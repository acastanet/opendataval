# climate-commentary-service

Service P8 d'interprétation contrôlée de la fiche climat OpenDataVal.

Référence normative : `doc/climat/06-AI-INTERPRETATION.md`.

## Chaîne

```text
ClimateResult
  ↓
ClimateSignal[]
  ↓
prompt contrôlé
  ↓
ILAAS / mistral-medium-latest
  ↓
payload éditorial JSON
  ↓
validation croisée
  ↓
ClimateCommentary
```

Le LLM ne reçoit ni séries brutes ni `ClimateResult.data`. Il reçoit seulement les références des résultats, leur représentativité, les `ClimateSignal` éligibles et les caveats autorisés.

## Même LLM que la géologie BRGM

Le fournisseur officiel est le même que pour `geologie-service` :

- endpoint OpenAI-compatible : `https://llm.ilaas.fr/v1/chat/completions` ;
- modèle par défaut : `mistral-medium-latest` ;
- température : `0` ;
- même clé serveur ;
- même configuration de synthèse.

Le service climat réutilise directement :

```text
GEOLOGIE_LLM_URL
GEOLOGIE_LLM_API_KEY
GEOLOGIE_LLM_VISION_MODEL
GEOLOGIE_LLM_VISION_TIMEOUT_MS
GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS
```

Les valeurs par défaut sont identiques à celles de la lecture des fiches BRGM : `mistral-medium-latest`, 45 s et 700 tokens.

Si `GEOLOGIE_LLM_API_KEY` est absente ou si ILAAS échoue, aucun commentaire IA n'est produit. La fiche reste utilisable avec ses quatre infographies ; aucun texte de secours n'est inventé.

## Garanties P8

Après l'appel ILAAS, le résultat est soumis au validateur existant. Il contrôle notamment :

- existence de chaque `signal_id` ;
- résolution de chaque `evidence.result_pointer` ;
- conformité méthode, métrique, unité, direction et `claim_level` au catalogue ;
- interdiction de dépasser le niveau de preuve du signal ;
- rejet d'un résultat `insufficient` ou `failed` ;
- rejet des chiffres non ancrés dans les signaux référencés ;
- absence de chiffre nouveau dans le résumé transversal ;
- justification des caveats ;
- `validation.status=valid` avant publication.

Le fournisseur LLM n'est donc jamais l'autorité scientifique.

## Prompt

Version :

```text
climate-commentary-p1@1.0.0
```

Le prompt demande une phrase de synthèse et au plus cinq constats courts. Il interdit calcul climatique, connaissance extérieure, significativité absente et attribution causale.

## Génération réelle avec ILAAS

Avec les mêmes variables d'environnement que `geologie-service` :

```bash
python apps/climate-commentary-service/scripts/generate_ilaas_commentary.py \
  result-overview.json result-fingerprint.json result-seasons.json result-water.json \
  --output climate-commentary.json
```

Le fichier n'est écrit que si la réponse ILAAS est un JSON éditorial valide **et** si le `ClimateCommentary` final passe tous les contrôles P8.

Pour décomposer manuellement le processus, les commandes `prepare_prompt.py` et `build_commentary.py` restent disponibles.

## Intégration `/climat/`

`climate-sheet-service` accepte un `ClimateCommentary` validé avec `--commentary`. Sans ce fichier, le bloc « En bref — Lecture IA contrôlée » n'est pas affiché.

## Tests

```bash
python -m pip install -r apps/climate-commentary-service/requirements-test.txt
python -m unittest discover -s apps/climate-commentary-service/tests -p "test_*.py" -v
```

La CI n'appelle jamais ILAAS. L'adaptateur réseau est testé avec une réponse OpenAI-compatible simulée, puis les tests P8 vérifient le commentaire et les refus attendus.

## Hors périmètre

- calcul scientifique par le LLM ;
- lecture du SVG par le LLM ;
- second fournisseur LLM spécifique au climat ;
- test de tendance ou attribution causale.
