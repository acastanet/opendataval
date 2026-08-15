import type { FastifyBaseLogger } from "fastify";
import type { InfoterreClient } from "../clients/infoterre.js";
import type { GeologieConfig } from "../config.js";
import {
  extraireDocuments,
  extraireLog,
  type DocumentInfoterre,
  type NiveauLog,
} from "../domain/infoterre-parsing.js";
import { urlFicheInfoterre } from "../domain/reference-bss.js";
import type { Convertisseur } from "./conversion-document.js";
import type { DocumentPourSynthese, Syntheseur } from "./llm-interpretation.js";
import type { MethodeSelection, SelecteurDocument } from "./selecteur-document.js";

export type MethodeSynthese = "llm_vision" | "llm_document_texte" | "llm_texte" | "structure_seule";

export interface ImageAnalysee {
  nom: string;
  types: string[];
  apercu_data_url: string;
}

export interface DocumentTexteApercu {
  nom: string;
  types: string[];
  /** Aperçu tronqué du texte extrait (le texte complet, potentiellement volumineux, n'est jamais renvoyé au client). */
  extrait: string;
}

export interface DocumentSelectionne {
  nom: string;
  types: string[];
  url_scan: string;
  raison: string | null;
  methode_selection: MethodeSelection;
}

export interface SyntheseGeologique {
  reference: string;
  fiche_infoterre: string;
  methode_synthese: MethodeSynthese;
  synthese: string;
  log_geologique: NiveauLog[];
  documents: DocumentInfoterre[];
  document_selectionne: DocumentSelectionne | null;
  images_analysees: ImageAnalysee[];
  document_texte_analyse: DocumentTexteApercu | null;
  avertissements: string[];
}

export interface DependancesInterpretation {
  infoterre: InfoterreClient;
  selecteur: SelecteurDocument;
  convertisseur: Convertisseur;
  syntheseur: Syntheseur;
  config: GeologieConfig;
  log: FastifyBaseLogger;
}

const EXTRAIT_TEXTE_MAX_CARACTERES = 400;

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
 * Récupère la fiche InfoTerre et en tire une synthèse en deux étapes : (1) sélection du document
 * numérisé le plus pertinent parmi ceux listés sur la fiche — analyser tous les documents serait
 * trop coûteux (scraping + LLM vision par document) — puis (2) téléchargement, conversion et résumé
 * de ce seul document. Seule l'indisponibilité de la fiche elle-même propage une exception (pas de
 * repli, comme pour le BRGM sur `/bss/proches`) : tout le reste (parsing partiel, scan illisible,
 * sélection ou LLM en panne) est absorbé avec un avertissement, jamais une exception après la
 * récupération de la fiche.
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

  // Étape 1 : sélection du document, sur ses seules métadonnées (nom, types) — jamais de
  // téléchargement de scan à ce stade.
  const selection = await deps.selecteur.selectionner(documents);
  if (selection.methode === "deterministe" && documents.length > 1 && deps.config.llmApiKey) {
    avertissements.push("La sélection du document par IA n'a pas pu être obtenue ; repli sur le classement déterministe.");
  }

  // Étape 2 : téléchargement et conversion du seul document retenu.
  let documentConverti: DocumentPourSynthese | undefined;
  if (selection.document) {
    try {
      const scan = await deps.infoterre.recupererScan(selection.document.url_scan);
      const contenu = await deps.convertisseur.convertir(scan, selection.document.nom);
      documentConverti = { nom: selection.document.nom, types: selection.document.types, contenu };
    } catch (error) {
      avertissements.push(`Document "${selection.document.nom}" ignoré : ${erreurMessage(error)}`);
    }
  }

  let synthese: string;
  let methode: MethodeSynthese;
  if (log.length === 0 && !documentConverti) {
    // Rien à transmettre au LLM : l'appeler produirait un texte poli mais vide de sens
    // ("aucune donnée disponible"), facturé pour rien et faussement étiqueté llm_texte —
    // alors que la fiche n'a simplement rien livré d'exploitable à nos deux extractions.
    synthese = syntheseStructureSeule(log);
    methode = "structure_seule";
    if (documents.length === 0) {
      avertissements.push(
        "Aucun contenu structuré n'a été trouvé sur cette fiche (ni log, ni document numérisé) : consultez la fiche InfoTerre directement.",
      );
    } else {
      avertissements.push(
        `${documents.length} document(s) disponible(s) sur la fiche, mais le document sélectionné n'a pas pu être analysé automatiquement — consultez la fiche InfoTerre directement.`,
      );
    }
  } else {
    const resultatLlm = await deps.syntheseur.synthetiser({ reference, log, document: documentConverti });
    if (resultatLlm) {
      synthese = resultatLlm;
      methode =
        documentConverti?.contenu.type === "image"
          ? "llm_vision"
          : documentConverti?.contenu.type === "texte"
            ? "llm_document_texte"
            : "llm_texte";
    } else {
      synthese = syntheseStructureSeule(log);
      methode = "structure_seule";
      if (deps.config.llmApiKey) {
        avertissements.push("La synthèse par IA n'a pas pu être obtenue ; repli sur le log structuré seul.");
      }
    }
  }

  deps.log.info(
    {
      reference,
      methode,
      methodeSelection: selection.methode,
      documentAnalyse: documentConverti?.contenu.type ?? null,
      avertissementsCount: avertissements.length,
    },
    "synthèse géologique InfoTerre terminée",
  );

  return {
    reference,
    fiche_infoterre: ficheInfoterre,
    methode_synthese: methode,
    synthese,
    log_geologique: log,
    documents,
    document_selectionne: selection.document
      ? {
          nom: selection.document.nom,
          types: selection.document.types,
          url_scan: selection.document.url_scan,
          raison: selection.raison,
          methode_selection: selection.methode,
        }
      : null,
    images_analysees:
      documentConverti?.contenu.type === "image"
        ? [{ nom: documentConverti.nom, types: documentConverti.types, apercu_data_url: `data:image/png;base64,${documentConverti.contenu.pngBase64}` }]
        : [],
    document_texte_analyse:
      documentConverti?.contenu.type === "texte"
        ? { nom: documentConverti.nom, types: documentConverti.types, extrait: documentConverti.contenu.texte.slice(0, EXTRAIT_TEXTE_MAX_CARACTERES) }
        : null,
    avertissements,
  };
}
