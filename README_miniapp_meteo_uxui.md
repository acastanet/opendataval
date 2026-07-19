# Mini-app météo localisée — guide UX/UI

Ce document décrit l’interface de la mini-app météo située sur la page `/meteo/`. Il s’adresse à un agent chargé de faire évoluer son design. Le périmètre est l’interface de météo localisée, pas les autres modules historiques de la page météo.

## Intention produit

L’utilisateur choisit un point dans la commune de Val-d’Aigoual (clic sur la carte, coordonnées saisies, ou géolocalisation) et reçoit une lecture météo **hiérarchisée par importance**.

L’interface ne doit pas présenter toutes les données comme équivalentes. Elle aide à décider dans cet ordre :

1. **Danger officiel :** la Vigilance Météo-France et les consignes associées.
2. **Situation observée :** la mesure de la station Météo-France la plus proche.
3. **Très court terme :** AROME / ARPEGE, utile pour les 48 prochaines heures et le relief local.
4. **Tendance :** ECMWF IFS et son ensemble de 51 scénarios, utile à J+3–J+10 mais intrinsèquement moins certain.

Le design doit rendre cet ordre évident sans que l’utilisateur ait besoin de lire toute la page.

## Emplacement et fichiers

- Page Astro : `apps/web/src/pages/meteo.astro`
- Composant Svelte principal : `apps/web/src/islands/MeteoPoint.svelte`
- Route API : `apps/api/src/routes/meteo.ts`, endpoint `GET /api/meteo/point?lat={lat}&lon={lon}`
- Test visuel Playwright : `e2e/meteo-point.spec.ts`
- Captures de référence : `e2e/meteo-point.spec.ts-snapshots/`

Le composant racine a l’attribut `data-testid="meteo-point"`. Le conserver : il est utilisé par le test automatisé.

## Parcours utilisateur

### 1. Choisir le lieu

La zone supérieure comprend :

- un titre et une explication courte de la lecture hiérarchisée ;
- le bouton « Me localiser » ;
- deux champs latitude / longitude et le bouton « Afficher ce point » ;
- une carte interactive MapLibre ;
- un repère rouge sur le point sélectionné.

Un clic sur la carte déclenche une nouvelle requête météo. Les coordonnées hors de la commune sont refusées avec un message clair. Sur mobile, les champs et le bouton passent sur plusieurs lignes.

### 2. Lire la réponse

Quand les données sont disponibles, quatre cartes apparaissent dans l’ordre de priorité. Chaque carte a :

- un numéro dans un cercle (`1` à `4`) ;
- un libellé d’échéance / niveau ;
- un titre ;
- un badge de nature de source ;
- un code couleur de bordure gauche distinct.

Les cartes forment la structure principale de la page. Ne pas les réordonner selon la quantité de contenu ou l’esthétique seule.

### 3. Agir ou comprendre les limites

La carte Vigilance contient un widget officiel Météo-France et un lien vers le bulletin / les consignes. Un encart final rappelle qu’une coordonnée n’est pas une station et que le relief cévenol crée des écarts rapides.

## Architecture visuelle actuelle

| Priorité | Carte | Rôle | Traitement visuel actuel |
| --- | --- | --- | --- |
| 1 | Vigilance Météo-France — Gard | Danger et consignes | Bordure rouge, badge « Officiel expertisé » |
| 2 | Station Météo-France la plus proche | Mesure présente | Bordure vert lichen, grille de cinq métriques |
| 3 | Prévision Météo-France AROME | 0–48 h | Bordure bleu torrent, résumé 12 h et 4 jours |
| 4 | ECMWF IFS et ensemble de 51 scénarios | J+3 à J+10 | Bordure brun châtaigne, scénarios journaliers et dispersion |

Les données détaillées doivent être plus compactes que le niveau d’alerte. La Vigilance doit être visible avant toute projection de modèle, même si elle ne contient pas de phénomène actif.

## Contenus et règles de présentation

### Vigilance (priorité 1)

- C’est une source officielle : ne pas la mélanger visuellement aux cartes de modèle.
- Le widget est intégré dans une `iframe` Météo-France. Sa hauteur actuelle est `11rem` et il doit rester lisible sur mobile.
- Le lien « Ouvrir le bulletin officiel et les consignes » est une action importante et explicite.

### Observation de station (priorité 2)

- Afficher température, humidité, vent, rafale et pluie sur 1 h.
- Afficher systématiquement la station, sa distance, son altitude et l’heure de mesure : ces informations expliquent la représentativité limitée de la mesure.
- Si la mesure est ancienne, le signaler explicitement ; ne jamais faire croire à du temps réel.

### Prévision courte échéance (priorité 3)

- Le résumé « Prochaines 12 h » porte température min/max, cumul de pluie et rafale maximale.
- Les quatre cartes journalières sont comparables d’un coup d’œil.
- À partir du troisième jour, un marqueur « Relais progressif ARPEGE » indique le changement de modèle. Ce repère doit rester visible.
- La provenance indique que les modèles Météo-France sont diffusés / adaptés par Open-Meteo ; ce n’est pas une prévision éditorialisée directement par Météo-France.

### Tendance ECMWF (priorité 4)

- Cette zone commence à J+3 : elle ne doit pas concurrencer le court terme.
- Pour chaque jour : température médiane, probabilité de pluie, pluie médiane et scénario humide P90.
- Le badge de dispersion (`faible`, `moyenne`, `forte`) est une aide de lecture. Ce n’est **pas** un indice officiel ECMWF.
- Les probabilités de pluie forte et de fortes rafales sont des signaux secondaires, visuellement moins saillants que la Vigilance.
- Conserver le lien vers le météogramme probabiliste officiel ECMWF.

## États à designer

| État | Déclencheur | Attente UX |
| --- | --- | --- |
| Chargement | requête en cours | Message court, non bloquant, sans masquer le point choisi |
| Erreur de coordonnées | point hors territoire ou saisie invalide | Message précis et actionnable |
| Erreur réseau | API indisponible | Expliquer que les données sont indisponibles, rappeler que la Vigilance officielle reste consultable |
| Réponse partielle | une source est indisponible | Afficher les sources manquantes sans cacher les données restantes |
| Données périmées | dernière valeur mise en cache après échec d’actualisation | Signaler clairement qu’il s’agit des dernières données connues |
| Sans station récente | aucune observation voisine utilisable | Ne pas afficher de métriques vides ; expliquer la limite |

Ces états font partie du produit : ils méritent une conception aussi soignée que l’état nominal.

## Responsive et accessibilité

- Point de rupture actuel : `760px`.
- Sur mobile, les métriques station passent de 5 colonnes à 2 ; les jours AROME passent de 4 colonnes à 2 ; les données ECMWF passent en une colonne.
- Les badges ne doivent ni être coupés ni porter seuls l’information importante.
- Les contrastes des quatre couleurs de priorité doivent rester lisibles avec du texte et sans dépendre seulement de la couleur.
- Conserver des titres structurés (`h2`, puis `h3`), des labels visibles pour les coordonnées et des états `role="status"` / `role="alert"`.
- La carte doit conserver une alternative utilisable : champs de coordonnées et bouton de géolocalisation.

## Contraintes techniques de design

- Le composant est en Svelte avec styles locaux dans `MeteoPoint.svelte`. Une refonte peut déplacer les styles, mais doit conserver les comportements Svelte et les attributs d’accessibilité.
- La carte est MapLibre avec des tuiles IGN distantes. Ne pas faire dépendre une information critique de la seule visibilité des tuiles.
- L’iframe Vigilance exige l’autorisation CSP `frame-src https://vigilance.meteofrance.fr` dans `Caddyfile`.
- Les données sont asynchrones : prévoir des tailles de carte stables pour limiter les sauts de mise en page.
- Ne pas afficher de fausse précision : les valeurs de modèle, les probabilités et la dispersion doivent toujours être accompagnées de leur horizon et de leur provenance.

## Vérification après une évolution graphique

Lancer :

```powershell
pnpm test:e2e
pnpm build:web
```

Les tests contrôlent le rendu en Chromium bureau et mobile, la présence des quatre niveaux de lecture et le clic sur la carte. Les données météo, la Vigilance et les tuiles IGN sont simulées dans le test afin que les captures soient reproductibles. La zone raster de la carte est volontairement masquée dans la comparaison d’image ; l’interaction cartographique reste testée séparément.

Pour accepter volontairement un nouveau rendu comme référence :

```powershell
pnpm test:e2e -- --update-snapshots
```

Ne mettre à jour les captures qu’après une vérification visuelle du bureau et du mobile.
