# 06 — Tests et recette MVP

## Philosophie

Les tests doivent vérifier les **invariants du produit**, pas seulement les fonctions internes.

## Tests P0

### Géométrie

- centre correctement projeté ;
- carré de 100 × 100 m ;
- surface attendue ;
- conversion WGS84 valide ;
- géométrie déterministe.

### Manifest

- JSON valide ;
- conforme au schéma ;
- `tile_id` obligatoire ;
- état autorisé ;
- coordonnées et géométrie présentes ;
- provenance présente pour les données intégrées.

### Cycle de vie

Transitions autorisées :

```text
created → collecting
collecting → generated | failed
generated → review_required
review_required → approved
review_required → collecting   (retour sur changes_requested, voir 03-DATA-CONTRACT.md)
approved → published
```

Tester le refus des transitions incohérentes, notamment :

- `approved` ou `published` atteint alors que `review.status` n'est pas
  `approved` ;
- toute transition non listée ci-dessus (ex. `created → published`).

## Tests M1 de bout en bout

Créer deux dalles différentes.

Vérifier :

- deux `tile_id` ;
- deux répertoires indépendants ;
- géométries distinctes ;
- manifests indépendants ;
- scène correctement référencée ;
- frontend capable d’afficher chacune ;
- revue indépendante ;
- publication indépendante.

## Recette multi-dalles ultérieure

Trois situations minimum :

### A — maison

Teste bâtiment, parcelle, végétation, OLD.

### B — centre village

Teste bâti dense, routes, hydrographie, relief.

### C — rural/naturel

Teste forêt, géologie, eau et absence possible de bâtiment.

## Critère essentiel

Aucune dalle de recette ne doit nécessiter une modification du code spécifique à ses coordonnées.

L’opérateur peut corriger les données via l’interface de revue, pas via le code.

Ce critère porte sur `site-service` et les contrats qu'il orchestre. Il ne
s'étend pas au pipeline 3D externe (`poc/valleraugue-mairie-3d`), qui aujourd'hui
demande un paramètre par scène saisi à la main (`GEOLOGY_DEPARTMENT`, non
déductible des coordonnées). Deux options restent ouvertes et doivent être
tranchées avant le lot P8 : dériver ce paramètre automatiquement via
`apps/geography-service`, ou documenter cette exception au critère pour le
périmètre strict du pipeline 3D. Voir ADR-005.
