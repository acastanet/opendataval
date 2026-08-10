# Registre des méthodes climatiques

Ce répertoire contient les méthodes scientifiques, techniques et interprétatives canoniques de la future fiche climat OpenDataVal.

## Statut après P5

| Méthode | Version | Statut scientifique | Golden master P5 | Prochaine preuve |
|---|---:|---|---|---|
| `climate-overview` | 1.0.0 | `draft` | CI `pass` | service natif P6 |
| `climate-fingerprint` | 4.0.0 | `draft` | CI `pass` | service natif P6 |
| `thermal-seasons` | 1.0.0 | `draft` | CI `pass` | service natif P6 |
| `water-through-year` | 1.0.0 | `draft` | CI `pass` | service natif P6 |

P2 à P5 sont maintenant réalisés : méthodes extraites, interprétation bornée, contrats communs définis et sorties historiques figées par des golden masters exécutés en CI.

Les méthodes restent volontairement `draft` : P5 fige **la cible de non-régression**, mais ce sera P6 qui devra démontrer qu'un nouveau microservice calcule nativement le même résultat dans les tolérances prévues.

## Structure d'une méthode

Chaque version contient :

```text
method.yaml
science.md
technical.md
interpretation.md
visualization.md
CHANGELOG.md
```

Rôle des fichiers :

- `method.yaml` — contrat méthodologique lisible par machine ;
- `science.md` — question, fondements scientifiques, portée et limites ;
- `technical.md` — algorithme exact et décisions d'implémentation ;
- `interpretation.md` — `ClimateSignal` autorisés, formulations permises/interdites, caveats et abstention ;
- `visualization.md` — traduction de la méthode en infographie : hiérarchie, comparaison, légendes et limites graphiques ;
- `CHANGELOG.md` — décisions de version.

Les règles visuelles communes sont dans `doc/climat/05-VISUALIZATION-GUIDELINES.md`. Le cadre commun de commentaire IA est dans `doc/climat/06-AI-INTERPRETATION.md`, le registre sémantique des signaux dans `doc/climat/signals/catalogue.yaml`, et les contrats communs dans `packages/climate-contracts/`.

## Décisions scientifiques majeures

### Climate overview

- noyau canonique : température, précipitations, climatologie mensuelle et représentativité spatiale ;
- aucun downscaling automatique ;
- compteurs gel / ≥30 °C / nuits ≥20 °C du POC conservés dans le golden master pour traçabilité mais **sans `ClimateSignal`** ;
- réintroduction uniquement à partir de vrais minima/maxima quotidiens.

### Climate fingerprint

- vent : ERA5-Land `u10/v10` ;
- pluie intense : compte annuel de jours > P95 des jours humides, sans le nom R95p/R95pTOT ;
- couleur robuste V4 : convention éditoriale OpenDataVal ;
- six comparaisons structurées deviennent six `ClimateSignal` descriptifs.

### Thermal seasons

- saisons thermiques locales T25/T75 ;
- complétude, calendrier sans 29 février, lissage degré 3 et franchissements figés ;
- golden master : 29 années `ok` sur 30 ;
- cinq comparaisons décennales restent valides et produisent cinq signaux ;
- saison de croissance secondaire et distincte.

### Water through year

- conversion des accumulations ERA5-Land mensuelles vérifiée ECMWF ;
- signe de `total_evaporation` documenté ;
- stock 0–100 cm = grandeur dérivée du modèle, jamais réserve utile ou mesure de nappe ;
- sécheresse `SPEI-3 < -1` distincte de la métrique P10 de l'empreinte ;
- golden master : 420 mois valides sur 420 pour les quatre variables principales.

## Règle d'interprétation

Le service IA ne calcule aucune valeur scientifique.

Chaque constat reste ancré ainsi :

```text
finding
  ↓
signal_id
  ↓
ClimateSignal
  ↓
evidence.result_pointer
  ↓
ClimateResult
  ↓
method.id + method.version
```

Aucune des quatre méthodes actuelles n'autorise par défaut :

- significativité statistique ;
- attribution causale ;
- précision à l'échelle de la parcelle ;
- transformation d'une réanalyse en observation locale.

## Contrats P4

Les cinq contrats sont :

```text
ClimateSnapshot
ClimateResult
ClimateSignal
ClimateCommentary
ClimateSheet
```

Schémas : `packages/climate-contracts/schemas/`.

Le champ `ClimateResult.data` reste spécifique à chaque méthode, tandis que l'enveloppe commune impose provenance, méthode/version, représentativité, qualité, signaux et caveats.

## Golden masters P5

Index :

```text
packages/climate-contracts/tests/README.md
```

Manifests :

```text
packages/climate-contracts/tests/golden-masters/
├── climate-fingerprint/v4/manifest.json
├── thermal-seasons/v1/manifest.json
├── water-through-year/v1/manifest.json
└── climate-overview/v1/manifest.json
```

Le workflow `.github/workflows/climate-contracts.yml` exécute les tests de non-régression et valide les contrats Draft 2020-12.

## Acquisition

Les méthodes référencent la famille scientifique et les variables nécessaires. Elles ne figent pas une interface CDS lorsqu'un actif équivalent peut être substitué.

L'interface ERA5-Land time-series reste la référence historique de certains POC/golden masters. `apps/copernicus` pourra choisir un actif de production plus adapté, à condition que P6 démontre l'équivalence avec le golden master correspondant.

## Étape suivante : P6

La prochaine preuve est une **équivalence de calcul native** :

```text
golden master P5
      ↓
nouveau service scientifique
      ↓
ClimateResult natif
      ↓
comparaison scientifique et contractuelle
      ↓
PASS
```

Ordre recommandé de migration :

1. `climate-fingerprint@4.0.0` ;
2. `thermal-seasons@1.0.0` ;
3. `water-through-year@1.0.0` ;
4. `climate-overview@1.0.0`.

Le climat général reste dernier afin de ne pas réintroduire par inadvertance les anciens indicateurs d'extrêmes approximatifs.
