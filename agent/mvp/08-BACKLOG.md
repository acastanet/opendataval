# 08 — Backlog initial

Ce fichier est opérationnel et peut évoluer. Les contrats stables sont décrits dans les autres documents.

## P0 — Contrats

- [x] Ajouter le schéma JSON du manifeste (`schemas/tile-manifest.schema.json`).
- [x] Ajouter les types TypeScript correspondants (`packages/shared/src/dalle.ts`).
- [x] Ajouter les enums du cycle de vie (`ETATS_DALLE`, `STATUTS_REVUE`).
- [x] Ajouter les enums de relation spatiale (`RELATIONS_SPATIALES`, `SPHERES`, `DISPONIBILITES`).
- [x] Tester le schéma (`packages/shared/test/manifeste.test.ts`, validation Ajv).

## P1 — Géométrie d’instance

- [x] Réutiliser la projection WGS84 → Lambert-93 déjà disponible
      (`packages/shared/src/lambert93.ts`), ne pas la réimplémenter.
- [x] Ajouter la projection inverse Lambert-93 → WGS84 (`wgs84DepuisLambert93`).
- [x] Génération du carré ±100 m (`packages/shared/src/dalle-geometrie.ts`, `empriseDalle`).
- [x] Retour WGS84 via la projection inverse (pas d'approximation en degrés).
- [x] Tests de déterminisme.
- [x] Tests de dimensions.

## P2 — Persistance d’instance

- [x] Génération `tile_id` (`apps/site-service/src/tile-id.ts`, séquence `sites.tile_id_seq`
      posée par `db/migrations/013_sites.sql`, ADR-007).
- [x] Création du répertoire (`ecrireManifesteAtomique`, `apps/site-service/src/manifeste.ts`).
- [x] Écriture atomique du manifeste (fichier temporaire + `rename`).
- [x] Lecture d’une instance (`lireManifeste` / `getInstance`).
- [x] Gestion des états (`transitionerInstance`, `apps/site-service/src/instances.ts`,
      appuyée sur `transitionValide` de `dalle.ts`).
- [x] Journal minimal (`apps/site-service/src/journal.ts`, table `sites.evenements`).

Non couvert par ce lot, à faire en P3 : les routes HTTP elles-mêmes (`createInstance`,
`getInstance`, `transitionerInstance` sont des fonctions pures, pas encore exposées en
`/api/v2/sites/*`), et l'exécution réelle de la migration `013_sites.sql` contre une base
(non testée ici faute de PostgreSQL en environnement de test — seules les requêtes SQL
envoyées à un pool factice sont vérifiées).

## P3 — Squelette `site-service`

- [x] Route de création (`POST /internal/v1/sites`, `apps/site-service/src/app.ts`).
- [x] Route de lecture (`GET /internal/v1/sites/:tileId`).
- [x] Déclenchement de fabrication (`POST /internal/v1/sites/:tileId/build`,
      `apps/site-service/src/fabrication.ts`).
- [x] Gestion d’erreur (validation 400, instance introuvable 404, transition
      refusée 409, échec interne 500).
- [x] Premier adaptateur vers un service déjà existant
      (`apps/site-service/src/adapters/geography.ts`, commune/adresse/altitude
      depuis `geography-service`, exigé par `05-M1-VERTICAL-SLICE.md`).

Non couvert par ce lot à l'époque (câblage gateway/Caddy/docker-compose et
exposition publique) : livré aux lots P5 et ADR-009. Restent à faire : les
routes `review`/`publish` (P6), et le rejeu idempotent d'une fabrication déjà
`generated` (voir `04-SITE-SERVICE.md` § « Idempotence »).

## P4 — Raccord scène

- [x] Définir le contrat d’un actif 3D (`SceneDalle` dans `packages/shared/src/dalle.ts` ;
      `glb` est une URL servie, pas un chemin local — voir `01-ARCHITECTURE.md` § « Pipeline 3D »).
- [x] Rattacher une scène existante pour la première démonstration
      (`apps/site-service/src/adapters/scene.ts`, pointe vers le GLB déjà publié par
      `poc/valleraugue-mairie-3d` sous `/valleraugue-3d/assets/scenes/maison-200m/scene.glb`).
- [x] Afficher la scène dans la page d’instance — livré au lot P5
      (`apps/gateway-service/src/pages/site-instance.ts`, `<model-viewer>`).
- [ ] Remplacer ensuite par la génération automatique réelle — c'est le lot P8
      (« industrialisation du pipeline 3D »).

## P5 — Première page dalle

Servie par `gateway-service` à `GET /api/v2/sites/:tileId` (ADR-008), qui
récupère le manifeste côté serveur depuis la route interne de `site-service` —
aucune route JSON publique n'est ajoutée pour cette lecture.

- [x] Identité (`apps/gateway-service/src/pages/site-instance.ts`) : titre,
      `tile_id`, adresse, centre, emprise, surface, date de création.
- [x] 3D : `<model-viewer>` (Google, chargé depuis unpkg avec intégrité SRI
      vérifiée) sur l'URL de `manifeste.scene.glb` ; message explicite si
      aucune scène n'est rattachée.
- [x] Information locale minimale : données groupées par sphère, avec valeur,
      unité et badge de disponibilité.
- [x] Source/provenance : chaque donnée affiche producteur + date de
      récupération ; une section « Provenance » liste les sources distinctes.
- [x] Statut de fabrication/revue : badges `status`/`review.status`.

6 tests (`apps/gateway-service/test/site-instance.test.ts`) couvrent le rendu
nominal, l'absence de scène, l'absence de donnée, l'échappement HTML, et les
réponses 404/502 de `site-service`.

## P6 — Revue / publication minimale

Routes `POST /internal/v1/sites/:tileId/review` (action `submit` | `approve` |
`request_changes`, logique dans `apps/site-service/src/review.ts`) et
`POST /internal/v1/sites/:tileId/publish`, proxyées publiquement (ADR-009) —
voir `04-SITE-SERVICE.md` § « Revue et publication ».

- [x] Passage `generated → review_required` (action `submit`).
- [x] Validation opérateur (actions `approve`/`request_changes`, `reviewedBy`
      obligatoire, horodatage `review.reviewedAt`).
- [x] Passage `approved → published`.
- [x] Empêcher la publication directe sans approbation — assuré structurellement
      par `transitionValide` (`packages/shared/src/dalle.ts`), pas par une
      vérification ad hoc dans la route ; confirmé par un test dédié et par un
      essai réel (`POST .../publish` sur une dalle `created` → 409).

16 tests (12 site-service : `review.test.ts` + routes dans `app.test.ts` ; 4
gateway : `site-write-proxy.test.ts`) plus une vérification de bout en bout
dans un `docker compose` réel (création → build → submit → approve → publish,
et refus 409 d'une publication directe).

## P7 — Démonstration M1

- [ ] Créer deux dalles par coordonnées.
- [ ] Vérifier leur indépendance.
- [ ] Publier les deux.
- [ ] Documenter la procédure reproductible.

## P8 — Industrialisation du pipeline 3D (après la stop condition)

Le pipeline 3D de M1 se raccorde à une scène déjà produite manuellement par
`poc/valleraugue-mairie-3d`. Ce lot rend la fabrication déclenchable par
`site-service` sans intervention humaine par scène :

- [ ] Automatiser ou éliminer l'étape Roofer amont (aujourd'hui un conteneur
      Docker lancé à la main depuis un clone de
      `ignfab/roofer-with-ignf-datasets`).
- [ ] Décider de l'exécution du POC Python (venv natif Windows) : appelé en
      sous-processus par `site-service`, ou isolé derrière sa propre API.
- [ ] Dériver `GEOLOGY_DEPARTMENT` des coordonnées d'entrée au lieu de le
      saisir par scène (voir 06-TEST-AND-ACCEPTANCE.md, ADR-005).
- [ ] Adapter la chaîne à une émission par instance (`tile_id`), plutôt qu'aux
      fichiers `config/*.conf` versionnés du POC.
- [ ] Définir la stratégie de repli si le pipeline échoue ou dépasse un délai
      (dalle publiable sans scène 3D, ou publication bloquée — à trancher).

## Stop condition

Une fois P7 validé, ne pas élargir immédiatement tous les domaines.

Choisir ensuite les lots d’enrichissement dans cet ordre indicatif :

1. IGN local ;
2. BRGM/BSS ;
3. OLD/risques existants ;
4. météo/vigilance ;
5. eau ;
6. autres contextes.
