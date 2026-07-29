from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

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


def validate_run(config: PocConfig, run_dir: Path | None = None) -> Path:
    run_dir = run_dir or latest_run(config)
    width, height = config.expected_size
    lines = [
        "# Validation POC 3D — mairie de Valleraugue",
        "",
        f"- Exécution : `{run_dir.name}`",
        f"- Date : `{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}`",
        f"- Emprise : {width:g} × {height:g} m, soit {width * height:g} m²",
        f"- Bbox EPSG:2154 : `{config.get('POC_BBOX', '')}`",
        "",
        "## Artefacts",
    ]
    success = True
    for relative in REQUIRED_ARTIFACTS:
        path = run_dir / relative
        valid = path.is_file() and path.stat().st_size > 0
        success &= valid
        status = "x" if valid else " "
        details = f"{path.stat().st_size} octets" if valid else "absent ou vide"
        lines.append(f"- [{status}] `{relative}` — {details}")

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
    lines.extend(
        [
            "",
            "## Décision",
            (
                "**PASS technique** — tous les artefacts minimaux sont présents."
                if success
                else "**FAIL technique** — des artefacts sont absents."
            ),
        ]
    )
    report = run_dir / "poc-validation.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(report.read_text(encoding="utf-8"))
    if not success:
        raise RuntimeError(f"Validation en échec : {report}")
    return report
