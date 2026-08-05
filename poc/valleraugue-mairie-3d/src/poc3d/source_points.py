from __future__ import annotations

from collections import Counter
from pathlib import Path
import hashlib
import json
import math

import laspy
import numpy as np

from .config import PocConfig, latest_run
from .glb import GlbBuilder, ortho_uv, srgb_to_linear
from .occlusion import load_occlusion


DEFAULT_POINT_LIMIT = 750_000
# Pas de la grille de décimation. Mesuré sur l'emprise 200 m : 0,40 m ramène 1 923 514 points
# à 744 905, soit le budget d'affichage à cinq mille points près, mais avec une densité
# homogène en volume — coefficient de variation par mètre cube 0,66 contre 0,80 pour un
# échantillonnage pris dans l'ordre du fichier. C'est ce qui fait qu'une façade se lit comme
# une surface et non comme une grappe.
DEFAULT_VOXEL_M = 0.4
# Une classe rare ne doit pas s'effacer parce qu'elle occupe peu de voxels : le tablier de
# pont passe de 4 037 points à 935 sur l'emprise 200 m, ce qui reste lisible, mais une classe
# marginale pourrait tomber à quelques unités.
MINIMUM_CLASS_POINTS = 500
# L'intensité LiDAR a une queue de distribution très longue — médiane 1 080 pour un maximum
# de 4 232 sur l'emprise 200 m. Normaliser sur les extrêmes écraserait toute la scène dans le
# premier quart de l'échelle : les centiles sont le seul cadrage lisible.
INTENSITY_PERCENTILES = (2.0, 98.0)
COLOR_MODES = ("classification", "ortho", "intensity", "elevation")
DEFAULT_COLOR_MODE = "ortho"
DATASET_URL = "https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_NUAGES-DE-POINTS-LIDAR-HD"
CLASSIFICATION = {
    0: ("Créé, jamais classé", (170, 170, 170, 255)),
    1: ("Non classé", (190, 190, 190, 255)),
    2: ("Sol", (151, 113, 73, 255)),
    3: ("Végétation basse", (158, 201, 89, 255)),
    4: ("Végétation moyenne", (83, 160, 65, 255)),
    5: ("Végétation haute", (30, 105, 52, 255)),
    6: ("Bâtiment", (210, 92, 62, 255)),
    7: ("Point bas", (110, 110, 110, 255)),
    9: ("Eau", (55, 142, 191, 255)),
    17: ("Tablier de pont", (122, 114, 105, 255)),
    66: ("Point non classé IGN", (166, 92, 188, 255)),
}
FALLBACK_COLOR = (222, 194, 90, 255)

# Un point de végétation prend, en mode orthophotographie, la couleur de ce qui se trouve à son
# aplomb dans l'image : une toiture, une route, un rocher. Les houppiers se constellent alors de
# points blancs, roses et gris clair, comme s'ils poussaient du bâti. C'est la même limite que
# celle déjà signalée pour les façades — faute d'imagerie oblique, chaque point reçoit la
# couleur vue de dessus, d'une prise de vue qui ne coïncide ni en date ni en angle avec le tir
# laser. Le modèle 3D protège ses houppiers depuis la vague 2 ; le nuage ne l'était pas.
#
# La plage de teinte n'est pas arbitraire : c'est celle de la palette de classification
# ci-dessus — végétation basse ≈ 84°, moyenne ≈ 109°, haute ≈ 135°. Les deux modes de couleur
# habitent ainsi le même domaine chromatique.
FOLIAGE_CLASSES = (3, 4, 5)
FOLIAGE_HUE_RANGE = (80.0, 140.0)
# Sans plancher de saturation, un gris resterait gris quelle que soit la teinte qu'on lui
# impose : la teinte d'une couleur désaturée n'a aucun effet visible.
FOLIAGE_MINIMUM_SATURATION = 0.25


def _linear_color(color: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Convertit la palette d'interface sRGB vers le COLOR_0 linéaire du glTF."""
    return tuple(
        round(srgb_to_linear(channel / 255) * 255) for channel in color[:3]
    ) + (color[3],)


def _classification_lut() -> np.ndarray:
    """Palette indexée par le code de classification, repli compris.

    Une table de 256 entrées remplace autant d'appels Python qu'il y a de points : 0,005 s
    contre 0,68 s pour 750 000 points, à résultat strictement identique.
    """
    lut = np.tile(np.array(_linear_color(FALLBACK_COLOR), dtype=np.uint8), (256, 1))
    for code, (_, color) in CLASSIFICATION.items():
        lut[code] = np.array(_linear_color(color), dtype=np.uint8)
    return lut


def _srgb_lut() -> np.ndarray:
    """Conversion sRGB vers linéaire des 256 valeurs d'un canal d'image."""
    return np.array(
        [round(srgb_to_linear(value / 255) * 255) for value in range(256)], dtype=np.uint8
    )


def _rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    """RVB vers TSV, sur un tableau de couleurs normalisées entre 0 et 1.

    Écrit ici plutôt que pris à `colorsys`, qui ne traite qu'une couleur à la fois : le nuage
    en compte trois quarts de million, et la boucle Python coûterait plus que tout le reste de
    l'étape réunie. C'est le même motif que `_classification_lut`.
    """
    maximum = rgb.max(axis=1)
    minimum = rgb.min(axis=1)
    delta = maximum - minimum
    hue = np.zeros(len(rgb))
    # Une couleur neutre n'a pas de teinte définie ; la laisser à zéro est sans conséquence,
    # puisque la contrainte lui en imposera une.
    coloured = delta > 1e-12
    red, green, blue = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    # Les trois secteurs de la roue, dans leur ordre canonique : le décalage place l'origine du
    # secteur et la différence signée dit de quel côté la teinte penche. L'ordre des deux canaux
    # soustraits n'est pas interchangeable — l'inverser retourne la moitié de la roue.
    for dominant, offset, first, second in (
        (red, 0.0, green, blue),
        (green, 2.0, blue, red),
        (blue, 4.0, red, green),
    ):
        selected = coloured & (maximum == dominant)
        if not selected.any():
            continue
        hue[selected] = offset + (first[selected] - second[selected]) / delta[selected]
    hue = (hue * 60.0) % 360.0
    saturation = np.divide(delta, maximum, out=np.zeros(len(rgb)), where=maximum > 1e-12)
    return np.stack((hue, saturation, maximum), axis=1)


def _hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    """TSV vers RVB, réciproque vectorisée de :func:`_rgb_to_hsv`."""
    hue, saturation, value = hsv[:, 0] / 60.0, hsv[:, 1], hsv[:, 2]
    sector = np.floor(hue).astype(np.int64) % 6
    fraction = hue - np.floor(hue)
    p = value * (1.0 - saturation)
    q = value * (1.0 - saturation * fraction)
    t = value * (1.0 - saturation * (1.0 - fraction))
    choices = (
        (value, t, p),
        (q, value, p),
        (p, value, t),
        (p, q, value),
        (t, p, value),
        (value, p, q),
    )
    return np.stack(
        [np.choose(sector, [choice[channel] for choice in choices]) for channel in range(3)],
        axis=1,
    )


def _greened(colors: np.ndarray, classes: np.ndarray) -> np.ndarray:
    """Ramène la couleur des points de végétation dans le domaine des verts.

    La teinte est bornée à :data:`FOLIAGE_HUE_RANGE` et la saturation relevée à
    :data:`FOLIAGE_MINIMUM_SATURATION`. **La valeur est conservée telle quelle** : c'est elle
    qui porte l'ombrage et le relief du nuage, et l'écraser rendrait un aplat vert où l'on ne
    distinguerait plus un houppier au soleil d'un sous-bois à l'ombre.

    Les couleurs entrent et sortent en **sRGB** sur 8 bits. Opérer en linéaire déplacerait les
    seuils, qui sont lus sur une palette sRGB.

    Seules les classes 3, 4 et 5 sont touchées : verdir une toiture ou une route n'aurait aucun
    sens, et c'est le contrôle qui prouve que le filtre vise bien la végétation.
    """
    selected = np.isin(classes, FOLIAGE_CLASSES)
    if not selected.any():
        return colors
    greened = colors.astype(np.float64).copy()
    hsv = _rgb_to_hsv(greened[selected] / 255.0)
    hue_min, hue_max = FOLIAGE_HUE_RANGE
    hsv[:, 0] = np.clip(hsv[:, 0], hue_min, hue_max)
    hsv[:, 1] = np.maximum(hsv[:, 1], FOLIAGE_MINIMUM_SATURATION)
    greened[selected] = _hsv_to_rgb(hsv) * 255.0
    return np.clip(np.rint(greened), 0, 255).astype(np.uint8)


def _sample_indices(classification: np.ndarray, limit: int) -> np.ndarray:
    """Échantillonne chaque classe régulièrement et de façon reproductible.

    Repli de la décimation par voxels, et comportement historique lorsque
    ``SOURCE_POINT_VOXEL_M`` vaut zéro. Le nuage publié reste une vue de contrôle : le LAZ
    demeure la donnée source. La stratification évite cependant qu'une classe rare
    disparaisse d'une emprise dense.
    """
    count = int(classification.size)
    if limit <= 0 or count <= limit:
        return np.arange(count, dtype=np.int64)
    classes, counts = np.unique(classification, return_counts=True)
    if limit < len(classes):
        raise ValueError("SOURCE_POINT_LIMIT doit au moins couvrir toutes les classes LiDAR")

    exact = counts.astype(np.float64) * (limit / count)
    quotas = np.maximum(1, np.floor(exact).astype(np.int64))
    quotas = np.minimum(quotas, counts)
    while int(quotas.sum()) > limit:
        candidates = np.flatnonzero(quotas > 1)
        index = int(candidates[np.argmax(quotas[candidates] - exact[candidates])])
        quotas[index] -= 1
    while int(quotas.sum()) < limit:
        candidates = np.flatnonzero(quotas < counts)
        if candidates.size == 0:
            break
        index = int(candidates[np.argmax(exact[candidates] - quotas[candidates])])
        quotas[index] += 1

    selected: list[np.ndarray] = []
    for klass, quota in zip(classes, quotas):
        indices = np.flatnonzero(classification == klass)
        if quota >= indices.size:
            selected.append(indices)
        else:
            offsets = np.linspace(0, indices.size - 1, int(quota), dtype=np.int64)
            selected.append(indices[offsets])
    return np.sort(np.concatenate(selected))


def _voxel_keys(
    x: np.ndarray, y: np.ndarray, z: np.ndarray, step: float
) -> np.ndarray | None:
    """Numéro de voxel de chaque point, ou ``None`` si la grille déborde d'un entier 64 bits.

    L'encodage se cale sur l'étendue réelle du nuage plutôt que sur un décalage de bits fixe :
    les emprises cévenoles cumulent plusieurs centaines de mètres de dénivelé, et un pas fin y
    ferait sortir l'index vertical d'un champ de largeur figée.
    """
    columns = np.floor((x - x.min()) / step).astype(np.int64)
    rows = np.floor((y - y.min()) / step).astype(np.int64)
    levels = np.floor((z - z.min()) / step).astype(np.int64)
    height = int(rows.max()) + 1
    depth = int(levels.max()) + 1
    if (int(columns.max()) + 1) * height * depth > 2**62:
        return None
    return (columns * height + rows) * depth + levels


def _voxel_indices(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    classification: np.ndarray,
    voxel_m: float,
    limit: int,
) -> tuple[np.ndarray, float]:
    """Retient un point par voxel, en élargissant la grille jusqu'à tenir le budget.

    Le point conservé est le premier du fichier dans son voxel, jamais un barycentre : le
    nuage témoin doit rester une sélection de mesures réelles, comme le terrain qui ne lisse
    que ses cellules interpolées.

    L'élargissement automatique est ce qui rend le réglage transposable. L'emprise 600 m porte
    neuf fois plus de points que celle de 200 m : un pas figé y produirait plusieurs millions
    de points. Chaque itération multiplie le pas par la racine cubique de deux, soit un volume
    de voxel doublé, donc à peu près deux fois moins de points retenus.
    """
    classes = int(np.unique(classification).size)
    if 0 < limit < classes:
        raise ValueError("SOURCE_POINT_LIMIT doit au moins couvrir toutes les classes LiDAR")
    step = float(voxel_m)
    for _ in range(32):
        keys = _voxel_keys(x, y, z, step)
        if keys is not None:
            _, first = np.unique(keys, return_index=True)
            selected = _restore_rare_classes(first, classification, limit)
            if limit <= 0 or selected.size <= limit:
                return np.sort(selected), step
        step *= 2 ** (1 / 3)
    raise RuntimeError("Décimation par voxels impossible : budget de points trop bas")


def _restore_rare_classes(
    selected: np.ndarray, classification: np.ndarray, limit: int
) -> np.ndarray:
    """Complète les classes qu'une grille trop lâche a réduites sous le seuil de lisibilité.

    Le plancher se plie au budget : sur une emprise minuscule ou un plafond serré, il retombe
    sur la garantie de l'échantillonnage stratifié — au moins un point par classe — plutôt que
    de faire déborder le nuage.
    """
    kept = Counter(classification[selected].tolist())
    census = Counter(classification.tolist())
    ceiling = MINIMUM_CLASS_POINTS if limit <= 0 else max(1, limit // len(census))
    missing: list[np.ndarray] = []
    for klass, available in census.items():
        target = min(MINIMUM_CLASS_POINTS, available, ceiling)
        if target <= kept.get(klass, 0):
            continue
        indices = np.flatnonzero(classification == klass)
        missing.append(indices[np.linspace(0, indices.size - 1, target, dtype=np.int64)])
    if not missing:
        return selected
    return np.unique(np.concatenate([selected, *missing]))


def _intensity_channel(intensity: np.ndarray) -> tuple[np.ndarray, tuple[int, int]]:
    """Réflectance cadrée sur ses centiles, ramenée à un octet."""
    if intensity.size == 0:
        return np.zeros(0, dtype=np.uint8), (0, 0)
    low, high = np.percentile(intensity, INTENSITY_PERCENTILES)
    if high <= low:
        return np.zeros(intensity.size, dtype=np.uint8), (int(low), int(high))
    scaled = (intensity.astype(np.float64) - low) / (high - low)
    return (np.clip(scaled, 0.0, 1.0) * 255).astype(np.uint8), (int(low), int(high))


def _ortho_offset(run_dir: Path) -> tuple[float, float]:
    """Calage de l'orthophotographie, relu tel que l'assemblage l'a cuit.

    Le recalage est mesuré par ``create_scene_glb``, qui s'exécute juste avant : le relire
    dans ``scene.json`` garantit que le nuage et le modèle portent exactement la même
    translation, là où le remesurer ici risquerait de les désaligner d'une exécution à
    l'autre.
    """
    scene = run_dir / "render" / "scene.json"
    if not scene.is_file():
        return (0.0, 0.0)
    try:
        offset = json.loads(scene.read_text(encoding="utf-8")).get("orthoOffset") or {}
    except (OSError, json.JSONDecodeError):
        return (0.0, 0.0)
    return (float(offset.get("eastMetres", 0.0)), float(offset.get("northMetres", 0.0)))


def _ortho_colors(
    config: PocConfig, run_dir: Path, x: np.ndarray, y: np.ndarray
) -> np.ndarray | None:
    """Couleur de chaque point échantillonnée dans l'orthophotographie recalée.

    C'est la pratique décrite par l'IGN pour l'exploitation architecturale du LiDAR HD :
    croiser le nuage et la photographie aérienne plutôt que de le laisser en teintes de
    classe. L'image couvre l'emprise du terrain à une dizaine de centimètres par pixel, soit
    la moitié de l'espacement des points — le plus proche voisin suffit, une interpolation
    ne ferait que lisser une couleur déjà plus fine que la géométrie qu'elle habille.

    Les points de façade reçoivent la couleur vue à leur aplomb, faute d'imagerie oblique.
    C'est la limite connue de la méthode, et elle reste préférable à un aplat.

    La couleur sort en **sRGB**, telle que l'image la porte. La conversion vers le linéaire du
    glTF est faite par l'appelant, après la contrainte de teinte du feuillage : celle-ci lit ses
    seuils sur une palette sRGB, et opérer en linéaire les déplacerait.
    """
    from PIL import Image

    ortho_path = run_dir / "orthophoto.jpg"
    if not ortho_path.is_file():
        return None
    try:
        with Image.open(ortho_path) as image:
            pixels = np.asarray(image.convert("RGB"), dtype=np.uint8)
    except (OSError, ValueError) as error:
        print(f"AVERTISSEMENT : nuage non recolorisé depuis l'orthophotographie ({error}).")
        return None
    height, width = pixels.shape[:2]
    # `ortho_uv` n'est qu'une transformation affine : elle s'applique telle quelle aux
    # tableaux, et l'employer plutôt qu'en réécrire une garantit que le nuage se cale
    # exactement comme le terrain et les toitures.
    u, v = ortho_uv(config, _ortho_offset(run_dir))(x, y)
    columns = np.clip((u * width).astype(np.int64), 0, width - 1)
    rows = np.clip((v * height).astype(np.int64), 0, height - 1)
    return pixels[rows, columns]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copc_sources(run_dir: Path) -> list[str]:
    pipeline = run_dir / "pdal_pipeline.json"
    if not pipeline.is_file():
        return []
    try:
        document = json.loads(pipeline.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    sources: list[str] = []
    for stage in document if isinstance(document, list) else []:
        if not isinstance(stage, dict) or stage.get("type") != "readers.copc":
            continue
        filename = stage.get("filename")
        value = filename.get("path") if isinstance(filename, dict) else filename
        if isinstance(value, str) and value:
            sources.append(value)
    return sources


def _counts(values: np.ndarray) -> dict[str, int]:
    return {str(int(key)): int(value) for key, value in sorted(Counter(values.tolist()).items())}


def create_source_points(config: PocConfig, run_dir: Path | None = None) -> tuple[Path, Path]:
    """Produit la représentation LiDAR témoin, séparée du modèle interprété."""
    run_dir = run_dir or latest_run(config, require_complete=True)
    source = run_dir / "lidar_subset.laz"
    terrain_path = run_dir / "terrain.npy"
    if not source.is_file() or source.stat().st_size == 0:
        raise FileNotFoundError(f"Nuage LiDAR absent : {source}")
    if not terrain_path.is_file():
        raise FileNotFoundError("Exécuter d'abord la commande terrain")

    cloud = laspy.read(source)
    x = np.asarray(cloud.x)
    y = np.asarray(cloud.y)
    z = np.asarray(cloud.z)
    classification = np.asarray(cloud.classification, dtype=np.uint8)
    intensity = np.asarray(cloud.intensity)
    xmin, ymin, xmax, ymax = config.terrain_bbox
    within = (x >= xmin) & (x <= xmax) & (y >= ymin) & (y <= ymax)
    if not np.any(within):
        raise RuntimeError("Aucun point LiDAR dans l'emprise du terrain")
    x, y, z, classification, intensity = (
        values[within] for values in (x, y, z, classification, intensity)
    )

    limit = config.get_int("SOURCE_POINT_LIMIT", DEFAULT_POINT_LIMIT)
    voxel_m = config.get_float("SOURCE_POINT_VOXEL_M", DEFAULT_VOXEL_M)
    if voxel_m > 0:
        selected, voxel_used = _voxel_indices(x, y, z, classification, voxel_m, limit)
        sampling = "un point par voxel, premier du fichier"
    else:
        selected, voxel_used = _sample_indices(classification, limit), 0.0
        sampling = "stratifié par classe, régulier et déterministe"
    selected_classes = classification[selected]

    center_x = sum(config.bbox[::2]) / 2
    center_y = sum(config.bbox[1::2]) / 2
    base_elevation = math.floor(float(np.min(np.load(terrain_path))))
    positions = np.stack(
        (x[selected] - center_x, z[selected] - base_elevation, center_y - y[selected]), axis=1
    ).astype(np.float32)

    grid = np.load(terrain_path)
    occlusion = load_occlusion(config, run_dir, grid)
    if occlusion is None:
        shade = np.ones(selected.size, dtype=np.float64)
    else:
        shade = occlusion.at(x[selected], y[selected], z[selected])

    ortho = _ortho_colors(config, run_dir, x[selected], y[selected])
    color_mode = config.get("SOURCE_POINT_COLOR", DEFAULT_COLOR_MODE).strip().lower()
    if color_mode not in COLOR_MODES:
        raise ValueError(f"SOURCE_POINT_COLOR doit valoir l'un de {', '.join(COLOR_MODES)}")
    if color_mode == "ortho" and ortho is None:
        color_mode = "classification"
    if color_mode == "ortho":
        # La contrainte de teinte s'applique en sRGB, avant le passage au linéaire du glTF.
        # Cette couleur cuite n'est qu'un repli : le visualiseur rééchantillonne lui-même
        # l'orthophotographie pour que le calage suive ses curseurs, et applique la même
        # contrainte dans son shader d'après les seuils publiés plus bas. Les deux chemins
        # doivent donc rendre la même image.
        base = _srgb_lut()[_greened(ortho, selected_classes)]
    else:
        base = _classification_lut()[selected_classes][:, :3]
    # L'occlusion est multipliée ici, et pas seulement transportée dans `_LIDAR` : le contrat
    # de `occlusion.py` est qu'elle se restitue dans n'importe quel moteur glTF, y compris un
    # visualiseur qui ignorerait les attributs applicatifs du POC.
    colors = np.empty((selected.size, 4), dtype=np.uint8)
    colors[:, :3] = np.clip(base * shade[:, None], 0, 255).astype(np.uint8)
    colors[:, 3] = 255

    intensity_channel, intensity_range = _intensity_channel(intensity[selected])
    lidar = np.zeros((selected.size, 4), dtype=np.uint8)
    lidar[:, 0] = selected_classes
    lidar[:, 1] = intensity_channel
    lidar[:, 2] = np.clip(shade * 255, 0, 255).astype(np.uint8)

    builder = GlbBuilder()
    material = builder.add_material("Classes LiDAR HD", (1.0, 1.0, 1.0, 1.0), roughness=1.0)
    builder.add_mesh(
        "NuageSource",
        [builder.point_primitive(positions, colors, material, {"_LIDAR": lidar})],
        extras={"renderedPoints": int(selected.size), "sourcePoints": int(classification.size)},
    )

    dimensions = list(cloud.point_format.dimension_names)
    # Toute la chaîne POC travaille contractuellement en Lambert-93, et le VLR du LAZ le
    # confirme désormais : `parse_crs` a besoin de `pyproj`, arrivé avec `geopandas`. Le repli
    # sur le contrat reste utile pour un nuage dont l'en-tête ne porte aucune projection.
    epsg = 2154
    epsg_source = "contrat du pipeline Lambert-93"
    try:
        crs = cloud.header.parse_crs()
        parsed = crs.to_epsg() if crs is not None else None
        if parsed is not None:
            epsg = parsed
            epsg_source = "en-tête LAS"
    except (AttributeError, ImportError, ValueError):
        pass
    area = (xmax - xmin) * (ymax - ymin)
    metadata = {
        "representation": "nuage-source",
        "sourceFile": source.name,
        "datasetUrl": DATASET_URL,
        "sourceSizeBytes": source.stat().st_size,
        "sourceSha256": _sha256(source),
        "sourcePoints": int(classification.size),
        "renderedPoints": int(selected.size),
        "decimated": int(selected.size) < int(classification.size),
        "sampling": sampling,
        "pointLimit": limit,
        "voxelM": round(voxel_used, 4),
        # Espacement moyen des points affichés. Le visualiseur en déduit la taille de ses
        # points : sans lui, un réglage calé sur une emprise serait faux sur la suivante.
        "spacingM": round(math.sqrt(area / max(int(selected.size), 1)), 4),
        "bboxLambert93": [xmin, ymin, xmax, ymax],
        "epsg": epsg,
        "epsgSource": epsg_source,
        "baseElevation": base_elevation,
        "dimensions": dimensions,
        "markerDimensions": [name for name in dimensions if name in {"DTM_Marker", "DSM_Marker"}],
        # Contrat de l'attribut applicatif `_LIDAR`, dans l'ordre de ses canaux : le
        # visualiseur reconstruit ses modes de couleur à partir de là.
        "pointAttributes": ["classification", "intensity", "occlusion", "reserved"],
        "colorModes": list(COLOR_MODES),
        "defaultColorMode": color_mode,
        "bakedColorMode": color_mode,
        # Seuils de la contrainte de teinte du feuillage. Ils sont publiés plutôt que recopiés
        # dans le visualiseur : celui-ci rééchantillonne l'orthophotographie dans son shader et
        # doit appliquer exactement la même correction que la couleur cuite ci-dessus. Deux
        # constantes tenues en parallèle finiraient par diverger sans que rien ne le signale.
        "foliageGreen": {
            "classes": list(FOLIAGE_CLASSES),
            "hueMin": FOLIAGE_HUE_RANGE[0],
            "hueMax": FOLIAGE_HUE_RANGE[1],
            "saturationMin": FOLIAGE_MINIMUM_SATURATION,
        },
        "intensityRange": list(intensity_range),
        "occlusionBaked": occlusion is not None,
        "classificationCounts": _counts(classification),
        "renderedClassificationCounts": _counts(selected_classes),
        "classificationLegend": {
            str(code): {"label": label, "color": "#%02x%02x%02x" % color[:3]}
            for code, (label, color) in CLASSIFICATION.items()
        },
        "copcSources": _copc_sources(run_dir),
    }
    render_dir = run_dir / "render"
    render_dir.mkdir(parents=True, exist_ok=True)
    glb_path = render_dir / "source-points.glb"
    metadata_path = render_dir / "source-points.json"
    builder.write(glb_path, extras=metadata)
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"Nuage source généré : {glb_path} "
        f"({selected.size:,}/{classification.size:,} points affichés, "
        f"voxel {voxel_used:.2f} m, couleur {color_mode})"
    )
    return glb_path, metadata_path
