# 08 — Backlog initial

Ce fichier est opérationnel et peut évoluer. Les contrats stables sont décrits dans les autres documents.

## P0 — Contrats

- [ ] Ajouter le schéma JSON du manifeste.
- [ ] Ajouter les types TypeScript correspondants.
- [ ] Ajouter les enums du cycle de vie.
- [ ] Ajouter les enums de relation spatiale.
- [ ] Tester le schéma.

## P1 — Géométrie d’instance

- [ ] Réutiliser la projection WGS84 → Lambert-93 déjà disponible
      (`packages/shared/src/lambert93.ts`), ne pas la réimplémenter.
- [ ] Ajouter la projection inverse Lambert-93 → WGS84, absente aujourd'hui.
- [ ] Génération du carré ±100 m.
- [ ] Retour WGS84 via la projection inverse (pas d'approximation en degrés).
- [ ] Tests de déterminisme.
- [ ] Tests de dimensions.

## P2 — Persistance d’instance

- [ ] Génération `tile_id`.
- [ ] Création du répertoire.
- [ ] Écriture atomique du manifeste.
- [ ] Lecture d’une instance.
- [ ] Gestion des états.
- [ ] Journal minimal.

## P3 — Squelette `site-service`

- [ ] Route de création.
- [ ] Route de lecture.
- [ ] Déclenchement de fabrication.
- [ ] Gestion d’erreur.
- [ ] Premier adaptateur vers un service déjà existant.

## P4 — Raccord scène

- [ ] Définir le contrat d’un actif 3D.
- [ ] Rattacher une scène existante pour la première démonstration.
- [ ] Afficher la scène dans la page d’instance.
- [ ] Remplacer ensuite par la génération automatique réelle.

## P5 — Première page dalle

- [ ] Identité.
- [ ] 3D.
- [ ] information locale minimale.
- [ ] source/provenance.
- [ ] statut de fabrication/revue.

## P6 — Revue / publication minimale

- [ ] Passage `generated → review_required`.
- [ ] validation opérateur.
- [ ] passage `approved → published`.
- [ ] empêcher la publication directe sans approbation.

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
