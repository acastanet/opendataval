# Registre des méthodes climatiques

Ce répertoire contient les méthodes scientifiques, techniques et interprétatives canoniques de la future fiche climat OpenDataVal.

## Statut après P3

| Méthode | Version | Statut | POC source | Question |
|---|---:|---|---|---|
| `climate-overview` | 1.0.0 | `draft` | `poc/climat/general/` | À quoi ressemble normalement une année climatique dans cette zone ? |
| `climate-fingerprint` | 4.0.0 | `draft` | `poc/climat/empreinte-climatique/` | Qu'est-ce qui a changé au cours des trente dernières années ? |
| `thermal-seasons` | 1.0.0 | `draft` | `poc/climat/saisons/` | Comment les régimes thermiques de l'année se sont-ils déplacés ? |
| `water-through-year` | 1.0.0 | `draft` | `poc/climat/bilan eau/` | Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ? |

**P2 et P3 sont terminés.** Les quatre comportements méthodologiques ont été extraits du code actuel et chaque méthode possède maintenant ses règles d'interprétation. Le statut reste `draft` jusqu'aux contrats P4 et aux golden masters P5.

## Structure

Chaque version contient désormais :

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

## Acquisition

Les méthodes référencent la famille scientifique et les variables nécessaires. Elles ne figent pas l'interface CDS lorsqu'un actif équivalent peut être substitué.

L'interface ERA5-Land time-series reste la référence des POC/golden masters ; `apps/copernicus` devra choisir l'actif de production et P5 démontrer l'équivalence numérique.

## Étape suivante : P4

Créer les contrats communs :

```text
ClimateSnapshot
ClimateResult
ClimateSignal
ClimateCommentary
ClimateSheet
```

P4 doit notamment rendre machine-validables :

- les `signal_id` ;
- les pointeurs `evidence` ;
- le niveau de preuve ;
- les unités et directions ;
- les caveats ;
- les statuts de qualité ;
- l'obligation pour chaque `finding` IA de référencer au moins un signal.

Puis :

- **P5** — golden masters et tests d'équivalence ;
- **P6+** — migration progressive des microservices.
