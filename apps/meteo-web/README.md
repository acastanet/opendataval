# Météo V2 — interface React

Cette application est le nouveau frontend météo d’OpenDataVal. Elle ne dépend ni
du code du worker, ni de PostgreSQL, ni du paquet `@opendata-vda/shared`. Son seul
point de contact avec le backend est le contrat HTTP versionné décrit dans
`doc/architecture/conception-v2/openapi.yaml`.

Cette itération de test consomme les deux routes du gateway :
`/api/v2/geography/resolve` et `/api/v2/weather/temperature`. Elle ne contacte
jamais directement l’IGN ni le fournisseur météo ; elle affiche précisément la
provenance de la température renvoyée par les services.

## Développement visuel autonome

```bash
pnpm --filter meteo-web dev:mock
```

Le navigateur ouvre l’application sur `http://localhost:4322/meteo-v2/`. MSW
intercepte les appels `/api/v1/meteo/*`, ce qui permet de modifier l’interface avec
le rechargement instantané de Vite sans lancer l’API ni la base de données.

Trois scénarios sont disponibles via les lieux rapides :

- Val-d’Aigoual : situation ordinaire avec pluie possible ;
- Paris : vigilance jaune canicule ;
- Marseille : vigilance orange et rafales.

## API réelle

```bash
pnpm --filter meteo-web dev
```

En développement, Vite proxifie `/api` vers `http://localhost:3000`. Une autre
origine peut être indiquée avec `VITE_API_BASE_URL`.

## Contrat et contrôles

```bash
pnpm --filter meteo-web generate:api
pnpm --filter meteo-web test
pnpm --filter meteo-web build
```

La page est une landing mobile-first de validation des services V2. Les prévisions
et la vigilance restent volontairement sur le parcours historique : ce nouveau
contrat ne publie à ce stade que la température et son contexte.
