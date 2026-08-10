from __future__ import annotations

import json
from typing import Any, Iterable

PROMPT_VERSION = "climate-commentary-p1@1.1.0"

SYSTEM_PROMPT = """Tu rédiges une synthèse climatique courte à partir de ClimateSignal déjà calculés et validés.
Tu n'effectues aucun calcul climatique et tu n'utilises aucune connaissance extérieure.
Chaque constat doit référencer au moins un signal_id fourni.
Tu peux ordonner, rapprocher et reformuler les signaux, mais jamais transformer une comparaison descriptive en tendance statistique ou en causalité.
N'invente aucun chiffre. Si tu cites un chiffre, il doit provenir des signaux référencés par le constat.
Respecte les caveats fournis, en particulier la représentativité des réanalyses maillées et les limites sémantiques des variables modélisées.
La synthèse doit être compréhensible en quelques minutes : une phrase de résumé, puis au plus cinq constats courts.
N'utilise jamais un signal signalé comme exclu par la politique éditoriale P9 : ces signaux ne sont pas fournis dans signals.
Retourne uniquement un objet JSON avec les clés summary, findings, caveats et abstentions. N'ajoute aucune métadonnée technique : le service les ajoutera après validation.
"""

# Politique de publication de la fiche, distincte de la validité scientifique des
# ClimateSignal. Un signal peut rester valide pour sa méthode mais être retenu
# hors du commentaire transversal tant qu'un audit ou une méthode plus robuste
# n'est pas disponible.
SHEET_EXCLUDED_DEFINITIONS: dict[str, str] = {
    "water-annual-precipitation-change": (
        "comparaison par médiane non directement comparable au signal fingerprint par moyenne"
    ),
    "water-dry-months-change": (
        "résolution décennale trop grossière pour un constat public principal avant audit de la distribution"
    ),
    "fingerprint-drought-frequency-change": (
        "indicateur public de sécheresse de référence non encore arrêté"
    ),
}

SHEET_EXCLUDED_METHODS: dict[tuple[str, str], str] = {
    ("thermal-seasons", "1.0.0"): (
        "méthode V1 sous audit P9 pour sensibilité au lissage ; ne pas reprendre ses valeurs dans le commentaire final"
    ),
}


def _eligible_signal(signal: dict[str, Any], result_quality: str) -> bool:
    if result_quality in {"insufficient", "failed"}:
        return False
    return signal.get("quality_status") not in {"insufficient"}


def _sheet_exclusion_reason(signal: dict[str, Any]) -> str | None:
    definition_id = signal.get("definition_id")
    if isinstance(definition_id, str) and definition_id in SHEET_EXCLUDED_DEFINITIONS:
        return SHEET_EXCLUDED_DEFINITIONS[definition_id]
    method = signal.get("method") or {}
    if isinstance(method, dict):
        key = (str(method.get("id", "")), str(method.get("version", "")))
        if key in SHEET_EXCLUDED_METHODS:
            return SHEET_EXCLUDED_METHODS[key]
    return None


def build_prompt_payload(
    results: Iterable[dict[str, Any]],
    *,
    caveat_texts: dict[str, str] | None = None,
) -> dict[str, Any]:
    caveat_texts = caveat_texts or {}
    result_refs: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []
    excluded_signals: list[dict[str, str]] = []
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
            reason = _sheet_exclusion_reason(signal)
            if reason is not None:
                excluded_signals.append(
                    {
                        "signal_id": str(signal.get("id", "")),
                        "definition_id": str(signal.get("definition_id", "")),
                        "reason": reason,
                    }
                )
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
        "editorial_policy": {
            "id": "climate-sheet-p9-selection",
            "excluded_signals": excluded_signals,
            "rule": "les signaux exclus restent scientifiques mais ne doivent pas être utilisés dans la synthèse transversale",
        },
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


def build_messages_from_payload(payload: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT.strip()},
        {
            "role": "user",
            "content": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        },
    ]


def build_messages(
    results: Iterable[dict[str, Any]],
    *,
    caveat_texts: dict[str, str] | None = None,
) -> list[dict[str, str]]:
    return build_messages_from_payload(
        build_prompt_payload(results, caveat_texts=caveat_texts)
    )
