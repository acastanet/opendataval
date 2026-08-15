# Procédure — modifier le design

Trois gestes couvrent l'essentiel des évolutions visuelles du portail. Chacun part d'un
fichier différent : se tromper de point d'entrée fait perdre la modification au build
suivant, ou fait diverger le code de la charte.

## 1. Changer une couleur ou un espacement

Éditer **`packages/shared/styles/design-system.css`**, seule source de vérité des jetons,
puis :

```bash
pnpm styles:sync
```

`scripts/sync-design-system.mjs` recopie le fichier vers `apps/web/public/eau/` et
`apps/gateway-service/public/dalle/`. Ces deux copies ne se modifient jamais à la main :
`pnpm build:web` lance `styles:sync` avant le build Astro et écrase toute édition directe.

Répercuter ensuite la valeur dans `style_VAL.html` lorsqu'elle y est démontrée (les hex de
la palette et les tailles typographiques sont écrits en dur dans le balisage des sections
02 et 03).

## 2. Essayer une nouvelle idée visuelle

```bash
pnpm design:preview
```

Prototyper dans un fichier HTML de `doc/design/` et poser les règles dans **`design.css`**.
Vérifier desktop, mobile, clavier et contraste, faire valider, et ne remonter dans
`design-system.css` ou `apps/web/src/styles/global.css` que ce qui est véritablement
commun. Une règle intégrée au portail sort de `design.css` si elle n'est plus utile à la
démonstration.

## 3. Faire évoluer la règle elle-même

Modifier **`style_VAL.html`** et incrémenter la version affichée dans l'en-tête. La section
« Manques assumés » en fin de document tient la file d'attente des sujets ouverts pour la
version suivante.

---

Cycle complet, contexte et règles de contribution : [`README.md`](./README.md).
