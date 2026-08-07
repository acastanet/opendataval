# 05 — M1 : première tranche verticale

## Objectif

Démontrer très tôt la chaîne complète :

```text
coordonnées
→ instance
→ dalle 100 × 100
→ manifest
→ enrichissement minimal
→ scène
→ page
→ review
→ publication
```

Cette tranche doit fonctionner avant d’ajouter de nouveaux domaines de données.

## Périmètre volontairement réduit

### Obligatoire

- coordonnées ;
- `tile_id` ;
- géométrie 100 × 100 m ;
- manifeste validé ;
- adresse ou information géographique simple issue d’un service existant ;
- au moins une information locale réelle ;
- actif 3D raccordé à l’instance ;
- page publique minimale ;
- écran ou action de revue minimale ;
- publication.

### Acceptable temporairement

Pour isoler l’orchestration du chantier 3D, un actif 3D déjà produit peut être utilisé pendant la première étape, à condition que le contrat de rattachement soit celui qui sera conservé.

Ensuite le pipeline 3D réel remplace ce raccord provisoire.

## Démonstration M1

Avec une commande ou un appel API :

```text
lat=...
lon=...
```

on doit pouvoir retrouver :

```text
instances/<tile_id>/manifest.json
instances/<tile_id>/scene/...
URL interne ou publique de consultation
```

## Non-objectifs M1

- six sphères complètes ;
- rapport PDF complet ;
- toutes les sources IGN ;
- eau v2 complète ;
- Copernicus dynamique ;
- scoring sophistiqué de pertinence ;
- design final.

## Pourquoi cette tranche est prioritaire

Elle valide simultanément :

- le modèle d’instance ;
- les contrats ;
- le stockage ;
- l’orchestration ;
- le frontend ;
- la supervision ;
- la publication.

Elle évite de découvrir les défauts d’intégration après dix lots de données.
