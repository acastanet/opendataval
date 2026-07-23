# Copernicus

> Jobs Python d'agrégation climatique ERA5 (Climate Data Store) → PostgreSQL.
> Dernière mise à jour : 2026-07-23 · Dernière vérification : 2026-07-23
> Code : `apps/copernicus/` (README applicatif de référence : [`../../../apps/copernicus/README.md`](../../../apps/copernicus/README.md))

## Rôle

Application Python qui télécharge et agrège **côté serveur** les produits climatiques utilisés par les pages météo. Une visite du site ne déclenche jamais de requête vers le Climate Data Store : le navigateur lit uniquement des agrégats déjà validés dans PostgreSQL. Ce n'est pas un service HTTP mais un job idempotent, activé par le profil Docker Compose `copernicus`.

## Périmètre / jobs

| Job | Produit | Résultat |
|---|---|---|
| `meteo_climatologie_points` | ERA5-Land | médiane, P10, P90 quotidiens sur 1991-2020, fenêtre J−7/J+7 |
| `thermal_monthly` | ERA5-HEAT / UTCI | bilan du dernier mois complet, nuits tropicales, référence 1991-2020 |

Points fixes traités : Val-d'Aigoual, Paris, Marseille (`series.meteo_points_reference`).

Sorties : `series.meteo_climatologie_jour` (366 références/point) et `series.thermal_monthly` (bilans mensuels + tableaux de dates de dépassement des seuils UTCI 32/38/46 °C). Seuls les bilans `statut_donnee = 'complet'` sont publiés.

Routes consommatrices (servies par le monolithe `api`) : `GET /api/meteo/contexte-climatique` et `GET /api/meteo/bilan-thermique`.

## Dépendances

- Climate Data Store Copernicus (`cdsapi`) — licences des 3 produits à accepter sur le compte de la clé.
- PostgreSQL / PostGIS (`db`) — écriture des agrégats.

## Configuration

| Variable | Description |
|---|---|
| `COPERNICUS_CDS_URL` / `COPERNICUS_CDS_KEY` | accès CDS (clé jamais commitée, ni journalisée, ni exposée au navigateur) |
| `COPERNICUS_PRODUCT_TYPE` | type de produit (défaut `intermediate_dataset`) |
| `COPERNICUS_DOWNLOAD_DIR` | cache des fichiers bruts (`data/downloads/`, ignoré par Git) |
| `COPERNICUS_TARGET_MONTH` | recalcul d'un mois précis (optionnel) |
| `RUN_ONCE` / `RUN_ONLY` | exécution ponctuelle / d'un seul job |
| `POSTGRES_*` | accès base |

## Lancement

```bash
docker compose --profile copernicus build copernicus
# jobs manuels
docker compose --profile copernicus run --rm -e RUN_ONCE=true -e RUN_ONLY=meteo_climatologie_points copernicus
docker compose --profile copernicus run --rm -e RUN_ONCE=true -e RUN_ONLY=thermal_monthly copernicus
# service planifié (bilan le 8 du mois, climatologie le 9 janvier)
docker compose --profile copernicus up -d copernicus
```

## Docs liées

- Exploitation générale : [`exploitation.md`](exploitation.md)
- Plan météo essentiel : [`plan-meteo-essentiel.md`](plan-meteo-essentiel.md)
- Aide au code : [`aide-code.md`](aide-code.md)
- README applicatif détaillé : [`../../../apps/copernicus/README.md`](../../../apps/copernicus/README.md)
- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
