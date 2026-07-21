# Plan de mise en œuvre — Météo essentielle et contexte climatique

Dernière mise à jour : 21 juillet 2026
Statut : lots 0 à 5 implémentés et alimentés pour les trois points fixes. Lots 6 et 7 volontairement différés.

Ce document est la source de vérité du chantier portant sur :

- la page `/meteo/essentiel/` ;
- les lieux préconfigurés Val-d’Aigoual, Paris et Marseille ;
- la comparaison avec la référence climatique 1991–2020 ;
- le futur bilan thermique mensuel Copernicus / UTCI ;
- la préparation d’une offre simple et d’une offre précise payante.

Il consolide le diagnostic produit, les échanges de conception et l’état réel du dépôt. Les anciennes notes restent utiles comme sources, mais ne doivent pas remplacer ce plan.

---

## 1. Objectif produit

La page doit répondre immédiatement à trois questions différentes, sans les mélanger :

1. **Maintenant** : que se passe-t-il à l’endroit choisi ?
2. **Prochaines heures et prochains jours** : comment la météo va-t-elle évoluer ?
3. **Contexte climatique** : la situation prévue est-elle habituelle pour la période ?

Le bilan UTCI répond à une quatrième question, rétrospective :

4. **Mois terminé** : la chaleur ressentie a-t-elle été intense, durable ou inhabituelle ?

La page principale doit rester très lisible. Le bilan climatique détaillé doit être placé sur une page séparée.

---

## 2. Modèle produit à préparer

### 2.1 Offre simple

L’offre simple repose sur trois points fixes et pré-calculables :

| Identifiant | Libellé | Latitude | Longitude |
|---|---|---:|---:|
| `val-aigoual` | Mairie de Val-d’Aigoual, Valleraugue | 44.081192 | 3.641467 |
| `paris` | Paris, Hôtel de Ville | 48.8566 | 2.3522 |
| `marseille` | Marseille, Hôtel de Ville | 43.2965 | 5.3698 |

À terme, cette offre doit servir des résultats déjà calculés et mis en cache. Une consultation ne doit déclencher ni téléchargement Copernicus ni calcul climatique lourd.

### 2.2 Offre précise

L’offre précise utilisera :

- la position GPS ;
- une adresse ou des coordonnées ;
- l’altitude du point ou du modèle ;
- un calcul ou une sélection de maille adapté au point demandé ;
- un cache par point normalisé afin d’éviter les recalculs identiques.

Cette offre pourra devenir payante plus tard, avec authentification, quotas et suivi d’usage.

### 2.3 Règle pendant la phase de test

Pendant la phase actuelle :

- les trois lieux préconfigurés restent accessibles ;
- la géolocalisation précise reste accessible ;
- les calculs et données restent accessibles ;
- aucun paiement, quota ou contrôle d’abonnement n’est activé ;
- l’interface ne doit pas présenter une fonction comme payante ou réservée.

Le code doit seulement préparer la distinction entre une localisation `preconfiguree` et une localisation `precise`.

---

## 3. État actuel du dépôt

### 3.1 Fonctionnel et vérifié

- `/meteo/essentiel/` répond en local sur `http://localhost:8080/meteo/essentiel/`.
- L’API `/api/meteo/point` fonctionne pour Val-d’Aigoual, Paris et Marseille.
- La vigilance est déterminée pour le département du point demandé.
- Les boutons Val-d’Aigoual, Paris et Marseille sont présents dans `MeteoEssentiel.svelte`.
- La position GPS utilise toujours la même chaîne météo complète pendant les tests.
- Le build web réussit.
- Les six tests Playwright météo passent sur les profils mobile et ordinateur.

### 3.2 Travaux locaux déjà présents

Le répertoire de travail contient plusieurs modifications non commités :

- ajout du bloc « Ce jour depuis 10 ans » ;
- ajout de `/api/meteo/historique-jour` ;
- ajout d’une fenêtre d’information et de sources ;
- ajout des trois lieux rapides ;
- modification globale du bouton Accueil ;
- suppression locale de `SiteHeader.astro` et remplacement sur plusieurs pages ;
- mise à jour de captures Playwright.

Ces changements doivent être préservés pendant le chantier, mais examinés avant un commit. La suppression globale de `SiteHeader` dépasse le périmètre de la météo essentielle et peut créer une régression de navigation sur les autres pages.

### 3.3 Sécurité Copernicus

Les actions locales suivantes ont été commencées :

- remplacement de la clé CDS écrite dans `doc/aide code copernicus.md` par un exemple neutre ;
- ajout de `.cdsapirc`, NetCDF, GRIB et `data/downloads/` à `.gitignore` ;
- ajout des variables vides `COPERNICUS_CDS_URL` et `COPERNICUS_CDS_KEY` à `.env.example`.

Action humaine encore obligatoire : **révoquer la clé qui a été exposée et en créer une nouvelle**. La nouvelle valeur ne doit être placée que dans `.env`, `.cdsapirc` ou le gestionnaire de secrets de production.

---

## 4. Décisions de conception

### 4.1 Hiérarchie de la page principale

Ordre cible :

```text
LIEU ET FRAÎCHEUR DES DONNÉES
VIGILANCE OFFICIELLE
MAINTENANT
PROCHAINES 3 HEURES
LES 3 PROCHAINS JOURS
CONTEXTE CLIMATIQUE 1991–2020
BILAN DU MOIS DERNIER — résumé et lien
```

### 4.2 Vocabulaire obligatoire

- Utiliser **Ressenti estimé** pour le ressenti issu du modèle météo courant.
- Réserver **UTCI** ou **stress thermique UTCI** aux données Copernicus réellement calculées avec cette méthode.
- Utiliser **référence 1991–2020** ou **normale 1991–2020** pour la climatologie correspondante.
- Ne jamais appeler la moyenne 2016–2025 une « normale ».
- Utiliser **environ** lorsqu’une prévision fine est comparée à une réanalyse maillée.
- Signaler explicitement les limites du relief et de l’altitude.

### 4.3 Sources par usage

| Usage | Source cible |
|---|---|
| Vigilance | API officielle Météo-France |
| Prévision immédiate | AROME / AROME HD puis ARPEGE via Open-Meteo |
| Ressenti immédiat | `apparent_temperature` du modèle météo courant |
| Contexte de température | une série ERA5-Land cohérente sur 1991–2020 |
| Bilan thermique | ERA5-HEAT / UTCI Copernicus |
| Adresse | Géoplateforme IGN / BAN |

ERA5-Land est retenu pour le premier contexte de température en raison de sa maille plus fine que celle d’ERA5. Ce choix reste une estimation maillée et ne transforme pas la donnée en mesure locale.

### 4.4 Principe de calcul climatique

Pour éviter une référence instable fondée sur un seul jour calendaire :

- période de référence : 1991–2020 ;
- même produit et même version pour toute la référence ;
- même point ou même maille pour toutes les années ;
- fenêtre mobile de 15 jours, soit J−7 à J+7 ;
- médiane comme valeur centrale ;
- percentiles 10 et 90 comme repères de distribution ;
- nombre d’observations et complétude enregistrés ;
- année bissextile traitée explicitement.

La comparaison principale sera approximative :

> 35 °C prévus — environ +5 °C par rapport à la référence 1991–2020 pour ce secteur.

Une formulation percentile pourra compléter la valeur :

> Plus chaud que 90 % des journées comparables de la période 1991–2020.

---

## 5. Lots d’implémentation

## Lot 0 — Sécurité et gouvernance des données

### Objectif

Garantir qu’aucun secret ou fichier climatique lourd ne puisse être publié par erreur.

### Travaux

- [x] Neutraliser la clé présente dans la documentation locale.
- [x] Ignorer `.cdsapirc`, `*.nc`, `*.grib`, `*.grib2` et `data/downloads/`.
- [x] Documenter des variables Copernicus vides dans `.env.example`.
- [ ] Révoquer la clé exposée et générer une nouvelle clé côté CDS.
- [x] Accepter manuellement les conditions des jeux de données retenus.
- [x] Vérifier qu’aucun secret n’existe dans les fichiers suivis ou l’historique Git.
- [x] Documenter la procédure de configuration locale et de production.

### Critères d’acceptation

- aucune clé réelle dans Git, les logs, une URL client ou une image publique ;
- un démarrage sans clé désactive proprement le job Copernicus ;
- un message d’exploitation distingue clé absente, clé refusée et conditions non acceptées.

---

## Lot 1 — Localisations simples et précises

### Objectif

Stabiliser le modèle de localisation qui supportera plus tard les deux offres.

### Travaux

- [x] Ajouter Val-d’Aigoual, Paris et Marseille à l’interface essentielle.
- [x] Garder la position GPS ouverte pendant les tests.
- [x] Tester les coordonnées envoyées pour Paris et Marseille.
- [x] Déplacer la liste des points préconfigurés de Svelte vers `packages/shared`.
- [x] Ajouter le type `preconfiguree | precise` au contrat interne.
- [x] Retourner dans l’API l’identifiant du point préconfiguré lorsqu’il correspond exactement.
- [x] Normaliser les coordonnées précises pour construire une clé de cache stable.
- [x] Conserver le lieu précédent lorsqu’un changement de point échoue.

### Critères d’acceptation

- le choix d’un point met à jour prévision, vigilance, lieu et climat ;
- une position GPS n’active aucun bouton préconfiguré ;
- l’API sait distinguer un point fixe d’un point précis sans paiement actif ;
- aucun débordement horizontal à partir de 320 px.

---

## Lot 2 — Corrections immédiates de l’interface

### Objectif

Améliorer la confiance, la lisibilité et la séparation des temporalités sans charger le premier écran.

### Travaux

1. [x] Afficher **Consulté à…** pour l’horloge de l’utilisateur.
2. [x] Afficher séparément **Prévision mise à jour à…**.
3. [x] Conserver l’heure propre de mise à jour de la vigilance.
4. [x] Afficher **Ressenti estimé : X °C** sous la température actuelle.
5. [x] Après géolocalisation, afficher **Position GPS · précision ± X m**.
6. [x] Afficher **Altitude du point modèle : X m**.
7. [x] Remplacer la grande flèche par un diagramme en barres rouges gradué, avec heure et température.
8. [x] Conserver le texte de synthèse : « baisse/hausse de X °C dans les trois prochaines heures ».
9. [x] Supprimer les quatre petits carrés colorés sans fonction.
10. [x] Finaliser l’accessibilité de la fenêtre Sources : piège de focus, restitution du focus et navigation clavier des onglets.
11. [x] Isoler le traitement du bouton Accueil à la page immersive et restaurer la navigation des pages ordinaires si sa suppression n’est pas une décision globale confirmée.

### Critères d’acceptation

- les heures de consultation, prévision et vigilance ne peuvent pas être confondues ;
- le ressenti n’est jamais nommé UTCI ;
- l’altitude et la précision GPS sont visibles lorsqu’elles existent ;
- la tendance reste compréhensible sans la couleur et par un lecteur d’écran ;
- aucun chevauchement du bouton Accueil avec le contenu ;
- tests clavier, mobile et `prefers-reduced-motion` satisfaits.

---

## Lot 3 — Contexte climatique 1991–2020

### Objectif

Remplacer le bloc temporaire « Ce jour depuis 10 ans » par une référence robuste et explicitement maillée.

### Schéma de données proposé

Ajouter une migration additive, sans modifier les migrations existantes :

```text
series.meteo_points_reference
  id
  slug
  nom
  latitude
  longitude
  altitude_reference_m
  type_localisation
  actif

series.meteo_climatologie_jour
  point_id
  jour_annee
  periode_debut
  periode_fin
  fenetre_jours
  tmax_mediane
  tmax_p10
  tmax_p90
  tmin_mediane
  tmin_p10
  tmin_p90
  nb_valeurs
  produit
  version_produit
  altitude_maille_m
  calcule_le
```

La clé logique doit empêcher les doublons pour un point, un jour de l’année, une période et une version de produit.

### Ingestion

- [x] créer un job idempotent `meteo_climatologie_points` dans le service Python isolé ;
- [x] télécharger ERA5-Land côté serveur uniquement ;
- [x] calculer les statistiques des trois points fixes ;
- [x] enregistrer les valeurs dans PostgreSQL ;
- [x] conserver la dernière climatologie valide si la source est indisponible ;
- [x] ne pas recalculer 1991–2020 à chaque consultation ;
- [x] prévoir l’extension future aux points précis, avec cache et quotas désactivés pendant les tests.

Première alimentation réussie le 21 juillet 2026 : 366 références journalières complètes pour
chacun des trois points, soit 1 098 lignes à 100 % de complétude.

### API

Créer :

```text
GET /api/meteo/contexte-climatique?lat=…&lon=…
```

Réponse minimale :

```json
{
  "point": {
    "type": "preconfiguree",
    "slug": "paris",
    "nom": "Paris · Hôtel de Ville"
  },
  "reference": {
    "debut": 1991,
    "fin": 2020,
    "fenetreJours": 15,
    "produit": "ERA5-Land"
  },
  "temperatureMax": {
    "mediane": 25.4,
    "p10": 20.1,
    "p90": 31.2
  },
  "limite": "Estimation climatique maillée, moins précise en zone de relief."
}
```

Le navigateur calcule seulement l’écart d’affichage entre la prévision déjà reçue et la référence. Il ne télécharge ni ne traite l’historique brut.

État : route, contrat, cache HTTP et repli sans donnée implémentés. L'ancienne route
`/api/meteo/historique-jour` et son consommateur ont été supprimés.

### Interface

Remplacer le titre actuel par :

```text
AUJOURD’HUI DANS SON CONTEXTE CLIMATIQUE
35 °C prévus
Environ +5 °C par rapport à la référence 1991–2020
Estimation climatique maillée pour le secteur sélectionné
```

La moyenne 2016–2025 peut être conservée en information secondaire, repliée ou placée dans la fenêtre Sources. Elle ne doit pas être le repère principal.

### Critères d’acceptation

- aucune requête historique externe lors d’une consultation normale ;
- la référence est persistée et reproductible ;
- le produit, la période et la limite géographique sont affichés ;
- un échec climatologique ne bloque jamais la météo actuelle ;
- le bloc temporaire `/api/meteo/historique-jour` est supprimé après migration complète de ses consommateurs et tests.

---

## Lot 4 — Collecte et calcul UTCI mensuels

### Objectif

Produire un bilan du dernier mois complet pour les points fixes, puis préparer le calcul précis.

### Étape obligatoire de validation

Avant d’écrire le traitement final :

1. [x] ouvrir les jeux de données CDS retenus ;
2. [x] accepter leurs conditions ;
3. [x] vérifier les paramètres dans les schémas de requête officiels ;
4. [x] tester avec succès un seul point et un seul mois, puis les trois points fixes ;
5. [x] inspecter et traiter les dimensions, variables et unités réellement reçues ;
6. [x] figer le nom des jeux, les versions et les paramètres dans le code testé.

Jeu candidat : `derived-utci-historical-timeseries`. Le choix final doit être confirmé par ce test et non déduit d’un exemple de documentation.

### Architecture cible

Créer un module Python isolé `apps/copernicus` utilisant le client officiel `cdsapi` :

```text
apps/copernicus/
  requirements.txt
  src/copernicus/client.py
  src/copernicus/requests/monthly_thermal.py
  src/copernicus/process/monthly_thermal.py
  src/copernicus/main.py
  tests/
```

Le module fonctionne en mode `RUN_ONCE` et écrit les agrégats dans PostgreSQL. Le service
Python dédié est activé uniquement par le profil Compose `copernicus` ; l'image du worker Node
reste inchangée. Un mode planifié lance le bilan le 8 du mois et la climatologie le 9 janvier.

### Stockage proposé

```text
series.thermal_monthly
  point_id
  annee
  mois
  utci_max_c
  categorie_max
  jours_stress_fort
  jours_stress_tres_fort
  jours_stress_extreme
  dates_stress_fort
  dates_stress_tres_fort
  dates_stress_extreme
  nuits_tropicales
  anomalie_jours_stress_1991_2020
  completude_pct
  statut_donnee
  produit
  version_produit
  calcule_le
```

Les seuils doivent être centralisés et testés :

- stress thermique modéré : 26 à moins de 32 °C UTCI ;
- fort : 32 à moins de 38 °C ;
- très fort : 38 à moins de 46 °C ;
- extrême : 46 °C et plus ;
- nuit tropicale : température minimale restant strictement au-dessus de 20 °C.

### Planification

- lancer le traitement vers le 7 ou le 8 du mois ;
- traiter le mois précédent seulement s’il est complet ;
- conserver le dernier bilan complet si le nouveau mois n’est pas encore disponible ;
- permettre une relance sans doublon ;
- ne jamais lancer une requête CDS lors d’une visite utilisateur.

### Critères d’acceptation

- le même mois et la même version produisent le même résultat ;
- une donnée incomplète n’est pas publiée comme bilan final ;
- les erreurs ne contiennent ni clé ni en-tête d’authentification ;
- les fichiers bruts sont ignorés par Git et conservés jusqu’à validation du traitement ;
- les trois points préconfigurés peuvent être calculés en lot.

---

## Lot 5 — Page « Bilan thermique du mois dernier »

### Objectif

Donner une lecture rétrospective sans alourdir la page principale.

### Route cible

```text
/meteo/bilan-thermique/
```

### Contenu

- choix Val-d’Aigoual / Paris / Marseille ;
- période exacte analysée ;
- pic UTCI et catégorie correspondante ;
- nombre de jours avec au moins un stress thermique fort ;
- dates exactes affichées au survol, au focus clavier ou après sélection des valeurs de stress ;
- nombre de nuits tropicales ;
- écart par rapport à 1991–2020 ;
- source, version, date de calcul et complétude ;
- limite liée à la maille et, pour Val-d’Aigoual, au relief.

Pour Val-d’Aigoual, une extension ultérieure pourra comparer vallée, plateau/intermédiaire et altitude. Cette comparaison ne doit pas être simulée à partir d’un seul point.

### Résumé sur la page essentielle

Afficher uniquement :

```text
JUIN 2026 · BILAN THERMIQUE
8 jours de fort stress thermique
3 jours de plus que la référence 1991–2020
Voir le bilan →
```

Les nombres ne sont affichés que s’ils proviennent d’un bilan complet enregistré.

État : route API, résumé conditionnel et page détaillée implémentés. Le bilan de juin 2026 est
publié pour les trois points avec 100 % de complétude ; l'état sans donnée reste géré.

### Critères d’acceptation

- la page principale reste légère ;
- le lien fonctionne au clavier et sur mobile ;
- un mois indisponible affiche le dernier bilan complet et sa période exacte ;
- température de l’air, ressenti estimé et UTCI restent clairement distingués.

---

## Lot 6 — Préparation de la future monétisation

### Objectif

Préparer l’évolution sans activer de restriction pendant les tests.

### À préparer maintenant

- un type de localisation explicite ;
- une liste serveur des points simples autorisés ;
- une clé de cache pour les points précis ;
- des métriques anonymisées de coût et de durée de calcul ;
- un mécanisme de configuration désactivé par défaut.

### À ne pas implémenter maintenant

- paiement ;
- compte obligatoire ;
- blocage de la position GPS ;
- quotas utilisateurs ;
- messages commerciaux ;
- suppression des données ou calculs actuels.

### Architecture future

```text
Requête météo
  ├─ point préconfiguré → cache partagé → offre simple
  └─ position précise  → authentification/quota → cache normalisé → calcul précis
```

La décision de prix, d’authentification et de fournisseur de paiement fera l’objet d’un plan séparé.

---

## Lot 7 — Tests, exploitation et déploiement

### Tests unitaires

- validation des coordonnées ;
- sélection d’un point préconfiguré ;
- normalisation d’un point précis ;
- médiane et percentiles ;
- fenêtre J−7/J+7 ;
- 29 février ;
- seuils UTCI 26, 32, 38 et 46 °C ;
- nuit à exactement 20 °C et strictement au-dessus ;
- mois incomplet ;
- idempotence des upserts ;
- absence de clé CDS.

### Tests API

- contrats des routes météo ;
- réponses partielles ;
- cache et fraîcheur ;
- absence de données climatiques ;
- point hors liste simple ;
- aucune fuite de secret dans les erreurs.

### Tests d’interface

- captures mobile et ordinateur ;
- largeur minimale 320 px ;
- changement Val-d’Aigoual / Paris / Marseille ;
- passage d’un point fixe à la géolocalisation ;
- absence de chevauchement du bouton Accueil ;
- clavier, lecteur d’écran et réduction des animations ;
- distinction visuelle des trois temporalités.

### Vérifications de livraison

```powershell
pnpm --filter api exec tsc --noEmit
pnpm --filter worker exec tsc --noEmit
pnpm build:web
pnpm exec playwright test e2e/meteo-point.spec.ts
docker compose config
docker compose up -d --build
```

Après reconstruction locale :

```powershell
Invoke-WebRequest http://localhost:8080/api/health
Invoke-WebRequest http://localhost:8080/meteo/essentiel/
docker compose ps
```

---

## 6. Ordre de réalisation retenu

1. Faire valider le présent plan.
2. Terminer le lot 0, notamment la rotation de clé par l’utilisateur.
3. Centraliser les trois points et leur type de localisation — lot 1.
4. Terminer les corrections visibles de la page — lot 2.
5. Construire et alimenter la référence ERA5-Land 1991–2020 — lot 3.
6. Remplacer définitivement le bloc « Ce jour depuis 10 ans ».
7. Réaliser le prototype CDS sur un point et un mois — début du lot 4.
8. Implémenter le traitement mensuel et son stockage — fin du lot 4.
9. Créer la page de bilan et son résumé — lot 5.
10. Ajouter seulement les abstractions nécessaires à la future offre payante — lot 6.
11. Exécuter la validation complète et documenter l’exploitation — lot 7.

Les lots 3 et 4 ne doivent pas être fusionnés : la température climatologique ERA5-Land et le stress thermique UTCI répondent à des usages différents.

---

## 7. Points de contrôle avant reprise du code

Avant toute nouvelle modification fonctionnelle, confirmer :

- [ ] le maintien des coordonnées des trois points fixes ;
- [ ] ERA5-Land comme produit de référence pour la température 1991–2020 ;
- [ ] la fenêtre climatologique de 15 jours ;
- [ ] le maintien temporaire de toutes les fonctions sans paiement ;
- [ ] la restauration de `SiteHeader` sur les pages ordinaires ou la validation explicite de sa suppression globale ;
- [ ] le jeu CDS et la requête générée officiellement pour le prototype UTCI ;
- [ ] la rotation effective de la clé CDS exposée.

---

## 8. Définition globale de terminé

Le chantier sera terminé lorsque :

- la météo essentielle reste compréhensible en quelques secondes ;
- les trois lieux simples fonctionnent sans calcul climatique déclenché par la visite ;
- la position précise fonctionne encore pendant les tests ;
- la comparaison 1991–2020 remplace la moyenne de dix dates ;
- le bilan UTCI du dernier mois complet est calculé côté serveur et stocké ;
- aucune clé ni donnée brute lourde n’atteint le navigateur ou Git ;
- les limites de résolution et d’altitude sont visibles ;
- les tests unitaires, API, interface et build réussissent ;
- la future séparation simple/payante peut être activée plus tard sans réécrire les contrats météo.

---

## 9. Références

- Diagnostic général fourni pour `/meteo/essentiel/`.
- `doc/aide code copernicus.md` pour les contraintes CDS et `cdsapi`.
- Open-Meteo Historical Weather API : https://open-meteo.com/en/docs/historical-weather-api
- Copernicus ERA5-HEAT : https://cds.climate.copernicus.eu/datasets/derived-utci-historical
- Séries temporelles UTCI : https://cds.climate.copernicus.eu/datasets/derived-utci-historical-timeseries
