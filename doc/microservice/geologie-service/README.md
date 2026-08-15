# Geologie Service

> Recherche des ouvrages géologiques BSS BRGM les plus **pertinents** autour d’un point,
> pas simplement les plus proches.
> Dernière mise à jour et vérification : 2026-08-07
> Code : `apps/geologie-service/`

## Périmètre fonctionnel

À partir d’un point GPS et d’un rayon (≤ 5 km), le service interroge le WFS `BSS_TOTAL`
du BRGM, normalise les ouvrages trouvés, leur attribue un score déterministe combinant
richesse géologique et proximité, en diversifie la sélection pour éviter qu’un cluster
d’ouvrages quasi identiques ne monopolise le résultat, puis confie le classement final
à un LLM (au plus un appel réseau). Le service **retombe automatiquement sur un
classement déterministe** si le LLM est absent, indisponible ou renvoie une sortie
invalide — la disponibilité du BRGM ne dépend jamais de celle du LLM.

Aucune donnée géologique n’est inventée : la nature brute du BRGM (`nature_brgm`) est
toujours restituée telle quelle, et le LLM reçoit pour instruction explicite de ne
déduire aucune lithologie absente des données.

MVP volontairement limité à un rayon de 5 km et sans base de données. La démo affiche
désormais les 10 résultats sur une carte, et propose optionnellement, fiche par fiche,
une synthèse et une interprétation de la coupe géologique à partir du contenu réel de la
fiche InfoTerre (voir [Synthèse géologique interprétée](#synthèse-géologique-interprétée-optionnelle)).

## Routes

| Route | Exposition | Rôle |
|---|---|---|
| `GET /api/v2/geologie/bss/proches` | publique via gateway | Recherche par pertinence |
| `GET /internal/v1/geologie/bss/proches` | réseau interne | Cible du gateway |
| `GET /api/v2/geologie/bss/synthese` | publique via gateway | Synthèse et coupe géologique interprétée d'une fiche |
| `GET /internal/v1/geologie/bss/synthese` | réseau interne | Cible du gateway |
| `GET /health` | interne | Vie du processus |
| `GET /ready` | interne | Processus prêt |

Paramètres :

| Paramètre | Règle |
|---|---|
| `lat` | obligatoire, entre -90 et 90 |
| `lon` | obligatoire, entre -180 et 180 |
| `rayon` | facultatif, `5000` par défaut, entre 1 et 5000 m — au-delà, 400 explicite |
| `debug` | facultatif, `true` pour exposer les scores intermédiaires (ignoré si `GEOLOGIE_DEBUG_ENABLED=false`) |
| `trier` | facultatif, `true` par défaut. `false` désactive shortlist et reranking : tous les candidats du cercle sont renvoyés, triés par distance (`selection.ranking_method` vaut alors `"distance"`) — pour un usage de repérage où rien ne doit être écarté au profit d’une pertinence supposée |

Exemple local :

```bash
curl -fsS "http://localhost:8080/api/v2/geologie/bss/proches?lat=44.06455556&lon=3.68302778&rayon=5000"
```

## Sources et calcul

| Besoin | Source | Appel |
|---|---|---|
| Ouvrages BSS | BRGM InfoTerre | WFS 1.1.0 `GetFeature`, `TYPENAME=BSS_TOTAL`, `SRSNAME=EPSG:2154`, `BBOX` en Lambert-93 |
| Reranking | Passerelle ILAAS (compatible OpenAI) | `POST /v1/chat/completions`, modèle `mistral-medium-latest` |

Pipeline :

```text
validation lat/lon/rayon
    → WGS84 → Lambert-93 (packages/shared/src/lambert93.ts, partagé avec map-service)
    → requête BBOX WFS BRGM (ou cache mémoire, TTL configurable)
    → filtrage cercle exact (distance euclidienne réelle en Lambert-93)
    → normalisation (flags non exclusifs : is_borehole, is_sounding, is_core_sample,
      has_geological_section, has_geological_section_document, has_geological_section_scan)
    → score déterministe (geological_value_score 0-100, proximity_score, base_score 70/30)
    → candidats protégés (plus proche, meilleur forage documenté, meilleur sondage,
      meilleur carottage, meilleure coupe géologique — départage par distance croissante)
    → diversification MMR (selection_score = 0.75 × base_score − 25 × similarité max
      avec la shortlist déjà retenue), jusqu’à 15 candidats
    → reranking LLM (1 appel maximum, sortie strictement validée) ou repli déterministe
    → top 10
```

**Aucun pré-filtrage par distance** n’intervient avant le scoring : tous les ouvrages du
cercle sont considérés, car certains carottages déterminants se trouvent près de la
limite des 5 km (cf. cas de référence ci-dessous).

Avec `trier=false`, le pipeline s’arrête après le scoring déterministe : ni shortlist
diversifiée, ni reranking. Tous les candidats du cercle sont renvoyés, dans l’ordre de
`distance_rank`, avec `selection.ranking_method = "distance"` — pour un consommateur qui
n’a pas de besoin précis à faire trancher par le LLM, et pour qui rien dans le cercle
n’est moins pertinent qu’autre chose.

### Score géologique (`geological_value_score`, 0–100)

| Critère | Points |
|---|---|
| Carottage explicite (`mode_execution` contient CAROTT) | +30 |
| Coupe géologique déclarée | +20 |
| Document `COUPE-GEOLOGIQUE` | +10 |
| Scan de coupe disponible | +5 |
| Sondage (`SONDAGE*`) | +10 |
| Forage (`FORAGE`) | +8 |
| Profondeur renseignée | +5 |
| Bonus de profondeur | 0 à +5 (paliers 10/25/50/100 m) |
| Documents géologiques complémentaires (hors `COUPE-GEOLOGIQUE`, déjà comptée) | 0 à +7 |

`proximity_score = 100 / (1 + (distance_m / 2500)²)` — décroissance douce, volontairement
non linéaire : un ouvrage riche à 4,9 km peut dépasser une source banale à 1,5 km.
`base_score = 0,70 × geological_value_score + 0,30 × proximity_score`.

### Similarité et diversification

`similarite(a, b)` ∈ [0, 1] : cluster géographique < 200 m (+0,40), même nature BRGM
(+0,15), même mode d’exécution (+0,15), documents similaires — indice de Jaccard
(+0,20), profondeur proche (+0,10, seulement si les deux sont connues). Une absence
commune d’information (mode vide des deux côtés, profondeur inconnue) ne compte jamais
comme une ressemblance.

### Fallback LLM

Le service fonctionne intégralement sans clé API (`GEOLOGIE_LLM_API_KEY` vide) : le top
10 devient alors les 10 premiers candidats du classement déterministe, et
`selection.ranking_method` vaut `"deterministic"` au lieu de `"llm_reranked"`. Timeout,
erreur HTTP, réponse non-JSON ou sortie invalide déclenchent le même repli — jamais
d’exception visible côté route.

## Synthèse géologique interprétée (optionnelle)

`GET /api/v2/geologie/bss/synthese?reference=<ancien_code_bss>` récupère la fiche
InfoTerre publique de l'ouvrage (`http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action`),
en extrait le tableau de log géologique déjà présent en HTML et la liste des documents
numérisés (« Document(s) numérisé(s) », des scans TIFF ou des PDF), puis produit une
synthèse en français **en deux étapes**. C'est une action **coûteuse** (site tiers +
éventuel appel LLM) : elle n'est déclenchée que sur action explicite de l'utilisateur
(un bouton par fiche sur la démo), jamais automatiquement lors de la recherche
`/bss/proches`.

1. **Sélection** (`src/services/selecteur-document.ts`) — analyser tous les documents
   d'une fiche serait trop coûteux (téléchargement + conversion + appel LLM par document),
   donc un seul document est choisi *avant* tout téléchargement, sur ses seules
   métadonnées (nom, types déclarés). S'il n'y a qu'un document, il est retenu directement
   sans appel réseau. S'il y en a plusieurs, un appel LLM léger (texte seul, même canal que
   le reranking de `/bss/proches`) choisit le plus pertinent, avec repli déterministe
   (classement par mots-clés `classerDocuments`, priorité coupe interprétée > coupe >
   rapport > reste) si la clé LLM est absente ou la sortie invalide. Exposé dans
   `document_selectionne.methode_selection` (`aucune` | `unique` | `llm` | `deterministe`).
2. **Résumé** du seul document retenu (`src/services/conversion-document.ts`) — un scan
   TIFF est converti en PNG (comme avant) ; un PDF est d'abord tenté en extraction de texte
   (`pdftotext`, première page), et seulement rasterisé en image (`pdftoppm`) si aucune
   couche texte exploitable n'est trouvée (PDF scanné). Nécessite `poppler-utils` en
   environnement d'exécution (déjà inclus dans l'image Docker).

`reference` doit correspondre au format BSS réel (`\d{5}[A-Z]\d{4}/désignation`, ex.
`09372X0012/MONNA`) : validé par regex côté route (400 rapide) et côté client HTTP
(défense en profondeur). Le serveur reconstruit toujours lui-même l'URL InfoTerre à partir
de cette référence — aucune URL n'est jamais acceptée telle quelle depuis le client
(anti-SSRF). Les scans ne sont récupérés que depuis `ficheinfoterre.brgm.fr` ; toute URL
résolue vers un autre hôte est rejetée.

Cascade de repli, exposée dans `methode_synthese` :

1. **`llm_vision`** — le document sélectionné est une image (scan TIFF ou PDF rasterisé) ;
   le LLM répond en recevant le log structuré et cette image (un seul appel réseau).
2. **`llm_document_texte`** — le document sélectionné est un PDF dont le texte a pu être
   extrait ; le LLM répond à partir du log structuré et de ce texte.
3. **`llm_texte`** — aucun document exploitable (pas de document sur la fiche, document
   non téléchargeable ou conversion échouée), mais le LLM répond à partir du seul log
   structuré.
4. **`structure_seule`** — repli 100 % déterministe, sans LLM, toujours disponible :
   un résumé du log est généré directement à partir des données structurées.

**Aucun log ni document analysable ⇒ le LLM n'est jamais appelé.** Certaines fiches
anciennes ne livrent ni tableau de log ni document numérisé exploitable : l'interroger
produirait un texte poli mais vide de sens (« aucune donnée disponible »), facturé pour
rien et étiqueté `llm_texte` comme s'il s'agissait d'une vraie synthèse. Le service part
alors directement en `structure_seule`, avec un avertissement qui distingue les deux cas :
aucun document du tout sur la fiche, ou un document sélectionné mais dont le téléchargement
ou la conversion a échoué.

Le passage d'une étape à l'autre ne lève jamais d'exception : seule l'indisponibilité de
la fiche InfoTerre elle-même (site injoignable, timeout) fait échouer la requête (502/504),
comme le fait le BRGM sur `/bss/proches`. Tout le reste (section HTML non reconnue, scan
illisible, LLM en panne) est absorbé et remonté dans `avertissements`, sans jamais renvoyer
un résultat vide silencieusement.

Exemple :

```bash
curl -fsS "http://localhost:8080/api/v2/geologie/bss/synthese?reference=09372X0012/MONNA"
```

## Vérification réelle du cas de référence

Contrôle effectué le 2026-08-07 contre le WFS BRGM en production, avec reranking LLM actif
(`lat=44.06455556`, `lon=3.68302778`, `rayon=5000`) :

| Élément | Résultat |
|---|---|
| Ouvrages trouvés en BBOX | 54 |
| Candidats dans le cercle exact | 44 |
| Taille de la shortlist | 15 |
| Résultats retournés | 10 |
| `ranking_method` | `llm_reranked` |
| BSS002DKFG (MONNA, forage 97 m, coupe+scan) | rang 2 (distance_rank 1) |
| BSS002DKEC (VA-2A, sondage carotté 14 m, coupe+perméabilité) | **rang 1** (distance_rank 39) |

VA-2A, le 40ᵉ ouvrage le plus proche, ressort en tête du classement de pertinence grâce
à sa richesse géologique — exactement le comportement recherché. Le cluster des cinq
sondages carottés quasi identiques (VA-1A à VA-5A) est diversifié : ils occupent les
rangs 1, 3, 4, 6 et 7 plutôt que de monopoliser le haut du classement.

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | port HTTP interne |
| `GEOLOGIE_BRGM_WFS_URL` | `https://mapsref.brgm.fr/wxs/infoterre/catalogue` | WFS BSS BRGM |
| `GEOLOGIE_BRGM_TIMEOUT_MS` | `20000` | délai de l’appel BRGM |
| `GEOLOGIE_BRGM_MAX_FEATURES` | `500` | `MAXFEATURES` de la requête WFS |
| `GEOLOGIE_CACHE_TTL_SECONDS` | `21600` | durée de vie du cache mémoire (réponse BRGM normalisée) |
| `GEOLOGIE_CACHE_MAX_ENTRIES` | `200` | taille maximale du cache (éviction FIFO) |
| `GEOLOGIE_LLM_URL` | `https://llm.ilaas.fr/v1/chat/completions` | passerelle LLM compatible OpenAI |
| `GEOLOGIE_LLM_MODEL` | `mistral-medium-latest` | modèle utilisé pour le reranking et la sélection de document |
| `GEOLOGIE_LLM_API_KEY` | *(vide)* | secret serveur ; vide = repli déterministe direct, sans appel réseau |
| `GEOLOGIE_LLM_TIMEOUT_MS` | `20000` | délai de l’appel LLM (reranking, sélection de document) |
| `GEOLOGIE_LLM_MAX_TOKENS` | `1500` | `max_tokens` de la requête LLM (reranking, sélection de document) |
| `GEOLOGIE_LLM_VISION_MODEL` | `mistral-medium-latest` | modèle utilisé pour la synthèse (avec ou sans document) |
| `GEOLOGIE_LLM_VISION_TIMEOUT_MS` | `45000` | délai de l’appel LLM de synthèse (plus long : peut inclure une image) |
| `GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS` | `700` | `max_tokens` de la requête LLM de synthèse |
| `GEOLOGIE_INFOTERRE_TIMEOUT_MS` | `15000` | délai des appels à InfoTerre (fiche et scans) |
| `GEOLOGIE_INFOTERRE_MAX_SCAN_BYTES` | `5000000` | taille maximale acceptée pour un scan téléchargé |
| `GEOLOGIE_INFOTERRE_IMAGE_WIDTH_PX` | `1400` | largeur cible de conversion image → PNG (scan TIFF ou page PDF rasterisée) |
| `GEOLOGIE_DEBUG_ENABLED` | `false` | autorise `?debug=true` à exposer les scores intermédiaires |
| `APP_VERSION` | `dev` | version exposée par la santé |

## Développement et validation

Prérequis local pour la conversion des documents PDF de la synthèse géologique :
`poppler-utils` (`pdftotext`, `pdftoppm`) doit être installé et accessible sur le `PATH`.
Sans lui, `pnpm check:geologie` reste vert (les tests concernés s'ignorent proprement),
mais `/bss/synthese` ne pourra pas analyser les documents PDF en local.

```bash
pnpm dev:geologie
pnpm check:geologie
pnpm check:map        # non-régression de la projection Lambert-93 partagée
pnpm check:gateway
docker compose up --build geologie-service gateway caddy
```

Test d’intégration réel (hors CI, appelle le BRGM en production) :

```bash
GEOLOGIE_TEST_LIVE=true pnpm --filter geologie-service test
```

Les tests unitaires couvrent la conversion Lambert-93, la construction de la BBOX et le
filtrage cercle, la normalisation (dont le piège de casse `coupe_geologique = "Presente"`,
non `"PRESENTE"`), le scoring, la similarité, la diversification (avec les deux ouvrages
de référence BSS002DKFG et BSS002DKEC), le reranker (validation stricte de la sortie LLM,
extraction JSON robuste, fallback) et la route HTTP de bout en bout, sur un fixture
GeoJSON réel figé (`test/fixtures/`), sans appel réseau.

## Limites connues

- La détection du carottage repose uniquement sur `mode_execution` : le BRGM n’expose
  aucun champ dédié.
- La fiche InfoTerre est fournie en `http://`, jamais en `https://` côté BRGM.
- Le barème de score géologique plafonne théoriquement à 100, mais aucune combinaison
  réaliste de `nature_brgm` (FORAGE et SONDAGE s’excluent) n’atteint ce plafond : le
  maximum observé en pratique est 92.
- Pas de cache de la sortie LLM : seule la réponse BRGM normalisée est mise en cache, le
  scoring et la diversification étant recalculés à chaque requête (coût négligeable).
- L'extraction du HTML InfoTerre repose sur des regex tolérantes contre un site tiers non
  versionné (balisage irrégulier confirmé, ex. `<td>` non refermés) : verrouillée par des
  fixtures réelles, elle échoue explicitement (`avertissements`) plutôt que de renvoyer un
  résultat vide silencieux si la structure de la page venait à changer.
- Le support vision du LLM ILAAS n'est pas garanti contractuellement ; `methode_synthese`
  peut ne jamais valoir `"llm_vision"` selon la disponibilité du modèle — le service reste
  pleinement fonctionnel dans ce cas (`structure_seule`). Validé empiriquement fonctionnel
  avec `mistral-medium-latest` le 2026-08-07.
- Un seul document est sélectionné puis analysé par fiche (jamais plusieurs), et au plus
  deux appels LLM par requête (sélection, puis synthèse), pour maîtriser le coût
  (scraping tiers + appels LLM).
- La conversion des PDF (`pdftotext`/`pdftoppm`, `poppler-utils`) ne considère que la
  première page du document sélectionné.

## Références

- [BRGM InfoTerre — service WFS](https://mapsref.brgm.fr/wxs/infoterre/catalogue)
- [BRGM — Banque du Sous-Sol](https://infoterre.brgm.fr/page/banque-sous-sol-bss)
