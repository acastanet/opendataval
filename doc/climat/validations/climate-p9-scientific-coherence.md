# P9 — Audit de cohérence scientifique avant publication

Date : 2026-08-10  
Statut : **audit exécuté ; corrections séparées par version ; thermal-seasons V1 non gelable en l'état**.

## 1. Précipitations : moyenne et médiane, pas bug d'unité

Sur les mêmes cumuls annuels du golden master `climate-fingerprint@4.0.0` :

| statistique | 1996–2005 | 2016–2025 | écart |
| --- | ---: | ---: | ---: |
| moyenne | 1375,9 mm | 1307,1 mm | −5,0 % |
| médiane | 1330,5 mm | 1207,8 mm | −9,2 % |

Le `−5 %` de l'empreinte et le `−9,19 %` du module eau sont donc exacts mais ne portent pas la même statistique décennale. Le test `test_p9_precipitation_coherence.py` reproduit cette différence.

La conversion ERA5-Land `moda` du module eau reste conforme à sa méthode : `value × 1000 × days_in_month`.

### Décision

`03-COMMON-CONTRACT.md` doit rendre explicite la statistique de toute comparaison de période (`mean`, `median`, etc.). Changer une statistique qui modifie une valeur publiée est un changement scientifique versionné ; il est interdit d'unifier silencieusement les deux valeurs.

### Non-additivité du panneau eau

La bande mensuelle montre :

```text
median_late_month - median_early_month
```

alors que l'encart annuel montre :

```text
median(annual_sum_late) - median(annual_sum_early)
```

Donc :

```text
sum(monthly_median_differences) != difference_of_annual_medians
```

Le renderer doit l'expliciter ou utiliser une statistique additive cohérente.

## 2. Saisons : durée cohérente, mais lissage V1 fragile

La différence `18 j plus tôt + 15 j plus tard` versus `+29 j` n'est pas une erreur : les durées sont calculées année par année puis résumées par médiane. La publication doit préciser : **« Durées calculées année par année. »**

### Test de sensibilité P9

P9 compare trois lissages sur les mêmes seuils T25/T75 :

```text
polynomial_degree_3   # méthode V1
harmonic_2            # audit circulaire
moving_average_31d    # audit circulaire
```

Sur un cycle saisonnier sinusoïdal propre, sans bruit :

- les deux lissages circulaires restent à moins de 3 jours l'un de l'autre ;
- le polynôme de degré 3 produit un écart maximal d'environ **24,2 jours**.

Le test ne doit donc pas attendre que les trois méthodes coïncident : il verrouille au contraire cette sensibilité structurelle.

### Décision

Le replay Copernicus réel reste nécessaire pour quantifier l'effet sur le lieu de validation, mais **thermal-seasons@1.0.0 ne peut plus être considéré robuste au choix de lissage sur la seule base du golden replay**. Si le replay réel confirme un écart matériel, la correction appartient à `thermal-seasons@2.x`.

Le script d'audit est :

```bash
python apps/climate-seasons-service/scripts/audit_smoothing_sensitivity.py \
  /chemin/vers/climate-snapshot.json \
  --output smoothing-sensitivity.json
```

## 3. SPEI-3 : signe correct, résolution trop grossière pour un message principal

Le service compte par année les mois `SPEI-3 < -1`, puis compare les médianes des dix comptes annuels. Une valeur négative signifie correctement moins de mois sous le seuil.

Le test `test_p9_spei_semantics.py` montre qu'une baisse des médianes mensuelles peut coexister avec moins de franchissements sous `-1`.

Cependant les comptes annuels sont entiers et la médiane de dix valeurs évolue par pas de `0,5`. Quelques années autour du centre de la distribution peuvent déplacer le résultat d'un mois entier.

### Décision

Avant de publier `1,0 mois de moins/an`, examiner les dix comptes de chaque décennie. Jusqu'alors, SPEI reste une lecture technique et ne doit pas être un constat principal du commentaire IA.

## 4. Fragilités de code confirmées

### Fingerprint

- `_rank` utilise `ordered.index(value) + 1` : politique d'ex aequo implicite ; définir et tester une convention.
- `_comparison` sérialise `display` et `qualifier` : formatage éditorial dans la couche scientifique ; conserver les nombres et des identifiants symboliques seulement.
- `_selected_events` limite à huit événements et deux par famille : quota éditorial dans la couche scientifique ; émettre les candidats, sélectionner ailleurs.
- le renderer calcule une pseudo-normalisation à partir de P10/P50/P90 puis affiche `−3 σ / +3 σ` sans σ scientifique : violation de `04-SCIENTIFIC-GOVERNANCE.md §14`.
- le percentile plafonne à P100 et la classe >P90 sature : garder le percentile comme rang, mais ne pas l'utiliser seul pour représenter l'intensité hors référence.
- le vent est calculé dans le bon ordre (`sqrt(u²+v²)` horaire → maximum journalier → P98) mais n'est pas une rafale ; libellé public : **vent horaire ERA5-Land**.
- l'agrégation journalière UTC est reproductible mais peut décaler les événements proches de minuit par rapport au jour civil français ; caveat requis.
- provenance et représentativité doivent provenir du `ClimateSnapshot`, pas être reconstituées arbitrairement par l'adaptateur.

### Thermal seasons

- `fit_rmse_c` est calculé mais n'entre pas dans `qa_annual` ; une règle RMSE qui invalide des années peut modifier les résultats et doit être versionnée scientifiquement.
- les franchissements N+1 utilisés pour certaines durées ne passent pas leur propre QA avant emploi ; tester l'impact avant classement de version.

### Climate overview

- une référence mensuelle différente de 30/30 lève une exception : aucun vrai chemin `partial` ; définir `partial/insufficient` avant gel final.
- les politiques de complétude diffèrent entre méthodes ; elles peuvent rester spécifiques mais doivent être exposées explicitement dans `ClimateResult.quality`.
- la V1 sérialise une seule cellule de poids 1,0 tout en annonçant `area_weighted` ; ne pas promettre Polygon/MultiPolygon tant que l'agrégation multi-cellules n'est pas effectivement exécutée.

## 5. Versionnement décidé

Les changements doivent rester dans des PR distinctes :

1. **P9 audit** — tests et preuves uniquement ; aucun golden master modifié.
2. **PATCH restitution** — libellés, séparateurs français, suppression du pseudo-σ, clarification eau/saisons ; aucune valeur scientifique modifiée.
3. **Évolution compatible de contrat** — statistique de comparaison et politique de complétude explicites dans les métadonnées communes.
4. **MAJOR scientifique** — changement de statistique, de classification, de lissage ou de QA susceptible de modifier les valeurs validées.
5. **Refactor scientifique/éditorial séparé** — retrait de `display`, `qualifier` et de la sélection éditoriale d'événements hors du calcul, avec vérification de l'impact sur les golden masters.

## 6. Statut avant phase finale

| Contrôle | Résultat | Statut |
| --- | --- | --- |
| pluie −5 / −9,2 | moyenne vs médiane démontré | contrat à expliciter |
| pluie mensuelle / annuelle | non-additivité démontrée | renderer à clarifier |
| durée été | calcul cohérent année par année | renderer à clarifier |
| SPEI | signe correct, faible résolution | ne pas mettre en avant |
| lissage saisons | ~24,2 j sur cycle propre | **bloquant scientifique** |
| pseudo-σ fingerprint | calculé dans renderer | **bloquant restitution** |
| rank ex aequo | convention implicite | correction/documentation |
| QA RMSE / N+1 | insuffisante | évolution scientifique séparée |
| overview partial | non représentable | contrat qualité à compléter |
| provenance fingerprint | dépend de l'adaptateur | à compléter avant gel |

P9 ne modifie pas les valeurs de référence. Il transforme les alertes en preuves et fixe les frontières entre PATCH, contrat compatible et MAJOR scientifique.
