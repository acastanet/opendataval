# Atelier de design VAL

Cet espace permet de concevoir le portail en HTML/CSS isolé avant son intégration dans Astro. Il ne définit pas une nouvelle charte : les prototypes importent directement `packages/shared/styles/design-system.css`, source de vérité issue de `style_VAL.html`.

Le balisage et `design.css` reprennent également les patrons du référentiel : barre officielle sombre, en-tête éditorial, sommaire visible, largeur de document à 60 rem, trois surfaces, cartes à filet de classement, cibles tactiles de 40 px, états de vigilance non chromatiques et fraîcheur explicite.

Les pages chargent le design system par une balise `<link>` placée avant `design.css`, sans `@import`. Source Serif 4 et Inter sont préchargées ; `font-display: optional` empêche leur remplacement tardif et le serveur de l'atelier les met en cache pendant un an.

## Démarrer l'atelier

Depuis la racine du dépôt :

```bash
pnpm design:preview
```

Puis ouvrir <http://127.0.0.1:4174/doc/design/accueil.html>. Le serveur expose aussi les polices auto-hébergées de `apps/web/public/fonts`. Pour changer de port :

```powershell
$env:DESIGN_PORT=4180; pnpm design:preview
```

## Fichiers

- `accueil.html` : coque générale, navigation, manifeste et entrées du portail ;
- `lav.html` : page autonome LAV — texte de référence exact “Localiser, Agréger, Valoriser” avec 8 usages ;
- `lav.md` : source Markdown du texte exact LAV pour copier-coller et documentation ;
- `meteo.html` : page éditoriale avec mesures, vigilance et prévisions ;
- `carte.html` : composition d'une carte avec panneau, légende et contrôles simulés ;
- `composants.html` : inventaire visuel des composants communs ;
- `design.css` : styles propres aux prototypes, construits uniquement avec les jetons VAL ;
- `style_VAL.html` : référentiel détaillé et règles de la charte ;
- `procedure.md` : les trois gestes courants (changer un jeton, essayer une idée, faire évoluer la charte).

Les cartes et graphiques des prototypes sont volontairement statiques. Les îlots Svelte restent dans `apps/web/src/islands` et ne sont pas copiés dans l'atelier.

## Cycle de travail

1. Modifier le HTML d'un prototype et les règles dans `design.css`.
2. Vérifier les états desktop, mobile, clavier et contraste dans le navigateur.
3. Faire valider visuellement la proposition.
4. Reporter les règles véritablement communes dans `packages/shared/styles/design-system.css` ou `apps/web/src/styles/global.css`.
5. Intégrer le balisage validé dans la page ou le composant Astro concerné, en laissant près de la page uniquement les règles spécifiques.
6. Vérifier avec `pnpm --filter web exec astro build`, puis tester les îlots interactifs concernés.

## Règles de contribution

- Ne pas recopier les valeurs de couleur, typographie, ombre ou rayon : employer un jeton du socle.
- Ne pas modifier `design-system.css` pour une expérience non validée ; tester d'abord dans `design.css`.
- Une fois une règle intégrée dans le portail, la retirer de `design.css` si elle n'est plus utile à la démonstration.
- Garder les prototypes sans dépendance applicative ni appel API afin qu'ils restent rapides à comparer.
