/**
 * Extraction tolérante du HTML des fiches InfoTerre (site tiers non versionné, balisage
 * irrégulier — ex. `<td>` non refermés dans le tableau de log). Distinction stricte entre
 * une section absente de la fiche (retour `[]`, état légitime) et une section présente mais
 * dont le contenu n'est pas reconnu par nos regex (`ErreurExtractionInfoterre`, jamais un
 * résultat vide silencieux qui masquerait une régression de parsing).
 */

export interface DocumentInfoterre {
  nom: string;
  types: string[];
  url_scan: string;
}

export interface NiveauLog {
  profondeur_min_m: number;
  profondeur_max_m: number;
  lithologie: string;
  stratigraphie: string;
}

export class ErreurExtractionInfoterre extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurExtractionInfoterre";
  }
}

const RE_LIGNE_DOCUMENT =
  /<tr>\s*<td>[\s\S]*?<\/td>\s*<td><a href="([^"]+)">([^<]*)<\/a><\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>[^<]*<\/td>\s*<\/tr>/g;
const RE_TYPE = /<li>([^<]*)<\/li>/g;
const RE_COMPTE_DOCUMENTS = /<span>\s*(\d+)\s*document\(s\)\s*<\/span>/;

/** Extrait les documents numérisés (scans) référencés depuis la fiche, avec leur URL absolue. */
export function extraireDocuments(html: string, urlFiche: string): DocumentInfoterre[] {
  const debut = html.indexOf('id="content_document"');
  if (debut === -1) return [];

  const finBloc = html.indexOf('id="content_log"', debut);
  const bloc = finBloc === -1 ? html.slice(debut) : html.slice(debut, finBloc);

  const documents: DocumentInfoterre[] = [];
  for (const ligne of bloc.matchAll(RE_LIGNE_DOCUMENT)) {
    const href = ligne[1] ?? "";
    const nom = (ligne[2] ?? "").trim();
    const typesBloc = ligne[3] ?? "";
    const types = [...typesBloc.matchAll(RE_TYPE)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
    documents.push({ nom, types, url_scan: new URL(href, urlFiche).href });
  }

  if (documents.length > 0) return documents;

  const compte = bloc.match(RE_COMPTE_DOCUMENTS);
  if (compte?.[1] === "0") return [];

  throw new ErreurExtractionInfoterre('Section "documents numérisés" présente mais non reconnue');
}

/**
 * Classe tous les documents par intérêt géologique probable, sans en écarter aucun : une coupe
 * interprétée passe avant un chantier, une coupe générique avant un rapport, un rapport avant le
 * reste. Contrairement à l'ancien `documentsCoupe` (retiré), rien n'est filtré — un rapport PDF
 * non typé "COUPE" reste éligible à la sélection, seulement moins prioritaire.
 */
export function classerDocuments(documents: DocumentInfoterre[]): DocumentInfoterre[] {
  const rang = (doc: DocumentInfoterre): number => {
    if (doc.types.some((t) => t.toUpperCase().includes("INTERPRETEE"))) return 0;
    if (doc.types.some((t) => t.toUpperCase().includes("COUPE"))) return 1;
    if (doc.types.some((t) => t.toUpperCase().includes("RAPPORT"))) return 2;
    return 3;
  };
  return [...documents].sort((a, b) => rang(a) - rang(b));
}

const RE_LIGNE_LOG =
  /<tr>\s*<td class="small">([^<]*?)\s*<td class="big">([^<]*)<\/td>\s*<td class="small">([^<]*)<\/td>\s*<\/tr>/g;
const RE_PROFONDEUR = /De\s+([\d,.]+)\s*[àa]\s+([\d,.]+)\s*m/i;
const RE_COMPTE_NIVEAUX = /Nombre de niveaux\s*:\s*<\/h3>\s*<span>\s*(\d+)\s*<\/span>/i;

function nombre(texte: string): number {
  return Number(texte.replace(",", "."));
}

/** Extrait le tableau de log géologique (profondeur/lithologie/stratigraphie) déjà en HTML. */
export function extraireLog(html: string): NiveauLog[] {
  const debut = html.indexOf('id="content_log"');
  if (debut === -1) return [];

  const bloc = html.slice(debut);
  const niveaux: NiveauLog[] = [];

  for (const ligne of bloc.matchAll(RE_LIGNE_LOG)) {
    const profondeurTexte = (ligne[1] ?? "").trim();
    const lithologie = (ligne[2] ?? "").trim();
    const stratigraphie = (ligne[3] ?? "").trim();

    const profondeur = RE_PROFONDEUR.exec(profondeurTexte);
    if (!profondeur || profondeur[1] === undefined || profondeur[2] === undefined) {
      throw new ErreurExtractionInfoterre(`Profondeur de log non reconnue : "${profondeurTexte}"`);
    }

    niveaux.push({
      profondeur_min_m: nombre(profondeur[1]),
      profondeur_max_m: nombre(profondeur[2]),
      lithologie,
      stratigraphie,
    });
  }

  if (niveaux.length > 0) return niveaux;

  const compte = bloc.match(RE_COMPTE_NIVEAUX);
  if (compte?.[1] === "0") return [];

  throw new ErreurExtractionInfoterre('Section "log géologique" présente mais non reconnue');
}
