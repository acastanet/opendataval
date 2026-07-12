import type pg from "pg";
import { COMMUNES_EPCI, upsertObjetsEnLot, type ObjetInput } from "@opendata-vda/shared";

const URL_AOC_AOP =
  "https://static.data.gouv.fr/resources/aires-geographiques-des-aoc-aop/20251009-122320/2025-10-09-comagri-communes-aires-ao.csv";
const URL_IGP =
  "https://static.data.gouv.fr/resources/aire-geographique-des-igp-et-des-ig/20251009-122625/2025-10-09-comagri-communes-aires-ig.csv";

const CODES_EPCI = new Set<string>(COMMUNES_EPCI.map((c) => c.codeInsee));

interface Label {
  label: string;
  type: "AOC/AOP" | "IGP";
}

/** Découpe une ligne CSV point-virgule en gérant les champs entre guillemets (pas d'échappement dans ces fichiers). */
function parseLigneCsv(ligne: string): string[] {
  return ligne.split(";").map((champ) => champ.trim().replace(/^"|"$/g, ""));
}

/** Les CSV INAO sont encodés en ISO-8859-1. */
async function chargerLignesCsv(url: string): Promise<{ header: string[]; lignes: string[][] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`INAO (${url}) -> HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const texte = new TextDecoder("iso-8859-1").decode(buffer);
  const toutesLignes = texte.split(/\r?\n/).filter((l) => l.length > 0).map(parseLigneCsv);
  const [header, ...lignes] = toutesLignes;
  if (!header) throw new Error(`INAO (${url}) : fichier vide`);
  return { header, lignes };
}

async function chargerLabelsParCommune(url: string, type: Label["type"]): Promise<Map<string, Label[]>> {
  const { header, lignes } = await chargerLignesCsv(url);
  const idxCI = header.indexOf("CI");
  const idxAire = header.indexOf("Aire géographique");
  if (idxCI === -1 || idxAire === -1) throw new Error(`INAO (${url}) : colonnes CI/Aire géographique absentes`);

  const parCommune = new Map<string, Label[]>();
  for (const ligne of lignes) {
    const codeInsee = ligne[idxCI];
    const aire = ligne[idxAire];
    if (!codeInsee || !aire || !CODES_EPCI.has(codeInsee)) continue;
    const labels = parCommune.get(codeInsee) ?? [];
    if (!labels.some((l) => l.label === aire)) labels.push({ label: aire, type });
    parCommune.set(codeInsee, labels);
  }
  return parCommune;
}

/**
 * Signes officiels de qualité (AOC/AOP/IGP) présents sur les communes de l'EPCI (INAO, via
 * data.gouv.fr — fichiers commune ↔ aire géographique, indexés par code INSEE). Un objet par
 * commune concernée, positionné sur son centre (geo.api.gouv.fr), regroupant tous ses labels.
 */
export async function run(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ debut: Date }>("select now() as debut");
  const debut = rows[0]?.debut;
  if (!debut) throw new Error("signesQualite : horodatage de départ indisponible");

  const [aocAop, igp] = await Promise.all([
    chargerLabelsParCommune(URL_AOC_AOP, "AOC/AOP"),
    chargerLabelsParCommune(URL_IGP, "IGP"),
  ]);

  const centresRes = await fetch(
    "https://geo.api.gouv.fr/epcis/200034601/communes?fields=nom,code,centre&format=geojson&geometry=centre",
  );
  if (!centresRes.ok) throw new Error(`geo.api epcis/communes (centre) -> HTTP ${centresRes.status}`);
  const centres = (await centresRes.json()) as {
    features: Array<{ properties: { code: string; nom: string }; geometry: { coordinates: [number, number] } }>;
  };

  const objets: ObjetInput[] = [];
  for (const feature of centres.features) {
    const codeInsee = feature.properties.code;
    const labels = [...(aocAop.get(codeInsee) ?? []), ...(igp.get(codeInsee) ?? [])];
    if (labels.length === 0) continue;

    objets.push({
      couche: "signe_qualite",
      externalId: codeInsee,
      props: { commune: feature.properties.nom, labels },
      geometry: feature.geometry,
      sourceUrl: "https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop",
    });
  }

  await upsertObjetsEnLot(pool, objets);
  await pool.query("delete from couches.objets where couche = 'signe_qualite' and maj < $1", [debut]);
  return objets.length;
}
