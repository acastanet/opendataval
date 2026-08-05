# Itinéraire Service — poids lourd

> POC d’itinéraire camion, fondé sur Valhalla et les restrictions OpenStreetMap.
> Dernière mise à jour et vérification : 2026-08-04

## Contrat

| Route | Exposition | Rôle |
|---|---|---|
| `GET /api/v2/itineraire/poids-lourd` | publique via gateway | Calcul et audit du trajet PL |
| `GET /internal/v1/itineraire/poids-lourd` | interne | Cible du gateway |
| `GET /health`, `GET /ready` | interne | Vie et disponibilité du processus |

Paramètres obligatoires : `lon_depart`, `lat_depart`, `lon_arrivee`, `lat_arrivee`, `hauteur_m`, `largeur_m`, `longueur_m`, `poids_t`, `charge_essieu_t`, `nb_essieux`, `matieres_dangereuses` (`0` ou `1`). Les coordonnées et gabarits sont validés avec des bornes physiques plausibles.

```bash
curl -fsS "http://localhost:8080/api/v2/itineraire/poids-lourd?lon_depart=3.641467&lat_depart=44.081192&lon_arrivee=3.6103&lat_arrivee=43.9925&hauteur_m=4.1&largeur_m=2.55&longueur_m=16.5&poids_t=38&charge_essieu_t=11.5&nb_essieux=5&matieres_dangereuses=0"
```

La réponse inclut le GeoJSON du trajet, les étapes, les obstacles connus évités, la part du linéaire sans gabarit OSM explicite et une confiance calculée. Si Valhalla n’est pas prêt, le service répond `503 VALHALLA_UNAVAILABLE`.

## Chaîne de calcul

1. Valhalla calcule le trajet optimal avec `costing: truck` et le gabarit demandé.
2. `trace_attributes` fournit les ways OSM réellement parcourus.
3. Le service joint ces ways à `restrictions.json`, un index local OSM.
4. Un second trajet `auto` sert à afficher les restrictions incompatibles qui ont été évitées.

L’index est produit par `pnpm --filter itineraire-service sync-restrictions`. Le script interroge deux miroirs Overpass, avec deux tentatives par miroir, sur les sous-zones du corridor Doubs–Cévennes, dont Rhône-Alpes pour assurer la continuité. Il indexe les tags de gabarit, `hgv` et `hazmat` par `way_id`.

Si Overpass est indisponible, un export GeoJSON séquentiel issu du PBF Valhalla peut être importé avec `pnpm --filter itineraire-service import-restrictions-geojson`. Cette voie de secours conserve les géométries et les tags de gabarit dans l’index local.

## Configuration et exploitation

| Variable | Défaut | Rôle |
|---|---|---|
| `VALHALLA_URL` | `http://valhalla:8002` | moteur interne |
| `VALHALLA_TIMEOUT_MS` | `25000` | délai par requête Valhalla |
| `ITINERAIRE_RESTRICTIONS_FILE` | volume du service | index JSON OSM |
| `ITINERAIRE_SERVICE_TIMEOUT_MS` | `30000` | délai du gateway |

```bash
pnpm check:itineraire
pnpm check:gateway
pnpm build:web
docker compose up --build valhalla itineraire-service gateway caddy
```

Le premier démarrage de Valhalla construit les tuiles dans `valhalla_tiles`. Il doit être observé avant toute décision de production (durée, RAM et disque). Le POC n’intègre ni BD TOPO ni DiaLog : voir [ADR 009](../../ADR/009-choix-valhalla-itineraire-poids-lourd.md).
