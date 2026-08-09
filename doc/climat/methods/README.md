# Registre des méthodes climatiques

Ce répertoire contient les méthodes scientifiques et techniques canoniques de la future fiche climat OpenDataVal.

## Statut après P2

| Méthode | Version | Statut | POC source | Question |
|---|---:|---|---|---|
| `climate-overview` | 1.0.0 | `draft` | `poc/climat/general/` | À quoi ressemble normalement une année climatique dans cette zone ? |
| `climate-fingerprint` | 4.0.0 | `draft` | `poc/climat/empreinte-climatique/` | Qu'est-ce qui a changé au cours des trente dernières années ? |
| `thermal-seasons` | 1.0.0 | `draft` | `poc/climat/saisons/` | Comment les régimes thermiques de l'année se sont-ils déplacés ? |
| `water-through-year` | 1.0.0 | `draft` | `poc/climat/bilan eau/` | Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ? |

**P2 est terminé.** Les quatre comportements méthodologiques ont été extraits, confrontés au code actuel et documentés. Le statut reste `draft` : aucune méthode ne devient `validated` avant P3, P4 et P5.

## Structure

Chaque version contient :

```text
method.yaml
science.md
technical.md
CHANGELOG.md
```

`interpretation.md` sera ajouté en P3.

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
- résumé déterministe legacy à remplacer par `ClimateSignal` + commentaire IA.

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

## Acquisition

Les méthodes référencent la famille scientifique et les variables nécessaires. Elles ne figent pas l'interface CDS lorsqu'un actif équivalent peut être substitué.

L'interface ERA5-Land time-series reste la référence des POC/golden masters ; `apps/copernicus` devra choisir l'actif de production et P5 démontrer l'équivalence numérique.

## Étape suivante : P3

Pour chacune des quatre méthodes, créer `interpretation.md` avec :

- `ClimateSignal` attendus ;
- signification des directions et unités ;
- formulations autorisées ;
- formulations interdites ;
- caveats obligatoires ;
- conditions d'abstention ;
- règles de combinaison de signaux ;
- exemples de commentaires acceptables/refusés.

P3 ne doit modifier aucun calcul numérique.

Puis :

- **P4** — contrats `ClimateSnapshot`, `ClimateResult`, `ClimateSignal`, `ClimateCommentary`, `ClimateSheet` ;
- **P5** — golden masters et tests d'équivalence.
