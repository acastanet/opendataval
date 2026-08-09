# Interprétation IA de la fiche climat

Statut : **cadre commun P3**.

Ce document définit le rôle du futur `climate-commentary-service`. Il ne remplace aucune méthode scientifique et n'autorise aucun calcul climatique dans le modèle de langage.

## 1. Principe

Le commentaire IA intervient **après** le calcul scientifique.

```text
ClimateSnapshot
      ↓
méthode versionnée
      ↓
ClimateResult
      ↓
ClimateSignal[]
      ↓
climate-commentary-service
      ↓
ClimateCommentary
```

Le modèle de langage ne reçoit pas l'infographie comme source de vérité. Le SVG peut être présenté à un humain, mais les affirmations de l'IA doivent être fondées sur les données structurées et les signaux calculés.

## 2. Responsabilités

### Service scientifique

Il décide :

- quelles valeurs sont calculées ;
- quelles comparaisons sont valides ;
- quel signal est émis ;
- quelle unité et quelle direction lui sont associées ;
- si les données sont suffisantes ;
- quels caveats sont obligatoires.

### Service IA

Il décide uniquement :

- comment ordonner les constats ;
- comment les reformuler en français clair ;
- quels constats complémentaires relier entre eux ;
- comment expliciter les limites déjà fournies.

Il ne doit pas :

- recalculer un indicateur ;
- déduire une significativité statistique absente ;
- attribuer une cause ;
- transformer une réanalyse en observation locale ;
- transformer une variable modélisée en grandeur non mesurée ;
- interpréter une absence de donnée comme une valeur nulle ;
- inférer un phénomène d'impact non observé à partir d'un signal météorologique.

## 3. Structure conceptuelle d'un `ClimateSignal`

Le schéma JSON exact sera défini en P4. P3 fixe la sémantique minimale :

```json
{
  "id": "summer-start-shift",
  "metric": "summer_start",
  "value": -11,
  "unit": "days",
  "direction": "earlier",
  "comparison": {
    "early": "1996-2005",
    "late": "2016-2025"
  },
  "evidence": ["/data/..."],
  "claim_level": "descriptive",
  "caveats": ["thermal-season-not-meteorological-season"]
}
```

Champs conceptuellement obligatoires :

- identifiant stable ;
- métrique source ;
- valeur ou catégorie calculée ;
- unité ;
- direction lorsqu'elle existe ;
- période ou comparaison ;
- pointeur vers la preuve dans `ClimateResult` ;
- niveau de preuve ;
- caveats applicables.

## 4. Niveaux de preuve

P3 retient les niveaux suivants :

### `descriptive`

Comparaison déterministe entre périodes ou position dans une distribution de référence.

Autorise :

> « La période 2016–2025 présente une valeur plus élevée que 1996–2005. »

N'autorise pas :

> « La variable augmente durablement. »

### `statistical_trend`

Réservé à une future méthode comportant explicitement un test de tendance, son niveau de confiance et ses hypothèses.

Aucune des quatre méthodes P2 actuelles n'émet ce niveau.

### `causal_attribution`

Réservé à une méthode d'attribution dédiée.

Aucune des quatre méthodes actuelles n'émet ce niveau.

## 5. Règle d'ancrage

Chaque `finding` du futur `ClimateCommentary` doit citer au moins un `signal_id`.

Une phrase comportant un nombre climatique doit pouvoir être retracée vers :

```text
phrase
  ↓
signal_id
  ↓
ClimateSignal
  ↓
evidence
  ↓
ClimateResult
  ↓
method.id + method.version
```

Aucun chiffre nouveau ne peut apparaître uniquement dans la réponse du LLM.

## 6. Vocabulaire commun

### Préférer

- « contexte climatique » ;
- « réanalyse » ;
- « période de référence 1991–2020 » ;
- « comparaison entre 1996–2005 et 2016–2025 » ;
- « plus élevé / plus faible » ;
- « plus tôt / plus tard » ;
- « dans les données de réanalyse » ;
- « valeur modélisée » lorsque la grandeur l'exige.

### Éviter sans méthode supplémentaire

- « prouve » ;
- « démontre que le changement climatique a causé » ;
- « tendance significative » ;
- « mesure sur la parcelle » ;
- « température exacte du lieu » ;
- « prévision » pour des résultats historiques ;
- « catastrophe », « crue », « tempête », « incendie » lorsque seule une condition météorologique est calculée.

## 7. Représentativité spatiale

Si `local_measurement=false`, le commentaire doit parler de **contexte climatique du lieu** ou de **maille de réanalyse associée**.

Lorsqu'une zone est plus petite que la maille utilisée, le commentaire ne doit pas reprendre sa taille comme résolution climatique.

Lorsque plusieurs mailles sont agrégées, l'IA peut expliquer que le résultat représente une moyenne spatiale pondérée si cette information est fournie par `ClimateResult`.

## 8. Données insuffisantes

L'IA doit s'abstenir d'interpréter un signal lorsque :

- le service scientifique ne l'a pas émis ;
- le statut qualité est insuffisant ;
- la valeur est `null` ;
- la référence est incomplète selon la méthode ;
- la comparaison ne satisfait pas le nombre minimum d'années valides ;
- la méthode marque l'indicateur `not_applicable`.

Le commentaire peut alors dire uniquement qu'une interprétation fiable n'est pas disponible pour cet indicateur.

## 9. Hiérarchie éditoriale

Pour une infographie, le commentaire recommandé comporte au maximum :

1. un constat principal ;
2. deux ou trois constats secondaires ;
3. un caveat de représentativité ou de méthode si nécessaire.

Le commentaire doit privilégier les signaux les plus informatifs et éviter d'énumérer toutes les valeurs du graphique.

## 10. Synthèse de la fiche complète

Le commentaire transversal de la fiche ne recevra pas les séries brutes. Il recevra les `ClimateSignal` validés des quatre méthodes.

Il pourra rapprocher deux signaux, par exemple un réchauffement descriptif et un déplacement des saisons thermiques, mais il ne pourra pas transformer leur coïncidence en causalité.

## 11. Fichiers normatifs P3

Les règles spécifiques sont définies dans :

```text
doc/climat/methods/climate-overview/v1/interpretation.md
doc/climat/methods/climate-fingerprint/v4/interpretation.md
doc/climat/methods/thermal-seasons/v1/interpretation.md
doc/climat/methods/water-through-year/v1/interpretation.md
```

En cas de conflit, la règle spécifique de la méthode s'applique tant qu'elle respecte la gouvernance scientifique générale.

## 12. Étape suivante

P4 transformera ces règles en contrats machine :

- `ClimateSignal` ;
- `ClimateCommentary` ;
- références `evidence` ;
- niveaux de preuve ;
- caveats structurés ;
- validation automatique d'un commentaire avant publication.
