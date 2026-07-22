# Mini-app météo — brief UX/UI historique

> **Document archivé le 22 juillet 2026.**
>
> Ce brief décrivait une étape antérieure de la conception. Il ne correspond plus au périmètre fonctionnel de l’application actuellement en production et ne doit plus servir de cahier des charges pour une refonte.

## Pourquoi ce document est archivé

Le brief initial imposait notamment :

- une vue essentielle limitée à un seul lieu ;
- l’absence de vigilance ;
- l’absence de navigation vers des vues complémentaires ;
- l’exclusion du contexte climatique et du bilan thermique ;
- une composition presque entièrement contenue dans le premier écran mobile ;
- une vigilance principalement pensée pour le Gard.

Le produit réel comprend désormais :

- Val-d’Aigoual, Paris et Marseille ;
- la géolocalisation GPS et le géocodage ;
- la vigilance officielle du département du point sélectionné ;
- la situation actuelle et une tendance sur trois heures ;
- les trois jours suivants ;
- un contexte ERA5-Land 1991–2020 ;
- un bilan thermique ERA5-HEAT / UTCI ;
- une page de comparaison des révisions J−1 / J ;
- une page d’informations sur les méthodes et les limites.

La suite est en production sous le préfixe public `/val-daigoual/`, avec comme point d’entrée :

```text
https://euporie.cloud/val-daigoual/meteo/essentiel/
```

## Documentation à utiliser

Le référentiel actif est :

- [`README_meteo.md`](README_meteo.md) ;
- [`doc/meteo/ETAT-PRODUIT.md`](doc/meteo/ETAT-PRODUIT.md) ;
- [`doc/meteo/DONNEES-METHODES-LIMITES.md`](doc/meteo/DONNEES-METHODES-LIMITES.md) ;
- [`doc/meteo/ARCHITECTURE.md`](doc/meteo/ARCHITECTURE.md) ;
- [`doc/meteo/SPECIFICATION-V2.md`](doc/meteo/SPECIFICATION-V2.md) ;
- [`doc/meteo/PLAN-V2.md`](doc/meteo/PLAN-V2.md).

## Valeur historique

L’ancien contenu reste disponible dans l’historique Git. Il peut être consulté pour comprendre l’origine du style clair, éditorial et mobile-first de la première vue essentielle.

Les éléments graphiques de cet ancien brief ne sont ni interdits ni obligatoires pour la V2. Toute décision de design doit être reprise dans un document dédié après validation de l’architecture de l’information et des prototypes.