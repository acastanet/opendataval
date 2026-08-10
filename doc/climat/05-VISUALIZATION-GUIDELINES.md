# Principes de visualisation — fiche climat

## Objectif

La fiche climat doit donner, en **quelques minutes**, une idée claire :

1. du climat habituel d’un lieu ;
2. des principaux changements observés.

Les infographies servent d’abord à comprendre. Les détails scientifiques restent dans `science.md`, `technical.md` et `interpretation.md`.

## Règles communes

1. **Une infographie = une idée principale.**
2. **Une unité sémantique importante = une unité visuelle identifiable.** Les bandes blanches servent à séparer des phénomènes différents.
3. **Lecture visuelle avant lecture du texte.** Titres courts, peu de chiffres, annotations brèves.
4. **Ne pas amplifier un changement faible.** Un chevauchement important ou une stabilité sont aussi des résultats à montrer.
5. **Réduire le calcul mental.** Si deux profils sont proches, montrer directement leur écart peut être plus utile que les dupliquer.
6. **La couleur ne porte jamais seule le sens.** Utiliser aussi position, type de trait, libellé ou forme.
7. **Légende locale quand nécessaire.** Le lecteur doit identifier immédiatement une ligne ou une zone importante.
8. **Montrer la dispersion sans la laisser dominer.** Médiane ou signal principal d’abord ; P25–P75 en second plan.
9. **Limiter la synthèse.** 1 à 3 chiffres clés maximum par infographie.
10. **Le renderer ne crée pas de science.** Il met en forme les valeurs déjà présentes dans `ClimateResult` et ne produit aucune nouvelle conclusion.

## Hiérarchie de lecture

```text
question
↓
phénomène principal
↓
cycle ou structure
↓
comparaison
↓
écart notable
↓
méthode / provenance
```

## Comparer deux périodes

Trois cas :

- **écart net** : comparaison directe possible ;
- **profils proches avec écarts localisés** : conserver le profil principal et montrer l’écart séparément ;
- **quasi-stabilité** : laisser le chevauchement visible, sans chercher à créer artificiellement une différence.

## Rôle de `visualization.md`

Pour chaque méthode :

```text
science.md         → ce qui est scientifiquement fondé
technical.md       → comment c’est calculé
interpretation.md  → ce qu’on peut affirmer
visualization.md   → comment le résultat doit être montré
renderer           → exécute cette conception
```

Toute modification importante d’un renderer doit rester cohérente avec son `visualization.md`.
