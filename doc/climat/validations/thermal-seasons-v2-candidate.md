# Validation candidate — thermal-seasons@2.0.0

Date : 2026-08-10  
Statut : **candidat implémenté ; replay réel requis avant validation scientifique**.

## Origine

L'audit P9 a montré que `thermal-seasons@1.0.0` est reproductible mais sensible à son lissage polynomial de degré 3. Sur un cycle annuel synthétique propre, l'écart maximal entre ce polynôme et les deux lissages circulaires dépasse 10 jours, tandis que les deux lissages circulaires restent proches.

Cette observation interdit de corriger silencieusement la V1. La V2 est donc une méthode MAJOR séparée.

## Candidat V2

Lissage canonique :

```text
harmonic_2
```

soit une constante, une composante annuelle et une composante semi-annuelle ajustées par moindres carrés.

Contrôle indépendant :

```text
circular_moving_average_31d
```

Les T25/T75, périodes, agrégation quotidienne UTC et règles de complétude de base restent inchangés afin d'isoler l'effet du changement de lissage.

## QA nouvelle

### Ajustement annuel

Pour 1991–2020, la méthode calcule les trente RMSE annuels du modèle harmonique. Le seuil est leur P95.

Une année d'étude au-dessus de ce seuil :

```text
status = partial
```

et n'entre pas dans les médianes décennales.

### Sensibilité au lissage

Pour chaque année :

```text
max |frontière harmonic_2 - frontière moving_average_31d|
```

Règles :

```text
<= 3 j       ok
>3 et <=10 j partial
>10 j        rejected
```

### N+1

Le printemps N+1 n'alimente la durée d'hiver N que si l'évaluation canonique N+1 est elle-même `ok`. Sinon `winter_length_days` reste `null`, sans invalider les autres frontières de N.

## Tests CI attendus

- cycle saisonnier propre : 30 années `ok`, contrôle circulaire <3 jours ;
- année artificiellement mal ajustée : passage en `partial` via RMSE et exclusion de la comparaison ;
- année N+1 invalide : absence de durée d'hiver N ;
- cinq signaux V2 et conformité au contrat `ClimateResult`.

## Replay réel obligatoire

Commande :

```bash
python apps/climate-seasons-service/scripts/compare_v1_v2_replay.py \
  /chemin/vers/climate-snapshot.json \
  --output-dir /chemin/vers/replay-v2
```

Sorties :

```text
thermal-seasons-v1-replay.json
thermal-seasons-v2-candidate.json
thermal-seasons-v1-v2-comparison.json
```

Le troisième fichier doit être revu avant toute décision de publication.

## Gate avant `validated`

La V2 ne peut passer à `validated` que si :

1. la CI candidate est verte ;
2. le replay utilise exactement le même snapshot que la validation P6 V1 ;
3. les distributions des 30 RMSE et des 30 écarts de lissage sont inspectées ;
4. chaque année `partial/rejected` est expliquée ;
5. 1996–2005 et 2016–2025 conservent chacune au moins 8 années `ok` ;
6. les cinq différences V1/V2 sont examinées scientifiquement ;
7. une décision explicite accepte ou révise les seuils QA ;
8. le renderer et le commentaire IA ne basculent vers V2 qu'après cette décision.

## Publication

**Interdite à ce stade.** La V1 reste la version historique reproductible ; les signaux V1 restent exclus du commentaire IA transversal par P9 tant que la V2 n'est pas validée.
