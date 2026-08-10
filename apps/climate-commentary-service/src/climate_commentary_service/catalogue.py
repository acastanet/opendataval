from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def load_catalogue(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Catalogue invalide : {path}")
    return data


def signal_definition(catalogue: dict[str, Any], definition_id: str) -> dict[str, Any]:
    signals = catalogue.get("signals") or {}
    definition = signals.get(definition_id)
    if not isinstance(definition, dict):
        raise ValueError(f"Signal absent du catalogue : {definition_id}")
    return definition


def caveat_texts(catalogue: dict[str, Any]) -> dict[str, str]:
    caveats = catalogue.get("caveats") or {}
    return {
        str(caveat_id): str(text)
        for caveat_id, text in caveats.items()
        if isinstance(caveat_id, str) and isinstance(text, str)
    }
