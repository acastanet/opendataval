# Visualiseur — analyse UX/UI et refonte de l'interface

## Objet

Le visualiseur a grossi par accumulation. Chaque piste livrée du rapport
[`ameliorations-3d.md`](ameliorations-3d.md) — terrain à 0,5 m, végétation, occlusion cuite,
qualité des toitures, eau et ponts — y a déposé ses propres réglages. Résultat : **huit
sections et plus de vingt contrôles** dans un panneau de 340 px, tous au même rang, plus un
comportement d'accordéon exclusif qui referme une section dès qu'on en ouvre une autre.

Le fond du problème n'est pas la quantité de contrôles : c'est que l'interface sert **deux
usages qu'elle ne distingue pas**.

| Usage | Ce qu'il demande |
| --- | --- |
| Contrôle géométrique entre deux exécutions du pipeline | mesure, comparaison, isolement d'une couche, mémoire des réglages |
| Démonstration du potentiel LiDAR HD | lisibilité immédiate, peu de réglages visibles, navigation évidente |

La réponse retenue est **deux niveaux d'interface** : une vue de découverte, complète mais
courte, et un bloc expert dépliable dont l'état est mémorisé.

Ce rapport rectifie au passage la conclusion de `ameliorations-3d.md` § 3 (« tout travail sur le
visualiseur » déconseillé). L'expérimentation ultérieure d'un mode réaliste — ciel de Preetham
et GTAO — a finalement été retirée après recette comparative, sans remettre en cause les gains
d'interface décrits ici.

L'accessibilité (WCAG 2.2 AA) est **hors périmètre** de ce lot, par décision explicite.

---

## 1. Ce que dit la recherche

- **Divulgation progressive plutôt qu'une liste plate.** Un gestionnaire de couches structuré
  en « critique » / « contexte optionnel » / « sources » vaut mieux que quarante bascules au
  même niveau ; le détail se révèle à la demande
  ([Bricx Labs](https://bricxlabs.com/blogs/map-ui-design-patterns-examples),
  [Eleken](https://www.eleken.co/blog-posts/map-ui-design)).
- **Explorer la scène et explorer un objet de la scène sont deux modèles d'interaction
  distincts**, qui doivent coexister sans se gêner. C'est l'argument direct en faveur d'un
  retour au survol : sans lui, rien ne distingue une scène qu'on oriente d'une scène dont on
  interroge les objets ([Eleken](https://www.eleken.co/blog-posts/map-ui-design)).
- **L'aide de navigation est un élément d'interface à part entière.** Les visualiseurs 3D
  urbains de référence l'exposent par un bouton dédié — `NavigationHelpButton` chez Cesium,
  `Toolbox` chez 3DCityDB — et non par une ligne de texte en pied de panneau
  ([3DCityDB](https://3dcitydb-docs.readthedocs.io/en/version-2024.0/webmap/features.html),
  [CesiumJS](https://github.com/CesiumGS/cesium/wiki/CesiumJS-Features-Checklist)).
- **La couleur porte l'état** — alerte, validé, neutre — et l'habillage s'effface devant la
  scène ([Bricx Labs](https://bricxlabs.com/blogs/map-ui-design-patterns-examples)).
- **Progression de chargement : compter les octets, pas les fichiers.** Le callback de
  progression de `GLTFLoader` existe, mais un compteur d'items saute de 0 à 17 % dès le premier
  petit fichier quand un seul fichier porte toute la charge — exactement notre cas, avec un GLB
  de 20 Mo ([three.js](https://threejs.org/docs/#examples/en/loaders/GLTFLoader.load),
  [sbcode](https://sbcode.net/threejs/progress-indicator/)).
- **En mobile, retirer le chrome superflu, pas l'information utile** : ce sont les commandes de
  navigation redondantes avec les gestes tactiles qui doivent disparaître, pas les mesures
  ([3DCityDB](https://3dcitydb-docs.readthedocs.io/en/version-2024.0/webmap/features.html)).

---

## 2. Diagnostic

Défauts retenus, chacun localisé dans le code d'origine.

| # | Défaut | Conséquence |
| --- | --- | --- |
| 1 | Accordéons mutuellement exclusifs | régler l'éclairage referme les couches : va-et-vient permanent |
| 2 | Huit sections au même rang | aucune entrée en matière ; l'essentiel se cherche |
| 3 | « Chargement de la scène… » figé sur 20 Mo de GLB | rien ne distingue un chargement lent d'un blocage |
| 4 | Pastille de statut verte en permanence | l'état d'erreur ne se voit pas là où on le regarde |
| 5 | Aide en 0,69 rem, `display:none` sous 760 px | les raccourcis `1`/`2`/`3` et la sélection au clic sont invisibles en mobile |
| 6 | Aucun retour au survol d'un bâtiment | rien n'indique que la scène est interrogeable |
| 7 | Sélection par boîte englobante alignée sur les axes | sur un bâti en L, la boîte englobe les voisins : on ne sait pas ce qui est sélectionné |
| 8 | Sauts de caméra instantanés | désorientation à chaque changement de point de vue |
| 9 | « Mode de rendu » écrase les bascules de « Textures » sans le dire | un même état piloté depuis deux endroits, sans indication de divergence |
| 10 | Aucune échelle métrique | un outil de contrôle géométrique sans repère de dimension |
| 11 | Aucune mémoire d'état | chaque `poc.py all` fait tout re-régler à la main |
| 12 | Légende du mode qualité en texte seul | `roofQuality` et `reconstructionQuality` sont calculés, mais ni comptés ni filtrables |
| 13 | Aucun chemin de l'identifiant vers le bâtiment | les `cleabs` sont dans les nœuds du GLB et `buildings.json` est servi, mais rien n'y mène : les bâtiments nommés dégradés par le rapport de validation sont introuvables dans la scène |
| 14 | Mobile : métriques supprimées, rose des vents à `bottom: 205px` | valeur magique qui chevauche le panneau selon la hauteur d'écran |
| 15 | `button { width: 100% }` global | chaque nouveau bouton doit annuler la règle |
| 16 | Seul le sélecteur d'emprise se verrouille pendant un chargement | on peut régler une scène qui n'est pas encore là |

Le point **13** est le plus révélateur : le pipeline nomme chaque nœud du GLB par son `cleabs`,
recopie `buildings.json` dans le dossier servi, et le rapport de validation désigne les bâtiments
dégradés par leur identifiant. Mais aucun chemin d'interface ne permet d'aller de ce nom au
bâtiment dans la scène. Le coût de la liaison est faible ; ce qu'elle débloque — vérifier un à un
les cas signalés — est précisément l'usage de contrôle que l'outil revendique.

---

## 3. Interface retenue

### Niveau 1 — découverte

1. **Statut** : pastille colorée par état (`chargement` / `prête` / `erreur`) et barre de
   progression en octets.
2. **Mesures** : bâtiments, emprise, relief — conservées en mobile, sur deux colonnes.
3. **Couches** : terrain, bâtiments, végétation, eau, ponts, carte géologique BRGM — en
   accordéon, seul pliage de ce niveau : elles sont six, et on n'y revient pas à chaque
   ouverture. La géologie y porte en plus son opacité et sa légende, contrairement aux cinq
   autres : ce n'est pas un nœud du GLB qu'on montre ou masque, mais une image drapée sur le
   terrain, dont la transparence *est* la comparaison avec l'orthophoto rendue dessous. Mettre
   ce curseur au niveau expert, avec celui du terrain, aurait séparé la bascule de ce qui la
   rend utile.
4. **POV** : titre et trois boutons carrés sur une même ligne — vue générale, mairie, toitures.
   Trois boutons pleine largeur prenaient la hauteur de trois sections pour trois commandes qui
   ne demandent qu'une icône.
5. **Informations sur les données** et **Navigation et raccourcis**.

### Niveau 2 — bloc expert replié, état mémorisé

Sections **non exclusives** : Mode de rendu · Emprise · Rechercher un bâtiment · Textures et
maillage · Opacité du terrain · Éclairage (hauteur, azimut, lumière rasante, exagération
verticale) · Houppiers.

Deux déplacements de section méritent leur justification :

- **le mode de rendu descend au niveau avancé.** Ce n'est pas une commande de chaque ouverture
  mais un préréglage des bascules de texture, qui vivent elles-mêmes à ce niveau. L'y garder
  laissait au premier plan un contrôle dont l'effet réel se règle deux sections plus bas.
- **la lumière rasante quitte « Points de vue » pour « Éclairage ».** Elle ne déplace pas la
  caméra.

L'état de chaque section est repéré par son identifiant, non par son rang : un réglage inséré au
milieu du panneau aurait sinon décalé tout l'état déjà mémorisé.

---

## 4. Améliorations livrées

| Lot | Contenu | Défauts corrigés |
| --- | --- | --- |
| 1 | Deux niveaux, accordéons indépendants, progression en octets, statut coloré, dialogue d'aide, panneau verrouillé pendant le chargement, `.button` explicite | 1, 2, 3, 4, 5, 15, 16 |
| 2 | Survol des bâtiments, contour de sélection épousant le volume, transitions de caméra interruptibles, barre d'échelle | 6, 7, 8, 10 |
| 3 | Persistance `localStorage`, état « personnalisé » du mode de rendu, légende de qualité filtrable, recherche par `cleabs`, reprise du mobile | 9, 11, 12, 13, 14 |

### Calage manuel de l'orthophotographie

La section « Textures » porte deux glissières, **est** et **nord**, qui déplacent la photographie
sur le terrain et sur les toitures à la fois — les deux partagent la même texture glTF, si bien
qu'un décalage de coordonnées appliqué à celle-ci les suit ensemble, comme le fait `ortho_uv`
à la production.

Elles existent parce que la mesure automatique **se refuse** là où les toitures ne se distinguent
pas de leur environnement (`sun.py`), et qu'il faut bien pouvoir caler l'image à la main dans ce
cas. Le réglage est de plus le seul moyen de vérifier une mesure : on la fait bouger, on voit à
partir d'où elle se dégrade.

Trois décisions valent d'être notées :

- **Le réglage ne se mémorise pas d'une scène à l'autre.** Un calage vaut pour une
  orthophotographie ; le reporter ailleurs décalerait une image qui n'a pas le même défaut. Il
  retombe donc à zéro à chaque chargement, contrairement aux autres réglages du panneau.
- **Le bouton « Copier le calage » rend le total**, mesure cuite dans la scène comprise, sous la
  forme des deux lignes `ORTHO_OFFSET_*` à coller dans le `.conf`. C'est la seule valeur qui a un
  sens hors du visualiseur : les curseurs, eux, ne disent qu'un écart à ce qui est déjà appliqué.
  La section « Éclairage » a son équivalent pour `ORTHO_SUN_*`, par le même chemin — l'azimut du
  panneau est déjà géographique, aucune conversion ne s'interpose. Une copie refusée par le
  navigateur affiche les lignes à l'écran plutôt que d'échouer en silence : un réglage trouvé à
  l'œil et impossible à reporter serait perdu.
- **La texture n'est pas renvoyée au GPU** à chaque cran : seul son décalage change, et la
  matrice de texture est recalculée au rendu. Lever `needsUpdate` retéléverserait 4096 pixels de
  côté à chaque mouvement du curseur.

S'y ajoutent deux reprises de l'habillage :

- **L'en-tête tient sur deux lignes** — provenance et titre. Le troisième niveau énumérait les
  couches de la scène, information que le dialogue « Informations sur les données » porte déjà,
  et qui empiétait sur la vue.
- **Le bouton de pliage change de forme selon l'état** : pastille à icône tant que le panneau est
  visible — il est sous les yeux, l'icône suffit — et pilule libellée « Réglages » dès qu'il est
  replié, où plus rien n'indique ce qu'on rouvre. La flèche désigne le sens du déplacement du
  panneau, et pivote d'un quart de tour en mobile, où il glisse vers le bas.

### Uniformisation visuelle du panneau

Une fois les sections en place, le panneau restait bigarré : la refonte avait ajouté ses propres
conventions à côté de celles qu'elle avait héritées. Sept incohérences relevées sur capture, puis
corrigées :

| Constat | Correction |
| --- | --- |
| Trois symboles pour la même action : `+` au niveau 1, `×` sur une section ouverte, `▸` sur le bloc avancé | un seul chevron `›` qui pivote de 90°, même taille, même couleur, aligné à droite à toutes les profondeurs |
| Le `×` d'une section ouverte se lisait comme un bouton de fermeture | supprimé avec le reste |
| Titres de section de hauteurs inégales, calés par des retraits différents | une variable `--section-head` de 40 px, un `display: flex` commun, un unique filet de séparation |
| « 200 × 200 m » repliait son unité sur une seconde ligne et déséquilibrait les trois cartes de mesure | valeurs en `nowrap`, police légèrement réduite, libellés tronqués proprement |
| « 57.6 m » en point décimal, à côté de valeurs en virgule | virgule partout |
| Boutons de trois hauteurs et deux rayons de bordure | un gabarit unique à la hauteur d'une ligne de réglage (`--row`), deux variantes de fond seulement |
| Boussole calée dans une boîte de 58 px, flottant au-dessus de la barre d'échelle | hauteur laissée au contenu : les deux repères partagent leur ligne de base |

Deux reprises hors panneau accompagnent la même intention : le titre tient désormais sur **sa**
ligne — deux lignes d'en-tête voulait dire deux, pas trois — et l'icône de vue des toitures
associe une flèche plongeante au plan des toitures, un losange seul se lisant comme un œil.

Points d'implémentation qui méritent d'être signalés :

- **Le survol est plafonné à un lancer de rayon par image.** Un raycast par événement
  `pointermove` sur 176 nœuds — 484 en 600 m — coûte plus que le rendu lui-même. Le pointeur
  n'enregistre que sa position ; la boucle d'animation consomme le drapeau.
- **Le contour de sélection est un `EdgesGeometry` sur les maillages du bâtiment**, ajouté comme
  enfant du nœud sélectionné. Il suit ainsi l'exagération verticale sans aucun recalcul, là où
  la boîte englobante demandait une reconstruction à chaque pixel de curseur.
- **Les transitions de caméra s'interrompent à la première interaction.** Une animation qu'on ne
  peut pas reprendre en main est pire qu'un saut.
- **La persistance ne force jamais une couche absente.** Un réglage retrouvé ne rallume pas une
  bascule désactivée faute de végétation, d'eau ou de carte géologique dans la scène chargée.
- **La carte géologique ne se télécharge qu'à sa première activation.** Elle vit hors du GLB,
  en trois fichiers servis à part ; les charger d'office aurait fait payer à chaque visiteur
  une couche que la plupart n'ouvriront pas. Le clic y lit la formation dans une image
  d'identifiants décodée une fois dans un canvas — chaque interrogation n'est ensuite qu'un
  accès mémoire, et le bâti reste prioritaire sur le rayon.
- **La liste des identifiants se construit depuis les nœuds de la scène, pas depuis
  `buildings.json`.** Les `cleabs` sont déjà dans les `extras` du GLB, que le visualiseur lit de
  toute façon pour la carte de détail : charger le fichier d'attributs n'aurait ajouté qu'une
  requête et un cas d'absence à traiter, pour la même information.
- **La barre d'échelle se calcule sur la distance caméra-cible et le champ de vision**, arrondie
  à 1, 2 ou 5 × 10ⁿ mètres. Elle est juste au centre de l'image, en perspective — c'est le
  compromis usuel, et la seule alternative honnête serait une caméra orthographique.

---

## 5. Ce qui n'a pas été fait, et pourquoi

**L'accessibilité WCAG** est hors périmètre par décision. Les manquements restent : contrastes
du petit texte sous le seuil AA, cases à cocher de 34 × 19 px, canvas sans alternative clavier,
`prefers-reduced-motion` ignoré, contrôles du panneau masqué encore atteignables au clavier.

**Une bibliothèque d'interface.** Le visualiseur reste sans build : trois fichiers servis tels
quels par `poc.py web`, Three.js mis en cache localement. Introduire un empaqueteur pour un
panneau de réglages serait disproportionné.

**Un mode plein écran, un export d'image, un compteur d'images par seconde.** Utiles, mais
aucun ne corrige un défaut constaté. À prendre si l'usage les réclame.

**Une caméra orthographique pour la mesure.** C'est la seule voie vers une échelle exacte, mais
elle change le rendu de toute la scène. Hors sujet pour un POC dont l'objet est l'aspect.

---

## 6. Vérification

```powershell
node --check viewer\app.js
.\.venv\Scripts\python.exe -m unittest discover -s test -v
.\.venv\Scripts\python.exe poc.py web
.\.venv\Scripts\python.exe poc.py serve
```

Contrôles manuels, emprises 200 m puis 600 m — à reporter dans
[`acceptance-checklist.md`](acceptance-checklist.md), section « Interface du visualiseur » :

1. La barre progresse en octets ; la pastille passe d'ambre à vert ; le panneau est inactif
   pendant le chargement. Serveur coupé en cours de route : pastille rouge et bandeau d'erreur.
2. Deux sections expertes ouvertes en même temps restent ouvertes.
3. Survol d'un bâtiment : curseur et surbrillance. Clic : contour épousant le volume. « Mairie »
   et « Toitures » : transition animée, interrompue dès qu'on touche la souris.
4. Mode « Modèle » puis rallumage manuel d'une texture : l'état « personnalisé » s'affiche.
5. Mode « Qualité » : la légende compte 15 dégradés sur 176 en 200 m ; un clic isole le niveau.
6. Saisie du `cleabs` d'un bâtiment dégradé : caméra cadrée, carte de détail renseignée.
7. Réglages retrouvés après rechargement de la page et après changement d'emprise.
8. À 380 × 700 : mesures présentes, aide atteignable, rose des vents et barre d'échelle jamais
   recouvertes par le panneau, ouvert comme fermé.
