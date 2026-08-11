"""CLI de rendu de la roue des saisons : lit wheel-config.json + le résultat V4,
écrit un ou plusieurs SVG. Voir --help pour le mode --watch --serve (atelier de réglage)."""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from seasons_wheel.config import WheelConfig  # noqa: E402
from seasons_wheel.render import build_document, render_wheel_svg  # noqa: E402

DEFAULT_CONFIG = ROOT / "wheel-config.json"
DEFAULT_RESULT = ROOT / "output" / "thermal-seasons-v4-replay.json"
DEFAULT_OUT_DIR = ROOT / "output"
VERSION_FILE_NAME = ".wheel-version"


def load_document(result_path: Path) -> dict[str, Any]:
    if not result_path.is_file():
        raise SystemExit(
            f"Résultat V4 introuvable : {result_path}\n"
            "Lancer d'abord rebuild.bat (ou collect-and-build.bat) depuis saison_v2."
        )
    result = json.loads(result_path.read_text(encoding="utf-8"))
    return build_document(result)


def load_config(config_path: Path) -> WheelConfig:
    if not config_path.is_file():
        config_path.write_text(WheelConfig().to_json(), encoding="utf-8")
        print(f"Config par défaut créée : {config_path}")
    return WheelConfig.from_file(config_path)


def render_all(document: dict[str, Any], config: WheelConfig, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = [out_dir / "seasons-wheel.svg"]
    written[0].write_text(render_wheel_svg(document, config, state=None), encoding="utf-8")
    # Version sans les aiguilles animées, à côté de la version animée ci-dessus.
    no_markers_path = out_dir / "seasons-wheel-no-markers.svg"
    no_markers_config = config.merged({"show_active_markers": False})
    no_markers_path.write_text(render_wheel_svg(document, no_markers_config, state=None), encoding="utf-8")
    written.append(no_markers_path)
    for period in (document["early_period"], document["late_period"]):
        path = out_dir / f"seasons-wheel-{period}.svg"
        path.write_text(render_wheel_svg(document, config, state=period), encoding="utf-8")
        written.append(path)
    return written


def watch_loop(
    config_path: Path,
    result_path: Path,
    out_dir: Path,
    poll_seconds: float = 0.4,
    debounce_seconds: float = 0.6,
) -> None:
    """Régénère à chaque changement de ``config_path``, mais seulement une fois que le
    fichier a cessé de bouger pendant ``debounce_seconds`` : un éditeur qui écrit en
    plusieurs passes (auto-save, écriture atomique) ne doit pas déclencher un rendu par
    passe, sous peine de faire clignoter l'aperçu à chaque sauvegarde."""

    document = load_document(result_path)
    version_path = out_dir / VERSION_FILE_NAME
    last_seen_mtime: float | None = None
    last_rendered_mtime: float | None = None
    pending_since: float | None = None
    version = 0
    print(f"Surveillance de {config_path.name} (Ctrl+C pour arrêter)")
    try:
        while True:
            mtime = config_path.stat().st_mtime if config_path.is_file() else -1.0
            now = time.monotonic()
            if mtime != last_seen_mtime:
                last_seen_mtime = mtime
                pending_since = now
            elif pending_since is not None and mtime != last_rendered_mtime and (now - pending_since) >= debounce_seconds:
                pending_since = None
                try:
                    config = load_config(config_path)
                    render_all(document, config, out_dir)
                    last_rendered_mtime = mtime
                    version += 1
                    version_path.write_text(str(version), encoding="utf-8")
                    print(f"[{time.strftime('%H:%M:%S')}] rendu régénéré (v{version})")
                except Exception as exc:  # noqa: BLE001 - on continue de surveiller malgré une config invalide
                    last_rendered_mtime = mtime
                    print(f"[{time.strftime('%H:%M:%S')}] erreur de rendu, config ignorée : {exc}", file=sys.stderr)
            time.sleep(poll_seconds)
    except KeyboardInterrupt:
        print("\nArrêt de la surveillance.")


def start_server(root_dir: Path, port: int) -> socketserver.TCPServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root_dir))

    class QuietTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    httpd = QuietTCPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def main() -> None:
    parser = argparse.ArgumentParser(description="Rend la roue des saisons thermiques en SVG.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="fichier de paramètres visuels")
    parser.add_argument("--result", type=Path, default=DEFAULT_RESULT, help="ClimateResult V4 (thermal-seasons-v4-replay.json)")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="répertoire de sortie des SVG")
    parser.add_argument("--state", help="restreint le rendu à une décennie (ex. 2016-2025), figé sans animation")
    parser.add_argument("--out", type=Path, help="chemin de sortie unique, utilisé avec --state")
    parser.add_argument("--watch", action="store_true", help="régénère à chaque sauvegarde de --config")
    parser.add_argument(
        "--debounce", type=float, default=0.6,
        help="délai (s) sans changement du fichier avant de régénérer, avec --watch (évite les rendus en rafale)",
    )
    parser.add_argument("--serve", action="store_true", help="sert wheel-preview.html en local (avec --watch)")
    parser.add_argument("--port", type=int, default=8765, help="port du serveur local (--serve)")
    parser.add_argument("--open", action="store_true", help="ouvre l'atelier dans le navigateur (avec --serve)")
    args = parser.parse_args()

    if args.watch:
        httpd = None
        if args.serve:
            httpd = start_server(ROOT, args.port)
            url = f"http://127.0.0.1:{args.port}/wheel-preview.html"
            print(f"Atelier d'aperçu : {url}")
            if args.open:
                webbrowser.open(url)
        try:
            watch_loop(args.config, args.result, args.out_dir, debounce_seconds=args.debounce)
        finally:
            if httpd is not None:
                httpd.shutdown()
        return

    document = load_document(args.result)
    config = load_config(args.config)

    if args.state:
        if args.state not in document["decades"]:
            available = ", ".join(document["decades"])
            parser.error(f"--state doit être l'une de : {available}")
        out_path = args.out or (args.out_dir / f"seasons-wheel-{args.state}.svg")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(render_wheel_svg(document, config, state=args.state), encoding="utf-8")
        print(f"Écrit : {out_path}")
        return

    for path in render_all(document, config, args.out_dir):
        print(f"Écrit : {path}")


if __name__ == "__main__":
    main()
