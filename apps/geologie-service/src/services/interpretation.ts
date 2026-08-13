import type { FastifyBaseLogger } from "fastify";
import type { InfoterreClient } from "../clients/infoterre.js";
import type { GeologieConfig } from "../config.js";
import {
  documentsCoupe,
  extraireDocuments,
  extraireLog,
  type DocumentInfoterre,
  type NiveauLog,
} from "../domain/infoterre-parsing.js";
import { urlFicheInfoterre } from "../domain/reference-bss.js";
import { tiffVersPngBase64 } from "./conversion-image.js";
import type { Syntheseur } from "./llm-interpretation.js";

export type MethodeSynthese = "llm_vision" | "llm_texte" | "structure_seule";

export interface ImageAnalysee {
  nom: string;
  types: string[];
  apercu_data_url: string;
}

export interface SyntheseGeologique {
  reference: string;
  fiche_infoterre: string;
  methode_synthese: MethodeSynthese;
  synthese: string;
  log_geologique: NiveauLog[];
  documents: DocumentInfoterre[];
  images_analysees: ImageAnalysee[];
  avertissements: string[];
}

export interface DependancesInterpretation {
  infoterre: InfoterreClient;
  syntheseur: Syntheseur;
  config: GeologieConfig;
  log: FastifyBaseLogger;
}

function erreurMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Chemin 100 % déterministe, sans LLM, toujours disponible en dernier recours. */
export function syntheseStructureSeule(log: NiveauLog[]): string {
  if (log.length === 0) {
    return "Aucun log géologique structuré n'est disponible pour cet ouvrage.";
  }
  const profondeurMax = Math.max(...log.map((niveau) => niveau.profondeur_max_m));
  const niveauxTexte = log
    .map((niveau) => {
      const strate = niveau.stratigraphie ? ` (${niveau.stratigraphie})` : "";
      return `de ${niveau.profondeur_min_m} à ${niveau.profondeur_max_m} m : ${niveau.lithologie}${strate}`;
    })
    .join(" ; ");
  return `Log géologique sur ${log.length} niveau${log.length > 1 ? "x" : ""}, jusqu'à ${profondeurMax} m de profondeur : ${niveauxTexte}.`;
}

/**
 * Récupère la fiche InfoTerre et en tire une synthèse. Seule l'indisponibilité de la fiche
 * elle-même propage une exception (pas de repli, comme pour le BRGM sur `/bss/proches`) :
 * tout le reste (parsing partiel, scan illisible, LLM en panne) est absorbé avec un
 * avertissement, jamais une exception après la récupération de la fiche.
 */
export async function interpreterFiche(
  reference: string,
  deps: DependancesInterpretation,
): Promise<SyntheseGeologique> {
  const ficheInfoterre = urlFicheInfoterre(reference);
  const avertissements: string[] = [];

  const html = await deps.infoterre.recupererFiche(reference);

  let log: NiveauLog[] = [];
  try {
    log = extraireLog(html);
  } catch (error) {
    avertissements.push(`Section "log géologique" non reconnue : ${erreurMessage(error)}`);
  }

  let documents: DocumentInfoterre[] = [];
  try {
    documents = extraireDocuments(html, ficheInfoterre);
  } catch (error) {
    avertissements.push(`Section "documents numérisés" non reconnue : ${erreurMessage(error)}`);
  }

  const coupes = documentsCoupe(documents).slice(0, deps.config.infoterreMaxImages);
  const images: { nom: string; types: string[]; pngBase64: string; apercu_data_url: string }[] = [];

  for (const document of coupes) {
    try {
      const scan = await deps.infoterre.recupererScan(document.url_scan);
      const pngBase64 = await tiffVersPngBase64(scan, deps.config.infoterreImageWidthPx);
      images.push({
        nom: document.nom,
        types: document.types,
        pngBase64,
        apercu_data_url: `data:image/png;base64,${pngBase64}`,
      });
    } catch (error) {
      avertissements.push(`Scan "${document.nom}" ignoré : ${erreurMessage(error)}`);
    }
  }

  let synthese: string;
  let methode: MethodeSynthese;
  if (log.length === 0 && images.length === 0) {
    // Rien à transmettre au LLM : l'appeler produirait un texte poli mais vide de sens
    // ("aucune donnée disponible"), facturé pour rien et faussement étiqueté llm_texte —
    // alors que la fiche n'a simplement rien livré d'exploitable à nos deux extractions.
    synthese = syntheseStructureSeule(log);
    methode = "structure_seule";
    if (documents.length === 0) {
      avertissements.push(
        "Aucun contenu structuré n'a été trouvé sur cette fiche (ni log, ni document numérisé) : elle contient peut-être un rapport au format PDF, non pris en charge automatiquement — consultez la fiche InfoTerre directement.",
      );
    } else {
      avertissements.push(
        `${documents.length} document(s) disponible(s) sur la fiche, mais aucun n'est une coupe géologique analysable automatiquement — consultez la fiche InfoTerre directement.`,
      );
    }
  } else {
    const resultatLlm = await deps.syntheseur.synthetiser({
      reference,
      log,
      images: images.map(({ nom, types, pngBase64 }) => ({ nom, types, pngBase64 })),
    });
    if (resultatLlm) {
      synthese = resultatLlm;
      methode = images.length > 0 ? "llm_vision" : "llm_texte";
    } else {
      synthese = syntheseStructureSeule(log);
      methode = "structure_seule";
      if (deps.config.llmApiKey) {
        avertissements.push("La synthèse par IA n'a pas pu être obtenue ; repli sur le log structuré seul.");
      }
    }
  }

  deps.log.info(
    { reference, methode, imagesAnalysees: images.length, avertissementsCount: avertissements.length },
    "synthèse géologique InfoTerre terminée",
  );

  return {
    reference,
    fiche_infoterre: ficheInfoterre,
    methode_synthese: methode,
    synthese,
    log_geologique: log,
    documents,
    images_analysees: images.map(({ nom, types, apercu_data_url }) => ({ nom, types, apercu_data_url })),
    avertissements,
  };
}
