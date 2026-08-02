"""Carte géologique BRGM (BD Charm-50 harmonisée) rastérisée sur l'emprise de la scène.

La source est vectorielle, à 1/50 000, téléchargée par département en Shapefile Lambert-93.
La rastériser nous-mêmes plutôt que de tirer une image d'un WMS a deux vertus : la texture
est nette à la résolution voulue, et les attributs survivent — c'est ce qui permet au
visualiseur de nommer la formation sous le curseur.

L'étape est **non bloquante** : le BRGM n'est pas la Géoplateforme, et une scène doit se
produire sans lui. Comme les autres modules dépendant de NumPy, il n'est jamais importé au
chargement de ``cli``, pour que ``poc.py check`` puisse diagnostiquer une dépendance absente.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import colorsys
import hashlib
import json
import re
import urllib.request
import zipfile

import numpy as np
import shapefile
from PIL import Image, ImageDraw

from .config import PocConfig, latest_run
from .raster import Ring, fill_rings


ARCHIVE_URL = "https://infoterre.brgm.fr/telechargements/BDCharm50/GEO050K_HARM_{department}.zip"
SOURCE_LABEL = "BRGM — BD Charm-50 harmonisée"
NOMINAL_SCALE = 50_000

# Emprise plausible du Lambert-93 sur la France métropolitaine. Sert de garde-fou : une
# archive d'un autre département, ou un shapefile dans une autre projection, se trahit ici
# plutôt qu'en produisant une texture muette.
LAMBERT93_X = (0.0, 1_300_000.0)
LAMBERT93_Y = (6_000_000.0, 7_200_000.0)

# Les six couches de la base, repérées par le fragment central de leur nom : le préfixe
# porte le numéro de département et le suffixe la projection, ni l'un ni l'autre stables.
FORMATIONS_LAYER = "_S_FGEOL_"
CONTACTS_LAYER = "_L_FGEOL_"
FAULTS_LAYER = "_L_STRUCT_"
POINT_LAYERS = ("_P_STRUCT_", "_P_DIVERS_")

# Champs recherchés, par ordre de préférence. Les noms exacts varient d'une édition
# départementale à l'autre ; tous les attributs sont de toute façon conservés dans
# `geology.json`, ces listes ne servent qu'à alimenter l'affichage du visualiseur.
# `CODE_LEG` identifie la ligne de légende du département : c'est sur lui que se regroupent
# les polygones, la notation pouvant se répéter d'une formation à l'autre.
LEGEND_FIELDS = ("CODE_LEG", "CODE", "NOTATION")
CODE_FIELDS = ("NOTATION", "CODE_LEG", "CODE", "SYMBOLE")
LABEL_FIELDS = ("DESCR", "LEGENDE", "DESCRIPTIO", "DESCRIPTION", "NOM", "LIBELLE")
AGE_FIELDS = ("AGE", "AGE_DEB", "AGE_DEBUT", "ERE", "SYSTEME")
AGE_END_FIELDS = ("AGE_FIN", "AGE_F")
LITHOLOGY_FIELDS = ("LITHOLOGIE", "LITHO", "TYPE_GEOL", "NATURE")
AZIMUTH_FIELDS = ("AZIMUT", "AZIMUTH", "DIRECTION", "ORIENTATIO", "ANGLE")
# Couleur de fond de la formation, en quadrichromie 0-100 : c'est la teinte de la carte
# imprimée, portée par la donnée elle-même.
CMYK_FIELDS = ("C_FOND", "M_FOND", "J_FOND", "N_FOND")

# Âge géologique, tel que la BD Charm-50 le donne : entre parenthèses en fin de description,
# pour quatre notices sur cinq. Aucun champ dédié n'existe dans le format.
AGE_TAIL_RE = re.compile(r"\s*\(([^()]+)\)\s*\Z")

# Signature d'un caractère latin accentué encodé en UTF-8, cherchée dans le DBF quand aucun
# `.cpg` ne déclare l'encodage.
UTF8_LATIN_RE = re.compile(rb"[\xc3\xc5][\x80-\xbf]")

CONTACT_COLOUR = (90, 84, 78, 255)
FAULT_COLOUR = (40, 30, 30, 255)
POINT_COLOUR = (25, 25, 30, 255)


@dataclass
class Formation:
    """Une formation géologique distincte, tous polygones confondus."""

    identifier: int
    code: str
    attributes: dict[str, object]
    rings: list[Ring] = field(default_factory=list)
    colour: tuple[int, int, int] = (200, 200, 200)
    coverage: int = 0

    def as_legend(self) -> dict[str, object]:
        label, age = _split_age(_pick(self.attributes, LABEL_FIELDS))
        if not age:
            age = _pick(self.attributes, AGE_FIELDS)
            end = _pick(self.attributes, AGE_END_FIELDS)
            if end and end != age:
                age = f"{age} – {end}" if age else end
        return {
            "id": self.identifier,
            "code": self.code,
            "label": label,
            "age": age,
            "lithology": _pick(self.attributes, LITHOLOGY_FIELDS),
            "color": "#%02x%02x%02x" % self.colour,
            "coveragePx": self.coverage,
            "attributes": self.attributes,
        }


def _cache_dir(config: PocConfig) -> Path:
    """Cache partagé par toutes les scènes : deux emprises d'un même département ne
    téléchargent l'archive qu'une fois. `.work/` est ignoré par Git."""
    return config.root / ".work" / "geology"


def _normalise_department(value: str) -> str:
    """Numéro de département sur trois caractères, tel que le nomme le BRGM."""
    cleaned = value.strip().upper()
    if not cleaned:
        raise ValueError(
            "GEOLOGY_DEPARTMENT n'est pas renseigné : indiquer le département de l'emprise, "
            "par exemple 030 pour le Gard."
        )
    if not re.fullmatch(r"[0-9]{1,3}|2[AB]", cleaned):
        raise ValueError(f"GEOLOGY_DEPARTMENT invalide : {value!r}")
    return cleaned if cleaned in {"2A", "2B"} else cleaned.rjust(3, "0")


def _download_archive(config: PocConfig, department: str) -> tuple[Path, dict[str, object]]:
    """Télécharge l'archive du département, ou réutilise celle du cache.

    Le critère de réutilisation est l'empreinte SHA-256, pas la seule présence du fichier :
    un téléchargement interrompu laisse une archive tronquée, que `zipfile` ne signalerait
    qu'au moment de lire un membre.
    """
    cache = _cache_dir(config)
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / f"GEO050K_HARM_{department}.zip"
    sidecar = archive.with_suffix(".json")
    url = ARCHIVE_URL.format(department=department)

    if archive.is_file() and sidecar.is_file():
        try:
            recorded = json.loads(sidecar.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            recorded = {}
        if recorded.get("sha256") == hashlib.sha256(archive.read_bytes()).hexdigest():
            print(f"Archive géologique en cache : {archive.name}")
            return archive, recorded

    print(f"Téléchargement de la carte géologique BRGM : {url}")
    request = urllib.request.Request(
        url, headers={"User-Agent": config.get("HTTP_USER_AGENT", "OpenDataVdA-POC/2.0")}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    if not payload.startswith(b"PK\x03\x04"):
        raise RuntimeError(
            f"Réponse inattendue du BRGM pour le département {department} : "
            f"{len(payload)} octets qui ne sont pas une archive ZIP"
        )
    archive.write_bytes(payload)
    provenance: dict[str, object] = {
        "url": url,
        "retrievedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sizeBytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }
    sidecar.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    return archive, provenance


def _extract(archive: Path, target: Path) -> None:
    """Extrait l'archive à plat, membre par membre, en ne gardant que le nom de base.

    Écrire les chemins tels quels exposerait à un membre nommé `../…` ; ne prendre que le
    nom de base clôt la question sans dépendance ni contrôle à rallonge.
    """
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if member.is_dir():
                continue
            name = Path(member.filename.replace("\\", "/")).name
            if not name or name.startswith("."):
                continue
            destination = target / name
            if destination.is_file() and destination.stat().st_size == member.file_size:
                continue
            with bundle.open(member) as source:
                destination.write_bytes(source.read())


def _find_layer(directory: Path, fragment: str) -> Path | None:
    matches = sorted(
        path
        for path in directory.glob("*.shp")
        if fragment.lower() in path.stem.lower()
    )
    return matches[0] if matches else None


def _encoding(path: Path) -> str:
    """Encodage du DBF : celui que déclare le `.cpg`, sinon celui qui décode le fichier.

    Les notices géologiques sont pleines d'accents ; se tromper ici fait ressortir
    « Schistes sériciteux » mutilé dans la légende, et rien ne le signale puisque les deux
    encodages décodent sans erreur. Le `.cpg` est souvent absent des livraisons BRGM, d'où
    la sonde. Décoder le fichier entier en UTF-8 ne dit rien : un DBF mêle au texte un
    en-tête et des champs numériques dont les octets ne sont valides dans aucun encodage.
    On cherche donc la signature d'un accent latin encodé en UTF-8 — deux octets que du
    texte français en cp1252 ne produit pratiquement jamais, puisqu'il faudrait un « Ã »
    suivi d'un caractère de contrôle.
    """
    companion = path.with_suffix(".cpg")
    if companion.is_file():
        declared = companion.read_text(encoding="ascii", errors="ignore").strip()
        if declared:
            return "utf-8" if declared.upper().replace("-", "") in {"UTF8", "65001"} else declared
    dbf = path.with_suffix(".dbf")
    if dbf.is_file() and UTF8_LATIN_RE.search(dbf.read_bytes()):
        return "utf-8"
    return "cp1252"


def _open(path: Path) -> shapefile.Reader:
    return shapefile.Reader(str(path), encoding=_encoding(path), encodingErrors="replace")


def _attributes(record: shapefile.ShapeRecord) -> dict[str, object]:
    values = record.record.as_dict()
    return {key: value for key, value in values.items() if value not in (None, "")}


def _clean_text(value: str) -> str:
    """Retire l'échappement à la mode CSV que porte le DBF de la BD Charm-50.

    Une notice citant les « Schistes des Cévennes » arrive entourée de guillemets, ceux de
    l'intérieur étant doublés : sans ce nettoyage, la légende affiche cette mécanique.
    """
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] == '"':
        text = text[1:-1]
    return text.replace('""', "«", 1).replace('""', "»", 1).replace('""', '"').strip()


def _split_age(description: str) -> tuple[str, str]:
    """Sépare la notice de l'âge que la BD Charm-50 place entre parenthèses à la fin."""
    match = AGE_TAIL_RE.search(description)
    if not match:
        return description, ""
    return description[: match.start()].strip(), match.group(1).strip()


def _pick(attributes: dict[str, object], candidates: tuple[str, ...]) -> str:
    upper = {key.upper(): value for key, value in attributes.items()}
    for name in candidates:
        value = _clean_text(str(upper.get(name, "")))
        if value and value not in {"0", "-", "NC"}:
            return value
    return ""


def _rings(shape: shapefile.Shape) -> list[Ring]:
    points = np.asarray(shape.points, dtype=np.float64)
    if points.size == 0:
        return []
    bounds = list(shape.parts) + [len(points)]
    rings: list[Ring] = []
    for start, stop in zip(bounds, bounds[1:]):
        part = points[start:stop]
        if len(part) >= 3:
            rings.append((part[:, 0].copy(), part[:, 1].copy()))
    return rings


def _check_projection(reader: shapefile.Reader, layer: Path) -> None:
    xmin, ymin, xmax, ymax = reader.bbox
    plausible = (
        LAMBERT93_X[0] <= xmin <= xmax <= LAMBERT93_X[1]
        and LAMBERT93_Y[0] <= ymin <= ymax <= LAMBERT93_Y[1]
    )
    if not plausible:
        raise ValueError(
            f"{layer.name} : projection inattendue, emprise "
            f"[{xmin:.0f}, {ymin:.0f}, {xmax:.0f}, {ymax:.0f}] hors du Lambert-93 métropolitain"
        )


def _read_formations(layer: Path, bbox: tuple[float, float, float, float]) -> list[Formation]:
    """Formations distinctes intersectant l'emprise, numérotées de façon déterministe.

    Le regroupement se fait sur le code de la formation, pas sur le polygone : une même
    formation revient en plusieurs morceaux, et la légende doit la nommer une seule fois.
    """
    grouped: dict[str, Formation] = {}
    with _open(layer) as reader:
        _check_projection(reader, layer)
        for record in reader.iterShapeRecords(bbox=bbox):
            rings = _rings(record.shape)
            if not rings:
                continue
            attributes = _attributes(record)
            key = _pick(attributes, LEGEND_FIELDS) or f"oid-{record.shape.oid}"
            existing = grouped.get(key)
            if existing is None:
                existing = Formation(
                    identifier=0,
                    code=_pick(attributes, CODE_FIELDS) or key,
                    attributes=attributes,
                )
                grouped[key] = existing
            existing.rings.extend(rings)
    # Le tri fixe l'ordre de la légende et les identifiants de la carte de picking : sans
    # lui, deux exécutions sur la même archive produiraient des PNG différents. Il porte sur
    # la clé de légende, qui est numérique dans la BD Charm-50 : la trier comme du texte
    # suffit, seule la stabilité compte ici.
    formations = [grouped[key] for key in sorted(grouped)]
    for index, formation in enumerate(formations, start=1):
        formation.identifier = index
    return formations


def _read_lines(layer: Path, bbox: tuple[float, float, float, float]) -> list[np.ndarray]:
    segments: list[np.ndarray] = []
    with _open(layer) as reader:
        _check_projection(reader, layer)
        for shape in reader.iterShapes(bbox=bbox):
            points = np.asarray(shape.points, dtype=np.float64)
            if points.size == 0:
                continue
            bounds = list(shape.parts) + [len(points)]
            for start, stop in zip(bounds, bounds[1:]):
                if stop - start >= 2:
                    segments.append(points[start:stop])
    return segments


def _read_points(
    layer: Path, bbox: tuple[float, float, float, float]
) -> list[tuple[float, float, float | None]]:
    marks: list[tuple[float, float, float | None]] = []
    with _open(layer) as reader:
        _check_projection(reader, layer)
        for record in reader.iterShapeRecords(bbox=bbox):
            points = record.shape.points
            if not points:
                continue
            raw = _pick(_attributes(record), AZIMUTH_FIELDS)
            try:
                azimuth: float | None = float(raw.replace(",", ".")) if raw else None
            except ValueError:
                azimuth = None
            marks.append((points[0][0], points[0][1], azimuth))
    return marks


def _official_colour(attributes: dict[str, object]) -> tuple[int, int, int] | None:
    """Couleur de la carte imprimée, lue dans les champs de quadrichromie de la formation.

    La BD Charm-50 porte sa propre symbologie dans le DBF : `C_FOND`, `M_FOND`, `J_FOND` et
    `N_FOND` donnent le fond en pourcentages CMJN. C'est la source la plus sûre — le `.qml`
    livré à côté est un `RuleRenderer` dont les règles renvoient à des motifs et à une police
    cartographique que le navigateur n'a pas, quand ces quatre nombres suffisent à retrouver
    le rose des granites ou le vert-bleu des métamorphiques.

    Les surcharges (hachures, figurés ponctuels) ne sont pas reprises : elles ne survivraient
    pas au drapage sur un relief.
    """
    channels: list[float] = []
    for name in CMYK_FIELDS:
        value = attributes.get(name)
        if not isinstance(value, (int, float)):
            return None
        channels.append(max(0.0, min(100.0, float(value))) / 100.0)
    cyan, magenta, yellow, black = channels
    if not any(channels):
        # Blanc franc : le BRGM s'en sert pour les formations sans fond imprimé, où seule
        # une surcharge distingue la formation. Une nappe blanche masquerait l'orthophoto
        # sans rien apprendre ; la couleur dérivée est plus utile.
        return None
    return (
        round(255 * (1 - cyan) * (1 - black)),
        round(255 * (1 - magenta) * (1 - black)),
        round(255 * (1 - yellow) * (1 - black)),
    )


def _hashed_colour(code: str) -> tuple[int, int, int]:
    """Teinte stable dérivée du code de formation.

    Contrainte en saturation et en clarté : une palette de carte géologique doit rester
    lisible sous une orthophoto semi-transparente, ce qu'une couleur aléatoire pleine
    saturation ne fait pas.
    """
    digest = hashlib.sha256(code.encode("utf-8")).digest()
    hue = digest[0] / 255.0
    saturation = 0.30 + (digest[1] / 255.0) * 0.25
    lightness = 0.62 + (digest[2] / 255.0) * 0.22
    red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
    return (round(red * 255), round(green * 255), round(blue * 255))


def _to_pixels(
    coordinates: np.ndarray, xmin: float, ymax: float, resolution: float
) -> list[tuple[float, float]]:
    columns = (coordinates[:, 0] - xmin) / resolution
    rows = (ymax - coordinates[:, 1]) / resolution
    return list(zip(columns.tolist(), rows.tolist()))


def create_geology(config: PocConfig, run_dir: Path | None = None) -> Path | None:
    """Produit `render/geology.png`, `geology-pick.png` et `geology.json`.

    Rend le dossier `render/` en cas de succès, ``None`` si la scène n'active pas la couche.
    """
    run_dir = run_dir or latest_run(config, require_complete=True)
    if not config.get_bool("GEOLOGY", True):
        print("Carte géologique désactivée (GEOLOGY=0).")
        return None

    department = _normalise_department(config.get("GEOLOGY_DEPARTMENT", ""))
    size = config.get_int("GEOLOGY_TEXTURE_SIZE_PX", 2048)
    if size < 256 or size > 8192:
        raise ValueError("GEOLOGY_TEXTURE_SIZE_PX doit être compris entre 256 et 8192")
    xmin, ymin, xmax, ymax = config.terrain_bbox
    resolution = max(xmax - xmin, ymax - ymin) / size

    archive, provenance = _download_archive(config, department)
    extracted = _cache_dir(config) / department
    _extract(archive, extracted)

    formations_layer = _find_layer(extracted, FORMATIONS_LAYER)
    if formations_layer is None:
        raise RuntimeError(
            f"Couche des formations ({FORMATIONS_LAYER}) absente de {archive.name} : "
            "l'archive n'est pas une BD Charm-50."
        )
    formations = _read_formations(formations_layer, (xmin, ymin, xmax, ymax))
    if not formations:
        raise ValueError(
            f"Aucune formation géologique sur l'emprise : le département {department} "
            "ne couvre probablement pas cette scène."
        )

    official = 0
    for formation in formations:
        colour = _official_colour(formation.attributes)
        official += colour is not None
        formation.colour = colour or _hashed_colour(formation.code)
    palette_source = "brgm" if official == len(formations) else (
        "mixte" if official else "hash"
    )

    identifiers = np.zeros((size, size), dtype=np.uint32)
    for formation in formations:
        fill_rings(identifiers, formation.rings, formation.identifier, xmin, ymax, resolution)

    # La couverture se compte après coup : deux formations qui se recouvrent laissent la
    # dernière peinte visible, et la légende doit refléter ce qui s'affiche réellement.
    counts = np.bincount(identifiers.ravel(), minlength=len(formations) + 1)
    for formation in formations:
        formation.coverage = int(counts[formation.identifier])
    visible = [formation for formation in formations if formation.coverage > 0]
    if not visible:
        raise ValueError("La rastérisation n'a couvert aucun pixel de l'emprise.")

    lookup = np.zeros((len(formations) + 1, 4), dtype=np.uint8)
    for formation in formations:
        lookup[formation.identifier] = (*formation.colour, 255)
    texture = Image.fromarray(lookup[identifiers], mode="RGBA")

    counted = {"formations": len(visible), "contacts": 0, "faults": 0, "points": 0}
    draw = ImageDraw.Draw(texture)
    stroke = max(1, round(size / 1024))
    for layer_fragment, colour, width, key in (
        (CONTACTS_LAYER, CONTACT_COLOUR, stroke, "contacts"),
        (FAULTS_LAYER, FAULT_COLOUR, stroke * 3, "faults"),
    ):
        layer = _find_layer(extracted, layer_fragment)
        if layer is None:
            continue
        for segment in _read_lines(layer, (xmin, ymin, xmax, ymax)):
            draw.line(_to_pixels(segment, xmin, ymax, resolution), fill=colour, width=width)
            counted[key] += 1

    # Marques ponctuelles : un disque, plus un tiret orienté quand l'azimut est renseigné.
    # Les glyphes normalisés de la carte imprimée demanderaient une bibliothèque de symboles
    # et seraient de toute façon illisibles drapés sur le relief.
    radius = stroke * 2
    for fragment in POINT_LAYERS:
        layer = _find_layer(extracted, fragment)
        if layer is None:
            continue
        for x_l93, y_l93, azimuth in _read_points(layer, (xmin, ymin, xmax, ymax)):
            column = (x_l93 - xmin) / resolution
            row = (ymax - y_l93) / resolution
            draw.ellipse(
                (column - radius, row - radius, column + radius, row + radius),
                fill=POINT_COLOUR,
            )
            if azimuth is not None:
                angle = np.radians(azimuth)
                reach = radius * 4
                # Azimut compté depuis le nord, qui est vers le haut de la texture.
                east, north = np.sin(angle) * reach, -np.cos(angle) * reach
                draw.line(
                    (column - east, row - north, column + east, row + north),
                    fill=POINT_COLOUR,
                    width=stroke,
                )
            counted["points"] += 1

    picking = np.zeros((size, size, 3), dtype=np.uint8)
    picking[:, :, 0] = (identifiers >> 16) & 0xFF
    picking[:, :, 1] = (identifiers >> 8) & 0xFF
    picking[:, :, 2] = identifiers & 0xFF

    render_dir = run_dir / "render"
    render_dir.mkdir(parents=True, exist_ok=True)
    # Sans profil ICC : le visualiseur relit la carte d'identifiants dans un canvas, et une
    # gestion de couleur y altérerait les valeurs qui portent les identifiants.
    texture.save(render_dir / "geology.png", format="PNG", optimize=True)
    Image.fromarray(picking, mode="RGB").save(
        render_dir / "geology-pick.png", format="PNG", optimize=True
    )

    metadata = {
        "source": SOURCE_LABEL,
        "scale": NOMINAL_SCALE,
        "department": department,
        "archiveUrl": provenance.get("url", ARCHIVE_URL.format(department=department)),
        "retrievedAt": provenance.get("retrievedAt", ""),
        "sha256": provenance.get("sha256", ""),
        "crs": "EPSG:2154",
        "bbox": [xmin, ymin, xmax, ymax],
        "sizePx": size,
        "resolutionM": resolution,
        "palette": palette_source,
        "layers": counted,
        "formations": [formation.as_legend() for formation in visible],
    }
    (render_dir / "geology.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    coverage = float(np.count_nonzero(identifiers)) / identifiers.size
    print(
        f"Carte géologique : {len(visible)} formation(s), {counted['faults']} faille(s), "
        f"{coverage:.0%} de l'emprise couverte, palette {palette_source} — {render_dir}"
    )
    return render_dir
