# Application Copernicus

Cette application Python télécharge et agrège côté serveur les produits climatiques utilisés
par les pages météo d'OpenData VdA. Une visite du site ne déclenche jamais de requête vers le
Climate Data Store (CDS) : le navigateur lit uniquement des agrégats déjà validés dans
PostgreSQL.

## Fonctions

Deux jobs idempotents sont disponibles :

| Job | Produit | Résultat |
|---|---|---|
| `meteo_climatologie_points` | ERA5-Land time-series | médiane, P10 et P90 quotidiens sur 1991–2020, fenêtre J−7/J+7 |
| `thermal_monthly` | ERA5-HEAT / UTCI | bilan du dernier mois complet, nuits tropicales et référence 1991–2020 |

Le module `copernicus.process.climate_fingerprint` implémente aussi l'empreinte
climatique historique définie dans
[`poc/climat/02-empreinte-climatique-specification.md`](../../poc/climat/02-empreinte-climatique-specification.md).
Il reçoit les cinq séries déjà téléchargées depuis le cache CDS (température, UTCI,
précipitations, SPEI-3 et vent), exclut les années incomplètes et produit deux artefacts
de snapshot : `climate-fingerprint.json` et `climate-fingerprint.svg`. Son branchement au
job de fabrication des dalles reste volontairement séparé de la collecte CDS afin de ne
jamais exposer un appel distant au chargement d'une page publique.

Les traitements couvrent les points fixes Val-d'Aigoual, Paris et Marseille enregistrés dans
`series.meteo_points_reference`.

## Données et règles de calcul

- ERA5-Land : température de l'air à 2 m sur la maille 0,1° la plus proche.
- ERA5-HEAT : UTCI sur la maille 0,25° la plus proche.
- Stress fort ou plus : maximum UTCI journalier supérieur ou égal à 32 °C.
- Stress très fort : maximum UTCI journalier supérieur ou égal à 38 °C.
- Stress extrême : maximum UTCI journalier supérieur ou égal à 46 °C.
- Nuit tropicale : minimum de température strictement supérieur à 20 °C.

Le bilan conserve, en plus des nombres de jours, les dates ISO exactes de chaque dépassement
des seuils 32, 38 et 46 °C. L'API les transmet à la page de bilan, qui les affiche au survol,
au focus clavier ou après sélection tactile de la valeur.

Les séries temporelles CDS exigent une plage de dates explicite et une emprise non nulle. Le
code construit donc une petite boîte autour de la maille la plus proche au lieu d'envoyer un
point de surface nulle.

## Configuration

Les valeurs suivantes sont injectées par Docker Compose depuis `.env` ou le gestionnaire de
secrets de production :

```text
COPERNICUS_CDS_URL
COPERNICUS_CDS_KEY
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

La clé CDS ne doit jamais être ajoutée au dépôt, aux journaux ou au navigateur. Les licences
des trois produits doivent être acceptées dans le compte associé à cette clé.

## Exécution

Construire l'image et exécuter les tests :

```powershell
docker compose --profile copernicus build copernicus
docker compose --profile copernicus run --rm --no-deps copernicus python -m unittest discover -s /app/tests -v
```

Lancer manuellement les deux jobs :

```powershell
docker compose --profile copernicus run --rm -e RUN_ONCE=true -e RUN_ONLY=meteo_climatologie_points copernicus
docker compose --profile copernicus run --rm -e RUN_ONCE=true -e RUN_ONLY=thermal_monthly copernicus
```

Pour recalculer un mois particulier à partir des fichiers mis en cache :

```powershell
$env:COPERNICUS_TARGET_MONTH="2026-06"
docker compose --profile copernicus run --rm -e RUN_ONCE=true -e RUN_ONLY=thermal_monthly -e COPERNICUS_TARGET_MONTH copernicus
```

Le service planifié vérifie le bilan le 8 de chaque mois et renouvelle la climatologie le
9 janvier :

```powershell
docker compose --profile copernicus up -d copernicus
```

## Stockage et publication

- `series.meteo_climatologie_jour` contient les 366 références par point.
- `series.thermal_monthly` contient les bilans mensuels et les tableaux
  `dates_stress_fort`, `dates_stress_tres_fort` et `dates_stress_extreme`.
- seuls les bilans avec `statut_donnee = 'complet'` sont publiés par l'API ;
- les fichiers bruts sont conservés dans `data/downloads/`, réutilisés lors des relances et
  ignorés par Git.

Routes consommatrices :

```text
GET /api/meteo/contexte-climatique?lat=…&lon=…
GET /api/meteo/bilan-thermique?lat=…&lon=…
```

La page ajoute `v=2` et utilise `cache: no-store` afin qu'une réponse navigateur antérieure à
l'ajout des tableaux de dates ne masque pas les valeurs nouvellement calculées.

## Diagnostic

| Message | Action |
|---|---|
| clé ou URL CDS absente | vérifier les variables du service |
| authentification refusée | vérifier la clé et le compte CDS |
| conditions non acceptées | accepter la licence depuis chaque fiche produit |
| requête refusée | vérifier plage de dates, produit, version et emprise |
| fichier vide ou incomplet | conserver le dernier agrégat valide et relancer |

Pour la procédure d'exploitation générale, consulter
[`doc/microservice/copernicus/exploitation.md`](../../doc/microservice/copernicus/exploitation.md).
