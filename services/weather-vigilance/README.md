# Weather Vigilance Service

Microservice autonome du lot 4. Il récupère et expose la **Vigilance météorologique officielle de Météo-France** pour un département métropolitain. Il ne calcule aucun risque local et ne réalise aucun géocodage.

## Périmètre

Le service représente les neuf phénomènes du référentiel Météo-France : vent, vagues-submersion, pluie-inondation, crues, orages, neige-verglas, avalanches, canicule et grand froid. Le phénomène `crues` est uniquement celui relayé par la Vigilance ; le détail Vigicrues, APIC, la sécheresse et le risque incendie restent hors périmètre.

Une vigilance départementale ne prouve pas qu'un phénomène est observé ou prévu à une coordonnée précise. Toutes les réponses exposent `geographic_scope: "department"`.

## Source officielle

Produits DPVigilance v1 :

- `cartevigilance/encours` : niveaux J/J1, phénomènes et chronologies ;
- `textesvigilance/encours` : bulletins lorsqu'ils existent.

Le produit `textes` peut légitimement être absent. Lorsqu'il est présent, sa date de publication doit correspondre à celle de la carte ; sinon le bulletin n'est pas exposé et un avertissement structuré est retourné.

L'accès nécessite un compte sur le portail API Météo-France et un jeton. Le service prend en charge l'en-tête historique `apikey` et le mode OAuth2 `Authorization: Bearer`, sélectionné avec `METEOFRANCE_VIGILANCE_AUTH_MODE`.

## Endpoints

- `GET /healthz` : liveness, indépendante de Météo-France ;
- `GET /readyz` : prêt uniquement avec un snapshot frais ou temporairement obsolète ;
- `GET /version` : commit et date de build ;
- `GET /metrics` : métriques Prometheus ;
- `GET /v1/vigilance/departments/{department_code}` ;
- `GET /v1/vigilance/departments/{department_code}?include_bulletins=true`.

La route publique est fournie par le gateway :

```text
GET /api/v2/vigilance?lat=44.0812&lon=3.6421&accuracy=25
GET /api/v2/vigilance?department_code=30
```

## Cache et résilience

Le collecteur ne contacte pas Météo-France à chaque requête. Il recharge périodiquement les deux produits, valide complètement la nouvelle carte, écrit un snapshot JSON de manière atomique puis remplace le cache mémoire. Une réponse invalide ou un échec amont ne remplace jamais le dernier état valide.

États :

- `fresh` : dernière récupération récente ;
- `stale` : récupération récente en échec mais snapshot encore exploitable ;
- `expired` : ancienneté ou validité dépassée ;
- `unknown` : dates insuffisantes.

Une indisponibilité n'est jamais convertie en vigilance verte.

## Variables d'environnement

Voir `.env.example`. Variables obligatoires en production :

```text
METEOFRANCE_VIGILANCE_API_TOKEN
APP_VERSION
GIT_SHA
BUILT_AT
```

Le jeton historique `METEOFRANCE_API_TOKEN_VIGILANCE` reste accepté pendant la migration. Aucun jeton n'est retourné par les endpoints ou écrit dans les logs.

## Tests

```bash
npm --prefix services/weather-vigilance run typecheck
npm --prefix services/weather-vigilance test
# ou
npm run check:vigilance
```

Les suites utilisent uniquement des fixtures et des faux clients. Aucun test automatisé ne dépend de la disponibilité réelle de Météo-France.

## Déploiement

```bash
docker build --no-cache -f services/weather-vigilance/Dockerfile -t opendataval-vigilance:latest .
docker compose up -d --no-deps --build weather-vigilance-service gateway
```

Vérifications : `/healthz`, `/readyz`, `/version`, département `30`, route publique par coordonnées, absence du jeton dans les logs.

## Rollback

Avant remplacement :

```bash
docker tag opendataval-vigilance:latest opendataval-vigilance:rollback-before-<sha>
```

Pour revenir en arrière, réappliquer le tag à `latest`, recréer uniquement `weather-vigilance-service` et `gateway`, puis contrôler les endpoints de santé. Le volume `vigilance_cache` doit être conservé.
