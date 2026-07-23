# Weather Vigilance Service

Le microservice `weather-vigilance-service` récupère, normalise, met en cache et expose la Vigilance météorologique officielle de Météo-France à l’échelle départementale.

Il couvre les neuf phénomènes DPVigilance et distingue explicitement vigilance verte, donnée indisponible, donnée obsolète, donnée expirée et territoire non couvert. Il ne réalise aucun géocodage, aucune estimation locale et aucune fusion multi-risques.

## Contrats

- Interne : `GET /v1/vigilance/departments/{departmentCode}`.
- Public via gateway : `GET /api/v2/vigilance?lat=...&lon=...&accuracy=...`.
- Test déterministe : `GET /api/v2/vigilance?department_code=30`.

Le détail d’exploitation, de configuration, de test et de rollback se trouve dans `services/weather-vigilance/README.md`. Le contrat OpenAPI est dans `services/weather-vigilance/openapi.yaml`.
