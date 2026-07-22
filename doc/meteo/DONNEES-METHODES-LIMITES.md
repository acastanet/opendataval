# Application météo — données, méthodes et limites

Dernière vérification : 22 juillet 2026.

## 1. Objet

Ce document fixe le vocabulaire, les sources, les méthodes de calcul et les limites d’interprétation de la suite météo.

Il vise à éviter quatre confusions :

- une prévision de modèle n’est pas une mesure locale ;
- une vigilance officielle n’est pas une prévision calculée par l’application ;
- une révision de prévision n’est pas une erreur mesurée ;
- une comparaison climatique ponctuelle n’est pas, à elle seule, une conclusion sur le changement climatique.

## 2. Typologie des informations

| Type | Définition | Exemple dans l’application |
| --- | --- | --- |
| Localisation | Coordonnées et libellé du point demandé | GPS, adresse, lieu préconfiguré |
| Prévision | Estimation future issue d’un modèle numérique | température, ressenti, pluie, vent |
| Observation | Mesure produite en un point | station utilisée dans `/meteo/` |
| Vigilance | Information officielle de danger | niveau Météo-France et phénomènes |
| Climatologie | Distribution de référence sur une longue période | médiane, P10 et P90 1991–2020 |
| Réanalyse | Reconstruction cohérente du passé par assimilation de données | ERA5-Land et ERA5-HEAT |
| Révision | Écart entre deux versions d’une même prévision | comparaison J−1 / J |
| Ensemble | Groupe de scénarios représentant une incertitude | ECMWF à 51 scénarios |

## 3. Localisation

Le géocodage et le géocodage inverse utilisent la Géoplateforme de l’IGN et la Base Adresse Nationale.

La localisation peut provenir :

- d’un point préconfiguré ;
- du GPS du navigateur ;
- d’une adresse ou d’un lieu-dit dans l’application détaillée ;
- de coordonnées ou d’un point choisi sur une carte dans l’application détaillée.

La précision GPS affichée est celle déclarée par l’appareil. Elle décrit l’incertitude de localisation, pas la précision météorologique.

Une adresse précise améliore le choix du point de calcul, mais ne transforme pas une grille kilométrique en station installée à l’adresse.

## 4. Prévision immédiate

### 4.1 Chaîne de modèles

La prévision de courte échéance est obtenue via Open-Meteo avec une priorité donnée aux modèles de Météo-France :

1. AROME ou AROME HD lorsqu’ils sont disponibles ;
2. ARPEGE pour le relais ou le repli.

La transition entre modèles doit être explicite dans les vues qui couvrent plusieurs jours.

### 4.2 Variables de la vue essentielle

- température à 2 m ;
- température apparente ;
- minimum et maximum quotidiens ;
- altitude du point de modèle ;
- températures horaires nécessaires à la tendance sur trois heures.

### 4.3 Limites

Les principaux facteurs d’écart sont :

- la résolution de la grille ;
- l’altitude du point de modèle ;
- le relief et l’exposition ;
- les effets de vallée, de versant ou d’îlot urbain ;
- la rapidité d’évolution d’un phénomène local ;
- l’heure du dernier calcul disponible.

La formulation recommandée est « estimation locale ». Éviter « température chez vous » ou « mesure à votre adresse » lorsqu’aucune station ne correspond au point.

## 5. Vigilance Météo-France

La vigilance provient de l’API officielle Météo-France. Le département est résolu à partir du point sélectionné.

Elle :

- prime sur les indicateurs calculés pour toute décision de sécurité ;
- couvre aujourd’hui et demain ;
- peut comporter plusieurs phénomènes ;
- doit toujours renvoyer vers le bulletin officiel.

### Indisponibilité

L’absence de réponse ne permet aucune déduction sur le niveau réel. Le comportement correct est :

- niveau « inconnu » ;
- style neutre ou d’alerte, jamais vert ;
- explication de l’indisponibilité ;
- lien vers le bulletin officiel.

Un niveau vert ne peut être affiché que si la source confirme effectivement l’absence de vigilance supérieure.

## 6. Révisions J−1 / J

La page de comparaison utilise les anciens runs archivés par Open-Meteo.

Pour une date donnée, elle rapproche :

- la prévision disponible environ vingt-quatre heures auparavant ;
- la version actualisée le jour concerné.

Les indicateurs portent sur les écarts de température, de pluie et de famille de scénario.

Une faible révision signifie que la prévision est restée stable. Une forte révision signifie qu’elle a changé.

Cela ne permet pas de conclure que :

- la version J est exacte ;
- la version J−1 était fausse ;
- le modèle est globalement fiable ou non fiable.

Pour mesurer l’erreur, il faudrait comparer la prévision à une observation représentative, avec un protocole distinct.

## 7. Contexte climatique ERA5-Land

### 7.1 Produit et maille

La climatologie utilise `reanalysis-era5-land-timeseries` pour la température à 2 m sur la maille 0,1° la plus proche des trois points fixes.

### 7.2 Référence

La période de référence est 1991–2020.

Pour chaque jour climatologique, le traitement calcule :

- la médiane ;
- le percentile 10 ;
- le percentile 90 ;
- le nombre de valeurs disponibles.

Le calcul utilise une fenêtre circulaire de J−7 à J+7. Le 29 février conserve une position climatologique stable.

### 7.3 Usage dans l’interface

La vue essentielle compare le maximum prévu du jour à la médiane de la période. Elle peut signaler un dépassement du P90.

Cette comparaison porte sur une prévision actuelle et une référence de réanalyse. Elle ne constitue ni une observation directe ni une attribution climatique.

## 8. Bilan thermique ERA5-HEAT / UTCI

### 8.1 Produits

| Usage | Produit CDS | Sortie |
| --- | --- | --- |
| Mois étudié | `derived-utci-historical` | série horaire UTCI du mois complet |
| Référence | `derived-utci-historical-timeseries` | série horaire UTCI 1991–2020 |

La maille utilisée est la maille 0,25° la plus proche.

### 8.2 Seuils

- fort stress thermique : maximum UTCI journalier supérieur ou égal à 32 °C ;
- très fort stress thermique : maximum UTCI journalier supérieur ou égal à 38 °C ;
- stress extrême : maximum UTCI journalier supérieur ou égal à 46 °C ;
- nuit tropicale : minimum de température à 2 m strictement supérieur à 20 °C.

Le traitement conserve les dates exactes de dépassement des seuils UTCI.

### 8.3 Complétude

Un bilan mensuel n’est publiable que si :

- le mois est terminé ;
- les 24 heures de chaque jour attendu sont présentes ;
- le statut en base est `complet` ;
- les agrégats ont été validés avant exposition par l’API.

Une exécution échouée ne doit jamais remplacer le dernier résultat complet par un résultat partiel.

### 8.4 Interprétation

L’UTCI combine plusieurs paramètres atmosphériques pour décrire une contrainte thermique standardisée. Il ne mesure pas le ressenti individuel, qui dépend aussi de l’activité, de l’habillement, de la santé, de l’ombre et du microclimat.

## 9. Tendance ECMWF

La vue détaillée `/meteo/` utilise l’ensemble ECMWF de 51 scénarios pour la tendance à plus longue échéance.

La médiane, les probabilités et la dispersion décrivent l’incertitude entre scénarios. Elles ne constituent pas un score officiel de fiabilité.

Plus l’échéance augmente, plus l’interface doit privilégier des tendances et des plages plutôt que des horaires précis.

## 10. Qualité de l’air

La vue détaillée utilise Copernicus CAMS via Open-Meteo. La maille est régionale et ne doit pas être présentée comme une mesure à l’adresse.

Les concentrations et l’indice européen sont des estimations prévues. Leur date, leur source et leur résolution doivent rester visibles.

## 11. Fraîcheur, cache et replis

Chaque famille de données possède son propre rythme de mise à jour. L’interface ne doit pas masquer cette hétérogénéité derrière un unique statut global.

Règles :

- afficher l’heure ou la période de production lorsqu’elle est utile ;
- signaler explicitement une dernière valeur connue ;
- conserver les sections valides lors d’une erreur partielle ;
- ne pas prolonger silencieusement une donnée officielle critique ;
- distinguer indisponibilité de source et absence réelle de phénomène.

## 12. Collecte Copernicus

Les téléchargements CDS sont effectués par l’application Python `apps/copernicus`.

Le navigateur ne reçoit :

- ni clé CDS ;
- ni fichier brut NetCDF, GRIB ou CSV ;
- ni accès direct au CDS.

Il lit uniquement des agrégats validés dans PostgreSQL via l’API Fastify.

Les fichiers bruts sont stockés côté serveur dans `data/downloads/`, réutilisés lors des relances et ignorés par Git.

## 13. Vocabulaire recommandé

| Préférer | Éviter |
| --- | --- |
| estimation locale | météo exacte chez vous |
| point de modèle | station locale, si ce n’est pas une station |
| vigilance officielle | alerte calculée par l’application |
| révision de prévision | erreur de prévision |
| référence 1991–2020 | normale absolue |
| réanalyse climatique | mesure locale historique |
| tendance probabiliste | prévision certaine à dix jours |
| niveau inconnu | vigilance verte par défaut |

## 14. Références techniques internes

- `apps/api/src/routes/meteo.ts` ;
- `apps/api/src/routes/meteoClimate.ts` ;
- `apps/copernicus/README.md` ;
- `doc/EXPLOITATION-COPERNICUS.md` ;
- `packages/shared/src/localisationsMeteo.ts` ;
- migrations `009` et `010` relatives aux agrégats climatiques.