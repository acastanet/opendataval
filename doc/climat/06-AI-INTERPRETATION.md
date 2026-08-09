# Interprétation IA de la fiche climat

Statut : **cadre P3 + contrats P4**.

Ce document définit le rôle du futur `climate-commentary-service`. Il ne remplace aucune méthode scientifique et n'autorise aucun calcul climatique dans le modèle de langage.

Les contrats exécutables associés sont dans :

```text
packages/climate-contracts/schemas/climate-signal.schema.json
packages/climate-contracts/schemas/climate-commentary.schema.json
```

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

## 3. Contrat `ClimateSignal`

P4 formalise le signal avec JSON Schema.

Exemple contractuel simplifié :

```json
{
  "schema_version": "1.0",
  "id": "thermal-summer-start-shift:POINT-...",
  "definition_id": "thermal-summer-start-shift",
  "method": {
    "id": "thermal-seasons",
    "version": "1.0.0"
  },
  "metric": "summer_start_shift_days",
  "claim_level": "descriptive",
  "value": -11,
  "unit": "days",
  "direction": "earlier",
  "evidence": [
    {
      "result_pointer": "/data/comparison/summer_start_shift_days"
    }
  ],
  "caveat_ids": [
    "thermal-not-meteorological-season",
    "descriptive-not-trend"
  ]
}
```

### Deux identifiants différents

`id` identifie **l'occurrence de signal produite pour un résultat donné**.

`definition_id` identifie **la sémantique autorisée** dans :

```text
doc/climat/signals/catalogue.yaml
```

Le service IA ne peut pas inventer un `definition_id` absent de ce catalogue.

## 4. Preuve `evidence`

Chaque signal contient au moins une preuve :

```text
evidence[].result_pointer
```

Ce pointeur vise une donnée de `ClimateResult`.

Exemple :

```text
/data/comparison/summer_start_shift_days
```

JSON Schema contrôle la présence et la forme du pointeur.

Le validateur applicatif P5/P6 devra contrôler qu'il se résout réellement dans le résultat fourni.

## 5. Niveaux de preuve

### `descriptive`

Comparaison déterministe entre périodes ou position dans une distribution de référence.

Autorise :

> « La période 2016–2025 présente une valeur plus élevée que 1996–2005. »

N'autorise pas :

> « La variable augmente durablement. »

### `statistical_trend`

Réservé à une future méthode comportant explicitement un test de tendance, son niveau de confiance et ses hypothèses.

Aucune des quatre méthodes actuelles n'émet ce niveau.

### `causal_attribution`

Réservé à une méthode d'attribution dédiée.

Aucune des quatre méthodes actuelles n'émet ce niveau.

## 6. Contrat `ClimateCommentary`

Le commentaire n'est pas une chaîne libre publiée directement.

Il possède notamment :

```text
summary
findings[]
caveats[]
abstentions[]
generation
validation
```

Chaque finding possède obligatoirement :

```text
id
text
signal_ids[]
claim_level
```

Le schéma interdit donc un finding sans `signal_id`.

## 7. Règle d'ancrage

Chaque `finding` doit être retraçable :

```text
phrase
  ↓
signal_id
  ↓
ClimateSignal.id
  ↓
evidence.result_pointer
  ↓
ClimateResult
  ↓
method.id + method.version
```

Aucun chiffre nouveau ne peut apparaître uniquement dans la réponse du LLM.

## 8. Validation applicative

JSON Schema ne peut pas vérifier seul les relations entre plusieurs documents.

Le validateur devra donc contrôler notamment :

- chaque `signal_id` existe réellement dans les `ClimateResult` fournis ;
- chaque JSON Pointer `evidence` se résout ;
- `ClimateSignal.method` correspond à la méthode du résultat ;
- `definition_id`, unité et direction respectent le catalogue P3 ;
- le `claim_level` du finding ne dépasse pas celui des signaux ;
- un commentaire marqué `valid` ne contient aucun claim non supporté.

Ces invariants sont détaillés dans `03-COMMON-CONTRACT.md` et `packages/climate-contracts/README.md`.

## 9. Vocabulaire commun

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

## 10. Représentativité spatiale

Si `local_measurement=false`, le commentaire doit parler de **contexte climatique du lieu** ou de **maille de réanalyse associée**.

Lorsqu'une zone est plus petite que la maille utilisée, le commentaire ne doit pas reprendre sa taille comme résolution climatique.

Lorsque plusieurs mailles sont agrégées, l'IA peut expliquer que le résultat représente une moyenne spatiale pondérée si cette information est fournie par `ClimateResult`.

## 11. Données insuffisantes

L'IA doit s'abstenir d'interpréter un signal lorsque :

- le service scientifique ne l'a pas émis ;
- le statut qualité est insuffisant ;
- la valeur est `null` ;
- la référence est incomplète selon la méthode ;
- la comparaison ne satisfait pas le nombre minimum d'années valides ;
- la méthode marque l'indicateur `not_applicable`.

Le commentaire peut alors expliquer uniquement qu'une interprétation fiable n'est pas disponible pour cet indicateur.

## 12. Hiérarchie éditoriale

Pour une infographie, le commentaire recommandé comporte au maximum :

1. un constat principal ;
2. deux ou trois constats secondaires ;
3. un caveat de représentativité ou de méthode si nécessaire.

Le commentaire doit privilégier les signaux les plus informatifs et éviter d'énumérer toutes les valeurs du graphique.

## 13. Synthèse de la fiche complète

Le commentaire transversal de la fiche ne recevra pas les séries brutes. Il recevra les `ClimateSignal` validés des quatre méthodes.

Il pourra rapprocher deux signaux, par exemple un réchauffement descriptif et un déplacement des saisons thermiques, mais il ne pourra pas transformer leur coïncidence en causalité.

## 14. Fichiers normatifs

Règles spécifiques :

```text
doc/climat/methods/climate-overview/v1/interpretation.md
doc/climat/methods/climate-fingerprint/v4/interpretation.md
doc/climat/methods/thermal-seasons/v1/interpretation.md
doc/climat/methods/water-through-year/v1/interpretation.md
```

Registre sémantique :

```text
doc/climat/signals/catalogue.yaml
```

Contrats :

```text
packages/climate-contracts/schemas/climate-signal.schema.json
packages/climate-contracts/schemas/climate-commentary.schema.json
```

En cas de conflit, la méthode spécifique doit respecter la gouvernance scientifique générale et les contrats communs.

## 15. Étape suivante

**P5** doit confronter ces contrats aux sorties réelles des quatre POC :

- créer les golden masters ;
- adapter les sorties POC vers `ClimateResult` ;
- générer les `ClimateSignal` correspondants ;
- valider les schémas ;
- tester les JSON Pointer ;
- vérifier que les commentaires d'exemple restent entièrement ancrés dans les signaux.
