# P9 — Audit de cohérence scientifique avant publication

Date : 2026-08-10  
Statut : **audit implémenté ; un replay réel de sensibilité des saisons reste requis avant gel final**.

## Périmètre

Cet audit traite trois alertes apparues lors de la lecture croisée des quatre infographies :

1. écart `-5 %` / `-9,2 %` sur les précipitations ;
2. lecture `18 j plus tôt + 15 j plus tard` versus `+29 j` de durée d'été thermique ;
3. baisse de médianes mensuelles SPEI-3 alors que le nombre de mois sous `-1` diminue.

Aucun de ces contrôles ne doit être résolu par le renderer ou par le LLM.

## 1. Précipitations — cause reproduite

Le golden master `climate-fingerprint@4.0.0` fournit les cumuls annuels 1996–2025.

Sur exactement ces valeurs :

- moyenne 1996–2005 : `1375,937 mm` ;
- moyenne 2016–2025 : `1307,129 mm` ;
- écart relatif des moyennes : `-5,0008 %` ;
- médiane 1996–2005 : `1330,51 mm` ;
- médiane 2016–2025 : `1207,75 mm` ;
- écart relatif des médianes : `-9,2265 %`.

Le résultat eau publié (`-9,19 %`) est donc cohérent avec une comparaison de **médianes**, tandis que l'empreinte (`-5 %`) compare des **moyennes**. L'écart n'est pas un facteur quatre d'unité : il est reproduit par le choix de statistique décennale.

Le code `water-through-year` applique par ailleurs explicitement la sémantique ERA5-Land `moda` documentée dans `method.yaml` : accumulation moyenne journalière mensuelle convertie en cumul mensuel par `value × 1000 × days_in_month`.

### Décision P9

- conserver la comparaison médiane dans la méthode eau V1, car elle est documentée et utile comme statistique robuste ;
- **ne pas la présenter comme le même indicateur public que la comparaison de l'empreinte** ;
- pour la synthèse transversale de la fiche, la comparaison publique des précipitations est celle de `fingerprint-precipitation-decadal-change`, calculée sur les moyennes décennales ;
- toute utilisation du `-9,2 %` doit préciser explicitement « médiane des cumuls annuels ».

Le test `test_p9_precipitation_coherence.py` verrouille la cause de l'écart afin qu'une future divergence ne soit pas diagnostiquée à tort comme une erreur d'unité.

## 2. Durée de l'été thermique — pas d'incohérence arithmétique

Dans `thermal-seasons@1.0.0` :

- chaque frontière annuelle est calculée sur l'année concernée ;
- `summer_length_days = autumn_start - summer_start` est calculé **année par année** ;
- les frontières décennales affichées sont ensuite des médianes de dates ;
- le changement de durée est une différence entre médianes des durées annuelles.

Il n'existe donc pas d'identité imposant :

```text
écart de durée = écart médian de fin - écart médian de début
```

`18 + 15 = 33` et `+29 j` peuvent coexister sans erreur de calcul.

### Décision P9

La publication doit porter une mention courte :

> **Durées calculées année par année.**

Les zones P25–P75 restent visibles comme dispersion interannuelle des frontières.

## 3. SPEI-3 — signe et seuil vérifiés

La méthode eau définit un mois sec par :

```text
SPEI-3 < -1,0
```

Puis, pour chaque année complète :

```text
nombre de mois satisfaisant le seuil
```

La comparaison est :

```text
médiane 2016–2025 - médiane 1996–2005
```

Une valeur négative signifie donc correctement **moins de mois sous le seuil** dans la décennie récente.

Une baisse de la médiane SPEI-3 de plusieurs mois du calendrier n'implique pas mathématiquement une hausse du nombre de franchissements sous `-1`. La fréquence de seuil dépend de toute la distribution annuelle, pas seulement des médianes mensuelles.

Le test `test_p9_spei_semantics.py` construit explicitement un cas où dix médianes mensuelles sur douze baissent alors que la fréquence annuelle passe de deux à un mois sous `-1`. Le service doit alors émettre `dry_months_change = -1` et `direction = less_frequent`.

### Décision P9

- aucun problème de signe n'est démontré dans l'implémentation ;
- ne pas résumer le profil SPEI par la moyenne des douze écarts de médianes ;
- pour la fiche grand public, le SPEI reste un indicateur technique tant que la hiérarchie finale des indicateurs de sécheresse n'est pas arrêtée ;
- le commentaire IA ne doit jamais transformer une baisse de médiane SPEI en affirmation automatique de hausse de la fréquence des mois secs.

## 4. Sensibilité du lissage des saisons

La V1 utilise un polynôme de degré 3. P9 ajoute, **sans modifier la méthode canonique**, deux lissages d'audit :

- ajustement harmonique circulaire à deux harmoniques ;
- moyenne mobile circulaire centrée de 31 jours.

Le module `climate_seasons_service.sensitivity` compare les quatre frontières T25/T75 avec :

```text
polynomial_degree_3
harmonic_2
moving_average_31d
```

Le script :

```bash
python apps/climate-seasons-service/scripts/audit_smoothing_sensitivity.py \
  /chemin/vers/climate-snapshot.json \
  --output smoothing-sensitivity.json
```

utilise le snapshot réel et son hash ; il ne télécharge aucune donnée.

### Barème P9

- écart maximal `<= 3 jours` : méthode V1 considérée robuste au choix de lissage ;
- écart `> 3 et <= 10 jours` : revue scientifique + caveat avant publication ;
- écart `> 10 jours` : sensibilité majeure, ne pas publier le signal de déplacement sans révision de méthode (`thermal-seasons@2.x`).

La CI vérifie sur un cycle saisonnier contrôlé que les trois lissages restent à moins de trois jours. Le snapshot Copernicus réel n'étant pas versionné dans Git, le replay réel doit être exécuté sur l'actif P6 avant gel final.

## 5. Statut de sortie P9

| Contrôle | Résultat | Publication |
| --- | --- | --- |
| Précipitations | cause identifiée : moyenne vs médiane | moyenne = signal transversal public ; médiane eau = libellé explicite/technique |
| Durée saisons | calcul cohérent année par année | publiable avec mention méthodologique courte |
| SPEI | seuil et signe cohérents | technique ; pas de conclusion automatique à partir des médianes |
| Lissage saisons | outil et seuils d'audit ajoutés | **replay réel requis avant gel final** |

## 6. Ce que P9 ne change pas

P9 ne modifie pas :

- les `ClimateResult` validés ;
- les seuils T25/T75 ;
- le calcul SPEI-3 ;
- la méthode de conversion ERA5-Land ;
- le niveau de preuve `descriptive` ;
- les renderers, sauf corrections éditoriales explicitement décidées dans une tranche ultérieure.
