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
- [ ] En mode réaliste, les ombres calculées **prolongent** celles de l'orthophotographie,
  sans angle perceptible entre les deux.
- [ ] `python poc.py sun` mesure un calage d'orthophotographie stable entre exécutions.
- [ ] Le terrain n'apparaît plus décalé par rapport aux bâtiments, sous tous les angles.
- [ ] Les toitures photo-texturées et le terrain sont décalés du **même** vecteur : aucune
  discontinuité de texture au pied des murs.
- [ ] Écarter l'azimut de ±40° rend la contradiction manifeste, et le panneau la signale.
- [ ] Le mode diagnostic reste strictement inchangé après bascule aller-retour.
- [ ] Le ciel s'affiche réellement en fond, sous tous les points de vue et à tout niveau
  de zoom — un fond uni signale une boîte de ciel détourée par le plan éloigné.
- [ ] L'occlusion ambiante assombrit les angles rentrants et le pied des murs, sans halo
  ni scintillement au déplacement de la caméra.

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
