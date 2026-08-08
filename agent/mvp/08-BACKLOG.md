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

- [x] Créer deux dalles par coordonnées.
- [x] Vérifier leur indépendance.
- [x] Publier les deux.
- [x] Documenter la procédure reproductible.

Rejoué de bout en bout contre un `docker compose up -d` réel via
`scripts/demo-m1.mjs` (`node scripts/demo-m1.mjs`, sur le modèle de
`scripts/verify-meteo-national.mjs`) : création, fabrication, soumission,
puis approbation et publication indépendantes de deux dalles distinctes —
Dalle A « Maison » (lat 44.064555, lon 3.683027, coïncide avec la scène 3D
déjà publiée par le POC `maison-200m`) et Dalle B « Les Plantiers »
(lat 44.09, lon 3.7). Le script vérifie et affiche pass/fail pour chaque
critère de `06-TEST-AND-ACCEPTANCE.md` § « Tests M1 de bout en bout » :
`tile_id` distincts (`ODV-2026-000005`/`ODV-2026-000006` lors de la dernière
exécution), géométries `geometryWgs84` distinctes, scène référencée pour
chacune, page `GET /api/v2/sites/:tileId` correcte et sans mélange entre les
deux, indépendance de la revue (A approuvée pendant que B reste en attente,
sans effet croisé) et indépendance de la publication (A publiée pendant que
B reste non publiée, jusqu'à sa propre publication). Sort en erreur
(`process.exitCode = 1`) si un critère échoue, donc rejouable pour
re-vérifier après tout changement futur.

Vérification complémentaire manuelle des répertoires sur le volume nommé
`site_instances` (ADR-007) : `docker exec opendatavda-site-service-1 ls
/data/instances` confirme un répertoire distinct par `tile_id`, et la lecture
des deux `manifest.json` confirme des `geometry_wgs84` distincts et aucun
champ partagé entre les deux instances.

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

## P9 — Visualiseur de dalle et modules par domaine

Ce lot ne consomme pas la stop condition, qui interdit d'élargir les domaines
de données : il n'ajoute aucune source et rend visible et extensible ce que
P0→P7 produisent déjà.

- [x] Reprendre le moteur Three.js du POC sous
      `apps/gateway-service/public/dalle/` et le servir avec `@fastify/static`.
- [x] Remplacer `scenes.json` par un adaptateur du manifeste embarqué, sans
      ouvrir de route JSON publique (ADR-008 et ADR-010).
- [x] Étendre `SceneDalle` aux métadonnées, au nuage LiDAR source et au calage
      d'orthophotographie, en conservant ces champs optionnels.
- [x] Ajouter les sept états fictifs sous `/api/v2/sites/apercu` pour ouvrir la
      boucle de design, dont les cas sans scène, sans donnée et XSS.
- [x] Réorganiser le premier niveau du panneau selon les six sphères, sans
      masquer l'absence de donnée ; conserver l'instrument avancé du POC.
- [x] Ajouter le registre `public/dalle/modules/`, le relevé générique de repli
      et le premier module `geographie`.
- [x] Couvrir les actifs statiques et la traversée de chemin, les aperçus, le
      manifeste embarqué, le registre de modules et le contrat Ajv.

Lacune connue d'ADR-007 : aucun service ne sert encore
`/data/instances/<tileId>/assets/`. Le visualiseur M1 utilise donc toujours les
actifs du POC montés sous `/valleraugue-3d/`. Cette lacune doit être traitée
avec l'émission réelle par instance prévue en P8.

## Stop condition

Une fois P7 validé, ne pas élargir immédiatement tous les domaines.

Choisir ensuite les lots d’enrichissement dans cet ordre indicatif :

1. IGN local ;
2. BRGM/BSS ;
3. OLD/risques existants ;
4. météo/vigilance ;
5. eau ;
6. autres contextes.
