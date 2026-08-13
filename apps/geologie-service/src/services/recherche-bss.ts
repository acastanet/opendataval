import type { FastifyBaseLogger } from "fastify";
import type { BrgmClient } from "../clients/brgm.js";
import type { GeologieConfig } from "../config.js";
import { bboxAutour, centreLambert93 } from "../domain/bbox.js";
import { construireShortlist } from "../domain/diversification.js";
import { normaliserFeature } from "../domain/normalisation.js";
import { construireReponse, type ReponseBss } from "../domain/reponse.js";
import { baseScore, geologicalValueScore, proximityScore } from "../domain/scoring.js";
import type { Candidat, OuvrageBss } from "../types.js";
import { cleCacheBrgm, type CacheMemoire } from "./cache.js";
import { classementParDistance, type Reranker } from "./reranker.js";

export interface EntreeRecherche {
  lat: number;
  lon: number;
  rayonM: number;
  debug: boolean;
  /**
   * `true` (défaut) : shortlist diversifiée puis reranking (LLM ou repli déterministe),
   * plafonné à 10 résultats. `false` : tous les candidats du cercle, triés par distance
   * uniquement, sans shortlist ni reranking — pour un usage de repérage où rien ne doit
   * être écarté au profit d'une pertinence supposée.
   */
  trier: boolean;
}

interface ReponseBrgmNormalisee {
  ouvrages: OuvrageBss[];
  tronque: boolean;
}

export interface DependancesRecherche {
  brgm: BrgmClient;
  reranker: Reranker;
  cache: CacheMemoire<ReponseBrgmNormalisee>;
  config: GeologieConfig;
  log: FastifyBaseLogger;
}

/**
 * Enchaîne le pipeline complet : BBOX BRGM (ou cache) → filtrage cercle exact →
 * scoring déterministe → diversification → reranking LLM (avec repli). Le filtrage par
 * distance n'intervient qu'après avoir normalisé *tous* les ouvrages de la BBOX — jamais
 * de pré-limite arbitraire avant le scoring.
 */
export async function rechercherOuvragesProches(
  entree: EntreeRecherche,
  deps: DependancesRecherche,
): Promise<ReponseBss> {
  const centre = centreLambert93(entree.lon, entree.lat);
  const cle = cleCacheBrgm(entree.lat, entree.lon, entree.rayonM);

  let normalisee = deps.cache.obtenir(cle);
  let brgmDureeMs = 0;
  let brgmFeatureCount = normalisee?.ouvrages.length ?? 0;

  if (!normalisee) {
    const bbox = bboxAutour(centre, entree.rayonM);
    const debutBrgm = Date.now();
    const resultat = await deps.brgm.featuresDansBbox(bbox);
    brgmDureeMs = Date.now() - debutBrgm;
    brgmFeatureCount = resultat.features.length;

    const ouvrages: OuvrageBss[] = [];
    for (const feature of resultat.features) {
      const ouvrage = normaliserFeature(feature, centre);
      if (ouvrage) ouvrages.push(ouvrage);
    }
    normalisee = { ouvrages, tronque: resultat.tronque };
    deps.cache.definir(cle, normalisee);
  }

  const dansLeCercle = normalisee.ouvrages
    .filter((ouvrage) => ouvrage.distance_m <= entree.rayonM)
    .sort((a, b) => a.distance_m - b.distance_m);

  const candidats: Candidat[] = dansLeCercle.map((ouvrage, index) => {
    const geologicalScore = geologicalValueScore(ouvrage);
    const proximity = proximityScore(ouvrage.distance_m);
    return {
      ...ouvrage,
      distance_rank: index,
      geological_value_score: geologicalScore,
      proximity_score: proximity,
      base_score: baseScore(geologicalScore, proximity),
    };
  });

  const shortlist = entree.trier ? construireShortlist(candidats) : candidats;

  const debutLlm = Date.now();
  const classement = entree.trier ? await deps.reranker.classer(shortlist) : classementParDistance(shortlist);
  const llmDureeMs = Date.now() - debutLlm;

  deps.log.info(
    {
      brgmDureeMs,
      brgmFeatureCount,
      brgmTronque: normalisee.tronque,
      candidatsDansLeCercle: candidats.length,
      shortlistCount: shortlist.length,
      llmDureeMs,
      rankingMethod: classement.methode,
      resultCount: Math.min(classement.entrees.length, 10),
    },
    "recherche BSS BRGM terminée",
  );

  return construireReponse({
    lat: entree.lat,
    lon: entree.lon,
    rayonM: entree.rayonM,
    candidatsDansLeCercle: candidats.length,
    classement,
    shortlist,
    debug: entree.debug && deps.config.debugEnabled,
    brgmTronque: normalisee.tronque,
  });
}
