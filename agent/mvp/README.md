# OpenDataVdA — Guide de démarrage MVP

Ce dossier est la référence de travail de l’agent de codage pour le MVP OpenDataVdA.

## Objectif du MVP

Produire une **dalle persistante de 100 × 100 m** centrée sur des coordonnées GPS, capable de rassembler des données locales, de proximité et de contexte, de générer une représentation 3D, puis de passer par une supervision humaine avant publication.

Le MVP doit d’abord démontrer une **chaîne complète de bout en bout**. Il ne doit pas chercher à intégrer toutes les données disponibles.

## Ordre de lecture obligatoire

1. [`00-PRODUCT.md`](00-PRODUCT.md) — ce que l’on construit et ce qui est hors périmètre.
2. [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) — composants et responsabilités.
3. [`02-TILE-CONTRACT.md`](02-TILE-CONTRACT.md) — définition géométrique et identité d’une dalle.
4. [`03-DATA-CONTRACT.md`](03-DATA-CONTRACT.md) — contrat commun de toute information.
5. [`04-SITE-SERVICE.md`](04-SITE-SERVICE.md) — rôle du composant d’orchestration.
6. [`05-M1-VERTICAL-SLICE.md`](05-M1-VERTICAL-SLICE.md) — première chaîne exécutable à construire.
7. [`06-TEST-AND-ACCEPTANCE.md`](06-TEST-AND-ACCEPTANCE.md) — critères de recette.
8. [`07-AGENT-RULES.md`](07-AGENT-RULES.md) — règles de décision pendant l’implémentation.
9. [`08-BACKLOG.md`](08-BACKLOG.md) — ordre d’exécution initial.

Le schéma machine du manifeste est dans [`schemas/tile-manifest.schema.json`](schemas/tile-manifest.schema.json).

## Règle de priorité

En cas de contradiction :

1. `00-PRODUCT.md`
2. `02-TILE-CONTRACT.md` et `03-DATA-CONTRACT.md`
3. `01-ARCHITECTURE.md`
4. `05-M1-VERTICAL-SLICE.md`
5. `08-BACKLOG.md`

Le backlog peut évoluer. Les contrats ne doivent pas être modifiés implicitement pour faire passer une implémentation.

## Définition courte de la réussite

À partir de `latitude + longitude`, le système crée une instance indépendante avec :

- un identifiant ;
- une emprise exacte de 100 × 100 m ;
- un `manifest.json` valide ;
- une première scène 3D ou un actif 3D de démonstration raccordé à l’instance ;
- quelques données réellement attachées au lieu ;
- une page de consultation ;
- un état de revue ;
- une action de validation/publication.

Aucune nouvelle API thématique ne doit être ajoutée tant que cette tranche verticale n’est pas démontrée.
