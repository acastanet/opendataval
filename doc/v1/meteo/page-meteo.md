# Page météo — informations et fonctions disponibles

Cette page décrit ce qu’un utilisateur peut voir et faire sur `/meteo/`, dans l’ordre de priorité de l’interface. Elle reflète la page telle qu’elle est aujourd’hui, pensée en priorité pour un écran mobile.

## 1. Savoir immédiatement où porte la prévision

Informations affichées en tête de page :

- le nom du lieu actuellement sélectionné ;
- l’adresse ou le contexte du lieu lorsque cette information est disponible ;
- le niveau de précision de la position : GPS et précision estimée, adresse / lieu-dit géocodé, point sur la carte ou coordonnées saisies ;
- un rappel clair : la prévision AROME s’applique à une maille d’environ 1,5 à 2,5 km, et non à l’adresse exacte.

Fonctions disponibles :

- rechercher une adresse ou un lieu-dit dans Val-d’Aigoual ;
- choisir une proposition de recherche et actualiser toute la prévision pour ce point ;
- utiliser la position GPS du téléphone ou de l’ordinateur ;
- enregistrer le lieu en favori sous le nom « Maison » ;
- rouvrir rapidement le favori « Maison » lorsqu’un autre lieu est affiché.

## 2. Comprendre la situation actuelle

Le bloc principal affiche, sans nécessiter de défilement :

- la température estimée au point choisi ;
- la température ressentie ;
- la condition météo en cours, avec pictogramme ;
- l’heure d’actualisation du modèle ;
- la pluie cumulée prévue sur les douze prochaines heures ;
- le vent, sa direction et les rafales ;
- l’humidité.

## 3. Identifier le risque ou phénomène à anticiper

Une carte de signal synthétique indique le phénomène le plus important des prochaines heures :

- orage ;
- fortes rafales ;
- pluie marquée ;
- chaleur ;
- risque de gel ;
- ou situation calme.

Lorsqu’une Vigilance Météo-France est disponible, cette carte donne un accès direct à la section des alertes.

## 4. Voir la tendance des prochaines heures

Une bande courte présente les quatre premiers créneaux horaires :

- horaire ;
- pictogramme météo ;
- température ;
- pluie prévue.

Elle sert de résumé rapide. Le détail complet est disponible plus bas dans la page.

## 5. Accéder rapidement aux détails utiles

Une navigation interne permet d’aller directement à :

- la prévision heure par heure ;
- les prochains jours ;
- la pluie et le vent ;
- les alertes ;
- la précision et les sources.

Si une partie des sources est indisponible ou si les données affichées sont anciennes, un message le signale explicitement sans masquer les informations encore disponibles.

## 6. Consulter la prévision heure par heure

La section « Heure par heure » présente les seize prochaines heures avec :

- heure ;
- condition météo ;
- température ;
- ressenti ;
- précipitations prévues ;
- rafales prévues.

La source courte échéance affichée est AROME.

## 7. Prévoir les quatre prochains jours

La section « Les 4 prochains jours » indique, pour chaque journée :

- jour et condition dominante ;
- température maximale et minimale ;
- cumul de pluie ;
- rafale maximale.

La transition progressive entre AROME et ARPEGE est indiquée à partir du troisième jour afin de rendre visible le changement de modèle.

## 8. Approfondir pluie, vent et atmosphère

Une grille de lecture locale récapitule :

- cumul de pluie prévu sur douze heures ;
- vent actuel estimé, direction et rafales ;
- humidité ;
- pression au niveau du point de modèle.

Ces valeurs sont des estimations de modèle pour le point choisi, pas des mesures faites au domicile de l’utilisateur.

## 9. Vérifier les alertes officielles

La section « Vigilance et alertes » fournit :

- le widget officiel de Vigilance Météo-France pour le Gard ;
- un lien vers le bulletin officiel et les consignes Météo-France.

Cette information est la référence pour les décisions de sécurité. Elle est volontairement séparée des prévisions de modèles.

## 10. Consulter la qualité de l’air

La section « Qualité de l’air » affiche :

- l’indice européen de qualité de l’air ;
- un niveau de lecture synthétique ;
- les concentrations prévues de PM2,5, PM10, ozone et dioxyde d’azote.

Les données sont une prévision régionale Copernicus CAMS, diffusée par Open-Meteo, sur une maille d’environ 11 km. Elles sont donc clairement décrites comme une estimation, et non comme une mesure à l’adresse.

## 11. Comprendre la fiabilité réelle de la prévision

La section « Précision réelle et sources » explique :

- la position effectivement demandée ;
- le modèle utilisé, sa résolution et l’altitude du point de calcul ;
- la station Météo-France disponible pour comparaison, avec distance, altitude et heure de relevé ;
- l’éventuelle ancienneté de la mesure ;
- les limites liées au relief cévenol, aux vallées et à l’exposition.

Elle rappelle qu’une localisation très précise n’implique pas une prévision exacte « à la porte près ».

## 12. Comparer les révisions J−1 / J

La page `/meteo/comparaison/`, accessible depuis le menu commun des pages météo essentielles, compare pour une même journée :

- la prévision disponible 24 heures avant (J−1) ;
- sa version actualisée le jour concerné (J) ;
- les écarts de températures minimale et maximale ;
- l’écart de cumul de pluie ;
- le nombre d’heures dont la famille de scénario météo a changé.

Les périodes disponibles sont 7, 14 et 30 jours. Les valeurs proviennent des anciens runs du modèle Météo-France AROME / ARPEGE archivés par Open-Meteo. Elles mesurent la stabilité et l’ampleur des révisions du modèle, pas son erreur par rapport au temps réellement observé.

## 13. Explorer la tendance à moyen terme

La section repliée « Tendance probabiliste ECMWF » couvre J+3 à J+10. Pour chaque jour, elle donne :

- la condition dominante ;
- la température médiane ;
- la probabilité de pluie ;
- la pluie médiane et le scénario humide P90 ;
- le niveau de dispersion ;
- les signaux de pluie forte et de forte rafale lorsqu’ils existent.

Elle s’appuie sur l’ensemble ECMWF de 51 scénarios. Les données servent à lire une tendance et une incertitude ; les horaires précis deviennent moins fiables avec l’échéance. Un lien conduit au météogramme officiel ECMWF.

## 14. Ajuster manuellement le point de prévision

La section repliée « Choisir le point sur la carte » permet :

- de saisir latitude et longitude ;
- d’afficher la météo de ces coordonnées ;
- de cliquer dans la carte pour déplacer le point ;
- de visualiser le repère correspondant au point demandé.

La carte est un réglage fin, non une étape obligatoire : recherche d’adresse, GPS et coordonnées restent des alternatives complètes.

## Résumé des sources

| Besoin | Source ou mode de calcul |
| --- | --- |
| Adresse, lieu-dit et géolocalisation inverse | Géoplateforme IGN / BAN |
| Prévision de court terme | Météo-France AROME, puis ARPEGE, diffusés et adaptés par Open-Meteo |
| Historique des versions J−1 / J | Open-Meteo Previous Runs API, modèle Météo-France seamless |
| Observation de comparaison | Station Météo-France la plus proche lorsqu’elle est disponible |
| Alertes | Vigilance Météo-France |
| Tendance à moyen terme | ECMWF IFS et ensemble de 51 scénarios |
| Qualité de l’air | Copernicus CAMS European Ensemble, diffusé par Open-Meteo |

Pour le détail des choix de design et des contraintes d’implémentation, consulter [README_miniapp_meteo_uxui.md](README_miniapp_meteo_uxui.md).
