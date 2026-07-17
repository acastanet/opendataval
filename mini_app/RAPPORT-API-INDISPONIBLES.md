# Rapport technique — Indisponibilité des API Hub'Eau et résilience de la mini app

**Public** : développeur·e
**Date** : 2026-07-14
**Concerne** : `mini_app/` (mini app « L'eau à Valleraugue » — crues de l'Hérault + nappe)
**Contexte** : intégration directe (fetch navigateur, zéro backend) des API Hub'Eau depuis `app.js`.

---

## 1. Résumé

L'endpoint principal de **données hydrométriques temps réel** (`observations_tr`, v2) est en panne
côté Hub'Eau (HTTP 500 global). Les blocs « Rivière » et « Fleuve » de la mini app en dépendaient
directement. La page reste utilisable (dégradation par bloc, blocs « Crues » et « Nappe »
fonctionnels).

Un **repli temps réel a été mis en œuvre** via **Vigicrues** (infrastructure indépendante de
Hub'Eau) : 8 des 10 stations du fleuve y sont télésuivies (hauteur + débit, horaire), et la
station de St-André-de-Majencoules sert d'indicateur du haut Hérault à la place de Valleraugue
(non suivie). Le proxy serveur `/api/vigicrues/observations` (allowlist, pas de CORS) rend la
donnée joignable par la mini app servie sur la même origine (`/eau/`).

---

## 2. État des endpoints testés (vérifié le 2026-07-14)

| API | Endpoint | Résultat | Usage mini app |
|---|---|---|---|
| Hydrométrie v2 — temps réel | `GET /api/v2/hydrometrie/observations_tr` | ❌ **HTTP 500** `Internal server error` (panne globale, y compris sans filtre) | Bloc 1 (Rivière) + Bloc 3 (Fleuve) |
| Hydrométrie v1 — temps réel | `GET /api/v1/hydrometrie/observations_tr` | ❌ **HTTP 403** Forbidden (v1 hydrométrie coupée) | — |
| Hydrométrie v2 — référentiel stations | `GET /api/v2/hydrometrie/referentiel/stations` | ✅ 200 (19 stations Hérault, 10 en service) | Liste statique `STATIONS_FLEUVE` |
| Hydrométrie v2 — élaboré | `GET /api/v2/hydrometrie/obs_elab` (QmnJ) | ✅ 200 (5 704 pts, pagination curseur) | Bloc 2 (Crues) |
| Piézométrie v1 — stations | `GET /api/v1/niveaux_nappes/stations` | ✅ 200 | Bloc 4 (Nappe) |
| Piézométrie v1 — chroniques | `GET /api/v1/niveaux_nappes/chroniques` | ✅ 206 | Bloc 4 (Nappe) |
| Écoulement (ONDE) v1 | `GET /api/v1/ecoulement/observations` | ✅ 200 **mais** 0 obs Hérault | Non retenu (visuel estival) |
| Température cours d'eau v1 | `GET /api/v1/temperature/chronique` | ✅ 200 **mais** Hérault stale/mort | Non retenu (pas live) |

> Note追溯 : la panne `observations_tr` était déjà constatée le 2026-07-13 (mentionnée dans le
> plan d'origine). Elle persiste 24 h plus tard → panne côté fournisseur, non liée au code.

---

## 3. Détail du problème `observations_tr`

- **Symptôme** : toute requête renvoie `500` avec corps `{ "code": "Internal server error", "message": "" }`.
- **Périmètre** : global (échec même sans aucun filtre), pas un problème de paramètres.
- **Fréquence** : au moins 24 h (entre le 13 et le 14/07/2026).
- **Cause probable** : incident serveur Hub'Eau (BRGM) — hors de notre contrôle, pas de correctif
  applicatif possible côté client.
- **Impact données** : l'Hérault à Valleraugue (`Y200001002`) et les 10 stations en service du
  fleuve ne peuvent pas être interrogées en temps réel. Impossible de tracer hauteur (H, mm→m)
  ni débit (Q, m³/s).

### Pourquoi pas de repli simple ?
- `v1/hydrometrie/*` est coupée (403) → pas d'API de secours sur la même donnée.
- `ecoulement` (ONDE) : observations **visuelles** d'étiage en été, 1 seule station Hérault
  (`Y2000022`), **0 observation** historique. Ne fournit ni hauteur ni débit continu.
- `temperature` : 2 stations Hérault, mais `06181910` (Valleraugue) morte depuis 2014 et
  `06184000` (Florensac) stale depuis 2026-03-30. Pas de flux live.
- Vigicrues : station de **Valleraugue** (`Y200001002`) inconnue → non viable pour le bloc
  Rivière direct. **En revanche**, Vigicrues sert hauteur **et** débit (mise à jour horaire)
  pour **8 des 10** stations du fleuve (toutes sauf Valleraugue et Florensac), via une
  infrastructure **indépendante** de `observations_tr`. C'est donc un repli live viable pour le
  bloc Fleuve et pour un indicateur du haut Hérault (St-André-de-Majencoules, en aval de
  Valleraugue).

**Conclusion révisée** : un repli temps réel existe via **Vigicrues**, conditionné par un proxy
serveur (pas d'en-tête CORS). Mis en œuvre dans le plan suivant :
- Bloc Fleuve → 8 tuiles remplies depuis Vigicrues (Valleraugue/Florensac en état
  « non télésuivie »).
- Bloc Rivière → indicateur St-André-de-Majencoules (Vigicrues), clairement libellé comme
  approximation de la hauteur à Valleraugue.
- Proxy `/api/vigicrues/observations` ajouté côté API (allowlist des codes, `reply.code(502)`
  en cas d'erreur amont) ; mini app servie sur la même origine (`/eau/`) → aucun CORS.

---

## 4. Impact sur la mini app

| Bloc | Source | Comportement actuel |
|---|---|---|
| 1. Rivière | `observations_tr` → **Vigicrues** (St-André-de-Majencoules) | Hauteur récente + graphe depuis Vigicrues (libellé « station la plus proche en aval »). ✅ |
| 2. Grandes crues | `obs_elab` | Fonctionne (liste top 8, cache 7 j). ✅ |
| 3. Fleuve amont→aval | `observations_tr` × 10 → **Vigicrues** × 8 | 8 tuiles remplies (valeur + sparkline + tendance), Valleraugue/Florensac « non télésuivie ». ✅ |
| 4. Nappe | `niveaux_nappes` v1 | Fonctionne. ✅ |

La dégradation est **par bloc et asynchrone** (`Promise`/`.catch` par bloc), donc un bloc en erreur
ne casse pas les autres — conforme au cahier des charges.

---

## 5. Recommandations techniques

### 5.1 Déjà en place (à conserver)
- **Isolement par bloc** : chaque bloc a son propre `try/catch` ; un échec ne propage pas.
- **Messages d'erreur explicites** : `etat.classList.add("erreur")` + libellé « Hub'Eau
  injoignable ». La page n'est jamais vide.
- **Pagination robuste** : `fetchAllHubeau()` suit `page.next` (curseur) jusqu'à épuisement.

### 5.2 À ajouter (résilience renforcée)
1. **Backoff / retry sur `observations_tr`** : une panne transitoire ne doit pas afficher
   « indisponible » définitivement. Ex. : 2 tentatives avec délai croissant avant rendu erreur.
   ```js
   async function fetchAvecRetry(url, tentatives = 2) {
     for (let i = 0; i <= tentatives; i++) {
       try { return await fetchAllHubeau(url); }
       catch (e) { if (i === tentatives) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
     }
   }
   ```
2. **Bouton « Actualiser » pour tous les blocs** (aujourd'hui seul le thème est global ; un
   rechargement manuel des blocs rivière/fleuve serait utile une fois l'API revenue).
3. **Cache localStorage des dernières données valides** (comme déjà fait pour `obs_elab` via
   `CACHE_CRUES`) : en cas de 500, afficher « dernières données du <date> » au lieu de rien.
4. **Health-check léger au démarrage** : un `HEAD` sur `observations_tr` pour basculer un bandeau
   global « API hydrométrie perturbée » plutôt que N messages isolés.
5. **Ne pas sur-interroger** : `setInterval` de 30 s ne refetch pas les données (il ne fait que
   rafraîchir l'horodatage) — correct. Garder un intervalle de refetch raisonnable (ex. 5 min)
   pour éviter le throttling en cas de rétablissement partiel.

### 5.3 Monitoring / diagnostic
- Tableau de bord officiel : <https://hubeau.eaufrance.fr/status> (Uptime Robot, mais contenu
  chargé en JS — non parscriptable facilement).
- En attendant, un petit script `curl`/`fetch` périodique sur `observations_tr` suffit à détecter
  le retour de service.

---

## 6. Plan d'action

- [x] Confirmer la panne (`observations_tr` 500, v1 403) — fait le 13 et 14/07.
- [x] Vérifier qu'aucune API alternative ne couvre le Hérault en temps réel — fait (ONDE,
      Température : non utilisables ; **Vigicrues retenu** comme repli pour 8/10 stations).
- [x] Vérifier que les blocs non dépendants fonctionnent (`obs_elab`, `niveaux_nappes`) — fait.
- [x] Ajouter le proxy `/api/vigicrues/observations` + allowlist des codes (côté API).
- [x] Basculer les blocs Rivière/Fleuve sur Vigicrues ; servir la mini app sur `/eau/`.
- [x] Ajouter retry + cache localStorage + bandeau de santé global dans `app.js`.
- [ ] (optionnel) Rebrancher `observations_tr` pour Valleraugue une fois le service rétabli
      (conserver l'essai Vigicrues en repli).

---

## 7. Références endpoint

- Temps réel (en panne) : `https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=Y200001002&grandeur_hydro=H`
- Référentiel stations : `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?code_cours_eau=Y2--0200`
- Crues historiques : `https://hubeau.eaufrance.fr/api/v2/hydrometrie/obs_elab?code_entite=Y200001002&grandeur_hydro_elab=QmnJ`
- Nappe : `https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/chroniques?code_bss=09364X0017/111111`
- Repli live (Vigicrues, via proxy) : `https://www.vigicrues.gouv.fr/services/observations.json/?CdStationHydro=Y200002701&GrdSerie=H`
- Santé API : <https://hubeau.eaufrance.fr/status>
