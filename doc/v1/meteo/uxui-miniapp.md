# Mini-app météo localisée — guide UX/UI

Ce document décrit l’interface de la page `/meteo/` et sert de brief à l’agent chargé de son design. Le produit est une application météo locale pensée **d’abord pour le mobile**, pas une page de données exhaustive.

## Intention produit

La page doit répondre immédiatement à une seule question : **« Quel temps fera-t-il ici, maintenant, et que dois-je anticiper ? »**

La localisation est au cœur de la réponse. L’utilisateur peut partir de son GPS, rechercher une adresse ou un lieu-dit, choisir un favori (« Maison »), puis consulter les détails seulement s’il le souhaite. Une prévision de modèle n’est jamais présentée comme exacte à l’adresse près : l’interface distingue toujours le lieu sélectionné de la résolution du modèle et de la représentativité éventuelle d’une station.

L’inspiration visuelle est une application sombre, calme et très lisible : température dominante, peu de cadres, espaces généreux, informations secondaires progressives.

## Variante `/meteo/essentiel/` — brief autonome pour agent de design

`/meteo/essentiel/` est une vue de consultation immédiate, distincte de la mini-app complète `/meteo/`. Elle ne cherche pas à répondre à toutes les questions météo : en une lecture, elle indique **où se situe le point de prévision, quelle température il fait, comment elle évolue dans les trois heures et ce que donnent les trois jours suivants**.

Cette page doit rester une seule composition éditoriale, sans navigation du site, carte, recherche d’adresse, favori, météo heure par heure détaillée, humidité, vent, vigilance, qualité de l’air ou sources longues.

### Point de départ et localisation

- Au chargement, ne pas demander de lieu ni ouvrir la permission GPS.
- Le point initial est la mairie de Val-d’Aigoual : `44.081192, 3.641467`, libellé visible « Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue ».
- Un bouton de localisation est placé à droite de la date et de l’heure. Il est toujours visible, y compris sur mobile.
- Après accord du navigateur, recalculer la météo avec la position GPS et appeler `GET /api/meteo/localisation?lat=&lon=`. Remplacer le libellé de la mairie par l’adresse ou le lieu-dit le plus proche retourné par l’API.
- En cas de refus ou d’échec GPS, conserver la météo de la mairie et afficher un message bref, non culpabilisant. Ne pas proposer de carte ou de recherche dans cette variante.

### Données à afficher et règles de calcul

| Bloc | Donnée attendue | Règle de lecture |
| --- | --- | --- |
| Horodatage | Horloge du navigateur en `Europe/Paris` | Format condensé en capitales : `DIM. 19 JUIL. · 10:05`, heure sur 24 h. |
| Température actuelle | `courtTerme.current.temperature_2m` ; repli sur la première prévision horaire | C’est le nombre le plus grand de la page, affiché en `°C`. Employer « estimation locale », pas « mesure à votre adresse ». |
| Extrêmes du jour | `courtTerme.daily.temperature_2m_max` et `temperature_2m_min` pour la date locale du jour | Afficher `MAX` puis `MIN` en retrait, à côté de la température actuelle. |
| Tendance à 3 h | Première heure de prévision à partir de l’heure locale, puis quatrième valeur horaire | Une seule flèche part de la température présente et se termine par la température prévue à `+3 H`. La pente traduit hausse, baisse ou stabilité. |
| Trois jours suivants | Les trois entrées quotidiennes après aujourd’hui | Uniquement le nom du jour, `MAX` et `MIN`. Ne pas ajouter d’icône, pluie, vent ou commentaire. |

Si une valeur n’est pas disponible, afficher un tiret cadratin (`–`) sans inventer de donnée. Lors d’un chargement initial, conserver le libellé de la mairie et une attente courte, avec une hauteur réservée pour éviter le saut de mise en page.

### Construction de la composition

L’ordre est fixe et constitue la hiérarchie de la page :

1. Ligne d’en-tête : date/heure à gauche, bouton de localisation à droite.
2. Ligne de lieu : petit carré bleu puis libellé du point de prévision.
3. Bloc « maintenant » : sur-titre, température géante, `MAX` et `MIN` alignés à droite.
4. Bande « prochaines 3 heures » : libellé et titre à gauche ; flèche et température cible à droite.
5. Bande « après aujourd’hui » : titre à gauche ; trois colonnes de jours à droite.
6. Quatre micro-marques colorées en bas à droite, comme des repères d’impression.

Sur bureau, les bandes « tendance » et « jours » utilisent une colonne d’intitulé étroite à gauche et une zone de données plus large à droite. Sur mobile, elles se replient verticalement, sauf les trois jours qui restent trois colonnes compactes et comparables. La page doit tenir dans un premier écran mobile avec une lecture naturelle de haut en bas ; aucun carrousel ni défilement horizontal.

### Langage visuel : Swiss Brutalism × éditorial papier

Cette variante applique les principes de `brutalist_interpretabilite.md` à une interface web, sans reprendre le format de diapositive 16:9 :

- fond blanc, avec au plus une très légère nuance de papier ;
- texte noir mat `#1A1A1A` ;
- bleu d’identité `#0047AB` pour les repères, les températures maximales, la flèche et les éléments actifs ;
- police sans sérif unique, préférer Inter, Helvetica Neue ou une sans-serif système ;
- nombres très grands et gras, textes secondaires petits mais contrastés ;
- bordures noires fines et rectilignes ; aucune carte arrondie, ombre portée, dégradé décoratif ou effet météo réaliste ;
- composition asymétrique avec de larges respirations, mais alignements stricts à l’intérieur de chaque bande ;
- système de micro-accents limité aux quatre petits carrés de fin : jaune `#FFD600`, rouge `#E63946`, orange `#F77F00`, vert `#06A77D`.

La flèche est un élément d’information, pas une décoration : bleue, fine, tendue de gauche à droite et terminée par une pointe. Elle monte si la température à `+3 H` dépasse la température actuelle de plus de `0,5 °C`, descend si elle est inférieure de plus de `0,5 °C`, sinon elle reste horizontale. Le texte « Tendance à la hausse », « à la baisse » ou « stable » doit toujours l’accompagner.

### Accessibilité et interactions à préserver

- Le bouton porte le libellé accessible « Utiliser ma position » ; sur petit écran le texte peut être visuellement masqué, jamais supprimé pour les lecteurs d’écran.
- La date est un élément `<time>` et les sections emploient des titres réels (`h1`, puis `h2`, puis `h3`).
- L’adresse mise à jour utilise une région `aria-live="polite"` ; les erreurs GPS ou réseau utilisent `role="alert"`.
- Le contraste bleu/blanc et noir/blanc doit rester suffisant. Une couleur ou la seule forme de la flèche ne doit jamais être l’unique indication de la tendance.
- Respecter `prefers-reduced-motion` : l’indicateur de chargement ne doit pas rester animé dans ce mode.

### Fichiers, contrats et références visuelles propres à cette vue

- Page Astro : `apps/web/src/pages/meteo/essentiel.astro`
- Composant Svelte : `apps/web/src/islands/MeteoEssentiel.svelte`
- API utilisée : `GET /api/meteo/point?lat=&lon=` et, après GPS, `GET /api/meteo/localisation?lat=&lon=`
- Contrat de test à conserver : racine `data-testid="meteo-point"`, température courante `data-testid="temperature-actuelle"`, température à trois heures `data-testid="temperature-plus-trois"`
- Références Playwright : `meteo-essentiel-chromium-mobile-win32.png` et `meteo-essentiel-chromium-desktop-win32.png`

Ne pas faire évoluer l’interface essentielle en copiant des blocs de `/meteo/`. Si de nouvelles informations deviennent nécessaires, elles doivent remplacer une information existante ou faire l’objet d’une décision explicite de changement de périmètre.

## Fichiers et contrats à préserver

- Page Astro : `apps/web/src/pages/meteo.astro`
- Composant Svelte : `apps/web/src/islands/MeteoPoint.svelte`
- API : `apps/api/src/routes/meteo.ts`
- Test d’intégration / visuel : `e2e/meteo-point.spec.ts`
- Captures de référence : `e2e/meteo-point.spec.ts-snapshots/`

Le composant racine porte `data-testid="meteo-point"`. Le conserver : Playwright l’utilise pour les contrôles visuels.

## Hiérarchie : premier écran mobile

Sur un téléphone, le premier écran ne montre que ce qui permet de décider en quelques secondes. Les détails, la carte et les projections longues ne doivent pas repousser ce contenu sous le pli.

| Ordre | Élément | Règle de design |
| --- | --- | --- |
| 1 | Lieu choisi | Nom précis de l’adresse / lieu-dit ou coordonnées ; action de recherche immédiatement disponible |
| 2 | Niveau de précision | Badge clair : GPS avec précision estimée, adresse BAN/Géoplateforme, ou coordonnées manuelles |
| 3 | Situation actuelle | Température, ressenti et condition météo dans le bloc visuellement dominant |
| 4 | Quatre repères | Humidité, vent, rafale et pluie à court terme, compacts et comparables |
| 5 | Signal à anticiper | Une phrase courte et actionnable : orage, pluie, vent, chaleur, gel ou situation calme |
| 6 | Prochaines heures | Une bande de quatre créneaux ; elle donne la tendance sans devenir un tableau |

Le titre général, la recherche de lieu, le bouton GPS et le bouton « Maison » accompagnent ce premier écran. Ne pas y ajouter le radar, une carte, des dizaines de chiffres ou une longue explication de sources.

## Parcours de localisation

### Recherche et sélection

- Le champ « Rechercher une adresse ou un lieu-dit » interroge `GET /api/meteo/lieux?q=` à partir de deux caractères.
- Les suggestions doivent afficher le nom réellement sélectionné et son contexte administratif lorsque nécessaire.
- Une suggestion retenue actualise les coordonnées et toute la météo ; elle ne doit pas être traitée comme une simple étiquette décorative.
- La géolocalisation utilise la précision fournie par le navigateur et l’affiche. Si l’utilisateur refuse, le champ de recherche reste la voie principale.
- `GET /api/meteo/localisation?lat=&lon=` transforme les coordonnées GPS en nom de lieu lorsque possible.
- Le favori « Maison » est local au navigateur (`localStorage`) et correspond à des coordonnées, pas seulement à un libellé.

### Transparence sur la précision

Une adresse précise améliore le point de calcul mais ne transforme pas une maille météo en station à domicile. Le libellé de précision doit donc expliciter :

- GPS : précision estimée par l’appareil ;
- adresse / lieu-dit : point géocodé ;
- coordonnées : position saisie ou pointée ;
- prévision : résolution AROME d’environ 1,5 à 2,5 km, avec limites renforcées dans le relief cévenol.

La section Sources et précision rappelle la distance / l’altitude de la station lorsqu’une observation est disponible. Elle doit aussi indiquer qu’un versant, une vallée ou un orage local peuvent faire diverger les conditions de celles du point calculé.

## Sections de détail

Après le premier écran, la page peut être riche, mais chaque bloc doit répondre à une question explicite.

| Section | Contenu | Importance visuelle |
| --- | --- | --- |
| Heure par heure | Température, ressenti, pluie, vent et rafales pour les prochaines heures | Première section détaillée |
| Prochains jours | Quatre jours AROME puis relais ARPEGE, avec pluie et rafales | Forte, mais secondaire au présent |
| Pluie, vent et confort | Cumul, vent, direction, humidité, pression et ressenti | Grille d’appoint |
| Vigilance | Widget et lien officiels Météo-France | Très visible si un phénomène est signalé ; jamais confondu avec un modèle |
| Qualité de l’air | Indice européen, PM2.5, PM10, ozone et NO₂ | Bien séparée ; estimation CAMS à environ 11 km, donc pas une mesure à l’adresse |
| Sources et précision | Station, distance, altitude, modèles, limites du relief | Zone de confiance et pédagogie |
| Tendance ECMWF | J+3 à J+10, ensemble de 51 scénarios, dispersion et probabilités | Repliée au départ : tendance, non certitude locale |
| Carte et coordonnées | Carte interactive, clic sur un point et saisie manuelle | Repliée au départ, jamais nécessaire à la lecture initiale |

Les sections « Tendance ECMWF » et « Carte et coordonnées » restent dans des éléments `details` fermés au chargement. La carte MapLibre est initialisée seulement lors de l’ouverture : ne pas casser ce chargement différé.

## Sources et vocabulaire

Les termes de source font partie de l’interface ; ils empêchent une fausse promesse de précision.

- **Vigilance Météo-France** : information officielle de danger et consignes ; elle prime sur les indicateurs de modèle.
- **Observation de station** : mesure en un point, avec heure, distance et altitude ; ne pas l’appeler « météo chez vous ».
- **AROME / ARPEGE** : prévision courte échéance. Le relais ARPEGE doit être explicite lorsqu’il commence.
- **ECMWF IFS / ensemble** : tendance J+3 à J+10. Les 51 scénarios et la dispersion représentent une incertitude, pas un score de fiabilité officiel.
- **CAMS** : prévision de qualité de l’air à maille européenne ; utiliser le libellé « estimation ».
- **Géocodage Géoplateforme** : permet de convertir une adresse, un lieu-dit ou des coordonnées en point de prévision ; ne pas l’afficher comme une source météo.

En cas de source indisponible, conserver les autres données et nommer la source manquante. Ne jamais remplir une carte vide avec une valeur ancienne sans signalement explicite.

## États à concevoir

| État | Attente UX |
| --- | --- |
| Chargement | Conserver le lieu sélectionné, afficher une attente concise et éviter une page vide |
| Recherche sans résultat | Dire qu’aucun lieu du territoire n’a été trouvé et proposer GPS / coordonnées |
| Hors territoire | Message précis : le point doit rester dans le périmètre pris en charge |
| Refus GPS | Message non culpabilisant et retour immédiat à la recherche |
| Erreur réseau ou partielle | Garder les sections valides et indiquer les sources indisponibles |
| Données périmées | Afficher l’heure et dire clairement qu’il s’agit de la dernière donnée connue |
| Pas de station représentative | Expliquer la limite ; ne pas afficher de métriques artificiellement vides |

## Responsive et accessibilité

- Le design est mobile-first. Le premier écran à 393 px doit contenir lieu, précision, température / ressenti, signal anticipé et début de la bande horaire sans surcharge.
- Le point de rupture principal est `760px`. Sur bureau, la mise en page peut s’élargir mais ne doit pas modifier l’ordre mental : présent local avant détails et tendance.
- Les informations critiques ne reposent jamais uniquement sur une couleur ou une icône : conserver un texte descriptif.
- Les contrôles ont des labels visibles, les messages utilisent `role="status"` ou `role="alert"`, et la structure de titres reste cohérente (`h1`, puis `h2`, puis `h3`).
- Le contraste du thème sombre, les états de focus et la taille de toucher des boutons doivent être vérifiés en priorité sur mobile.

## Contraintes techniques

- Les styles sont locaux à `MeteoPoint.svelte`. Une évolution graphique peut les restructurer, sans enlever les comportements Svelte, les attributs d’accessibilité ou les `data-testid` utiles aux tests.
- La carte est une interaction secondaire ; les champs de recherche et de coordonnées doivent toujours permettre de faire la même action.
- La Vigilance est présentée dans un encart avec un lien vers le bulletin officiel Météo-France. Ne pas intégrer le widget distant : ses appels internes peuvent exiger une autorisation et polluer la console avec des erreurs `401`.
- Les données sont asynchrones. Prévoir des hauteurs raisonnablement stables pour limiter les sauts de mise en page.
- Les données de test sont simulées dans Playwright : le design ne doit pas dépendre d’une donnée externe ou d’un fond de carte chargé pour rester vérifiable.

## Vérifier une évolution graphique

```powershell
pnpm build:web
pnpm test:e2e
```

Les tests couvrent les rendus Chromium bureau et mobile, la lecture essentielle du héros, la recherche d’adresse, le passage aux détails et la carte. Les captures nommées `meteo-accueil-…png` sont les références du premier écran ; elles doivent être vérifiées humainement avant toute mise à jour.

Pour accepter volontairement un nouveau rendu :

```powershell
pnpm test:e2e -- --update-snapshots
```

Ne mettre à jour les captures qu’après vérification visuelle en bureau et en mobile.
