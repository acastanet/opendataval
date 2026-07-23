# Audit préalable — geography-service (Lot 2)

Date : 23 juillet 2026.

| Fichier | Comportement existant | Décision Lot 2 |
|---|---|---|
| `apps/api/src/lib/geography.ts` | Géocodage inverse IGN et altimétrie IGN en parallèle, cache mémoire 6 h ; commune/département dérivés de l'adresse. Les erreurs deviennent silencieusement `null`. | Laisser en place pour Météo V1. Reprendre uniquement le protocole fournisseur dans le nouveau service, avec statuts explicites et sans cache de position. |
| `apps/api/src/routes/meteo-v1.ts` | Consomme `createGeographyResolver`, puis sélectionne une station et calcule météo/vigilance. | Ne pas extraire : logique Météo hors périmètre. |
| `apps/api/src/routes/meteo.ts` | Recherche et géocodage inverse propres à l'écran météo, timeout 12 s. | Laisser historique ; aucune dépendance du nouveau service. |
| `apps/api/src/routes/outils.ts` | Proxys historiques BAN et altimétrie, sans timeout explicite. | Laisser historique ; anomalie documentée, non modifiée. |
| `packages/shared/src/localisationsMeteo.ts` | Points Val-d'Aigoual, Paris, Marseille et normalisation météo. | Réutiliser seulement les coordonnées du corpus ; ne pas importer la normalisation métier météo. |
| `apps/worker/src/sources/geoapi.ts` | Ingestion des contours EPCI depuis `geo.api.gouv.fr`. | Laisser dans le worker ; le nouveau service interroge l'API administrative en lecture directe. |

Les fournisseurs retenus sont l'API Découpage administratif (commune, département, EPCI) et IGN Géoplateforme (géocodage inverse, RGE ALTI). Les appels historiques IGN utilisent un timeout de 3 s dans le resolver et 12 s dans certaines routes ; le service applique 2 s par fournisseur et 2,5 s de budget global. L'anomalie principale corrigée dans le nouveau contrat est l'absence de distinction entre une absence de résultat, un timeout et une indisponibilité.

Les données météo, incendie, Copernicus, les tables PostgreSQL et les routes historiques ne sont pas modifiées.
