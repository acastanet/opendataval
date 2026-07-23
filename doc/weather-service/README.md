# Weather service

Le service interne `weather-service` isole progressivement la météo ordinaire de Météo V2. Il n'est jamais exposé directement au navigateur : le gateway publie `/api/v2/weather/temperature` et transmet `x-request-id`.

La première capacité est `GET /internal/v1/weather/temperature`. Elle appelle geography-service, lit PostgreSQL en lecture seule pour les observations candidates et consulte le modèle Météo-France derrière un client dédié. La vigilance, Copernicus et les écrans restent hors périmètre.

Le rollback consiste à retirer le service et le proxy v2 : les routes historiques `/api/v1/meteo/*` sont indépendantes.
