# weather-vigilance-service

Microservice autonome de récupération, normalisation, cache et exposition de la Vigilance météorologique officielle de Météo-France à l'échelle départementale.

## Périmètre

Le service représente les neuf phénomènes du produit DPVigilance : vent, vagues-submersion, pluie-inondation, crues, orages, neige-verglas, avalanches, canicule et grand froid. Il ne fournit ni Vigicrues détaillé, ni sécheresse, ni risque incendie, ni estimation locale. Une vigilance départementale ne prouve pas qu'un phénomène est présent aux coordonnées de l'utilisateur.

## Source

Par défaut, le collecteur appelle le produit DPVigilance V6 `cartevigilance/encours` et un produit bulletin configurable, avec l'en-tête `apikey`. Le compte et le jeton sont obtenus sur le portail API de Météo-France. Les URL restent surchargeables afin de supporter une évolution des routes officielles.

## Configuration

Copier `.env.example`. Le secret obligatoire est `METEOFRANCE_VIGILANCE_API_TOKEN`. Les seuils principaux sont `VIGILANCE_REFRESH_SECONDS`, `VIGILANCE_STALE_AFTER_SECONDS`, `VIGILANCE_EXPIRE_AFTER_SECONDS` et `VIGILANCE_SNAPSHOT_PATH`. Le jeton n'est jamais exposé par les endpoints ou les logs.

## Endpoints

- `GET /healthz` : liveness du processus ;
- `GET /readyz` : disponibilité d'un snapshot frais ou encore exploitable ;
- `GET /version` : version, commit et date de build ;
- `GET /metrics` : métriques Prometheus ;
- `GET /v1/vigilance/departments/{departmentCode}` ;
- `GET /v1/vigilance/departments/{departmentCode}?include_bulletins=true`.

Les codes `2A` et `2B` sont acceptés. Une absence de donnée n'est jamais transformée en vigilance verte.

## Cache et résilience

Le cache actif est en mémoire. Chaque rafraîchissement complètement validé remplace atomiquement le snapshot JSON persistant. Une réponse invalide ne remplace jamais le dernier état valide. Après redémarrage, le service recharge le snapshot. Les états sont `fresh`, `stale`, `expired` et `unknown`.

Le client limite la taille des réponses, vérifie le type JSON, applique des délais, des reprises exponentielles et un circuit breaker. Un échec sans snapshot exploitable produit `503`, pas un niveau vert.

## Développement

```bash
cd services/weather-vigilance
npm install
npm run typecheck
npm test
npm start
```

Les tests utilisent uniquement des fixtures et de faux serveurs. Le test réel est opt-in avec `SMOKE_TEST_METEOFRANCE=true` et un jeton valide.

## Déploiement et rollback

Construire l'image avec `docker build -f services/weather-vigilance/Dockerfile -t opendataval-vigilance:<sha> .`. Avant remplacement, taguer l'image active `opendataval-vigilance:rollback-before-<sha>`. Le conteneur reste interne au réseau Compose ; seul le gateway publie `/api/v2/vigilance`.
