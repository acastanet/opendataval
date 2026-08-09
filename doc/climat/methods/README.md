# Registre des méthodes climatiques

Ce répertoire contient les méthodes scientifiques et techniques canoniques de la future fiche climat OpenDataVal.

## Statut après P2

| Méthode | Version | Statut | POC source | Question |
|---|---:|---|---|---|
| `climate-overview` | 1.0.0 | `draft` | `poc/climat/general/` | À quoi ressemble normalement une année climatique dans cette zone ? |
| `climate-fingerprint` | 4.0.0 | `draft` | `poc/climat/empreinte-climatique/` | Qu'est-ce qui a changé au cours des trente dernières années ? |
| `thermal-seasons` | 1.0.0 | `draft` | `poc/climat/saisons/` | Comment les régimes thermiques de l'année se sont-ils déplacés ? |
| `water-through-year` | 1.0.0 | `draft` | `poc/climat/bilan eau/` | Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ? |

**P2 est terminé.** Les quatre comportements méthodologiques ont été extraits, confrontés au code actuel et documentés. Le statut reste `draft` conformément à la gouvernance : aucune méthode ne devient `validated` avant P3, P4 et P5.

## Structure d'une méthode

Chaque version contient :

```text
method.yaml
science.md
technical.md
CHANGELOG.md
```

`interpretation.md` sera ajouté en P3.

## Décisions P2

### Climate overview

- noyau V1 : température, précipitations, climatologie mensuelle et représentativité spatiale ;
- aucune descente d'échelle automatique ;
- jours de gel, jours ≥30 °C et nuits ≥20 °C exclus du noyau tant qu'ils sont approximés par température moyenne quotidienne ;
- réintroduction uniquement avec vrais minima/maxima quotidiens et tests.

### Climate fingerprint

- vent V4 : ERA5-Land `u10/v10` ;
- pluie intense : compte des jours dépassant le P95 des jours humides, sans utiliser abusivement le nom R95p/R95pTOT ;
- couleur robuste V4 : convention éditoriale OpenDataVal, pas indice scientifique universel ;
- résumé textuel déterministe du POC : logique legacy appelée à être remplacée par `ClimateSignal` + commentaire IA.

### Thermal seasons

- saisons thermiques locales T25/T75, pas saisons météorologiques fixes ;
- complétude, calendrier sans 29 février, lissage degré 3 et franchissements figés ;
- comparaison entre décennies descriptive, sans test de tendance ;
- saison de croissance secondaire et distincte.

### Water through year

- conversion des accumulations ERA5-Land mensuelles vérifiée dans la documentation ECMWF ;
- signe de `total_evaporation` documenté ;
- stock 0–100 cm = grandeur dérivée du modèle, jamais réserve utile ou mesure de nappe ;
- sécheresse `SPEI-3 < -1` distincte de la métrique relative P10 de l'empreinte.

## Décision transversale d'acquisition

Les méthodes canoniques référencent la famille scientifique et les variables nécessaires. Elles ne figent pas une interface CDS lorsque plusieurs actifs peuvent fournir une grandeur équivalente.

L'interface ERA5-Land time-series reste la référence des POC et des futurs golden masters ; `apps/copernicus` devra choisir l'actif de production stable et P5 devra vérifier l'équivalence numérique.

## Règle de dépendance

Le code futur devra conserver :

```text
method.id
method.version
```

Une fiche publiée doit rester reproductible après l'introduction d'une nouvelle version de méthode.

## Étape suivante : P3

P3 ne modifiera pas les quatre méthodes numériques. Il ajoutera une couche d'interprétation versionnée autour de leurs sorties.

Pour chacune des quatre méthodes, créer :

```text
interpretation.md
```

avec :

- catalogue des `ClimateSignal` attendus ;
- signification exacte de chaque direction et unité ;
- formulations autorisées ;
- formulations interdites ;
- caveats obligatoires ;
- conditions de non-interprétation ;
- règles de combinaison de plusieurs signaux ;
- exemples de commentaires acceptables et refusés.

P3 doit être écrit de manière à devenir ensuite une entrée contrôlée de `climate-commentary-service`, sans demander au LLM de reconstruire la méthode depuis les séries brutes.

Puis :

- **P4** — `ClimateSnapshot`, `ClimateResult`, `ClimateSignal`, `ClimateCommentary`, `ClimateSheet` ;
- **P5** — golden masters et tests d'équivalence.
