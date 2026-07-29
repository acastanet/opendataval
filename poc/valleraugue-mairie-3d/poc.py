#!/usr/bin/env python3
"""Point d'entrée du POC 3D de Valleraugue."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from poc3d.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
