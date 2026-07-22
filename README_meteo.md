# Application météo — documentation de référence

Dernière mise à jour : 22 juillet 2026.

Ce document est le point d’entrée de la documentation de l’application météo d’OpenDataVal. Il décrit le produit réellement présent dans le dépôt, son déploiement public et les exigences qui doivent orienter sa prochaine version.

La documentation reste volontairement classique : elle sépare l’état actuel, les données, l’architecture et les choix à prendre pour la future interface. Elle ne constitue pas une maquette graphique et ne remplace pas les tests ni le code.

## 1. État du produit

L’application météo forme une suite cohérente de quatre pages en production.

| Route interne | Route publique | Fonction principale |
| --- | --- | --- |
| `/meteo/essentiel/` | `/val-daigoual/meteo/essentiel/` | Lire immédiatement la situation météo locale et son contexte |
| `/meteo/comparaison/` | `/val-daigoual/meteo/comparaison/` | Comparer les révisions d’une prévision entre J−1 et J |
| `/meteo/bilan-thermique/` | `/val-daigoual/meteo/bilan-thermique/` | Consulter le bilan mensuel ERA5-HEAT / UTCI |
| `/meteo/informations/` | `/val-daigoual/meteo/informations/` | Comprendre les sources, les méthodes et les limites |

Point d’entrée public :

```text
https://euporie.cloud/val-daigoual/meteo/essentiel/
```

Le préfixe `/val-daigoual/` appartient au déploiement de production. Les routes du code restent `/meteo/...`. Toute évolution doit être vérifiée à la racine en local et sous ce préfixe en production ou préproduction.

La page `/meteo/` reste l’application météo détaillée historique. Elle n’est pas la source de vérité fonctionnelle de la suite essentielle et ne doit pas servir de modèle implicite pour sa future refonte.

## 2. Vue essentielle actuelle

La page `/meteo/essentiel/` propose :

- trois lieux rapides : Val-d’Aigoual, Paris et Marseille ;
- la géolocalisation GPS, avec précision estimée et géocodage du lieu ;
- la vigilance officielle du département du point sélectionné ;
- la température actuelle estimée, le ressenti, le maximum et le minimum du jour ;
- l’altitude du point de modèle ;
- une tendance graphique sur trois heures ;
- les trois jours suivants ;
- un contexte climatique ERA5-Land 1991–2020 ;
- un résumé du dernier bilan thermique complet.

La vigilance est prioritaire dans la hiérarchie. Lorsque Météo-France est indisponible, l’interface affiche « Niveau inconnu », explique que le niveau réel ne peut pas être confirmé et renvoie vers le bulletin officiel. Une absence de donnée ne doit jamais produire une pastille verte rassurante.

## 3. Sources principales

| Besoin | Source ou traitement |
| --- | --- |
| Prévision immédiate | AROME ou AROME HD, puis ARPEGE, diffusés via Open-Meteo |
| Vigilance | API officielle Météo-France, déterminée par département |
| Localisation | Géoplateforme IGN et Base Adresse Nationale |
| Référence climatique | ERA5-Land, médiane et percentiles 1991–2020 |
| Bilan thermique | ERA5-HEAT / UTCI, calculé côté serveur |
| Révisions J−1 / J | Open-Meteo Previous Runs API |
| Tendance longue de `/meteo/` | ensemble ECMWF de 51 scénarios |

Les données Copernicus sont téléchargées et agrégées par une application Python dédiée. Les résultats validés sont enregistrés dans PostgreSQL. Une consultation utilisateur ne déclenche jamais une requête vers le Climate Data Store.

La première ingestion complète a réussi le 21 juillet 2026 pour Val-d’Aigoual, Paris et Marseille.

## 4. Corpus documentaire

La documentation détaillée se trouve dans `doc/meteo/` :

- [`ETAT-PRODUIT.md`](doc/meteo/ETAT-PRODUIT.md) : périmètre, parcours et comportements actuels ;
- [`DONNEES-METHODES-LIMITES.md`](doc/meteo/DONNEES-METHODES-LIMITES.md) : sources, calculs, vocabulaire et précautions d’interprétation ;
- [`ARCHITECTURE.md`](doc/meteo/ARCHITECTURE.md) : composants, routes, stockage, tâches de fond et exploitation ;
- [`SPECIFICATION-V2.md`](doc/meteo/SPECIFICATION-V2.md) : exigences fonctionnelles et principes de conception de la prochaine version ;
- [`PLAN-V2.md`](doc/meteo/PLAN-V2.md) : séquencement proposé pour concevoir, développer et valider la refonte.

Documents techniques complémentaires :

- [`apps/copernicus/README.md`](apps/copernicus/README.md) ;
- [`doc/EXPLOITATION-COPERNICUS.md`](doc/EXPLOITATION-COPERNICUS.md) ;
- tests Playwright dans `e2e/` ;
- implémentation des pages dans `apps/web/src/pages/meteo/` et des composants dans `apps/web/src/islands/`.

## 5. Ordre de confiance

En cas de divergence, utiliser cet ordre :

1. comportement observé en production et tests automatisés ;
2. code des composants, routes API et traitements ;
3. documentation de référence dans `doc/meteo/` ;
4. documentation d’exploitation Copernicus ;
5. anciens briefs et documents de conception.

`README_miniapp_meteo_uxui.md` est désormais un document historique. Il décrit une étape antérieure où la vue essentielle devait exclure la vigilance, les autres lieux et le contexte climatique. Ces restrictions ne correspondent plus au produit actuel et ne doivent pas être appliquées sans décision produit explicite.

## 6. Règles pour la prochaine version

La future version doit être conçue à partir des besoins et des contrats décrits dans `SPECIFICATION-V2.md`, et non par simple modification cosmétique de l’interface actuelle.

Principes invariants :

- commencer par le lieu et la sécurité ;
- distinguer clairement observation, prévision, vigilance, climat et bilan thermique ;
- présenter les données comme des estimations de modèles lorsque c’est le cas ;
- conserver une expérience mobile-first accessible ;
- rendre visibles la fraîcheur, la source et les états d’indisponibilité ;
- ne jamais déclencher de collecte Copernicus depuis une visite ;
- préserver les contrats API ou documenter explicitement leur évolution ;
- conserver les URL publiques sous `/val-daigoual/` ;
- valider les changements en bureau et mobile avec Playwright.

## 7. Mise à jour de la documentation

Toute évolution fonctionnelle doit mettre à jour au minimum :

1. `doc/meteo/ETAT-PRODUIT.md` ;
2. le document de données ou d’architecture concerné ;
3. les tests associés ;
4. `SPECIFICATION-V2.md` si l’évolution modifie le périmètre de la prochaine version.

Une case de feuille de route ne doit être cochée que lorsque l’implémentation, le test et la documentation sont cohérents. Les intentions, prototypes et éléments déjà livrés doivent rester clairement distingués.