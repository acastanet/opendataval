# P9 — Audit de cohérence scientifique avant publication

Date : 2026-08-10  
Statut : **audit implémenté ; correctifs séparés par niveau de versionnement**.

## Périmètre

Cet audit traite les incohérences et fragilités apparues lors de la lecture croisée des quatre méthodes, de leurs golden masters et de leurs renderers. Il ne modifie pas silencieusement les méthodes validées.

## 1. Précipitations — cause reproduite

Le golden master `climate-fingerprint@4.0.0` fournit les cumuls annuels 1996–2025. Sur exactement ces valeurs :

- moyenne 1996–2005 : `1375,937 mm` ;
- moyenne 2016–2025 : `1307,129 mm` ;
- écart relatif des moyennes : `-5,0008 %` ;
- médiane 1996–2005 : `1330,51 mm` ;
- médiane 2016–2025 : `1207,75 mm` ;
- écart relatif des médianes : `-9,2265 %`.

Le `-5 %` de l'empreinte et le `-9,19 %` du module eau sont donc deux statistiques exactes appliquées aux mêmes données : **moyenne décennale** contre **médiane décennale**. L'écart n'est pas une erreur d'unité.

Le code `water-through-year` applique explicitement la sémantique ERA5-Land `moda` documentée dans `method.yaml` : accumulation moyenne journalière mensuelle convertie en cumul mensuel par `value × 1000 × days_in_month`.

### Défaut de contrat

`03-COMMON-CONTRACT.md` n'impose actuellement ni statistique décennale commune, ni champ explicite décrivant cette statistique dans `ClimateSignal`.

Décision P9 : **ne pas forcer rétroactivement une statistique unique dans les méthodes validées**. Le contrat commun doit rendre la statistique explicite (`mean`, `median`, etc.) pour toute comparaison de période. Un changement de statistique qui modifie une valeur publiée doit être versionné comme changement scientifique.

### Second écart interne au panneau eau

La somme des douze différences de médianes mensuelles n'est pas égale à la différence des médianes de sommes annuelles :

```text
sum(median_late_month - median_early_month)
!=
median(sum_late_year) - median(sum_early_year)
```

Le lecteur ne doit donc pas pouvoir interpréter la bande mensuelle comme une décomposition additive de l'encart annuel. La restitution doit soit expliciter cette non-additivité, soit utiliser une statistique additive cohérente avec l'encart.

Le test `test_p9_precipitation_coherence.py` verrouille la cause moyenne/médiane afin qu'une future divergence ne soit pas diagnostiquée à tort comme une erreur d'unité.

## 2. Durée de l'été thermique — calcul cohérent, libellé incomplet

Dans `thermal-seasons@1.0.0` :

- chaque frontière annuelle est calculée sur l'année concernée ;
- `summer_length_days = autumn_start - summer_start` est calculé année par année ;
- les frontières décennales affichées sont des médianes de dates ;
- le changement de durée est une différence entre médianes des durées annuelles.

Il n'existe donc pas d'identité imposant :

```text
écart de durée = écart médian de fin - écart médian de début
```

`18 + 15 = 33` et `+29 j` peuvent coexister sans erreur de calcul.

Décision P9 : la publication doit porter la mention **« Durées calculées année par année. »**

## 3. SPEI-3 — signe correct, résolution insuffisante pour un message fort

La méthode eau définit un mois sec par `SPEI-3 < -1,0`, compte les mois par année complète, puis compare les médianes des dix comptes annuels.

Une valeur négative de `dry_months_change` signifie correctement moins de mois sous le seuil dans la décennie récente. Une baisse de médianes SPEI mensuelles n'implique pas mathématiquement davantage de franchissements sous `-1`.

Le test `test_p9_spei_semantics.py` verrouille ce point.

### Fragilité statistique

Le signal public reste toutefois fragile : chaque compte annuel est entier et la médiane de dix valeurs évolue par pas de `0,5`. Une modification de quelques années autour du centre de distribution peut déplacer le résultat d'un mois entier.

Décision P9 : avant de publier `1,0 mois de moins/an` comme message principal, afficher et auditer la distribution des dix comptes annuels de chaque décennie. Jusqu'à cette vérification, SPEI reste un indicateur technique et non un constat principal du commentaire IA.

## 4. Sensibilité du lissage des saisons

La V1 utilise un polynôme de degré 3. P9 ajoute, sans modifier la méthode canonique, deux lissages d'audit :

- ajustement harmonique circulaire à deux harmoniques ;
- moyenne mobile circulaire centrée de 31 jours.

Le module `climate_seasons_service.sensitivity` compare :

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

Barème d'audit :

- écart maximal `<= 3 jours` : robuste ;
- `> 3 et <= 10 jours` : revue scientifique + caveat ;
- `> 10 jours` : sensibilité majeure, révision de méthode avant publication.

La CI contrôle les trois lissages sur un cycle saisonnier synthétique. Le replay Copernicus réel reste requis avant gel final.

## 5. Fragilités de code confirmées

### 5.1 Rang des ex aequo

`climate-fingerprint-service._rank` utilise `ordered.index(value) + 1`. Plusieurs valeurs identiques reçoivent donc le même rang de compétition et certains rangs disparaissent sans que cette convention soit documentée.

Décision : définir explicitement une règle d'ex aequo et la tester. Une correction purement technique ne doit pas modifier les métriques scientifiques elles-mêmes.

### 5.2 `fit_rmse_c` non utilisé par la QA

Le RMSE du lissage thermique est calculé et sérialisé mais `qa_annual` ne le reçoit pas. Une année mal ajustée peut être marquée `ok`.

Décision : ajouter une règle QA versionnée fondée sur un seuil documenté et exposer la distribution des RMSE. Comme cette règle peut rendre des années auparavant valides partielles/invalides et modifier les comparaisons, elle ne doit pas être introduite comme simple PATCH scientifique.

### 5.3 Franchissements N+1 non validés

La durée d'hiver d'une année dépend du printemps de N+1. Les franchissements N+1 sont actuellement calculés sans passer par `qa_annual` avant utilisation.

Décision : aucune durée dépendante d'une frontière N+1 ne doit utiliser une frontière que sa propre QA aurait rejetée. Ce changement peut affecter les valeurs de référence et doit être testé avant choix du niveau de version.

### 5.4 Pseudo-σ calculé dans le renderer fingerprint

Le renderer calcule une position robuste à partir de P10/P50/P90 puis affiche une légende `−3 σ / +3 σ`. Aucun σ n'est produit par la méthode scientifique. Le renderer crée donc une normalisation quantitative non présente dans `ClimateResult`, en contradiction avec `04-SCIENTIFIC-GOVERNANCE.md §14`.

Décision : supprimer cette normalisation du renderer V4 avant publication. Une nouvelle coloration fondée sur une métrique scientifique explicite devra être calculée par une méthode versionnée ou documentée comme transformation visuelle strictement déterminée à partir d'une valeur déjà fournie, sans nouvelle sémantique scientifique.

### 5.5 Saturation des percentiles

Le percentile empirique plafonne à `100` au-delà du maximum de référence et la classe supérieure regroupe tout ce qui dépasse P90. Plusieurs années chaudes récentes deviennent visuellement indiscernables.

Décision : garder le percentile comme information de rang, mais ne pas l'utiliser seul pour représenter l'intensité au-delà de la référence. Un changement de classification scientifique est MAJOR ; un changement de rendu doit rester traçable et ne pas recalculer de normalisation dans le renderer.

### 5.6 Formatage éditorial dans le calcul fingerprint

`_comparison` sérialise actuellement `display` et `qualifier`. Ces chaînes mélangent résultat scientifique et restitution éditoriale.

Décision : le payload scientifique doit conserver les nombres et, si nécessaire, des identifiants symboliques (`qualifier_id`). La chaîne localisée et le séparateur décimal relèvent du render kit.

### 5.7 Sélection éditoriale d'événements dans le calcul

`_selected_events` limite à huit événements et deux par famille. Ce quota est éditorial.

Décision : la couche scientifique doit produire les candidats calculés avec leur sévérité ; une couche de sélection distincte choisit ce qui est affiché. Si le golden master scientifique change, versionner explicitement la méthode ou le format de sortie selon l'impact.

### 5.8 `climate-overview` et résultats partiels

Le calcul overview lève une exception dès qu'un mois de référence n'a pas 30 valeurs, tandis que la gouvernance commune prévoit des statuts de qualité partiels. Il ne peut donc pas représenter une référence partiellement exploitable.

Décision : définir une vraie politique `partial/insufficient` avant gel final, avec règle de complétude documentée.

### 5.9 Politiques de complétude non harmonisées

Les méthodes utilisent des règles différentes (90 % journalier, 12 mois complets, 30 années mensuelles, etc.). Ces règles peuvent rester spécifiques, mais `ClimateResult.quality` doit exposer sans ambiguïté la politique appliquée.

### 5.10 Provenance et représentativité fingerprint

Le cœur `compute_fingerprint_data` ne reçoit ni point de grille, ni version de dataset, ni dates de récupération/génération. L'enveloppe `ClimateResult` doit garantir que ces métadonnées viennent du `ClimateSnapshot`, pas d'une valeur fabriquée par l'adaptateur.

### 5.11 Journée UTC

L'agrégation journalière est cohérente en UTC. Pour la France, les maxima proches de minuit peuvent différer d'une journée civile locale. Décision : conserver UTC pour la reproductibilité V1, mais ajouter un caveat explicite aux métriques quotidiennes sensibles.

### 5.12 Vent

L'ordre des opérations est correct : norme `sqrt(u²+v²)` au pas horaire, puis maximum journalier, puis seuil P98 de référence. La grandeur n'est toutefois pas une rafale.

Décision : libellé public **« Vent fort — vitesse horaire ERA5-Land »** ou formulation équivalente, jamais « rafale » ou « tempête ».

### 5.13 Multi-cellules overview

La V1 implémentée sérialise une seule cellule de poids `1.0` tout en annonçant `spatial_weighting: area_weighted`. La documentation générale ne doit pas laisser entendre qu'une vraie agrégation Polygon/MultiPolygon est déjà exécutée par ce chemin de code.

## 6. Versionnement décidé

Les corrections sont séparées :

1. **P9 audit** : tests, preuves et documentation uniquement ; aucune valeur scientifique modifiée.
2. **PATCH de restitution/structure** : libellés, suppression de pseudo-σ dans le renderer, formatage localisé hors calcul lorsque cela ne change pas les valeurs scientifiques.
3. **Évolution de contrat compatible** : exposer explicitement la statistique de comparaison et les politiques de complétude dans les métadonnées communes.
4. **MAJOR scientifique** : tout changement de statistique décennale, de classification, de QA RMSE ou de règle susceptible de modifier les valeurs validées/golden masters.

Les étapes 2 à 4 doivent être réalisées dans des PR distinctes.

## 7. Statut de sortie P9

| Contrôle | Résultat | Décision |
| --- | --- | --- |
| Précipitations | moyenne vs médiane reproduit exactement l'écart | défaut de contrat ; ne pas unifier silencieusement |
| Bande eau vs encart annuel | non-additivité des médianes | note/encodage à corriger avant publication |
| Durée saisons | calcul cohérent année par année | ajouter la mention explicative |
| SPEI | signe correct, résolution grossière | distribution décennale à auditer avant message principal |
| Lissage saisons | outil d'audit ajouté | replay réel requis |
| Rang fingerprint | convention d'ex aequo implicite | corriger/documenter |
| QA saisons | RMSE et N+1 insuffisamment branchés | évolution scientifique séparée |
| Renderer fingerprint | normalisation pseudo-σ confirmée | correction bloquante avant publication |
| Overview partial | état partiel non représentable | politique de qualité à définir |
| Provenance fingerprint | dépend trop de l'adaptateur | compléter avant gel final |

## 8. Ce que P9 ne change pas

P9 ne modifie pas les `ClimateResult` validés, les golden masters, les seuils T25/T75, le calcul SPEI-3, la conversion ERA5-Land ou le niveau de preuve `descriptive`. Il transforme les alertes en contrôles et en décisions versionnées.
