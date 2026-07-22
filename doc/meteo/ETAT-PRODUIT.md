# Application météo — état du produit

Dernière vérification : 22 juillet 2026.

## 1. Objet du document

Ce document décrit le comportement fonctionnel actuellement présent dans le dépôt. Il sert de référence pour les corrections, les tests et la conception de la prochaine version.

Il ne décrit pas une cible graphique et ne présume pas que les pages sont déployées publiquement. L’état d’un déploiement doit être vérifié séparément.

## 2. Périmètre

La suite météo comprend quatre vues complémentaires.

| Route | Question traitée |
| --- | --- |
| `/meteo/essentiel/` | Quel temps fait-il ici, quelle vigilance s’applique et quelle est la tendance immédiate ? |
| `/meteo/comparaison/` | Dans quelle mesure la prévision publiée la veille a-t-elle été révisée ? |
| `/meteo/bilan-thermique/` | Quel a été le niveau de stress thermique pendant le dernier mois complet ? |
| `/meteo/informations/` | D’où viennent les données et comment faut-il les interpréter ? |

La vue détaillée `/meteo/` existe toujours. Elle rassemble davantage de variables, une prévision heure par heure, la qualité de l’air, une carte et la tendance probabiliste ECMWF. Elle constitue un produit voisin, mais pas le modèle fonctionnel obligatoire de la suite essentielle.

## 3. Navigation commune

Les quatre pages utilisent un en-tête commun qui permet de passer d’une vue à l’autre en conservant autant que possible le lieu sélectionné.

Pour un lieu préconfiguré, la navigation transporte son identifiant dans le paramètre `lieu`. Pour une position GPS précise, la page de comparaison peut recevoir directement `lat` et `lon`.

Le retour vers l’accueil général est assuré par le composant partagé `BoutonAccueil`.

## 4. Vue essentielle

### 4.1 Point initial et lieux rapides

Le point initial est Val-d’Aigoual. Trois lieux préconfigurés sont disponibles :

- Val-d’Aigoual ;
- Paris ;
- Marseille.

Le choix d’un lieu relance la chaîne météo complète pour les coordonnées correspondantes. Le bouton actif est signalé visuellement et par `aria-pressed`.

### 4.2 Géolocalisation

L’utilisateur peut demander sa position au navigateur. La géolocalisation :

- exige un contexte HTTPS ;
- utilise une précision raisonnable afin d’éviter les délais inutiles sur mobile ;
- affiche la précision estimée fournie par l’appareil ;
- géocode ensuite les coordonnées avec l’API de localisation ;
- conserve un libellé de coordonnées si le géocodage échoue.

En cas de refus, d’expiration ou d’échec, le message doit être explicite et non culpabilisant. La dernière météo valide reste affichée lorsqu’elle existe.

### 4.3 Fraîcheur

La page affiche l’heure de mise à jour de la prévision. Une donnée issue d’un repli est signalée comme « dernière valeur connue ».

La météo essentielle est rafraîchie périodiquement sans effacer les données affichées lors d’un échec silencieux.

### 4.4 Vigilance

La vigilance est affichée avant la température. Elle est déterminée pour le département du point sélectionné.

Le bloc présente :

- le département et son code ;
- le niveau maximal ;
- les phénomènes d’aujourd’hui et de demain ;
- l’heure de mise à jour lorsqu’elle est disponible ;
- un lien vers le bulletin officiel.

Règle de sécurité : lorsque la source Météo-France est indisponible, le niveau affiché est « Niveau inconnu ». La page précise que le niveau réel ne peut pas être confirmé. Elle ne doit jamais transformer une indisponibilité en vigilance verte.

### 4.5 Situation actuelle

Le bloc principal affiche :

- la température actuelle estimée ;
- le ressenti estimé ;
- le maximum et le minimum du jour ;
- l’altitude du point de modèle.

La température provient d’une prévision de modèle. Le vocabulaire « estimation locale » doit être conservé. Une position GPS précise ne signifie pas que la valeur a été mesurée à l’adresse.

### 4.6 Tendance sur trois heures

Les quatre premiers points horaires sont représentés dans un graphique compact. La page compare la température actuelle à celle de la quatrième échéance disponible.

La tendance est :

- à la hausse si l’écart dépasse `+0,5 °C` ;
- à la baisse s’il est inférieur à `−0,5 °C` ;
- stable dans les autres cas.

Le graphique est accompagné d’une phrase explicite afin que l’information ne dépende pas uniquement de sa forme.

### 4.7 Trois jours suivants

La page affiche les trois jours qui suivent la date locale courante, avec :

- le jour ;
- le maximum ;
- le minimum.

Cette synthèse ne prétend pas remplacer la prévision détaillée de `/meteo/`.

### 4.8 Contexte climatique

Lorsque les agrégats sont disponibles, la température maximale prévue du jour est comparée à la climatologie ERA5-Land 1991–2020 du point.

La page peut afficher :

- l’écart à la médiane ;
- le dépassement du percentile 90 ;
- la période de référence ;
- le nombre de valeurs comparables ;
- une limite d’interprétation.

Cette section compare la journée à des journées climatologiquement voisines. Elle ne transforme pas une prévision ponctuelle en conclusion générale sur le changement climatique.

### 4.9 Résumé du bilan thermique

Lorsque le dernier bilan complet est disponible, la vue essentielle indique :

- le mois concerné ;
- le nombre de jours de fort stress thermique ;
- l’écart à la référence 1991–2020 lorsqu’il est calculable ;
- un lien vers le bilan détaillé.

## 5. Comparaison des révisions J−1 / J

La page `/meteo/comparaison/` compare, pour une même journée, la prévision disponible environ vingt-quatre heures avant et sa version actualisée le jour concerné.

Elle mesure notamment :

- la révision de la température minimale ;
- la révision de la température maximale ;
- la révision du cumul de pluie ;
- les changements de famille de scénario météo ;
- le sens des révisions moyennes.

Les périodes proposées sont 7, 14 et 30 jours.

Cette page mesure la stabilité des prévisions. Elle ne mesure pas directement leur erreur par rapport à une observation réelle. Le vocabulaire doit toujours préserver cette distinction.

## 6. Bilan thermique mensuel

La page `/meteo/bilan-thermique/` publie uniquement un mois complet validé en base.

Elle présente :

- les jours de fort stress thermique, à partir de 32 °C UTCI ;
- les jours de très fort stress thermique, à partir de 38 °C UTCI ;
- les jours de stress extrême, à partir de 46 °C UTCI ;
- les nuits tropicales, définies par un minimum strictement supérieur à 20 °C ;
- les écarts à la référence 1991–2020 ;
- les dates exactes des dépassements de seuil lorsque disponibles.

Le bilan porte sur une maille ERA5-HEAT proche du lieu de référence. Il décrit un indicateur biométéorologique de réanalyse, pas le ressenti réel de chaque personne ni une mesure au domicile.

## 7. Page d’informations

La page `/meteo/informations/` doit rester lisible par un public non spécialiste. Elle explique :

- la différence entre mesure, prévision, vigilance, climatologie et réanalyse ;
- les sources utilisées ;
- les résolutions spatiales ;
- le rôle de l’altitude et du relief ;
- la signification de l’UTCI ;
- les limites des comparaisons J−1 / J ;
- la priorité des bulletins officiels pour les décisions de sécurité.

## 8. États transversaux

Les états suivants font partie du produit et doivent être testés :

| État | Comportement attendu |
| --- | --- |
| Chargement initial | Réserver l’espace, conserver le lieu et éviter une page vide |
| Source météo indisponible | Afficher un message clair ; conserver la dernière donnée valide si possible |
| Vigilance indisponible | Afficher « Niveau inconnu » et le lien officiel |
| Refus GPS | Conserver le lieu courant et expliquer comment réessayer |
| Géocodage indisponible | Afficher les coordonnées sans bloquer la météo |
| Climatologie absente | Ne pas afficher de comparaison artificielle |
| Bilan incomplet | Ne pas publier de bilan partiel comme un mois complet |
| Donnée périmée | Afficher la fraîcheur et la mention « dernière valeur connue » |

## 9. Accessibilité actuelle à préserver

- structure de titres réelle ;
- boutons avec libellés accessibles ;
- messages dynamiques dans des régions adaptées ;
- informations critiques exprimées en texte, pas seulement en couleur ;
- prise en charge de `prefers-reduced-motion` ;
- navigation clavier et états de focus visibles ;
- valeurs numériques stables grâce aux chiffres tabulaires ;
- tests sur formats mobile et bureau.

## 10. Points à ne plus déduire de l’ancien brief

Les affirmations suivantes ne sont plus valides :

- la vue essentielle ne doit afficher qu’un seul lieu ;
- la vigilance doit être exclue de la page ;
- aucune information complémentaire ne doit suivre les trois jours ;
- la vigilance est limitée au Gard ;
- une page doit tenir intégralement dans le premier écran mobile.

La priorité mobile reste une exigence. Elle signifie que les informations de décision doivent apparaître tôt et dans un ordre clair, non que l’ensemble du produit doit être compressé dans une seule hauteur d’écran.