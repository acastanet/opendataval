# Mini-app Incendies — plan du MVP

> **Statut** : proposition à valider avant développement
> **Date** : 17 juillet 2026
> **Document source** : [`mini_app_feu.md`](./mini_app_feu.md)
> **Intégration cible** : portail OpenData Val-d'Aigoual

## 1. Objectif

Créer une deuxième mini-app grand public qui réponde rapidement à trois questions :

1. **Quel est le niveau de danger incendie aujourd'hui et demain ?**
2. **Une anomalie thermique récente a-t-elle été détectée près du territoire ?**
3. **Quand les données ont-elles été mises à jour et quelle confiance leur accorder ?**

La mini-app couvre une zone géographique opérationnelle, et non une seule limite administrative :

```text
Zone cœur = EPCI 200034601 + ZNIEFF II 910011858
Zone proche = zone cœur + tampon de 5 km
Zone de veille = zone cœur + tampon de 15 km
```

Le MVP est un outil d'information. Il ne remplace ni les consignes de la préfecture, ni les services de secours, ni une alerte officielle.

## 2. Promesse utilisateur

En moins de dix secondes, l'utilisateur doit pouvoir comprendre :

- le niveau officiel de risque disponible pour les zones gardoises concernées ;
- la présence ou l'absence de détections satellitaires récentes ;
- leur position : dans le cœur, à moins de 5 km ou dans la veille à 15 km ;
- l'heure de la dernière collecte de chaque source ;
- la différence entre une **détection thermique** et un **incendie confirmé**.

## 3. Périmètre fonctionnel du MVP

### 3.1 Inclus

#### A. Bandeau de situation

Le haut de page affiche deux informations distinctes :

```text
DANGER OFFICIEL
Niveau maximal + détail par zone + validité de la donnée

DÉTECTIONS SATELLITAIRES
Nombre de points des dernières 24 h dans les zones cœur, proche et veille
```

Les deux indicateurs ne doivent jamais être fusionnés en un score unique.

#### B. Carte interactive

La carte MapLibre affiche :

- la zone cœur ;
- les tampons de 5 km et 15 km ;
- les points FIRMS des dernières 24 heures ;
- une couleur différente selon `cœur`, `proche` ou `veille` ;
- une fiche au clic avec heure UTC et locale, satellite, confiance, FRP et distance à la zone cœur ;
- le fond IGN déjà utilisé par le portail.

#### C. Liste des détections

Sous la carte, une liste accessible et utilisable sans interaction cartographique présente les détections de la plus récente à la plus ancienne.

Chaque ligne comporte :

- date et heure ;
- localisation relative au territoire ;
- distance à la zone cœur ;
- satellite ;
- confiance fournie par FIRMS ;
- lien vers la source.

#### D. Fraîcheur et état des sources

Chaque bloc indique :

- `mis à jour à` ;
- `donnée valable pour` ;
- `source disponible`, `donnée ancienne` ou `source indisponible` ;
- un lien direct vers la source officielle.

La dernière donnée valide reste visible en cas de panne, avec un avertissement explicite.

#### E. Bloc pédagogique et consignes

Un texte court explique qu'un point FIRMS est une anomalie thermique détectée par satellite et non la confirmation d'un feu de forêt. Le numéro d'urgence `112` est affiché pour un feu observé directement, avec une invitation à suivre les consignes préfectorales.

### 3.2 Hors périmètre du MVP

- notifications par courriel, SMS ou push ;
- compte utilisateur et préférences ;
- confirmation automatique par réseaux sociaux ;
- suivi tactique de la progression d'un incendie ;
- estimation automatique d'une surface brûlée ;
- historique BDIFF complet ;
- prédiction locale du départ de feu ;
- application mobile native ;
- modification ou signalement participatif des données.

EFFIS, les surfaces brûlées et BDIFF constituent une deuxième version après validation du MVP.

## 4. Sources de données retenues

| Besoin | Source MVP | Fréquence cible | Remarque |
|---|---|---:|---|
| Danger officiel Gard | Carte quotidienne du risque incendie du Gard | 1 fois/jour après publication | Flux non documenté : adaptateur à qualifier avant automatisation |
| Détections thermiques | NASA FIRMS, VIIRS S-NPP, NOAA-20 et NOAA-21 | toutes les 30 min | `MAP_KEY` obligatoire côté serveur |
| Contours EPCI | API Découpage administratif | mensuelle ou à la construction | EPCI `200034601` |
| Contour du massif | ZNIEFF II | versionnée manuellement | Identifiant `910011858` |
| Fond de carte | IGN WMTS | à la demande | Réutilisation de la configuration existante |

La Lozère ne disposant pas dans le document source d'un flux local équivalent déjà identifié, le MVP doit afficher clairement la couverture de chaque indicateur. Il ne doit pas présenter le risque gardois comme valable sur toute la zone cœur.

## 5. Règles métier

### 5.1 Danger officiel

Le niveau synthétique du Gard est le maximum des zones officielles qui recouvrent la partie gardoise de la zone cœur :

```text
niveau_gard = max(niveaux des zones officielles concernées)
```

Le détail par zone reste toujours visible. La date de validité et la date de collecte sont obligatoires.

Si la collecte automatisée de la carte du Gard n'est pas suffisamment fiable, le MVP démarre avec un fichier normalisé validé manuellement. L'interface doit alors l'indiquer et l'automatisation reste un lot séparé.

### 5.2 Qualification spatiale FIRMS

```text
CŒUR     : point dans la zone cœur
PROCHE   : point hors cœur, à 5 km ou moins
VEILLE   : point à plus de 5 km et à 15 km ou moins
HORS ZONE: point au-delà de 15 km, non exposé par l'API publique du MVP
```

La requête FIRMS porte sur la boîte englobante de la zone de veille, puis PostGIS réalise le filtrage exact par polygone et calcule la distance à la zone cœur.

### 5.3 Déduplication

Le MVP conserve les observations brutes, puis regroupe uniquement pour l'affichage les détections proches dans le temps et l'espace. Il ne crée pas automatiquement un « incendie confirmé ».

Une détection doit rester identifiable par :

```text
source + satellite + date + heure + latitude + longitude
```

### 5.4 États de fraîcheur

| Source | Fraîche | Ancienne | Indisponible |
|---|---:|---:|---|
| FIRMS | collecte < 60 min | 60 min à 6 h | aucune collecte exploitable > 6 h |
| Risque Gard | date de validité courante | dernière publication expirée | aucune donnée valide conservée |

Ces seuils sont des règles d'interface, pas une garantie sur l'heure de passage d'un satellite.

## 6. Écran unique proposé

```text
┌──────────────────────────────────────────────────────────┐
│ Incendies autour de l'Aigoual            Dernière MAJ    │
├───────────────────────┬──────────────────────────────────┤
│ Danger officiel       │ Détections des dernières 24 h    │
│ niveau + validité     │ cœur / proche / veille           │
├───────────────────────┴──────────────────────────────────┤
│                                                          │
│                    CARTE INTERACTIVE                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Détections récentes                                     │
│ heure · position · distance · confiance · satellite     │
├──────────────────────────────────────────────────────────┤
│ Comprendre les données · Sources · Consignes officielles │
└──────────────────────────────────────────────────────────┘
```

Principes d'interface : mobile d'abord, navigation clavier, information jamais portée uniquement par la couleur, contraste RGAA AA et libellés compréhensibles sans jargon spatial.

## 7. Architecture cible

La mini-app réutilise l'architecture validée du portail :

```text
NASA FIRMS ─┐
            ├─> Worker TypeScript ─> PostgreSQL/PostGIS
Risque Gard ┘                            │
                                         ▼
                                  API Fastify
                                         │
                                         ▼
                              Astro + îlot Svelte
                              MapLibre + fond IGN
```

Les clés et les appels externes restent côté worker. Le navigateur n'appelle jamais FIRMS directement.

### 7.1 Variable d'environnement

```env
NASA_FIRMS_MAP_KEY=...
```

La clé ne doit ni être commitée, ni être envoyée au frontend, ni apparaître dans les journaux.

### 7.2 Modèle de données minimal

```text
fire_zones
- id
- name
- zone_type            # core, near_5km, watch_15km, official
- source
- source_version
- geom

fire_risk_levels
- id
- valid_date
- collected_at
- department
- official_zone
- level
- restrictions
- source_url
- raw_archive_path

fire_hotspots
- id
- observed_at
- satellite
- instrument
- confidence
- frp
- day_night
- location_class       # core, near, watch
- distance_to_core_m
- geom
- collected_at
```

Index et contraintes minimum :

- index GIST sur toutes les colonnes `geom` ;
- contrainte d'unicité sur l'identité d'une observation FIRMS ;
- dates stockées en UTC, conversion Europe/Paris uniquement à l'affichage ;
- conservation de la date de collecte indépendamment de la date d'observation.

### 7.3 API minimale

```text
GET /api/incendies/situation
```

Retourne le danger officiel, les compteurs FIRMS, la fraîcheur des sources et la dernière collecte.

```text
GET /api/incendies/detections?hours=24
```

Retourne un GeoJSON filtré sur la zone de veille. Pour le MVP, `hours` est borné côté serveur à `1..72`.

```text
GET /api/incendies/zones
```

Retourne les trois contours simplifiés nécessaires à la carte.

Les réponses ne contiennent jamais la clé FIRMS ni les archives brutes internes.

## 8. Plan de réalisation

### Lot 0 — Qualification des sources

Objectif : lever le principal risque avant de coder l'interface.

- produire et valider les trois géométries ;
- vérifier la correspondance communes/zonages officiels du Gard ;
- inspecter le chargement de la carte du Gard et documenter le format réellement automatisable ;
- obtenir une `MAP_KEY` FIRMS et tester les trois sources VIIRS sur la boîte englobante ;
- constituer trois jeux de test : aucune détection, une détection dans le cœur, plusieurs détections proches.

**Sortie** : exemples bruts archivés, formats normalisés et décision « collecte Gard automatique ou fichier validé manuellement ».

### Lot 1 — Ingestion et stockage

- créer la migration PostGIS ;
- importer les contours versionnés ;
- développer l'adaptateur FIRMS avec timeout, reprise limitée et validation CSV ;
- classifier spatialement chaque point ;
- développer l'adaptateur de risque Gard selon la décision du lot 0 ;
- enregistrer chaque exécution dans le journal d'import existant ;
- planifier FIRMS toutes les 30 minutes et le risque Gard après l'heure de publication.

**Sortie** : données fiables et interrogables en base, sans interface.

### Lot 2 — API Fastify

- exposer les trois routes du MVP ;
- définir les schémas de réponse ;
- borner les paramètres ;
- ajouter un cache court pour la situation et les détections ;
- retourner un état dégradé lisible si une source est indisponible ;
- tester les cas nominal, données anciennes et absence de détection.

**Sortie** : contrat API stable pour le frontend.

### Lot 3 — Interface

- créer la page Astro de la mini-app ;
- créer un îlot Svelte pour le bandeau, la carte et la liste ;
- réutiliser la configuration MapLibre/IGN existante ;
- afficher les niveaux, la fraîcheur et les avertissements ;
- rendre la liste et les fiches carte accessibles au clavier ;
- adapter l'affichage aux écrans mobiles.

**Sortie** : parcours utilisateur complet sur données réelles et jeux de test.

### Lot 4 — Validation et mise en production

- tests unitaires des règles spatiales et de déduplication ;
- tests d'intégration worker → PostGIS → API ;
- vérification sur mobile et audit Lighthouse/accessibilité ;
- test d'indisponibilité simulée de chaque source ;
- vérification des attributions et des liens officiels ;
- documentation d'exploitation et procédure de mise à jour manuelle de secours.

**Sortie** : MVP publiable et supervisable.

## 9. Fichiers probablement concernés lors du développement

La liste exacte sera confirmée après le lot 0. Le développement aura un impact supérieur à trois fichiers et nécessitera donc une validation préalable conformément à `AGENT.md`.

```text
db/migrations/006_incendies.sql
apps/worker/src/sources/firms.ts
apps/worker/src/sources/fireRiskGard.ts
apps/worker/src/scheduler.ts
apps/api/src/routes/incendies.ts
apps/api/src/index.ts
apps/web/src/pages/incendies/index.astro
apps/web/src/islands/FireDashboard.svelte
packages/shared/src/catalogue.ts
packages/shared/src/index.ts
```

Les géométries sources et les échantillons de test devront être rangés dans des emplacements dédiés déjà cohérents avec les conventions du dépôt ; aucun fichier généré volumineux ne devra être commité sans décision explicite.

## 10. Critères d'acceptation du MVP

Le MVP est accepté si :

- [ ] les trois contours sont validés visuellement et topologiquement ;
- [ ] une observation FIRMS hors du polygone mais dans sa boîte englobante est correctement exclue ;
- [ ] les détections sont classées `cœur`, `proche` ou `veille` ;
- [ ] aucune détection n'est libellée « incendie confirmé » ;
- [ ] le danger Gard affiche sa zone et sa date de validité ;
- [ ] la couverture gardoise n'est pas présentée comme une information lozérienne ;
- [ ] l'absence de point est formulée « aucune détection reçue », jamais « aucun incendie » ;
- [ ] une panne FIRMS ou Gard n'empêche pas l'affichage de la dernière donnée valide ;
- [ ] toute donnée ancienne est signalée visuellement et textuellement ;
- [ ] la clé FIRMS n'est visible ni dans le navigateur, ni dans les logs, ni dans Git ;
- [ ] la page fonctionne sur mobile et au clavier ;
- [ ] les sources, licences et limites d'interprétation sont accessibles ;
- [ ] le build TypeScript/Astro et les tests passent.

## 11. Risques et mesures de réduction

| Risque | Impact | Réponse MVP |
|---|---|---|
| Flux Gard non documenté ou modifié | danger officiel indisponible | adaptateur isolé, archive brute, mode manuel de secours |
| Retard entre passage satellite et publication | fausse impression de temps réel | afficher l'heure d'observation et de collecte |
| Faux positif FIRMS | inquiétude injustifiée | employer « détection thermique », afficher confiance et avertissement |
| Absence de détection interprétée comme absence de feu | faux sentiment de sécurité | formulation stricte et bloc pédagogique |
| Géométrie du massif contestable | périmètre incompris | afficher la méthodologie et versionner les contours |
| Doublons multi-satellites | compteur trompeur | conserver le brut, regrouper seulement dans la présentation |
| Clé FIRMS absente ou expirée | ingestion bloquée | contrôle de configuration et état de santé de la source |

## 12. Découpage recommandé

Ordre de livraison conseillé :

1. **Lot 0 — qualification** : 1 à 2 jours ;
2. **Lots 1 et 2 — données et API** : 3 à 5 jours ;
3. **Lot 3 — interface** : 2 à 3 jours ;
4. **Lot 4 — validation** : 1 à 2 jours.

Estimation globale : **7 à 12 jours ouvrés**, hors attente de la clé FIRMS, validation des contours et éventuelle difficulté d'automatisation du site du Gard.

## 13. Évolutions après MVP

1. intégrer EFFIS pour recouper les détections et afficher les périmètres disponibles ;
2. intégrer BDIFF et construire l'historique local ;
3. ajouter la Météo des forêts avec une présentation distincte du risque zonal Gard ;
4. ajouter des sources officielles lozériennes lorsqu'un flux exploitable est identifié ;
5. proposer des notifications uniquement après définition d'une politique d'alerte, de responsabilité et de supervision.

## 14. Décisions à valider avant développement

1. **Périmètre** : confirmer `EPCI + ZNIEFF II` comme zone cœur et les tampons 5/15 km.
2. **Danger Gard** : accepter un mode manuel de secours si aucun flux stable n'est disponible.
3. **Route publique** : valider `/incendies/` pour la mini-app et `/api/incendies/*` pour l'API.
4. **Priorité** : confirmer que l'historique et EFFIS restent hors MVP.
5. **Clé externe** : fournir une `NASA_FIRMS_MAP_KEY` avant le lot 1.

---

### Références techniques vérifiées le 17 juillet 2026

- [NASA FIRMS — API Area](https://firms.modaps.eosdis.nasa.gov/api/area/)
- [NASA FIRMS — demande et quota de MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/)
- [Carte quotidienne du risque incendie du Gard](https://www.risque-prevention-incendie.fr/gard/index.html)
