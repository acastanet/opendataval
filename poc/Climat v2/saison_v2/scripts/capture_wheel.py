"""Export PNG de contrôle de la roue des saisons via un navigateur headless.

Régénère d'abord les SVG (animé avec aiguilles + statique sans aiguilles) depuis la
config courante, puis exporte chacun en PNG. Il n'y a que ces deux figures : plus de
comparaison A/B par décennie figée, le nouvel anneau à deux couches montre déjà les deux
décennies en même temps sur chaque figure.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import render_wheel  # noqa: E402
from seasons_wheel.config import WheelConfig  # noqa: E402

CANDIDATE_BROWSERS = (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
)

# (nom du fichier SVG déjà écrit par render_all, nom du PNG à produire à côté)
FIGURES = (
    ("seasons-wheel.svg", "seasons-wheel.png"),
    ("seasons-wheel-no-markers.svg", "seasons-wheel-no-markers.png"),
)


def find_browser() -> Path | None:
    for candidate in CANDIDATE_BROWSERS:
        path = Path(candidate)
        if path.is_file():
            return path
    for name in ("msedge", "chrome", "google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def _wrap_svg_html(svg_markup: str, background: str) -> str:
    return (
        "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\" />"
        f"<style>* {{ box-sizing: border-box; }} body {{ margin: 0; background: {background}; }} "
        "svg { display: block; }</style></head><body>" + svg_markup + "</body></html>"
    )


def export_figure_png(svg_path: Path, out_png: Path, width: int, height: int, background: str, browser: Path) -> None:
    """Exporte un unique SVG en PNG via un navigateur headless (Edge ou Chrome)."""

    svg_markup = svg_path.read_text(encoding="utf-8")
    html = _wrap_svg_html(svg_markup, background)
    with tempfile.TemporaryDirectory(prefix="wheel-capture-") as tmp:
        html_path = Path(tmp) / "capture.html"
        html_path.write_text(html, encoding="utf-8")
        out_png.parent.mkdir(parents=True, exist_ok=True)
        command = [
            str(browser),
            "--headless=new",
            "--disable-gpu",
            "--force-color-profile=srgb",
            # Sans ce délai, la capture headless survient souvent avant la fin du
            # chargement réseau de la police Google Fonts (@import), et le PNG fige alors
            # la police de repli au lieu de Dancing Script — d'où l'écart avec le SVG.
            "--virtual-time-budget=4000",
            f"--screenshot={out_png}",
            f"--window-size={width},{height}",
            html_path.resolve().as_uri(),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 or not out_png.is_file():
            raise SystemExit(f"Échec de la capture avec {browser} :\n{result.stdout}\n{result.stderr}")


def export_figures(
    document: dict[str, Any], config: WheelConfig, out_dir: Path, export_dir: Path, browser: Path
) -> list[Path]:
    """Écrit les SVG de travail (via render_all, dans ``out_dir`` — utilisés par l'atelier
    d'aperçu), puis exporte les deux figures (SVG + PNG) dans ``export_dir``. Retourne les
    chemins exportés."""

    render_wheel.render_all(document, config, out_dir)
    width, height = int(config.width), int(config.height)
    export_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for svg_name, png_name in FIGURES:
        svg_src = out_dir / svg_name
        svg_dst = export_dir / svg_name
        shutil.copyfile(svg_src, svg_dst)
        written.append(svg_dst)
        png_dst = export_dir / png_name
        export_figure_png(svg_src, png_dst, width, height, config.background, browser)
        written.append(png_dst)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporte les deux figures de la roue des saisons en SVG + PNG.")
    parser.add_argument("--config", type=Path, default=render_wheel.DEFAULT_CONFIG)
    parser.add_argument("--result", type=Path, default=render_wheel.DEFAULT_RESULT)
    parser.add_argument("--out-dir", type=Path, default=render_wheel.DEFAULT_OUT_DIR, help="dossier de travail (SVG utilisés par l'atelier d'aperçu)")
    parser.add_argument("--export-dir", type=Path, default=ROOT, help="dossier d'export final des figures (SVG + PNG)")
    parser.add_argument("--browser", type=Path, help="chemin explicite vers l'exécutable du navigateur")
    args = parser.parse_args()

    browser = args.browser or find_browser()
    if browser is None or not Path(browser).is_file():
        raise SystemExit(
            "Aucun navigateur headless trouvé (Edge ou Chrome). "
            "Utiliser --browser pour indiquer un chemin explicite."
        )

    document = render_wheel.load_document(args.result)
    config = render_wheel.load_config(args.config)
    exported = export_figures(document, config, args.out_dir, args.export_dir, browser)

    for path in exported:
        print(f"Export écrit : {path}")


if __name__ == "__main__":
    main()
