from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re


LINE_RE = re.compile(r"^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$")


def read_shell_config(path: Path) -> dict[str, str]:
    """Lit le sous-ensemble KEY=VALUE utilisé par les configurations historiques."""
    values: dict[str, str] = {}
    for number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = LINE_RE.match(line)
        if not match:
            raise ValueError(f"{path}:{number}: ligne de configuration invalide")
        key, value = match.groups()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


@dataclass(frozen=True)
class PocConfig:
    root: Path
    source: Path
    values: dict[str, str]

    @classmethod
    def load(cls, root: Path, config_file: str | Path) -> "PocConfig":
        source = Path(config_file)
        if not source.is_absolute():
            source = root / source
        source = source.resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Configuration absente : {source}")
        return cls(root=root.resolve(), source=source, values=read_shell_config(source))

    def get(self, key: str, default: str) -> str:
        return self.values.get(key, default)

    def get_int(self, key: str, default: int) -> int:
        return int(self.get(key, str(default)))

    def get_float(self, key: str, default: float) -> float:
        return float(self.get(key, str(default)))

    def get_bool(self, key: str, default: bool = False) -> bool:
        value = self.get(key, "1" if default else "0").lower()
        if value not in {"0", "1", "false", "true", "no", "yes"}:
            raise ValueError(f"{key} doit être un booléen")
        return value in {"1", "true", "yes"}

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        parts = self.get("POC_BBOX", "751306 6331501 751406 6331601").split()
        if len(parts) != 4:
            raise ValueError("POC_BBOX doit contenir exactement quatre coordonnées")
        xmin, ymin, xmax, ymax = map(float, parts)
        if xmin >= xmax or ymin >= ymax:
            raise ValueError("POC_BBOX est invalide")
        return xmin, ymin, xmax, ymax

    @property
    def terrain_margin(self) -> float:
        margin = self.get_float("TERRAIN_MARGIN_M", 15.0)
        if margin < 0:
            raise ValueError("TERRAIN_MARGIN_M ne peut pas être négatif")
        return margin

    @property
    def terrain_bbox(self) -> tuple[float, float, float, float]:
        """Emprise du terrain et de l'orthophotographie, élargie autour de POC_BBOX.

        Roofer reconstruit les bâtiments sur une zone tamponnée : sans cette marge,
        ceux de bordure flottent au-delà du terrain.
        """
        xmin, ymin, xmax, ymax = self.bbox
        margin = self.terrain_margin
        return xmin - margin, ymin - margin, xmax + margin, ymax + margin

    @property
    def output_dir(self) -> Path:
        value = Path(self.get("OUTPUT_DIR", "./output"))
        return value.resolve() if value.is_absolute() else (self.root / value).resolve()

    @property
    def scene_title(self) -> str:
        """Nom du lieu représenté, tel qu'il s'affiche en tête du visualiseur.

        Vide par défaut : le sélecteur retombe alors sur la taille de l'emprise, ce qui
        suffisait tant qu'une seule commune était modélisée. Deux sites différents à 200 m
        donneraient en revanche deux entrées « 200 × 200 m » indiscernables.
        """
        return self.get("SCENE_TITLE", "").strip()

    @property
    def scene_subtitle(self) -> str:
        return self.get("SCENE_SUBTITLE", "").strip()

    @property
    def scene_centre_label(self) -> str:
        """Libellé du point de vue centré sur l'origine de la scène.

        La scène est recentrée sur le milieu de `POC_BBOX` : ce bouton vise toujours (0, 0),
        seul son intitulé change d'un site à l'autre.
        """
        return self.get("SCENE_CENTRE_LABEL", "").strip()

    @property
    def scene_centre_wgs84(self) -> tuple[float, float] | None:
        """Point de référence saisi à la création, en latitude puis longitude.

        Documentaire : le pipeline travaille en Lambert-93 et ne s'en sert pas. Il permet de
        retrouver le point sur une carte sans reprojeter l'emprise.
        """
        value = self.get("SCENE_CENTRE_WGS84", "").strip()
        if not value:
            return None
        parts = value.replace(",", " ").split()
        if len(parts) != 2:
            raise ValueError("SCENE_CENTRE_WGS84 doit contenir une latitude et une longitude")
        latitude, longitude = map(float, parts)
        return latitude, longitude

    @property
    def expected_size(self) -> tuple[float, float]:
        return (
            self.get_float("EXPECTED_WIDTH_M", 100.0),
            self.get_float("EXPECTED_HEIGHT_M", 100.0),
        )

    def validate(self) -> None:
        xmin, ymin, xmax, ymax = self.bbox
        width, height = self.expected_size
        actual_width = xmax - xmin
        actual_height = ymax - ymin
        if abs(actual_width - width) > 0.01 or abs(actual_height - height) > 0.01:
            raise ValueError(
                f"Emprise attendue {width:g} x {height:g} m, "
                f"reçue {actual_width:g} x {actual_height:g} m"
            )
        if self.get_float("TERRAIN_RESOLUTION_M", 1.0) <= 0:
            raise ValueError("TERRAIN_RESOLUTION_M doit être supérieur à zéro")
        self.terrain_margin
        self.scene_centre_wgs84


def latest_run(config: PocConfig, require_complete: bool = False) -> Path:
    candidates = sorted(
        (path for path in config.output_dir.glob("run-*") if path.is_dir()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if require_complete:
        candidates = [
            path
            for path in candidates
            if any((path / "roofer_output").glob("*.city.jsonl"))
        ]
    if not candidates:
        qualifier = " complète" if require_complete else ""
        raise FileNotFoundError(f"Aucune exécution{qualifier} dans {config.output_dir}")
    return candidates[0]
