from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import math

from .config import PocConfig, latest_run
from .roofs import read_roof_quality


# Au-delà de ce taux, la scène ne peut plus être présentée comme une reconstruction fidèle
# sans réserve écrite. Le seuil ne fait pas échouer la validation : il déclenche un avis.
DEGRADED_ROOF_NOTICE_RATIO = 0.10
# Une liste nominative complète noierait le rapport ; le fichier scene.json la porte en entier.
DEGRADED_ROOF_SAMPLE = 20

REQUIRED_ARTIFACTS = (
    "buildings.gpkg",
    "building_bbox.json",
    "buffered_bbox.json",
    "lidar_tiles.gpkg",
    "pdal_pipeline.json",
    "lidar_subset.laz",
    "buildings_cleaned.gpkg",
)

SIDES = ("ouest", "sud", "est", "nord")


def coverage_margins(
    bounds: tuple[float, float, float, float],
    terrain_bbox: tuple[float, float, float, float],
) -> dict[str, float]:
    """Débordement du nuage LiDAR au-delà de l'emprise du terrain, côté par côté, en mètres.

    Une valeur négative est un manque. L'étape amont extrait l'emprise demandée élargie d'un
    buffer : un buffer plus étroit que ``TERRAIN_MARGIN_M`` laisse le terrain déborder du
    nuage, et rien d'autre ne le signalerait.
    """
    cloud_xmin, cloud_ymin, cloud_xmax, cloud_ymax = bounds
    xmin, ymin, xmax, ymax = terrain_bbox
    return {
        "ouest": xmin - cloud_xmin,
        "sud": ymin - cloud_ymin,
        "est": cloud_xmax - xmax,
        "nord": cloud_ymax - ymax,
    }


def coverage_deficit(
    bounds: tuple[float, float, float, float],
    terrain_bbox: tuple[float, float, float, float],
    tolerance: float,
) -> dict[str, float]:
    """Manque de couverture par côté, en mètres, tolérance déduite.

    La tolérance vaut une maille du MNT : en dessous, aucune cellule ne change de valeur.
    """
    margins = coverage_margins(bounds, terrain_bbox)
    return {side: -margin for side, margin in margins.items() if margin < -tolerance}


def _cloud_bounds(lidar: Path) -> tuple[float, float, float, float]:
    """Emprise planimétrique du nuage, lue dans l'en-tête : le nuage n'est jamais chargé."""
    import laspy

    with laspy.open(lidar) as reader:
        header = reader.header
    return (
        float(header.mins[0]),
        float(header.mins[1]),
        float(header.maxs[0]),
        float(header.maxs[1]),
    )


def _coverage_section(config: PocConfig, run_dir: Path) -> tuple[list[str], bool]:
    """Confronte l'emprise du nuage à celle du terrain, que rien ne vérifiait jusqu'ici.

    Sans ce contrôle, un nuage trop court passe inaperçu : ``create_terrain`` comble les
    cellules vides par propagation de la moyenne des voisines, et rend un relief lisse,
    plausible et inventé sur toute la bande non couverte.
    """
    lines = ["", "## Couverture LiDAR"]
    lidar = run_dir / "lidar_subset.laz"
    if not lidar.is_file() or lidar.stat().st_size == 0:
        # L'absence est déjà comptée par la section des artefacts : ne pas la compter deux fois.
        lines.append("- Non mesurée : le nuage est absent ou vide.")
        return lines, True
    try:
        bounds = _cloud_bounds(lidar)
    except ImportError:
        lines.append("- Non mesurée : le module `laspy` est absent.")
        return lines, True
    except Exception as error:  # laspy lève des exceptions propres à son format
        lines.append(f"- [ ] Nuage illisible : {error}")
        return lines, False

    terrain_bbox = config.terrain_bbox
    tolerance = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    margins = coverage_margins(bounds, terrain_bbox)
    deficit = coverage_deficit(bounds, terrain_bbox, tolerance)
    lines.extend(
        [
            # Les coordonnées Lambert-93 tiennent sur sept chiffres : `%g` les rendrait en
            # notation scientifique, illisible pour une comparaison de bornes.
            "- Emprise du terrain : `{:.1f} {:.1f} {:.1f} {:.1f}`".format(*terrain_bbox),
            "- Emprise du nuage : `{:.1f} {:.1f} {:.1f} {:.1f}`".format(*bounds),
        ]
    )
    if not deficit:
        tightest = min(SIDES, key=lambda side: margins[side])
        lines.append(
            f"- [x] Le nuage couvre le terrain — marge la plus faible : "
            f"{margins[tightest]:.1f} m ({tightest})."
        )
        return lines, True

    lines.append("- [ ] Le nuage ne couvre pas le terrain :")
    lines.extend(f"  - {side} : {deficit[side]:.1f} m manquants" for side in SIDES if side in deficit)
    lines.append(
        "- Le MNT comblerait cette bande par interpolation sans rien signaler : relancer "
        "l'étape LiDAR + Roofer avec un `--buffer` plus large."
    )
    return lines, False


def _roof_quality_section(cityjson: list[Path]) -> list[str]:
    """Remonte le verdict que Roofer porte déjà sur chacune de ses toitures.

    Sans cette section, une toiture reconstruite sans le moindre point LiDAR se lit dans la
    scène exactement comme une toiture mesurée.
    """
    quality = read_roof_quality(cityjson)
    if not quality.total:
        return ["", "## Qualité des toitures", "- Aucun bâtiment lisible dans la sortie Roofer."]
    lines = [
        "",
        "## Qualité des toitures (`rf_roof_type`)",
        "",
        "| Type | Bâtiments |",
        "| --- | --- |",
    ]
    lines.extend(
        f"| `{label}` | {count} |" for label, count in sorted(quality.counts.items())
    )
    lines.append("")
    lines.append(
        f"- {len(quality.degraded)} bâtiment(s) dégradé(s) sur {quality.total} "
        f"({quality.ratio:.1%}) : toiture reconstruite sans plans exploitables."
    )
    if quality.degraded:
        shown = quality.degraded[:DEGRADED_ROOF_SAMPLE]
        suffix = "" if len(shown) == len(quality.degraded) else f" (+{len(quality.degraded) - len(shown)})"
        lines.append("- Identifiants : " + ", ".join(f"`{name}`" for name in shown) + suffix)
    if quality.ratio > DEGRADED_ROOF_NOTICE_RATIO:
        lines.append(
            f"- **Avis** : au-delà de {DEGRADED_ROOF_NOTICE_RATIO:.0%}, mentionner la réserve "
            "dans toute présentation de la scène."
        )
    return lines


def _read_json(path: Path) -> dict[str, object] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _render_section(run_dir: Path) -> list[str]:
    """Résumé lisible des résultats de rendu, lorsqu'une scène a déjà été assemblée."""
    scene = _read_json(run_dir / "render" / "scene.json")
    if scene is None:
        return []

    lines = ["", "## Rendu"]
    roof_quality = scene.get("roofQuality")
    if isinstance(roof_quality, dict):
        degraded = roof_quality.get("degraded", [])
        degraded_count = len(degraded) if isinstance(degraded, list) else int(degraded or 0)
        total = int(roof_quality.get("total", scene.get("buildings", 0)) or 0)
        lines.append(f"- Toitures dégradées : {degraded_count}/{total}.")

    offset = scene.get("orthoOffset")
    if isinstance(offset, dict):
        east = float(offset.get("eastMetres", 0.0) or 0.0)
        north = float(offset.get("northMetres", 0.0) or 0.0)
        lines.append(
            f"- Calage de l'orthophotographie : {math.hypot(east, north):.2f} m "
            f"(est {east:+.2f} m, nord {north:+.2f} m)."
        )

    trees = _read_json(run_dir / "trees.json")
    if trees is not None:
        count = int(trees.get("count", 0) or 0)
        foliage = trees.get("foliage")
        typed = 0
        if isinstance(foliage, dict):
            typed = sum(
                int(value or 0)
                for kind, value in foliage.items()
                if str(kind) != "generic"
            )
        lines.append(f"- Arbres : {count}, dont {typed} typés BD Forêt.")

    median = scene.get("medianViewFactor")
    if isinstance(median, (int, float)):
        lines.append(f"- Facteur de vue du ciel médian : {float(median):.3f}.")
    return lines


def validate_run(config: PocConfig, run_dir: Path | None = None) -> Path:
    run_dir = run_dir or latest_run(config)
    width, height = config.expected_size
    title = config.scene_title or "POC 3D"
    lines = [
        f"# Validation — {title}",
        "",
        f"- Exécution : `{run_dir.name}`",
        f"- Date : `{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}`",
        f"- Emprise : {width:g} × {height:g} m, soit {width * height:g} m²",
        f"- Bbox EPSG:2154 : `{config.get('POC_BBOX', '')}`",
    ]
    lines.extend(_render_section(run_dir))
    lines.extend(["", "## Artefacts"])
    success = True
    for relative in REQUIRED_ARTIFACTS:
        path = run_dir / relative
        valid = path.is_file() and path.stat().st_size > 0
        success &= valid
        status = "x" if valid else " "
        details = f"{path.stat().st_size} octets" if valid else "absent ou vide"
        lines.append(f"- [{status}] `{relative}` — {details}")

    coverage_lines, covered = _coverage_section(config, run_dir)
    lines.extend(coverage_lines)

    cityjson = sorted((run_dir / "roofer_output").glob("*.city.jsonl"))
    success &= bool(cityjson)
    lines.extend(
        [
            "",
            "## Sortie Roofer",
            f"- [{'x' if cityjson else ' '}] {len(cityjson)} fichier(s) CityJSONSeq",
        ]
    )
    if cityjson:
        lines.extend(_roof_quality_section(cityjson))

    problems: list[str] = []
    if not success:
        problems.append("des artefacts sont absents")
    if not covered:
        problems.append("le nuage LiDAR ne couvre pas l'emprise du terrain")
    lines.extend(
        [
            "",
            "## Décision",
            (
                "**PASS technique** — tous les artefacts minimaux sont présents et le nuage "
                "couvre l'emprise."
                if not problems
                else "**FAIL technique** — " + ", ".join(problems) + "."
            ),
        ]
    )
    report = run_dir / "poc-validation.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(report.read_text(encoding="utf-8"))
    if problems:
        raise RuntimeError(f"Validation en échec : {report}")
    return report
