from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from .config import PocConfig, latest_run


REQUIRED_ARTIFACTS = (
    "buildings.gpkg",
    "building_bbox.json",
    "buffered_bbox.json",
    "lidar_tiles.gpkg",
    "pdal_pipeline.json",
    "lidar_subset.laz",
    "buildings_cleaned.gpkg",
)


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
