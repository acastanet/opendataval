# Lot 4 — Weather Vigilance Service

## Architecture retenue

```text
lat/lon → gateway → geography-service → code département
                                  ↓
                     weather-vigilance-service
                                  ↓
                 carte + bulletins Météo-France
```

Le service possède un collecteur périodique, un parseur DPVigilance V6, un cache mémoire et un snapshot JSON persistant. Le cache actif n'est remplacé qu'après validation complète des produits. Le gateway expose `/api/v2/vigilance`; le conteneur n'est jamais routé directement par Caddy.

## Contrats

- Interne : `GET /v1/vigilance/departments/{departmentCode}`.
- Public : `GET /api/v2/vigilance?lat=...&lon=...&accuracy=...`.
- Test déterministe : `GET /api/v2/vigilance?department_code=30`.

Les états indisponible, expiré, non couvert et vert sont distincts. La précision GPS est conservée comme métadonnée et ne modifie jamais le niveau officiel.

## Résilience

Le collecteur ne remplace le snapshot qu'après validation complète. Une erreur conserve le dernier état valide. La readiness accepte un snapshot `fresh` ou `stale`, mais refuse un snapshot `expired` ou absent. Aucun niveau n'est estimé lorsque le flux officiel ne peut pas être interprété.
