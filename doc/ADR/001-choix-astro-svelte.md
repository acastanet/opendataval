# ADR-001 : Choix d'Astro + Svelte pour le frontend

## Statut
✅ Accepté

## Contexte

Le projet Portail OpenData Val-d'Aigoual nécessite un frontend moderne capable de :
- Afficher des pages statiques optimisées pour le SEO
- Intégrer des composants interactifs (cartes, graphiques, filtres)
- Être performant et accessible
- Être facile à maintenir et à étendre

**Problème à résoudre** : Quel framework utiliser pour concilier :
1. La simplicité de développement
2. La performance (Lighthouse, temps de chargement)
3. La flexibilité pour les composants interactifs
4. La compatibilité avec les données géospatiales

**Contraintes** :
- Équipe réduite (1 développeur humain + IA)
- Besoin de générer du HTML statique pour les pages de contenu
- Besoin d'îlots d'interactivité pour les visualisations
- Intégration avec Docker/PostGIS backend

## Décision

**Utiliser Astro comme framework principal avec des îlots Svelte pour l'interactivité.**

### Architecture retenue :
```
Frontend /
├── Astro (SSG)         - Pages statiques, layout, SEO
└── Svelte (Islands)    - Composants interactifs (carte, graphiques)
```

### Choix spécifiques :
- **Astro v4+** : Framework de construction de sites statiques avec support des îles (islands)
- **Svelte** : Pour les composants interactifs (MapLibre, Chart.js, etc.)
- **TypeScript** : Typage strict pour toute la codebase frontend

## Conséquences

### Positives
- ✅ **SSG par défaut** : Meilleure performance, SEO, et résilience
- ✅ **Îlots d'interactivité** : Seuls les composants interactifs sont hydratés côté client
- ✅ **Flexibilité** : Possibilité d'utiliser d'autres frameworks (React, Vue) si besoin
- ✅ **Écosystème** : Bonne intégration avec les outils modernes (Vite, ESLint, Prettier)
- ✅ **Apprentissage** : Courbe d'apprentissage raisonnable pour un développeur fullstack
- ✅ **Taille des bundles** : Minimale (pas de runtime lourd comme React)
- ✅ **Intégration Docker** : Build statique compatible avec nginx

### Négatives
- ❌ **Écosystème plus jeune** que Next.js ou Nuxt
- ❌ **Moins de plugins** prêts à l'emploi
- ❌ **Communauté plus petite** (mais en croissance rapide)

## Alternatives considérées

### 1. Next.js (React)
- ✅ Écosystème mature, énorme communauté
- ✅ SSG et SSR supportés
- ✅ Beaucoup de plugins disponibles
- ❌ Bundle plus lourd
- ❌ Complexité accrue pour un site principalement statique
- ❌ Moins optimisé pour les îles d'interactivité
- 📌 **Pourquoi rejetée** : Trop lourd pour nos besoins, complexité inutile

### 2. Nuxt.js (Vue)
- ✅ Écosystème mature
- ✅ Bon support TypeScript
- ❌ Moins performant qu'Astro pour le SSG pur
- ❌ Courbe d'apprentissage plus raide
- 📌 **Pourquoi rejetée** : Moins adapté à notre cas d'usage

### 3. Gatsby
- ✅ Excellente performance SSG
- ✅ Bonne communauté
- ❌ Configuration complexe
- ❌ Moins flexible pour l'interactivité
- ❌ Dépendance à GraphQL
- 📌 **Pourquoi rejetée** : Trop complexe, dépendance GraphQL inutile

### 4. Hugo / Eleventy (SSG purs)
- ✅ Ultra-rapides
- ✅ Simples
- ❌ Pas de support natif pour l'interactivité
- ❌ Nécessiteraient un framework séparé pour les composants dynamiques
- 📌 **Pourquoi rejetée** : Ne répondent pas au besoin d'interactivité

### 5. Remix
- ✅ Excellent pour les applications web complètes
- ✅ Bonnes performances
- ❌ Trop orienté backend
- ❌ Complexité inutile pour un site statique avec quelques îles interactives
- 📌 **Pourquoi rejetée** : Surdimensionné pour nos besoins

## Notes supplémentaires

### Intégration avec MapLibre
Astro permet d'importer nativement des bibliothèques ESM comme MapLibre GL JS. Les composants Svelte peuvent encapsuler toute la logique cartographique.

### Pattern des îles
```astro
<!-- Page Astro -->
<MaCarte client:load />  <!-- Hydraté côté client -->
<MonGraphique client:visible />  <!-- Hydraté quand visible -->
```

### Build et déploiement
- Build statique : `astro build` → généré dans `dist/`
- Servi par nginx dans le container Docker
- Compatible avec Cloudflare Pages / Netlify (pour l'option serverless)

### Migration future
Si besoin de passer à un autre framework, Astro permet une migration progressive grâce à son architecture modulaire.

## Liens
- [Astro Documentation](https://docs.astro.build/)
- [Svelte Documentation](https://svelte.dev/docs)
- [Astro Islands Architecture](https://docs.astro.build/en/concepts/islands/)
- [Comparison: Astro vs Next.js vs Gatsby](https://astro.build/blog/astro-vs-nextjs-vs-gatsby/)

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale |
| 2026-07-10 | Agent | Documentation ADR |
