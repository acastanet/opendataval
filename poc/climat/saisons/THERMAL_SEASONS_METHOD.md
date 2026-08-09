# Méthode — Saisons thermiques locales « Les saisons se déplacent » (V1)

Document technique associé à `thermal-seasons.json`, `thermal-seasons.svg` et
`thermal-seasons-preview.html`. Il décrit exactement ce qui a été calculé, avec
quelles données, et quelles limites conserver.

## 1. Objectif

Répondre à la question : **le rythme thermique annuel du lieu s'est-il déplacé
entre 1996–2005 et 2016–2025, et de combien de jours ?**

On représente des **saisons thermiques locales** (T25/T75), et non les saisons
calendaires fixes (DJF/MAM/JJA/SON), ni astronomiques, ni phénologiques.

## 2. Source : ERA5-Land

- Jeu de données : `reanalysis-era5-land-timeseries` (Climate Data Store).
- Variable : `2m_temperature` (température de l'air à 2 m).
- Résolution de grille : **0,1° × 0,1°** ; résolution native ~9 km.
- Temporel : horaire. Unité source : K ; convertie en °C (`T_°C = T_K − 273,15`).
- Point de grille associé au lieu (Valleraugue) : **44,1°N, 3,7°E**.

Les données sont des **réanalyses sur grille** : elles décrivent le *contexte
climatique du lieu*, pas une mesure à l'échelle de la dalle 100 × 100 m.

## 3. Périodes

- **Référence** : 1991-01-01 → 2020-12-31 (définit climatologie, T25, T75).
- **Étude** : 1996 → 2025 (années civiles complètes).
- **Décennies** : EARLY 1996–2005, MIDDLE 2006–2015, LATE 2016–2025.
- Comparaison visuelle principale : EARLY vs LATE.
- Les seuils T25/T75 sont **fixes** sur toute la période 1996–2025 (calculés une
  seule fois sur 1991–2020, jamais recalculés par décennie).

## 4. Température quotidienne (§5)

- `daily_mean = moyenne arithmétique des valeurs horaires du jour (UTC)`.
- Un jour est valide s'il possède **≥ 18 valeurs horaires** sur 24 ; sinon il est
  mis à `NaN`.
- Une année est exploitable si **≥ 98 %** des 365 jours attendus sont valides
  (après retrait du 29 février) ; sinon `status = insufficient_data`.
- Les lacunes de **≤ 2 jours consécutifs** sont interpolées linéairement (signalé
  dans les diagnostics).

## 5. Suppression du 29 février (§6)

Toutes les années sont ramenées à **365 jours** (calendrier *no-leap*). Deux
fonctions uniques et testées assurent la conversion :

- `date_to_noleap_doy(date) -> int` (1..365)
- `noleap_doy_to_month_day(doy) -> "MM-DD"`

## 6. Climatologie de référence et seuils (§7)

- Pour chaque DOY 1..365 : `climatology[doy] = moyenne des températures quotidiennes
  de ce jour sur 1991–2020` (nanmean, tolère ≤2 jours manquants par année).
- `T25 = percentile 25(climatology)`, `T75 = percentile 75(climatology)`.
- Méthode NumPy explicite : `np.percentile(values, q, method="linear")`.
- Pour le lieu (Valleraugue) : **T25 ≈ 4,9 °C**, **T75 ≈ 16,4 °C**.

## 7. Lissage polynomial (§8)

Pour chaque année, ajustement d'un **polynôme de degré 3** sur la séquence
quotidienne (x = 1..365, y = température quotidienne) :

- `coefficients = np.polyfit(x, y, deg=3)`
- `smoothed = np.polyval(coefficients, x)`

Le polynôme sert **uniquement** à repérer les dates de franchissement de seuils.
Le `fit_rmse_c` (°C) est conservé par année à titre de diagnostic.

## 8. Détection des quatre frontières (§9)

Avec `S[d]` = température lissée du jour d :

- `spring_start` = franchissement ascendant de T25  (S[d-1] < T25 ≤ S[d])
- `summer_start` = franchissement ascendant de T75  (S[d-1] < T75 ≤ S[d])
- `autumn_start` = franchissement descendant de T75 (S[d-1] ≥ T75 > S[d])
- `winter_start` = franchissement descendant de T25  (S[d-1] ≥ T25 > S[d])

Ordre obligatoire : `1 ≤ spring_start < summer_start < autumn_start <
winter_start ≤ 365`. Sinon `status = invalid_crossings` (année rejetée).

## 9. Interpolation du crossing (§10)

Entre les deux jours encadrant le seuil :

- `fraction = (T − S[d-1]) / (S[d] − S[d-1])`
- `crossing = (d − 1) + fraction`  (DOY flottant)

Toutes les statistiques décennales utilisent le DOY flottant ; seul l'affichage
arrondit au jour le plus proche.

## 10. Durées annuelles (§11)

Intervalles semi-ouverts :

- `spring_length = summer_start − spring_start`
- `summer_length = autumn_start − summer_start`
- `autumn_length = winter_start − autumn_start`
- `winter_length = (365 − winter_start) + spring_start_année_suivante`
  (null si le printemps suivant n'est pas disponible — non fabriqué).

## 11. Agrégation décennale (§12)

Pour chaque frontière et chaque durée, sur les années valides de la décennie :

- `P25`, `médiane`, `P75` (méthode percentile linéaire).
- La zone P25–P75 représente la **dispersion interannuelle** (≠ intervalle de
  confiance, ≠ incertitude du modèle).

## 12. Comparaison entre les deux décennies principales (§13)

`shift_days = médiane(2016–2025) − médiane(1996–2005)` pour chaque frontière.

- `shift < 0` → plus tôt ; `shift > 0` → plus tard (jamais inversé).

Résultats pour Valleraugue (médianes EARLY → LATE) :

| Frontière      | Déplacement |
|----------------|-------------|
| Printemps      | −1,7 j      |
| Été (début)    | −17,7 j     |
| Automne (début)| +15,3 j     |
| Hiver (début)  | +5,6 j      |

## 13. Durée de l'été thermique (§14)

`summer_length_change = médiane(2016–2025) − médiane(1996–2005)` des durées d'été.

- Indicateur signature : **Été thermique +28,7 jours** (Valleraugue).

## 14. Validation secondaire — saison de croissance > 5 °C (§24)

Contrôle secondaire inspiré de Copernicus (`sis-ecde-climate-indicators`) :

- Début = premier épisode de 5 jours consécutifs avec température moyenne > 5 °C.
- Fin = premier retour durable sous 5 °C (5 jours consécutifs).
- Consigné sous `validation` ; **non affiché** dans le SVG V1.

## 15. QA scientifique (§25)

Par année valide : `spring < summer < autumn < winter` ; `T25 < T75` ; durées > 0.
Une année atypique est conservée tant que l'ordre saisonnier tient ; elle n'est
rejetée que pour données insuffisantes, calcul impossible, ou ordre invalide.

## 16. Limites scientifiques

- **Réanalyse** : pas une station installée sur la dalle.
- **Relief local** (Cévennes) : altitude, exposition, inversions, couvert végétal
  peuvent créer un microclimat différent de la maille ERA5-Land.
- **Saisons T25/T75** : construction analytique climatique, ni astronomique, ni
  météorologique fixe, ni phénologique directe.
- **P25–P75 décennale** : dispersion des années, pas incertitude du modèle.

## 17. Provenance

- Source : ERA5-Land (CDS), `2m_temperature`, grille 0,1°, native ~9 km.
- Pipeline réutilisé : `poc/climat/empreinte-climatique` (téléchargement et lecture
  CSV), conformément à la contrainte de réutilisation (§3.3).
- Aucune requête CDS n'est émise au chargement de la page HTML : tout le calcul
  est côté serveur / job de fabrication.

## 18. Versions

- Dataset : `reanalysis-era5-land-timeseries` (ERA5-Land).
- Schéma JSON : `schema_version = "1.0"`.
- Méthode percentile : NumPy `method="linear"`.
- Langage : Python 3.13, numpy 2.x, pandas 2.x.
