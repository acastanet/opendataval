# Grille d'acceptation du POC

## Données

- [x] La mairie est incluse dans le carré configuré (200 × 200 m par défaut).
- [x] Les bâtiments BD TOPO sont récupérés sans erreur.
- [x] Au moins une dalle LiDAR HD intersecte la zone tamponnée.
- [x] Le nuage extrait contient des points de sol et de bâtiment.
- [x] Le nuage extrait couvre toute l'emprise du terrain, marge comprise — section
  « Couverture LiDAR » de `poc-validation.md`.
- [x] L'orthophotographie confirme l'alignement général des emprises.

## Reconstruction

- [x] Roofer produit au moins un bâtiment LoD2.2.
- [x] La mairie est identifiable dans la sortie.
- [x] Le faîtage principal est orienté correctement.
- [x] Aucun bâtiment majeur ne flotte ou ne s'enfonce visiblement.
- [x] Aucun artefact géométrique bloquant n'est observé.

## Terrain et orthophotographie

- [x] `terrain.tif` contient un relief continu sur l'emprise.
- [x] Les bâtiments reposent sur le terrain sans flottement majeur.
- [x] `orthophoto.jpg` couvre exactement la bbox Lambert-93.
- [x ] L'orthophotographie est correctement orientée sur le terrain.

## Contact terrain / bâtiments

À contrôler en lumière rasante (12°) sur fond clair, calques alternés avec `1`, `2` et `3`.

- [ ] Aucun terrain ne traverse le pied d'un mur du côté amont.
- [ ] Aucun mur ne flotte au-dessus du terrain du côté aval.
- [ ] La transition au bord des emprises est un talus, non une marche verticale.
- [ ] Aucune jupe de bâtiment n'est visible sous le terrain.
- [ ] La tranche de la dalle de terrain n'apparaît sous aucun angle.

## Terrain à 0,5 m

À contrôler en lumière rasante (12°), terrain seul (`1`).

- [ ] La grille double dans chaque dimension (460 × 460 cellules sur l'emprise 200 m).
- [ ] Les terrasses et les murs de soutènement se lisent, là où la maille métrique les lissait.
- [ ] L'assise sous les bâtiments et son fondu restent cohérents à la maille fine.
- [ ] Aucun bruit nouveau n'apparaît en terrain dégagé : la donnée soutient encore la maille.

## Végétation

- [x] `trees.json` est produit et son décompte est du même ordre que les cimes visibles sur
  l'orthophotographie.
- [x] Chaque proxy repose sur le terrain, sans fût flottant ni houppier enterré.
- [ x] Aucun arbre ne pousse à travers une toiture.
- [ ] Le nœud `Vegetation` peut être masqué séparément dans un logiciel de rendu.
- [ ] La hauteur des proxys correspond à celle des ombres portées sur l'orthophotographie.

## Occlusion ambiante cuite

- [ ] Les ruelles et les angles rentrants sont assombris, y compris hors du visualiseur.
- [ ] Les toitures et les surfaces dégagées restent claires : l'occlusion ne noircit pas tout.
- [ ] Aucune discontinuité brutale d'un triangle à l'autre.
- [ ] `OCCLUSION_STRENGTH=0` restitue exactement la scène sans occlusion.

## Qualité des toitures

- [ ] `poc-validation.md` compte les `rf_roof_type` et nomme les bâtiments dégradés.
- [ ] `render/scene.json` porte la clé `roofQuality` avec le même décompte.
- [ ] Chaque nœud de bâtiment porte `rf_degraded` dans ses `extras`.
- [ ] Les bâtiments signalés sont bien ceux dont la toiture paraît douteuse à l'écran.

## Éclairage

- [ ] `python poc.py sun` retrouve un azimut cohérent avec les ombres visibles sur l'image.
- [ ] Les ombres calculées **prolongent** celles de l'orthophotographie,
  sans angle perceptible entre les deux.
- [ ] `python poc.py sun` mesure un calage d'orthophotographie stable entre exécutions.
- [ ] Le terrain n'apparaît plus décalé par rapport aux bâtiments, sous tous les angles.
- [ ] Les toitures photo-texturées et le terrain sont décalés du **même** vecteur : aucune
  discontinuité de texture au pied des murs.
- [ ] Écarter l'azimut de ±40° rend la contradiction avec les ombres de l'orthophoto manifeste.
- [ ] Le préréglage contrasté sépare les faces sans sous-exposer les tons moyens : soleil `3.2`,
  environnement `0.08`, hémisphérique `0.20`, exposition `1.20` et contraste `1.12`.

## Diffusion web

- [ ] `render/scene.glb` s'ouvre sans erreur.
- [ ] Les murs et les toitures utilisent des matériaux distincts.
- [ ] Chaque bâtiment forme un nœud sélectionnable nommé par son `cleabs`.
- [ ] Les murs et les toitures portent des coordonnées de texture.
- [ ] `render/buildings.json` couvre tous les nœuds de `Batiments`.
- [ ] Le terrain et les bâtiments peuvent être masqués séparément.
- [ ] La boussole suit la rotation de la caméra.
- [ ] Les ombres sont cohérentes avec l'azimut solaire affiché.
- [ ] Le visualiseur fonctionne via `python poc.py serve`.
- [ ] Le visualiseur reste utilisable sur un écran mobile.

## Vague 0 — correctifs retenus

La touche `P` copie dans le presse-papiers et imprime dans la console la scène, la position de
caméra, la cible et les paramètres de projection ; une confirmation apparaît au centre de l'écran.

- [x] Le mode réaliste expérimental, jugé plus fade sans ajouter d'information, est retiré avec
  son ciel, son GTAO, son composer et sa bascule d'interface.
- [ ] Les silhouettes de toiture restent nettes avec l'antialiasing natif du rendu standard.
- [ ] Sur un affichage confortable et un GPU acceptant 4096 px, la carte d'ombres est en 4096²
  et les avant-toits restent nets sur l'emprise 630 m.
- [ ] À 380 × 700, ou avec une texture maximale inférieure à 4096 px, la carte d'ombres repasse
  en 2048² et le visualiseur reste utilisable.
- [ ] La fiche d'un bâtiment affiche les codes BD TOPO des murs et de la toiture ainsi que le
  nombre d'étages ; toute valeur absente apparaît comme « Non disponible ».
- [ ] Sur dix bâtiments tirés au hasard, les codes matériau annoncés sont cohérents avec
  l'orthophotographie ; ce contrôle décide de l'engagement de la vague 1.

## Vagues 1 et 2A — décision et végétation

- [x] Les textures murales évaluées en vague 1 sont absentes du GLB ; les matériaux
  `Murs — code …` ne portent aucune `baseColorTexture`.
- [x] Les légères nuances murales sont stables pour un même code `materiaux_des_murs` et ne
  dépendent plus de l'identifiant du bâtiment ; un code absent reçoit la teinte neutre.
- [x] Les codes BD TOPO des murs restent disponibles dans la fiche bâtiment.
- [x] `trees.json` documente la source BD Forêt, le nombre de formations croisées, l'essence
  mesurée et les décomptes `deciduous`, `conifer`, `mixed` et `generic`.
- [x] Une indisponibilité du WFS ne bloque pas la génération et conserve le profil générique.
- [x] Le matériau `Feuillage` ne porte plus de texture ni de masque alpha ; la couleur reste
  mesurée dans l'orthophotographie.
- [x] Le motif pointillé répétitif constaté pendant la recette visuelle a été retiré.
- [ ] Les profils conifères se lisent plus effilés que les feuillus sans caricature botanique.
- [x] La végétation projette ses ombres au sol sans recevoir les ombres noires des arbres voisins.
- [x] L'eau est translucide, gris-bleu, et ne projette ni ne reçoit d'ombre.
- [ ] Les curseurs de dimensions des houppiers continuent de redimensionner chaque arbre autour
  de son propre centre.
- [x] `poc.py all` régénère la scène sans relancer Roofer ni retélécharger le LiDAR.

## Vague 2B — ombres en cascades et repli LoD1

- [x] Le visualiseur embarque `CSM.js`, `CSMFrustum.js` et `CSMShader.js` localement.
- [x] Trois cascades 2048² suivent la caméra et le soleil sur un écran d'au moins
  720 × 600 disposant d'une texture maximale de 4096 px.
- [x] Le directionnel unique reste actif sur un petit écran ou un GPU limité.
- [x] Chaque matériau chargé est préparé pour les cascades et libéré lors d'un changement
  de scène.
- [x] Une toiture dégradée disposant d'une emprise devient un volume LoD1 horizontal ; une
  toiture fiable conserve sa géométrie LoD2.2.
- [x] `rf_lod1_fallback`, `rf_rendered_lod` et `rf_lod1_height_source` rendent le repli
  explicite dans le GLB et la fiche qualité.
- [ ] Les transitions entre cascades sont invisibles et les ombres ne nagent pas pendant
  une orbite sur les scènes 200 et 600 m.
- [ ] Les volumes LoD1 des bâtiments signalés épousent leur emprise sans trou ni mur
  inversé, et leur hauteur reste crédible dans l'orthophotographie.

## Vague 3 — relief des houppiers et courbe de rendu

À passer sur l'emprise 200 m puis 600 m.

- [ ] `VEGETATION_CROWN_IRREGULARITY=0` restitue exactement la scène précédente : même poids de
  `scene.glb`, même nombre de triangles.
- [ ] À la valeur par défaut, les houppiers perdent leur silhouette de boule sans se lire comme
  des cailloux, et le couvert continu du 600 m reste lisible.
- [x] L'ombrage du feuillage est facetté par défaut : le lissé, essayé puis écarté, donnait une
  bulle — intérieur continu, silhouette anguleuse — sur un solide de douze sommets.
- [ ] « Ombrage du feuillage » bascule les deux rendus sans recharger la scène, et le choix est
  retrouvé après rechargement de la page.
- [ ] Les facteurs de houppier reprennent l'ombrage avec eux : un houppier aplati ne garde pas
  l'éclairement de sa forme d'origine, dans l'un comme dans l'autre mode.
- [ ] Le relief ne déplace ni la cime ni l'assise : la hauteur des proxys correspond toujours
  aux ombres portées sur l'orthophotographie.
- [ ] `render/scene.json` porte `crownIrregularity` à la valeur employée par l'exécution.
- [ ] Le sélecteur de courbe change l'image immédiatement, sur une scène déjà chargée comme
  après un changement d'emprise.
- [ ] La courbe choisie est retrouvée après rechargement de la page.
- [ ] Le préréglage contrasté ramène la courbe à « Neutre » avec ses cinq autres valeurs.
- [ ] Comparaison à l'écran des quatre courbes : décider si le contraste d'affichage CSS reste
  nécessaire, et reporter la décision dans `ameliorations-3d.md`.
- [ ] Après `poc.py web`, `vendor/addons/` ne contient plus `Sky.js`, `GTAOPass.js` ni
  `EffectComposer.js`, et le visualiseur charge sans erreur de console.

## Sélecteur de scènes

- [ ] Le sélecteur liste chaque emprise disposant d'une scène, l'exécution servie en tête, et
  se masque quand il n'y en a qu'une.
- [ ] Changer d'emprise recharge la scène, recadre la caméra et met à jour les trois mesures
  du panneau ainsi que le nom de l'exécution.
- [ ] Les bascules de couches suivent ce que la nouvelle scène contient : une couche absente
  se désactive au lieu de rester sans effet.
- [ ] Opacité du terrain, exagération verticale et facteurs de houppier restent appliqués
  après le changement.
- [ ] Les ombres portées couvrent toute l'emprise, y compris ses bords, sur le 630 m comme
  sur le 200 m.
- [ ] « Vue générale » cadre la scène entière sans que la caméra soit ramenée vers le sol.
- [ ] Enchaîner rapidement deux changements d'emprise n'affiche jamais la scène abandonnée,
  et la mémoire graphique ne croît pas d'un aller-retour à l'autre.

## Lots cohérence solaire, publication et recette

- [x] Les scènes 200 m et 600 m portent des mesures `orthoSun` distinctes, calculées avec
  leur latitude propre ; une scène sans `SCENE_CENTRE_WGS84` retombe sur le centre Lambert-93.
- [ ] Sur les trois sites, le verrou solaire place les ombres 3D dans le prolongement de
  celles de l’orthophotographie ; décocher rend la main aux curseurs.
- [x] `serve` refuse un `web/` dont l’un des quatre fichiers source a changé, tandis que
  `check` ne signale cet état qu’en avertissement.
- [x] Le rapport de validation s’intitule avec `SCENE_TITLE` et ouvre sur « Rendu » après
  assemblage : toitures dégradées, calage, arbres typés et facteur de vue du ciel médian.
- [x] Le visualiseur servi répond en HTTP 200, annonce quatre scènes et expose l’exécution
  `run-20260729-225523` pour le 600 m.
- [ ] L’export PNG correspond exactement à la vue courante.
- [ ] `P`, déplacement de caméra, puis `Maj+P` revient exactement à la pose copiée ; une pose
  d’une autre scène est refusée avec un message.
- [x] Le GLB 600 m porte `canopy=true`, le 200 m `canopy=false`, et leur bascule est
  persistée comme les autres couches facultatives.
- [ ] En vue générale puis rasante, comparer le massif 600 m activé et désactivé ; s’il se
  lit comme une bâche verte, remettre `CANOPY_MASSIF=0`.

## Interface du visualiseur

Points de contrôle de la refonte décrite dans [`ux-visualiseur.md`](ux-visualiseur.md), à passer
sur l'emprise 200 m puis 600 m.

- [ ] La barre de progression avance en octets pendant le chargement du GLB ; la pastille passe
  d'ambre à vert, et le reste du panneau reste inactif jusqu'à la scène prête.
- [ ] Serveur coupé en cours de chargement : pastille rouge et bandeau d'erreur.
- [ ] Deux sections de « Réglages avancés » restent ouvertes en même temps.
- [ ] Survoler un bâtiment change le curseur et le souligne ; le contour de sélection épouse le
  volume au lieu d'une boîte alignée sur les axes.
- [ ] « Mairie » et « Toitures » déplacent la caméra progressivement, et l'animation s'interrompt
  dès qu'on reprend la souris.
- [ ] Rallumer une texture après le mode « Modèle » signale que l'affichage ne suit plus le
  préréglage.
- [ ] En mode « Qualité », la légende compte les trois niveaux conformément à `roofQuality`, et un
  clic isole le niveau choisi.
- [ ] Saisir le `cleabs` d'un bâtiment signalé par le rapport de validation le sélectionne et le
  cadre, même si une bascule ou le filtre de qualité le masquait.
- [ ] Les réglages sont retrouvés après rechargement de la page et après changement d'emprise.
- [ ] La barre d'échelle reste cohérente d'un niveau de zoom à l'autre.
- [ ] À 380 × 700 : les trois mesures restent affichées, l'aide est atteignable, et ni la rose des
  vents ni la barre d'échelle ne passent sous le panneau, ouvert comme fermé.

## Reproductibilité

- [ ] `python poc.py check` réussit avec Python Windows, sans Docker ni WSL.
- [ ] `python poc.py all` fonctionne à partir d’un `lidar_subset.laz` et d’une
  sortie CityJSONSeq Roofer existants.
- [ ] Les entrées amont utilisées sont identifiées dans le rapport de validation.
- [ ] `python poc.py validate` produit un rapport exploitable.
- [ ] `python -m unittest discover -s test -v` réussit.
- [ ] Les données générées restent hors Git.

## Décision

- **GO** : reconstruction correcte et reproductible, sans correction manuelle essentielle.
- **GO LoD1 seulement** : données disponibles mais reconstruction LoD2 insuffisante.
- **NO-GO** : couverture, alignement ou reproductibilité insuffisants.
