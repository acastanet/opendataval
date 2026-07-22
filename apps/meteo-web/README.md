# Météo V2 — interface React

Cette application est le nouveau frontend météo d’OpenDataVal. Elle ne dépend ni
du code du worker, ni de PostgreSQL, ni du paquet `@opendata-vda/shared`. Son seul
point de contact avec le backend est le contrat HTTP versionné décrit dans
`doc/meteo-v2/openapi.yaml`.

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

`generate:api` régénère les types TypeScript depuis OpenAPI. Le contrat doit être
mis à jour avant toute modification incompatible de l’API.
