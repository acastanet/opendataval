# Déploiement, rollback et raccordement météo

Déployer `geography-service` et le gateway seulement ; aucun frontend, migration SQL, API historique, worker, base, Copernicus ou Caddy n'est recréé. Vérifier ensuite `GET /api/v2/geography/resolve?lat=44.081&lon=3.641` et le corpus, puis observer les timeouts et réponses partielles.

Rollback : restaurer l'image précédente du gateway si nécessaire, arrêter `geography-service`, puis vérifier les routes `/api/*` historiques. Aucun écran ne dépend encore de la route V2, donc ce retrait ne requiert ni migration ni changement frontend.

Futur `weather-service` : il doit appeler le gateway ou consommer le contrat géographique versionné ; il ne doit pas redéduire commune, adresse ou altitude ni sélectionner une station dans `geography-service`.
