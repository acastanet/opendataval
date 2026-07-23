# Jalon de déploiement — observations météo nationales

## État

Le code fonctionnel est fusionné, mais la production n'a pas encore été basculée depuis ce chantier.

Commit fonctionnel à déployer :

```text
46888d7b192add720c982727fa34bef21a92db0d
```

Le commit documentaire ultérieur `d68760f56e308cda8b356c86f7b3ddf5d01a741e` ne modifie ni l'API, ni le worker, ni les images applicatives. Il n'est pas requis pour la bascule.

## Exécution attendue

Suivre strictement :

- [`DEPLOIEMENT-OBSERVATIONS-NATIONALES.md`](./DEPLOIEMENT-OBSERVATIONS-NATIONALES.md) ;
- [`OBSERVABILITE.md`](./OBSERVABILITE.md).

## Critères bloquants

Le déploiement ne peut être déclaré réussi que si :

- le worktree est détaché au commit fonctionnel exact ;
- les tests API et worker ainsi que leurs typages réussissent ;
- les images API et worker disposent de tags de retour arrière ;
- seuls l'API et le worker sont reconstruits et recréés ;
- la base, Caddy et Copernicus restent inchangés ;
- `meteo_stations` réussit avec un catalogue national d'au moins 1 000 stations ;
- `meteo_obs_national` réussit avec plusieurs centaines d'observations ;
- `/api/v1/meteo/health` ne signale aucune dégradation critique ;
- la sonde `verify:meteo-national` réussit localement et publiquement ;
- Paris, Marseille et Val-d'Aigoual disposent de candidates à moins de 50 km ;
- aucun retour silencieux au catalogue cévenol historique n'est observé.

## Preuves à conserver

Le rapport de déploiement doit inclure :

- commit et chemin du worktree ;
- images et conteneurs avant/après ;
- tags de retour arrière ;
- résultats de tests ;
- sorties des deux jobs initiaux ;
- réponse complète de l'endpoint de santé ;
- résultat de la sonde pour les trois localités ;
- confirmation que DB, Caddy et Copernicus n'ont pas été recréés ;
- procédure de retour arrière vérifiée.

## Interdiction

Ne pas corriger directement le code sur le VPS. En cas d'échec, conserver ou restaurer la version précédente et ouvrir un nouveau chantier dans le dépôt.