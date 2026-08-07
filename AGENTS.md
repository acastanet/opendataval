# Repository Guidelines

## Project Structure & Module Organization

This open-data portal is primarily a pnpm monorepo. `apps/` contains the Fastify API, gateway, web front end, worker, map service, site-service (the OpenDataVdA MVP orchestrator, see `agent/mvp/`), and other applications; `packages/shared/` holds shared domain and database code. Standalone npm services live in `services/weather-vigilance/` and `services/fire-detection/`. Migrations are in `db/migrations/`, Playwright tests in `e2e/`, documentation in `doc/`, and the Python Copernicus collector in `apps/copernicus/`.

Place implementation files under a module’s `src/` directory and unit tests beside the module in `test/` (or `src/**/*.test.ts` for worker sources). Update the relevant OpenAPI file or README when changing a public service contract.

## API v2 Service Inventory

The authoritative presentation catalogue is `apps/gateway-service/src/services-catalog.ts`. The gateway exposes Gateway (`/api/v2/gateway`), Geography (`/api/v2/geography/resolve`), Weather (`/api/v2/weather/temperature`), Weather Vigilance (`/api/v2/vigilance`), Fire Detection (`/api/v2/fire/nearby`, with explicit required radius/history), Geologie (`/api/v2/geologie/bss/proches`, BRGM BSS boreholes ranked by relevance with optional LLM reranking and deterministic fallback), the mobile Terrain app (`/api/v2/app/`), and the read-only Legacy bridge (`/api/v2/legacy/*`). Map (`/api/v2/map/*`) is deliberately routed directly by Caddy to `apps/map-service`; it provides styles, tiles, terrain, and legends. Check `/api/v2/status` for live service state.

`site-service` (`apps/site-service`, MVP work tracked in `agent/mvp/`) is the OpenDataVdA tile orchestrator: it is not yet part of the JSON API surface above. Its own routes (`/internal/v1/sites/*`) are internal-only (ADR-006 in `agent/mvp/09-DECISIONS.md`); the gateway only proxies its read side as an HTML page at `GET /api/v2/sites/:tileId` (`apps/gateway-service/src/pages/site-instance.ts`), not as JSON.

## Build, Test, and Development Commands

Use pnpm 11 from the repository root:

```bash
pnpm install
pnpm dev:web                 # Astro/Svelte development server
pnpm dev:gateway             # gateway-service in watch mode
pnpm check:gateway           # TypeScript check and gateway tests
pnpm check:map               # TypeScript check and map-service tests
pnpm check:geologie          # TypeScript check and geologie-service tests
pnpm check:fire-detection    # TypeScript check and fire-service tests
pnpm build:web               # production web build
pnpm test:e2e                # Playwright browser tests
docker compose up --build    # complete local stack on :8080
```

The standalone services use npm internally; root scripts already invoke them. Run focused checks for the module you changed.

## Coding Style & Naming Conventions

Write strict TypeScript: ES modules, explicit boundary types, and safe handling of possibly missing values (`noUncheckedIndexedAccess` is enabled). Follow existing formatting: two-space indentation, semicolons, double quotes, and French user-facing copy. Use `camelCase` for functions, `PascalCase` for types/classes/components, and kebab-case for route slugs. There is no configured linter; rely on `tsc --noEmit` and relevant tests.

## Testing Guidelines

Tests use Node’s test runner via `tsx --test`; name files `*.test.ts` and describe observable behavior in French, following nearby tests. Cover successful, invalid, and degraded/upstream-failure paths when changing HTTP services. For visual or end-to-end changes, run the focused Playwright test or `pnpm test:e2e` when practical.

## Commit & Pull Request Guidelines

Use concise French Conventional Commit messages, such as `feat(map): ajoute le service de représentation cartographique` or `fix(fire): corrige le cache`. Keep commits scoped. PRs should explain the behavior change, affected services/contracts, validation commands, and linked issue; include screenshots for UI changes. Never commit `.env`, tokens, generated data caches, or local tool settings. Before committing, run `git diff --check` and inspect `git status`.
