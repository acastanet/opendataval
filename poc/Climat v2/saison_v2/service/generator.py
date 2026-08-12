"""Orchestration GPS → ERA5-Land → résultat V4 → SVG/PNG."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import tempfile
from base64 import b64encode
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from climate_seasons_service.compute import ThermalSeasonsInput  # noqa: E402
from climate_seasons_service.result import ResultContext  # noqa: E402
from climate_seasons_service.snapshot import SnapshotError, read_temperature  # noqa: E402
from climate_seasons_service.v4 import build_climate_result_v4  # noqa: E402
from seasons_wheel.config import WheelConfig  # noqa: E402
from seasons_wheel.render import build_document, render_wheel_svg  # noqa: E402

from .collector import CollectedAsset, collect_temperature, validate_coordinates
from .validation import TechnicalValidationError, validate_result, validate_temperature_series

GENERATOR_VERSION = "thermal-seasons-v4-wheel-service-8"
FONT_DIRECTORY = Path(__file__).resolve().parent / "assets" / "fonts"
EMBEDDED_FONTS = (
    ("Dancing Script", "400 700", FONT_DIRECTORY / "DancingScript[wght].ttf"),
    ("Inter", "100 900", FONT_DIRECTORY / "Inter[opsz,wght].ttf"),
)
BROWSER_CANDIDATES = (
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
)


@dataclass(frozen=True)
class WheelBundle:
    svg_path: Path
    result_path: Path
    png_path: Path


_generation_guard = threading.Lock()
_generation_locks: dict[str, threading.Lock] = {}
_generation_slots = threading.BoundedSemaphore(max(1, int(os.getenv("SEASONS_MAX_CONCURRENT", "1"))))


def data_root() -> Path:
    return Path(os.getenv("SEASONS_DATA_DIR", "/data")).resolve()


def _lock_for(key: str) -> threading.Lock:
    with _generation_guard:
        return _generation_locks.setdefault(key, threading.Lock())


def _normalise_title(title: str | None) -> str | None:
    if title is None:
        return None
    normalised = " ".join(title.split())
    return normalised or None


def _cache_key(latitude: float, longitude: float, title: str | None, config_path: Path) -> str:
    config_hash = hashlib.sha256(config_path.read_bytes()).hexdigest()
    value = f"{GENERATOR_VERSION}|{latitude:.8f}|{longitude:.8f}|{title or ''}|{config_hash}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _atomic_text(path: Path, content: str) -> None:
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def _result(latitude: float, longitude: float, asset: CollectedAsset) -> dict[str, Any]:
    point_id = f"GPS-{latitude:.6f}-{longitude:.6f}"
    point_hash = hashlib.sha256(f"{latitude:.8f},{longitude:.8f}".encode("utf-8")).hexdigest()[:8]
    snapshot_id = f"SNAPSHOT-{asset.sha256[:16]}-{point_hash}"
    try:
        temperature = read_temperature(asset.path)
    except (OSError, SnapshotError, ValueError) as exc:
        raise TechnicalValidationError(
            "temperature_asset_invalid", "Le fichier ERA5-Land téléchargé ne peut pas être lu."
        ) from exc
    validate_temperature_series(temperature)
    result = build_climate_result_v4(
        ThermalSeasonsInput(temperature_c=temperature),
        context=ResultContext(
            tile_id=point_id,
            latitude=latitude,
            longitude=longitude,
            snapshot_id=snapshot_id,
            grid_latitude=asset.grid_latitude,
            grid_longitude=asset.grid_longitude,
            retrieved_at=asset.retrieved_at,
            generated_at=asset.retrieved_at,
        ),
    )
    validate_result(result)
    return result


@lru_cache(maxsize=1)
def _embedded_font_css() -> str:
    """Embarque les polices du cadran dans le SVG pour les lecteurs hors ligne.

    CairoSVG utilise les mêmes polices installées dans l'image Docker ; les
    navigateurs utilisent ces ``@font-face`` encodés. Aucun rendu ne dépend ainsi
    de Google Fonts.
    """

    faces: list[str] = []
    for family, weight, path in EMBEDDED_FONTS:
        if not path.is_file():
            raise RuntimeError(f"Police embarquée introuvable : {path}")
        encoded = b64encode(path.read_bytes()).decode("ascii")
        faces.append(
            f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
            f"src:url(data:font/ttf;base64,{encoded}) format('truetype');font-display:block;}}"
        )
    return "".join(faces)


def _embed_font(svg: str) -> str:
    end = svg.find(">")
    if end == -1:
        raise RuntimeError("SVG invalide : balise racine introuvable.")
    return f"{svg[:end + 1]}<style>{_embedded_font_css()}</style>{svg[end + 1:]}"


def _render_svg(result: dict[str, Any], config_path: Path, title: str | None = None) -> str:
    document = build_document(result)
    quality_status = result.get("quality", {}).get("status")
    document["location_title"] = escape(title) if title else (
        "Point GPS" if quality_status == "valid" else "Point GPS — interprétation prudente"
    )
    config = WheelConfig.from_file(config_path).merged(
        {
            "animation_enabled": False,
            "google_font_import_url": "",
            "show_active_markers": False,
        }
    )
    return _embed_font(render_wheel_svg(document, config, state=None))


def _png_dimensions(svg: str) -> tuple[int, int]:
    """Lit les dimensions de la racine SVG pour la capture navigateur de secours."""

    match = re.search(r'\bviewBox="0 0 ([0-9.]+) ([0-9.]+)"', svg)
    if match is None:
        raise RuntimeError("Le SVG ne contient pas de viewBox exploitable pour l'export PNG.")
    return round(float(match.group(1))), round(float(match.group(2)))


def _headless_browser() -> Path | None:
    """Retourne Edge/Chrome pour le repli Windows quand Cairo manque."""

    for candidate in BROWSER_CANDIDATES:
        if candidate.is_file():
            return candidate
    for name in ("msedge", "chrome", "google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def _render_png_with_browser(svg: str, target: Path) -> None:
    """Capture le SVG avec Edge/Chrome lorsque CairoSVG est indisponible en local.

    Ce chemin est surtout destiné à Windows. L'image Docker conserve CairoSVG et
    ses dépendances natives ; les deux rendent le même SVG autoportant et les
    polices encodées directement dans celui-ci.
    """

    browser = _headless_browser()
    if browser is None:
        raise RuntimeError(
            "L'export PNG requiert CairoSVG avec Cairo, ou un navigateur Edge/Chrome pour le repli local."
        )
    width, height = _png_dimensions(svg)
    # Chrome déduit le format de capture de l'extension : garder impérativement
    # ``.png`` en suffixe, même pour le fichier atomique temporaire.
    temporary = target.with_name(f"{target.stem}.part{target.suffix}")
    html = (
        "<!doctype html><html><head><meta charset=\"utf-8\" />"
        "<style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block}</style>"
        f"</head><body>{svg}</body></html>"
    )
    with tempfile.TemporaryDirectory(prefix="seasons-wheel-png-") as directory:
        html_path = Path(directory) / "wheel.html"
        html_path.write_text(html, encoding="utf-8")
        result = subprocess.run(
            [
                str(browser),
                "--headless=new",
                "--disable-gpu",
                "--force-color-profile=srgb",
                "--virtual-time-budget=500",
                f"--screenshot={temporary}",
                f"--window-size={width},{height}",
                html_path.resolve().as_uri(),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    if result.returncode != 0 or not temporary.is_file():
        raise RuntimeError(f"Échec de l'export PNG via {browser.name} : {result.stderr.strip()}")
    temporary.replace(target)


def _render_png(svg: str, target: Path) -> None:
    """Produit le PNG avec CairoSVG, ou Edge/Chrome en repli sur Windows."""

    try:
        import cairosvg
        temporary = target.with_name(f"{target.stem}.part{target.suffix}")
        cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(temporary))
    except (ImportError, OSError):
        _render_png_with_browser(svg, target)
        return
    temporary.replace(target)


def generate_wheel(latitude: float, longitude: float, title: str | None = None) -> WheelBundle:
    """Génère les trois artefacts et les conserve dans le volume de cache."""

    latitude, longitude = validate_coordinates(latitude, longitude)
    title = _normalise_title(title)
    root = data_root()
    config_path = ROOT / "wheel-config.json"
    key = _cache_key(latitude, longitude, title, config_path)
    directory = root / "rendered" / key
    svg_path = directory / "wheel.svg"
    png_path = directory / "wheel.png"
    result_path = directory / "result.json"

    with _lock_for(key):
        if svg_path.is_file() and png_path.is_file() and result_path.is_file():
            return WheelBundle(svg_path, result_path, png_path)

        with _generation_slots:
            if svg_path.is_file() and png_path.is_file() and result_path.is_file():
                return WheelBundle(svg_path, result_path, png_path)
            directory.mkdir(parents=True, exist_ok=True)
            asset = collect_temperature(latitude, longitude, root)
            result = _result(latitude, longitude, asset)
            svg = _render_svg(result, config_path, title)
            _atomic_text(svg_path, svg)
            _atomic_text(result_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            _render_png(svg, png_path)
            return WheelBundle(svg_path, result_path, png_path)
