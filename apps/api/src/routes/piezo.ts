import type { FastifyInstance } from "fastify";
import type pg from "pg";

interface MesurePiezo {
  date: string;
  niveau_m_ngf: string | null;
  profondeur_m: string | null;
}

/**
 * Classement BRGM des bulletins de situation hydrogéologique : percentile du dernier niveau
 * parmi l'historique du même mois calendaire (recharge/étiage propres à chaque mois).
 */
const SEUILS_SITUATION = [
  { max: 0.1, classe: "tres_bas", libelle: "très bas" },
  { max: 0.25, classe: "bas", libelle: "bas" },
  { max: 0.75, classe: "modere", libelle: "modéré" },
  { max: 0.9, classe: "haut", libelle: "haut" },
  { max: Infinity, classe: "tres_haut", libelle: "très haut" },
] as const;

const NB_REFERENCE_MIN = 24;

function calculerStats(mesures: MesurePiezo[]) {
  if (mesures.length === 0) return null;
  const valides = mesures
    .filter((m) => m.niveau_m_ngf !== null)
    .map((m) => ({ date: m.date, niveau: Number(m.niveau_m_ngf), profondeur: m.profondeur_m === null ? null : Number(m.profondeur_m) }));
  if (valides.length === 0) return null;

  const derniereMesure = mesures[mesures.length - 1]!;
  const derniere = {
    date: derniereMesure.date,
    niveau_m_ngf: derniereMesure.niveau_m_ngf === null ? null : Number(derniereMesure.niveau_m_ngf),
    profondeur_m: derniereMesure.profondeur_m === null ? null : Number(derniereMesure.profondeur_m),
  };

  const min = valides.reduce((a, b) => (b.niveau < a.niveau ? b : a));
  const max = valides.reduce((a, b) => (b.niveau > a.niveau ? b : a));

  let situation = null;
  if (derniere.niveau_m_ngf !== null) {
    const moisDerniere = derniere.date.slice(5, 7);
    const reference = valides.filter((m) => m.date.slice(5, 7) === moisDerniere);
    if (reference.length >= NB_REFERENCE_MIN) {
      const nbInferieurs = reference.filter((m) => m.niveau < derniere.niveau_m_ngf!).length;
      const percentile = nbInferieurs / reference.length;
      const seuil = SEUILS_SITUATION.find((s) => percentile < s.max) ?? SEUILS_SITUATION[SEUILS_SITUATION.length - 1]!;
      situation = { classe: seuil.classe, libelle: seuil.libelle, percentile, nbReference: reference.length };
    }
  }

  return {
    derniere,
    min: { date: min.date, niveau_m_ngf: min.niveau },
    max: { date: max.date, niveau_m_ngf: max.niveau },
    nb: valides.length,
    debut: mesures[0]!.date,
    fin: derniereMesure.date,
    situation,
  };
}

export function registerPiezoRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Querystring: { code_bss?: string; depuis?: string } }>(
    "/api/piezo/chronique",
    async (req, reply) => {
      const { code_bss, depuis } = req.query;
      if (!code_bss) {
        reply.code(400);
        return { error: "paramètre code_bss requis" };
      }
      const { rows } = await pool.query<MesurePiezo>(
        `select to_char(date, 'YYYY-MM-DD') as date, niveau_m_ngf, profondeur_m
         from series.piezo
         where code_bss = $1
         order by date`,
        [code_bss],
      );
      const stats = calculerStats(rows);
      const mesures = depuis ? rows.filter((m) => m.date >= depuis) : rows;
      return { code_bss, mesures, stats };
    },
  );
}
