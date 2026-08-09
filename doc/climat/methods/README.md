# Registre des méthodes climatiques

Ce répertoire contient les méthodes scientifiques, techniques et interprétatives canoniques de la future fiche climat OpenDataVal.

## Statut après P4

| Méthode | Version | Statut | POC source | Question |
|---|---:|---|---|---|
| `climate-overview` | 1.0.0 | `draft` | `poc/climat/general/` | À quoi ressemble normalement une année climatique dans cette zone ? |
| `climate-fingerprint` | 4.0.0 | `draft` | `poc/climat/empreinte-climatique/` | Qu'est-ce qui a changé au cours des trente dernières années ? |
| `thermal-seasons` | 1.0.0 | `draft` | `poc/climat/saisons/` | Comment les régimes thermiques de l'année se sont-ils déplacés ? |
| `water-through-year` | 1.0.0 | `draft` | `poc/climat/bilan eau/` | Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ? |

**P2, P3 et P4 sont terminés.** Les comportements méthodologiques sont documentés, leurs règles d'interprétation sont définies et les échanges communs sont formalisés par JSON Schema. Le statut reste `draft` jusqu'aux golden masters P5.

## Structure d'une méthode

Chaque version contient :

```text
method.yaml
science.md
technical.md
interpretation.md
CHANGELOG.md
```

Rôle des fichiers :

- `method.yaml` — contrat méthodologique lisible par machine ;
- `science.md` — question, fondements scientifiques, portée et limites ;
- `technical.md` — algorithme exact et décisions d'implémentation ;
- `interpretation.md` — `ClimateSignal` autorisés, formulations permises/interdites, caveats et abstention ;
- `CHANGELOG.md` — décisions de version.

Le cadre commun de commentaire IA est dans `doc/climat/06-AI-INTERPRETATION.md` et le registre sémantique des signaux dans `doc/climat/signals/catalogue.yaml`.

Les contrats techniques communs sont documentés dans `doc/climat/03-COMMON-CONTRACT.md` et publiés dans `packages/climate-contracts/`.

## Décisions P2 principales

### Climate overview

- noyau : température, précipitations, climatologie mensuelle et représentativité spatiale ;
- aucun downscaling automatique ;
- compteurs gel / ≥30 °C / nuits ≥20 °C exclus tant qu'ils utilisent une approximation par température moyenne ;
- réintroduction uniquement à partir de vrais minima/maxima quotidiens.

### Climate fingerprint

- vent : ERA5-Land `u10/v10` ;
- pluie intense : compte annuel de jours > P95 des jours humides, sans le nom R95p/R95pTOT ;
- couleur robuste V4 : convention éditoriale OpenDataVal ;
- résumé déterministe legacy destiné à être remplacé par `ClimateSignal` + commentaire IA.

### Thermal seasons

- saisons thermiques locales T25/T75 ;
- complétude, calendrier sans 29 février, lissage degré 3 et franchissements figés ;
- comparaison entre décennies descriptive ;
- saison de croissance secondaire et distincte.

### Water through year

- conversion des accumulations ERA5-Land mensuelles vérifiée ECMWF ;
- signe de `total_evaporation` documenté ;
- stock 0–100 cm = grandeur dérivée du modèle, jamais réserve utile ou mesure de nappe ;
- sécheresse `SPEI-3 < -1` distincte de la métrique P10 de l'empreinte.

## Règles P3 communes

Le service IA ne calcule aucune valeur scientifique.

Chaque constat doit être ancré ainsi :

```text
finding
  ↓
signal_id
  ↓
ClimateSignal
  ↓
evidence
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

Les signaux utilisent actuellement le niveau de preuve `descriptive`. Les niveaux `statistical_trend` et `causal_attribution` sont réservés à de futures méthodes dédiées.

## Contrats P4

Les cinq contrats sont :

```text
ClimateSnapshot
ClimateResult
ClimateSignal
ClimateCommentary
ClimateSheet
```

Schémas :

```text
packages/climate-contracts/schemas/
```

Exemples :

```text
packages/climate-contracts/examples/
```

Le champ `ClimateResult.data` reste spécifique à chaque méthode, tandis que l'enveloppe commune impose provenance, méthode/version, représentativité, qualité, signaux et caveats.

`ClimateSignal.evidence` fournit des JSON Pointer vers `ClimateResult`. Chaque `ClimateCommentary.findings[]` doit référencer au moins un signal.

La validation applicative complètera JSON Schema pour vérifier les relations entre documents.

## Acquisition

Les méthodes référencent la famille scientifique et les variables nécessaires. Elles ne figent pas l'interface CDS lorsqu'un actif équivalent peut être substitué.

L'interface ERA5-Land time-series reste la référence des POC/golden masters ; `apps/copernicus` devra choisir l'actif de production et P5 démontrer l'équivalence numérique.

## Étape suivante : P5

P5 doit transformer les sorties actuelles des POC en références scientifiques de non-régression.

Pour chaque méthode :

```text
POC réel
 ↓
golden master
 ↓
adaptateur vers ClimateResult
 ↓
validation JSON Schema
 ↓
validation des ClimateSignal
 ↓
test d'équivalence numérique
```

P5 pourra aussi introduire des sous-schémas propres à `ClimateResult.data` si les sorties réelles montrent qu'ils sont suffisamment stables.

Puis :

- **P6+** — migration progressive des microservices.
