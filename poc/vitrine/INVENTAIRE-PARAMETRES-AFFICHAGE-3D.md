# Inventaire des paramètres d’affichage 3D

## Objet

Ce document inventorie les paramètres qui modifient l’apparence de la dalle 3D afin de concevoir le nouveau menu **Paramètres d’affichage** de la vitrine `poc-interface-dalle-v11-poc3d.html`.

La source de référence est le panneau interne du visualiseur `poc/valleraugue-mairie-3d/publication/index.html`, complété par les comportements définis dans `app.js`. Ce panneau interne reste masqué dans la vitrine. Le futur menu devra piloter ses contrôles sans dupliquer la logique de rendu Three.js.

## Périmètre

Sont inclus :

- les choix qui changent les objets visibles ;
- la représentation 3D ou LiDAR ;
- les matériaux, textures et couleurs ;
- l’éclairage, la tonalité et le relief apparent ;
- la forme visuelle de la végétation ;
- les vues prédéfinies et le comportement du pivot, car ils changent la composition à l’écran ;
- les actions de réinitialisation et d’export liées au rendu.

Sont exclus du menu d’affichage :

- les métriques de la scène ;
- la recherche et la fiche d’un bâtiment ;
- l’identification géologique par clic ;
- les informations de provenance et l’aide ;
- la sélection de la scène, qui relève de la navigation entre dalles.

## Proposition de structure du nouveau menu

Le menu est unique : il présente l’ensemble des paramètres dans une liste verticale, sans séparation « Normal / Avancé ». Les familles les plus techniques restent identifiées par des sections distinctes.

1. **Représentation** — toujours visible.
2. **Couches** — toujours visible.
3. **LiDAR HD** — visible seulement lorsque le nuage de points est affiché.
4. **Textures et matériaux** — section avancée.
5. **Éclairage et tonalité** — section avancée.
6. **Relief et végétation** — section avancée.
7. **Cadrage** — peut rester dans « Autres outils » si l’on veut réserver ce menu au rendu strict.
8. **Actions** — réinitialiser et exporter.

## 1. Représentation

Ces deux familles sont différentes et doivent conserver des intitulés distincts.

### Composition de la scène

Contrôle source : radios `comparisonMode`.

| Valeur | Libellé actuel | Effet visuel | Priorité |
|---|---|---|---|
| `bare` | Sol nu | Terrain et bâtiments, sans végétation ni photographie aérienne | Essentiel |
| `vegetation` | Scène 3D / Végétation | Modèle 3D, végétation LiDAR et orthophotographie | Essentiel |
| `source` | LiDAR HD | Nuage de points mesuré sans interprétation géométrique | Essentiel |
| `overlay` | 3D + LiDAR | Superposition du nuage mesuré et du modèle reconstruit | Essentiel |

### Style de rendu du modèle

Contrôle source : radios `renderMode`.

| Valeur | Libellé | Effet visuel | Priorité |
|---|---|---|---|
| `ortho` | Orthophoto | Photographie aérienne sur le terrain et les toitures | Essentiel |
| `model` | Modèle | Matériaux du modèle sans orthophoto | Secondaire |
| `quality` | Qualité | Couleurs indiquant la qualité de reconstruction Roofer | Analyse |

Le mode de composition décide quels grands ensembles sont visibles. Le style de rendu décide comment le modèle 3D visible est coloré.

## 2. Couches visibles

| Contrôle source | Libellé proposé | Type | Valeur initiale | Effet ou dépendance |
|---|---|---|---|---|
| `terrainToggle` | Terrain IGN | Interrupteur | Activé | Affiche le terrain |
| `buildingsToggle` | Bâtiments 3D | Interrupteur | Activé | Affiche les volumes bâtis |
| `vegetationToggle` | Végétation | Interrupteur | Activé | Affiche la couche de végétation générale |
| `canopyToggle` | Canopée dense | Interrupteur | Activé | Affiche les houppiers |
| `understoryToggle` | Strate arbustive | Interrupteur | Activé | Affiche les classes LiDAR 3 et 4 |
| `waterToggle` | Eau | Interrupteur | Activé | Affiche la couche eau |
| `bridgeToggle` | Ponts | Interrupteur | Activé | Affiche les ponts |
| `circularExtentToggle` | Emprise circulaire | Interrupteur | Désactivé | Applique une découpe visuelle circulaire |
| `circularBaseToggle` | Socle cylindrique | Interrupteur dépendant | Activé | Disponible avec l’emprise circulaire |
| `geologyToggle` | Carte géologique BRGM | Interrupteur | Désactivé | Charge puis affiche la texture géologique |
| `geologyOpacity` | Opacité de la géologie | Curseur 10–100 % | 70 % | Actif lorsque la géologie est affichée |

Les bascules de couches existent également dans les sphères territoriales. Le nouveau menu doit réutiliser le même état afin d’éviter deux commandes désynchronisées.

## 3. Nuage LiDAR HD

Cette section n’a de sens que pour les compositions `source` et `overlay`. Elle doit être masquée ou désactivée dans les autres modes, avec une explication courte.

| Contrôle source | Libellé proposé | Type | Valeurs / plage | Valeur initiale |
|---|---|---|---|---|
| `pointColorMode` | Couleur des points | Liste | Orthophotographie, classification, intensité, altitude | Orthophotographie |
| `foliageGreenToggle` | Corriger la couleur du feuillage | Interrupteur | Activé / désactivé | Activé |
| `pointSize` | Taille des points | Curseur ×0,4–×3,2 | Pas de 0,01 dans la valeur source | ×1,0 |
| Légende dynamique | Classes LiDAR visibles | Cases à cocher | Classes publiées dans les métadonnées de la dalle | Toutes visibles |

Notes de conception :

- le filtre de classes est construit dynamiquement depuis `classificationLegend` et `renderedClassificationCounts` ;
- le choix « Orthophotographie » peut être indisponible si la dalle ne possède aucune texture compatible ;
- la correction verte ne concerne que la coloration par orthophotographie des classes végétales ;
- le facteur de taille agit sur une taille physique dérivée de l’espacement du nuage, et non sur une taille fixe en pixels.

## 4. Textures et matériaux

| Contrôle source | Libellé proposé | Type | Valeur initiale | Effet ou dépendance |
|---|---|---|---|---|
| `terrainTextureToggle` | Orthophoto du terrain | Interrupteur | Activé | Active la texture aérienne du terrain |
| `roofTextureToggle` | Texture des toitures | Interrupteur | Activé | Active la texture aérienne des toitures |
| `wireframeToggle` | Maillage des bâtiments | Interrupteur | Désactivé | Affiche les arêtes du bâti |
| `terrainOpacity` | Opacité du terrain | Curseur 15–100 % | 100 % | Rend le terrain partiellement transparent |
| `orthoEast` | Calage de la photo — est | Curseur −12 à +12 m, pas 0,1 m | 0 m | Déplace la texture sur l’axe est-ouest |
| `orthoNorth` | Calage de la photo — nord | Curseur −12 à +12 m, pas 0,1 m | 0 m | Déplace la texture sur l’axe nord-sud |

Les deux calages s’appliquent au terrain, aux toitures et à la coloration orthophoto du LiDAR. Le bouton technique « Copier le calage pour la configuration » n’est pas nécessaire dans le menu grand public ; il peut rester réservé au mode expert.

## 5. Éclairage et tonalité

### Orientation et intensité des lumières

| Contrôle source | Libellé proposé | Type | Plage | Valeur initiale |
|---|---|---|---|---|
| `sunLockToMeasure` | Soleil de l’orthophoto | Interrupteur | Activé / désactivé | Activé |
| `sunHeight` | Hauteur du soleil | Curseur | 10–75°, pas 0,1° | 35° |
| `sunAzimuth` | Azimut du soleil | Curseur | 0–359°, pas 0,1° | 95° |
| `sunIntensity` | Intensité du soleil | Curseur | 0,5–4, pas 0,1 | 3,2 |
| `environmentIntensity` | Lumière d’environnement | Curseur | 0–0,8, pas 0,01 | 0,08 |
| `hemisphereIntensity` | Lumière hémisphérique | Curseur | 0–1,2, pas 0,01 | 0,20 |

Lorsque le soleil est calé sur la mesure de l’orthophoto, la hauteur et l’azimut manuels doivent être désactivés ou clairement indiqués comme calculés. Modifier l’un de ces deux curseurs désactive actuellement le verrouillage.

### Rendu final de l’image

| Contrôle source | Libellé proposé | Type | Valeurs / plage | Valeur initiale |
|---|---|---|---|---|
| `toneMapping` | Courbe de rendu | Liste | Neutre, AgX, ACES Filmic, aucune | Neutre |
| `displayExposure` | Exposition | Curseur | ×0,50–×2,00, pas 0,05 | ×1,20 |
| `displayContrast` | Contraste | Curseur | ×0,80–×1,40, pas 0,01 | ×1,12 |
| `contrastLighting` | Rendu contrasté | Préréglage | Action immédiate | — |
| `grazingLight` | Lumière rasante | Préréglage | Place le soleil à 12° | — |

Les préréglages modifient plusieurs valeurs. Après leur application, tous les contrôles concernés doivent refléter les nouvelles valeurs.

## 6. Relief et végétation

| Contrôle source | Libellé proposé | Type | Plage / valeurs | Valeur initiale |
|---|---|---|---|---|
| `verticalScale` | Exagération verticale | Curseur | ×1,0–×2,5 | ×1,0 |
| `foliageShading` | Ombrage du feuillage | Liste | Facettes, lissé | Facettes |
| `crownX` | Largeur des houppiers est-ouest | Curseur | ×0,20–×1,50 | ×1,00 |
| `crownY` | Hauteur des houppiers | Curseur | ×0,20–×1,50 | ×1,00 |
| `crownZ` | Largeur des houppiers nord-sud | Curseur | ×0,20–×1,50 | ×1,00 |
| `crownReset` | Rétablir la forme mesurée | Action | Réinitialise les trois dimensions | — |

L’exagération verticale agit sur le modèle et le nuage LiDAR. Elle impose également de recalculer le centre de rotation, le socle et le volume couvert par les ombres.

## 7. Cadrage et navigation visuelle

| Contrôle source | Libellé proposé | Type | Effet |
|---|---|---|---|
| `viewReset` | Vue générale | Bouton | Rétablit le cadrage de référence |
| `viewCentre` | Vue centrale | Bouton | Centre la caméra sur le milieu de la dalle |
| `viewRoof` | Vue des toitures | Bouton | Adopte un cadrage adapté aux toitures |
| `centerRotationToggle` | Rotation autour du centre | Interrupteur | Verrouille le pivot et désactive le déplacement latéral |

Dans la vitrine actuelle, les trois vues sont déjà placées dans « Autres outils ». Il est préférable de les y conserver pour ne pas mélanger cadrage et paramètres de rendu. Le pivot centré peut les rejoindre.

## 8. Actions liées à l’affichage

| Contrôle source | Libellé proposé | Destination |
|---|---|---|
| `resetSettings` | Réinitialiser l’affichage | Pied du menu Paramètres d’affichage |
| `exportPng` | Exporter la vue en PNG | Pied du menu ou Autres outils |
| `orthoOffsetCopy` | Copier le calage | Mode expert uniquement |
| `sunConfigCopy` | Copier le soleil | Mode expert uniquement |

La réinitialisation doit remettre ensemble les couches, le rendu, l’éclairage, le LiDAR, le relief et la végétation. Une confirmation n’est pas indispensable si l’action est immédiatement réversible ou si les réglages par défaut sont clairement annoncés.

## États, synchronisation et persistance

Le nouveau menu ne doit pas maintenir une copie indépendante des valeurs. Il doit lire et piloter les contrôles du visualiseur embarqué, ou passer par une API de commandes dédiée.

Points à garantir :

- synchronisation bidirectionnelle avec les interrupteurs des sphères ;
- actualisation après un changement de mode ou l’application d’un préréglage ;
- gestion des contrôles indisponibles selon les capacités de la dalle ;
- conservation des réglages déjà assurée par la clé locale `poc3d.viewer.v3` ;
- réinitialisation cohérente de l’état mémorisé ;
- aucun affichage fugitif du panneau interne lors du chargement de l’iframe ;
- libellés, valeurs et états accessibles au clavier et aux lecteurs d’écran.

## Organisation retenue

Le menu « Affichage 3D » expose directement toutes les familles recensées : représentation, couches, LiDAR, textures, éclairage, tonalité, relief, végétation, navigation, actions et profils JSON. Il n’emploie plus de sous-menu ni d’onglet de niveau.
