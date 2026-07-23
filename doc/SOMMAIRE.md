# Sommaire de la documentation — OpenData Val-d'Aigoual

> Index de toute la documentation du dépôt. Point d'entrée : [`architecture/ARCHITECTURE-GENERALE.md`](architecture/ARCHITECTURE-GENERALE.md).
> Sommaire généré le : 2026-07-23

La colonne **MàJ** indique la dernière modification de contenu (dernier commit) ; **Vérif.** la dernière vérification de pertinence lors du rangement de la doc.

## Architecture

| Fichier | Description | MàJ | Vérif. |
|---|---|---|---|
| [architecture/ARCHITECTURE-GENERALE.md](architecture/ARCHITECTURE-GENERALE.md) | Vue d'ensemble technique : monolithe v1 + microservices v2, routage, services Compose | 2026-07-23 | 2026-07-23 |
| [architecture/conception-v2/](architecture/conception-v2/) | Spécifications transverses météo v2 (OpenAPI, provenance, observabilité, déploiement) | 2026-07-23 | 2026-07-23 |

## Microservices (v2)

| Fichier | Description | MàJ | Vérif. |
|---|---|---|---|
| [microservice/gateway-service/README.md](microservice/gateway-service/README.md) | Gateway : point d'entrée `/api/v2/*`, proxys, santé | 2026-07-23 | 2026-07-23 |
| [microservice/geography-service/README.md](microservice/geography-service/README.md) | Geography : résolution géographique d'un point | 2026-07-23 | 2026-07-23 |
| [microservice/geography-service/audit.md](microservice/geography-service/audit.md) | Audit de couverture du geography-service | 2026-07-23 | 2026-07-23 |
| [microservice/geography-service/operations.md](microservice/geography-service/operations.md) | Exploitation et diagnostic geography-service | 2026-07-23 | 2026-07-23 |
| [microservice/geography-service/parity-report.md](microservice/geography-service/parity-report.md) | Rapport de parité vs API historique | 2026-07-23 | 2026-07-23 |
| [microservice/geography-service/reference-corpus.json](microservice/geography-service/reference-corpus.json) | Corpus de référence pour les tests de parité | 2026-07-23 | 2026-07-23 |
| [microservice/weather-service/README.md](microservice/weather-service/README.md) | Weather : température météo ponctuelle | 2026-07-23 | 2026-07-23 |
| [microservice/weather-service/current-behaviour.md](microservice/weather-service/current-behaviour.md) | Comportement actuel du service météo | 2026-07-23 | 2026-07-23 |
| [microservice/weather-service/station-selection-policy.md](microservice/weather-service/station-selection-policy.md) | Politique de sélection de station | 2026-07-23 | 2026-07-23 |
| [microservice/weather-service/temperature-method-v1.md](microservice/weather-service/temperature-method-v1.md) | Méthode de détermination de température v1 | 2026-07-23 | 2026-07-23 |
| [microservice/weather-service/parity-corpus.json](microservice/weather-service/parity-corpus.json) | Corpus de parité météo | 2026-07-23 | 2026-07-23 |
| [microservice/copernicus/README.md](microservice/copernicus/README.md) | Copernicus : jobs climatiques ERA5 → PostGIS | 2026-07-23 | 2026-07-23 |
| [microservice/copernicus/exploitation.md](microservice/copernicus/exploitation.md) | Exploitation générale Copernicus | 2026-07-22 | 2026-07-23 |
| [microservice/copernicus/plan-meteo-essentiel.md](microservice/copernicus/plan-meteo-essentiel.md) | Plan météo essentiel via Copernicus | 2026-07-22 | 2026-07-23 |
| [microservice/copernicus/aide-code.md](microservice/copernicus/aide-code.md) | Aide au code Copernicus | 2026-07-22 | 2026-07-23 |

## v1 — Monolithe & mini-applications

| Fichier | Description | MàJ | Vérif. |
|---|---|---|---|
| [v1/monolithe/architecture-legacy.md](v1/monolithe/architecture-legacy.md) | Architecture du monolithe historique (api/web/worker/db) | 2026-07-12 | 2026-07-23 |
| [v1/meteo/page-meteo.md](v1/meteo/page-meteo.md) | Page météo `/meteo/` : fonctions et affichage | 2026-07-22 | 2026-07-23 |
| [v1/meteo/uxui-miniapp.md](v1/meteo/uxui-miniapp.md) | UX/UI de la mini-app météo | 2026-07-20 | 2026-07-23 |
| [v1/incendies/exploitation.md](v1/incendies/exploitation.md) | Exploitation des données incendies | 2026-07-19 | 2026-07-23 |
| [v1/incendies/rapport-installation.md](v1/incendies/rapport-installation.md) | Rapport d'installation incendies | 2026-07-17 | 2026-07-23 |
| [v1/incendies/mini-app-feu.md](v1/incendies/mini-app-feu.md) | Mini-app feu | 2026-07-17 | 2026-07-23 |
| [v1/incendies/mini-app-incendie.md](v1/incendies/mini-app-incendie.md) | Mini-app incendie | 2026-07-17 | 2026-07-23 |
| [v1/incendies/vigilance-feu.md](v1/incendies/vigilance-feu.md) | Vigilance feu de forêt | 2026-07-23 | 2026-07-23 |

## Gouvernance & projet

| Fichier | Description | MàJ | Vérif. |
|---|---|---|---|
| [gouvernance/AGENT.md](gouvernance/AGENT.md) | Contrat de travail de l'agent | 2026-07-12 | 2026-07-23 |
| [gouvernance/PROJECT.md](gouvernance/PROJECT.md) | Vision fonctionnelle du produit | 2026-07-12 | 2026-07-23 |
| [gouvernance/DECISIONS.md](gouvernance/DECISIONS.md) | Décisions d'architecture immuables | 2026-07-12 | 2026-07-23 |
| [gouvernance/ROADMAP.md](gouvernance/ROADMAP.md) | Backlog structuré et feuille de route | 2026-07-12 | 2026-07-23 |
| [gouvernance/FEUILLE-DE-ROUTE-2026.md](gouvernance/FEUILLE-DE-ROUTE-2026.md) | Feuille de route 2026 | 2026-07-12 | 2026-07-23 |
| [gouvernance/CHANTIER-B-LOT-B1.md](gouvernance/CHANTIER-B-LOT-B1.md) | Chantier B — lot B1 | 2026-07-17 | 2026-07-23 |
| [gouvernance/mise-a-jour.md](gouvernance/mise-a-jour.md) | Consignes de mise à jour du dépôt | 2026-07-19 | 2026-07-23 |
| [gouvernance/deploiement-vps.md](gouvernance/deploiement-vps.md) | Guide de déploiement sur VPS | 2026-07-17 | 2026-07-23 |

## Design

| Fichier | Description | MàJ | Vérif. |
|---|---|---|---|
| [design/style-v2.md](design/style-v2.md) | Guide de style infographie v2 | 2026-07-20 | 2026-07-23 |
| [design/infographie-cevenol.md](design/infographie-cevenol.md) | Infographie scientifique — épisode cévenol | 2026-07-17 | 2026-07-23 |
| [design/brutalist-interpretabilite.md](design/brutalist-interpretabilite.md) | Guide de style Swiss Brutalism × Editorial Paper | 2026-07-20 | 2026-07-23 |

## Références

| Dossier | Description |
|---|---|
| [ADR/](ADR/) | Architecture Decision Records numérotés (001-007) |
| [archive/](archive/) | Documents historiques et plans obsolètes |
