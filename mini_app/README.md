# Mini-apps du Val-d'Aigoual

Ce dossier documente les deux mini-applications thématiques du projet. Elles répondent à des usages terrain distincts : l'eau à Valleraugue et la prévention du risque incendie autour de l'Aigoual.

> Les deux mini-apps ne sont pas organisées de la même façon à ce jour. `mini_app/` contient le prototype autonome historique de l'application Eau. L'application Incendies est une fonctionnalité intégrée au portail Astro ; elle n'a volontairement pas de copie dans ce dossier.

## Vue d'ensemble

| Mini-app | Objectif | Accès dans le portail | Code principal | Statut |
|---|---|---|---|---|
| Eau | Lire rapidement la situation de l'Hérault, les crues et la nappe à Valleraugue | `/eau/` et `/eau/tableau-de-bord/` | `mini_app/` (prototype), `apps/web/src/pages/eau/`, `apps/web/src/islands/PiezoNappe.svelte` | En cours d'intégration dans le portail |
| Incendies | Consulter les recommandations officielles et situer les massifs avant un déplacement | `/incendies/` | `apps/web/src/pages/incendies/`, `apps/web/src/islands/FireDashboard.svelte` | MVP intégré |

La page experte des incendies est disponible sous `/incendies/temps-reel/`. Elle présente les détections thermiques comme des indices à analyser et **jamais** comme la confirmation automatique d'un incendie.

## 1. Eau à Valleraugue

### Prototype autonome dans ce dossier

Les fichiers suivants constituent la mini-app historique, autonome côté navigateur :

```text
mini_app/
├── index.html                         # point d'entrée
├── app.js                             # situation rivière, crues et nappe
├── eau-commun.js                      # données et fonctions partagées
├── graphe.js                          # graphiques sans dépendance externe
├── style.css                          # interface principale
├── comprendre.js / comprendre.css      # parcours pédagogique
├── fiche-piezo-valleraugue*.html       # fiches détaillées
└── RAPPORT-API-INDISPONIBLES.md        # résilience et repli Vigicrues
```

La mini-app affiche notamment :

- un indicateur de l'Hérault à partir de la station de St-André-de-Majencoules, clairement présentée comme la station télésuivie la plus proche ;
- les grandes crues connues ;
- les stations d'amont en aval ;
- les informations de nappe à Valleraugue.

Les appels directs aux API peuvent être soumis au CORS ou à l'indisponibilité de fournisseurs tiers. Le repli via `/api/vigicrues/observations` est décrit dans [RAPPORT-API-INDISPONIBLES.md](./RAPPORT-API-INDISPONIBLES.md).

### Version intégrée au portail

Les pages servies par le portail sont dans `apps/web/src/pages/eau/`. Elles réutilisent les assets publics placés dans `apps/web/public/eau/` et les composants Svelte du répertoire `apps/web/src/islands/`.

`mini_app/` et `apps/web/public/eau/` contiennent actuellement des fichiers proches, mais ils ne doivent pas être considérés comme automatiquement synchronisés. Avant toute modification fonctionnelle, déterminer la cible :

- modifier le prototype autonome uniquement ;
- modifier la version intégrée au portail uniquement ;
- ou consolider les deux versions dans une source commune, après validation d'une refonte.

## 2. Risque incendie — Aigoual & Cévennes

Cette mini-app est directement intégrée au portail afin de partager l'API, les cartes MapLibre, le design officiel et les données collectées par le worker.

```text
apps/web/src/pages/incendies/
├── index.astro                        # informations et recommandations officielles
└── temps-reel.astro                   # écran expert d'exploration

apps/web/src/islands/
├── FireDashboard.svelte               # interface grand public
└── FireExpertDashboard.svelte         # interface temps réel

apps/api/src/routes/incendies.ts       # API /api/incendies/*
apps/worker/src/sources/
├── fireRiskGard.ts                    # niveau officiel Gard et mode de secours
├── fireZones.ts                       # périmètres EPCI, ZNIEFF et tampons
└── firms.ts                           # anomalies thermiques NASA FIRMS
```

Les deux écrans ont des objectifs différents :

- **`/incendies/` — Conseils officiels** : première page à consulter sur le terrain. Elle privilégie le niveau officiel, les règles applicables et le repérage simple des massifs.
- **`/incendies/temps-reel/` — Temps réel & données** : espace destiné aux personnes qui souhaitent explorer les détections thermiques et les périmètres. Une détection FIRMS peut correspondre à un feu, mais aussi à une autre source de chaleur ; elle ne vaut pas confirmation opérationnelle.

Les sources et le périmètre du MVP sont décrits dans [../doc/mini_app_incendie.md](../doc/mini_app_incendie.md). Le périmètre de veille combine l'EPCI, la ZNIEFF II et les tampons de 5 et 15 km. L'historique consolidé et EFFIS sont hors MVP.

## Lancer et vérifier les mini-apps

En environnement Docker local :

```bash
docker compose up --build
```

Puis ouvrir :

```text
http://localhost:8080/eau/
http://localhost:8080/eau/tableau-de-bord/
http://localhost:8080/incendies/
http://localhost:8080/incendies/temps-reel/
```

Pour valider le front avant un commit :

```bash
pnpm build:web
```

Pour vérifier l'API des incendies lorsque les services Docker sont démarrés :

```bash
curl http://localhost:8080/api/incendies/situation
curl http://localhost:8080/api/incendies/zones
```

Ne jamais ajouter de jeton, clé API ou mot de passe dans ce README, dans le code client ou dans Git. Les clés de collecte restent dans le fichier `.env` local, ignoré par Git.

## Règles de maintenance

- Conserver une interface lisible en extérieur, contrastée et responsive.
- Pour l'application Incendies, afficher d'abord les consignes officielles ; réserver les données d'exploration à l'onglet temps réel.
- Ajouter une source de données côté worker et API, jamais une clé secrète dans le navigateur.
- Documenter toute indisponibilité de fournisseur et prévoir un état dégradé compréhensible.
- Ne pas déplacer l'application Incendies dans `mini_app/` sans plan de refonte : cela créerait une seconde implémentation à maintenir.
