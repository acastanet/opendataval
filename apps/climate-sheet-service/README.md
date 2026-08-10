# climate-sheet-service

Orchestrateur de présentation de la fiche climat OpenDataVal.

Ce composant **ne calcule aucun indicateur scientifique**. Il assemble les quatre `ClimateResult` produits par les services validés et délègue le SVG à leurs renderers P7.

## Chaîne

```text
climate-overview ClimateResult
climate-fingerprint ClimateResult
thermal-seasons ClimateResult
water-through-year ClimateResult
          ↓
climate-sheet-service
          ↓
apps/web/public/climat/generated/*.svg
          ↓
/climat/
```

## Génération locale

Avec les artefacts de replay validés utilisés pendant P6 :

```bash
python apps/climate-sheet-service/scripts/build_static_sheet.py
```

Valeurs par défaut :

```text
poc/climat/saisons/output/p6-overview-replay/climate-result.json
poc/climat/saisons/output/p6-replay/climate-result.json
poc/climat/saisons/output/p6-seasons-replay/climate-result.json
poc/climat/bilan eau/output/p6-water-replay/climate-result.json
```

Les chemins peuvent être remplacés avec `--overview`, `--fingerprint`, `--seasons` et `--water`.

La sortie par défaut est :

```text
apps/web/public/climat/generated/
├── climate-overview-v1-neutral.svg
├── climate-fingerprint-v4-neutral.svg
├── thermal-seasons-v1-neutral.svg
├── water-through-year-v1-neutral.svg
└── manifest.json
```

## Responsabilité

L'assembleur :

- vérifie l'identifiant et la version de chaque méthode ;
- appelle les quatre renderers natifs validés ;
- conserve le thème `neutral` comme référence ;
- produit un manifeste léger de présentation.

Il ne :

- télécharge aucune donnée Copernicus ;
- ne recalcule aucun indicateur ;
- ne modifie aucun `ClimateResult` ;
- n'appelle aucun LLM ;
- n'effectue aucun downscaling.

La version actuelle est volontairement statique. Le futur orchestrateur HTTP pourra remplacer les chemins locaux par des références de résultats sans modifier la page ni les renderers scientifiques.
