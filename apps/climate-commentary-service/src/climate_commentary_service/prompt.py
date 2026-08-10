from __future__ import annotations

import json
from typing import Any, Iterable

PROMPT_VERSION = "climate-commentary-p1@1.0.0"

SYSTEM_PROMPT = """Tu rédiges une synthèse climatique courte à partir de ClimateSignal déjà calculés et validés.
Tu n'effectues aucun calcul climatique et tu n'utilises aucune connaissance extérieure.
Chaque constat doit référencer au moins un signal_id fourni.
Tu peux ordonner, rapprocher et reformuler les signaux, mais jamais transformer une comparaison descriptive en tendance statistique ou en causalité.
N'invente aucun chiffre. Si tu cites un chiffre, il doit provenir des signaux référencés par le constat.
Respecte les caveats fournis, en particulier la représentativité des réanalyses maillées et les limites sémantiques des variables modélisées.
La synthèse doit être compréhensible en quelques minutes : une phrase de résumé, puis au plus cinq constats courts.
Retourne uniquement un objet JSON avec les clés summary, findings, caveats et abstentions. N'ajoute aucune métadonnée technique : le service les ajoutera après validation.
"""


def _eligible_signal(signal: dict[str, Any], result_quality: str) -> bool:
    if result_quality in {"insufficient", "failed"}:
        return False
    return signal.get("quality_status") not in {"insufficient"}


def build_prompt_payload(
    results: Iterable[dict[str, Any]],
    *,
    caveat_texts: dict[str, str] | None = None,
) -> dict[str, Any]:
    caveat_texts = caveat_texts or {}
    result_refs: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []
    used_caveat_ids: set[str] = set()

    for result in results:
        quality = str((result.get("quality") or {}).get("status", "insufficient"))
        result_refs.append(
            {
                "result_id": result.get("result_id"),
                "method": result.get("method"),
                "representativity": result.get("representativity"),
                "quality_status": quality,
            }
        )
        for signal in result.get("signals") or []:
            if not isinstance(signal, dict) or not _eligible_signal(signal, quality):
                continue
            signals.append(signal)
            used_caveat_ids.update(str(item) for item in signal.get("caveat_ids") or [])

    caveats = [
        {"id": caveat_id, "text": caveat_texts[caveat_id]}
        for caveat_id in sorted(used_caveat_ids)
        if caveat_id in caveat_texts
    ]

    return {
        "prompt_version": PROMPT_VERSION,
        "scope": "sheet",
        "result_refs": result_refs,
        "signals": signals,
        "caveats": caveats,
        "output_contract": {
            "summary": "une phrase sans chiffre nouveau",
            "findings": [
                {
                    "id": "finding-1",
                    "text": "constat court",
                    "signal_ids": ["signal-id"],
                    "claim_level": "descriptive",
                }
            ],
            "caveats": [
                {"id": "caveat-id", "text": "reformulation courte", "signal_ids": ["signal-id"]}
            ],
            "abstentions": [{"reason": "raison explicite", "signal_definition_id": None}],
        },
    }


def build_messages(
    results: Iterable[dict[str, Any]],
    *,
    caveat_texts: dict[str, str] | None = None,
) -> list[dict[str, str]]:
    payload = build_prompt_payload(results, caveat_texts=caveat_texts)
    return [
        {"role": "system", "content": SYSTEM_PROMPT.strip()},
        {
            "role": "user",
            "content": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        },
    ]
