# climate-commentary-service

Service P8 d'interprétation contrôlée de la fiche climat OpenDataVal.

Référence normative : `doc/climat/06-AI-INTERPRETATION.md`.

## Responsabilité

Le service intervient uniquement après les calculs scientifiques :

```text
ClimateResult
  ↓
ClimateSignal[]
  ↓
prompt contrôlé
  ↓
LLM interchangeable
  ↓
payload éditorial JSON
  ↓
validation croisée
  ↓
ClimateCommentary
```

Le LLM ne reçoit pas les séries brutes ni `ClimateResult.data`. Il reçoit les références des résultats, leur représentativité, les `ClimateSignal` éligibles et les caveats du catalogue.

Le cœur du service ne dépend d'aucun fournisseur de modèle. L'orchestrateur injecte un générateur qui prend les messages versionnés et retourne uniquement :

```json
{
  "summary": "...",
  "findings": [],
  "caveats": [],
  "abstentions": []
}
```

Le service ajoute ensuite les métadonnées, construit `ClimateCommentary` et refuse la publication si l'ancrage n'est pas démontré.

## Garanties P8

Le validateur contrôle notamment :

- chaque `signal_id` existe dans les `ClimateResult` fournis ;
- chaque `evidence.result_pointer` se résout ;
- méthode, métrique, unité, direction et niveau de preuve respectent `doc/climat/signals/catalogue.yaml` ;
- un finding ne dépasse jamais le `claim_level` de ses signaux ;
- un résultat `insufficient` ou `failed` ne peut pas soutenir un finding ;
- un chiffre écrit dans un finding doit être ancré dans les signaux référencés ;
- le résumé transversal n'introduit aucun chiffre ;
- les caveats publiés sont justifiés par les résultats ;
- un commentaire publié porte `validation.status=valid` et aucun claim non supporté.

Le validateur autorise l'arrondi éditorial simple d'une valeur déjà fournie par un signal ; il ne crée aucune nouvelle agrégation.

## Prompt

Version initiale :

```text
climate-commentary-p1@1.0.0
```

Le prompt demande une lecture courte : une phrase de synthèse et au plus cinq constats. Il interdit explicitement calcul, connaissance extérieure, significativité absente et attribution causale.

## Utilisation

Préparer le paquet de messages destiné au modèle :

```bash
python apps/climate-commentary-service/scripts/prepare_prompt.py \
  result-overview.json result-fingerprint.json result-seasons.json result-water.json \
  --output prompt.json
```

Après appel au modèle par l'orchestrateur, construire le commentaire validé :

```bash
python apps/climate-commentary-service/scripts/build_commentary.py \
  result-overview.json result-fingerprint.json result-seasons.json result-water.json \
  --model-payload model-payload.json \
  --model "provider/model" \
  --output climate-commentary.json
```

Aucun commentaire non validé ne doit être publié dans `/climat/`.

## Tests

```bash
python -m pip install -r apps/climate-commentary-service/requirements-test.txt
python -m unittest discover -s apps/climate-commentary-service/tests -p "test_*.py" -v
```

Les fixtures couvrent la fiche de validation et notamment le cas hydroclimatique contrasté : baisse descriptive des précipitations et du stock estival modélisé sans augmentation du nombre de mois secs SPEI-3.

## Hors périmètre

- calcul scientifique ;
- choix d'un fournisseur LLM ;
- accès réseau direct depuis le cœur du service ;
- test de tendance ou attribution causale ;
- commentaire fondé sur le SVG ou sur une image de l'infographie.
