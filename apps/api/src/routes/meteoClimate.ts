import type { FastifyInstance } from "fastify";
import type pg from "pg";
import {
  resoudreLocalisationMeteo,
  type LocalisationMeteoResolue,
} from "@opendata-vda/shared";
import { datesIso, jourClimatologique, nombreOuNull, periodeMensuelle } from "../lib/meteoClimate.js";
import { validerCoordonnees } from "../lib/meteoPoint.js";

interface PointReferenceRow {
  id: string | number;
  slug: string;
  nom: string;
  latitude: string | number;
  longitude: string | number;
  type_localisation: "preconfiguree" | "precise";
}

function pointPublic(localisation: LocalisationMeteoResolue, row?: PointReferenceRow) {
  return {
    type: localisation.type,
    slug: localisation.pointPreconfigure?.slug ?? row?.slug ?? null,
    nom: localisation.pointPreconfigure?.label ?? row?.nom ?? "Position précise",
  };
}

async function trouverPoint(
  pool: pg.Pool,
  localisation: LocalisationMeteoResolue,
): Promise<PointReferenceRow | null> {
  if (localisation.pointPreconfigure) {
    const { rows } = await pool.query<PointReferenceRow>(
      `select id, slug, nom, latitude, longitude, type_localisation
       from series.meteo_points_reference where slug = $1 and actif`,
      [localisation.pointPreconfigure.slug],
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<PointReferenceRow>(
    `select id, slug, nom, latitude, longitude, type_localisation
     from series.meteo_points_reference
     where latitude = $1 and longitude = $2 and type_localisation = 'precise' and actif
     order by maj desc limit 1`,
    [localisation.normalisee.lat, localisation.normalisee.lon],
  );
  return rows[0] ?? null;
}

const LIMITE_CLIMAT = "Estimation climatique maillée, moins précise en zone de relief et lorsque l’altitude réelle diffère de celle de la maille.";
const LIMITE_UTCI = "Estimation ERA5-HEAT sur une maille d’environ 0,25°, qui ne représente pas les microclimats ni toutes les différences d’altitude.";

export function registerMeteoClimateRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Querystring: { lat?: string; lon?: string } }>(
    "/api/meteo/contexte-climatique",
    async (req, reply) => {
      const coordonnees = validerCoordonnees(req.query.lat, req.query.lon);
      if (!coordonnees) {
        reply.code(400);
        return { error: "coordonnées lat/lon invalides" };
      }
      const localisation = resoudreLocalisationMeteo(coordonnees.lat, coordonnees.lon);
      const point = await trouverPoint(pool, localisation);
      if (!point) {
        reply.header("cache-control", "public, max-age=300");
        return {
          disponible: false,
          point: pointPublic(localisation),
          limite: "Aucune référence 1991–2020 n’est encore calculée pour cette position précise.",
        };
      }

      const { rows } = await pool.query<Record<string, unknown>>(
        `select c.*
         from series.meteo_climatologie_jour c
         where c.point_id = $1 and c.jour_annee = $2
         order by c.calcule_le desc limit 1`,
        [point.id, jourClimatologique()],
      );
      const climat = rows[0];
      if (!climat) {
        reply.header("cache-control", "public, max-age=300");
        return { disponible: false, point: pointPublic(localisation, point), limite: LIMITE_CLIMAT };
      }

      reply.header("cache-control", "public, max-age=86400");
      return {
        disponible: true,
        point: pointPublic(localisation, point),
        reference: {
          debut: Number(climat.periode_debut),
          fin: Number(climat.periode_fin),
          fenetreJours: Number(climat.fenetre_jours),
          produit: String(climat.produit),
          version: String(climat.version_produit),
          nbValeurs: Number(climat.nb_valeurs),
          completudePct: nombreOuNull(climat.completude_pct),
          calculeLe: climat.calcule_le,
        },
        temperatureMax: {
          mediane: nombreOuNull(climat.tmax_mediane),
          p10: nombreOuNull(climat.tmax_p10),
          p90: nombreOuNull(climat.tmax_p90),
        },
        temperatureMin: {
          mediane: nombreOuNull(climat.tmin_mediane),
          p10: nombreOuNull(climat.tmin_p10),
          p90: nombreOuNull(climat.tmin_p90),
        },
        altitudeMailleM: nombreOuNull(climat.altitude_maille_m),
        limite: LIMITE_CLIMAT,
      };
    },
  );

  app.get<{ Querystring: { lat?: string; lon?: string; annee?: string; mois?: string } }>(
    "/api/meteo/bilan-thermique",
    async (req, reply) => {
      const coordonnees = validerCoordonnees(req.query.lat, req.query.lon);
      if (!coordonnees) {
        reply.code(400);
        return { error: "coordonnées lat/lon invalides" };
      }
      const annee = req.query.annee === undefined ? null : Number(req.query.annee);
      const mois = req.query.mois === undefined ? null : Number(req.query.mois);
      if ((annee === null) !== (mois === null) || (annee !== null && (!Number.isInteger(annee) || annee < 1940)) || (mois !== null && (!Number.isInteger(mois) || mois < 1 || mois > 12))) {
        reply.code(400);
        return { error: "période annee/mois invalide" };
      }

      const localisation = resoudreLocalisationMeteo(coordonnees.lat, coordonnees.lon);
      const point = await trouverPoint(pool, localisation);
      if (!point) {
        reply.header("cache-control", "public, max-age=300");
        return { disponible: false, point: pointPublic(localisation), limite: LIMITE_UTCI };
      }

      const params: unknown[] = [point.id];
      let periodeSql = "";
      if (annee !== null && mois !== null) {
        params.push(annee, mois);
        periodeSql = "and (t.annee * 12 + t.mois) <= ($2 * 12 + $3)";
      }
      const { rows } = await pool.query<Record<string, unknown>>(
        `select t.* from series.thermal_monthly t
         where t.point_id = $1 and t.statut_donnee = 'complet' ${periodeSql}
         order by t.annee desc, t.mois desc, t.calcule_le desc limit 1`,
        params,
      );
      const bilan = rows[0];
      if (!bilan) {
        reply.header("cache-control", "public, max-age=300");
        return { disponible: false, point: pointPublic(localisation, point), limite: LIMITE_UTCI };
      }

      const bilanAnnee = Number(bilan.annee);
      const bilanMois = Number(bilan.mois);
      reply.header("cache-control", "public, max-age=21600");
      return {
        disponible: true,
        point: pointPublic(localisation, point),
        periode: { annee: bilanAnnee, mois: bilanMois, ...periodeMensuelle(bilanAnnee, bilanMois) },
        utci: { maximumC: nombreOuNull(bilan.utci_max_c), categorie: bilan.categorie_max },
        jours: {
          stressFort: Number(bilan.jours_stress_fort),
          stressTresFort: Number(bilan.jours_stress_tres_fort),
          stressExtreme: Number(bilan.jours_stress_extreme),
          nuitsTropicales: Number(bilan.nuits_tropicales),
        },
        dates: {
          stressFort: datesIso(bilan.dates_stress_fort),
          stressTresFort: datesIso(bilan.dates_stress_tres_fort),
          stressExtreme: datesIso(bilan.dates_stress_extreme),
        },
        reference: {
          debut: 1991,
          fin: 2020,
          joursStressFort: nombreOuNull(bilan.reference_jours_stress_fort),
          anomalieJoursStress: nombreOuNull(bilan.anomalie_jours_stress_1991_2020),
        },
        source: {
          produit: bilan.produit,
          version: bilan.version_produit,
          calculeLe: bilan.calcule_le,
          completudePct: nombreOuNull(bilan.completude_pct),
        },
        limite: LIMITE_UTCI,
      };
    },
  );
}
