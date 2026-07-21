export const TYPES_LOCALISATION_METEO = ["preconfiguree", "precise"] as const;

export type TypeLocalisationMeteo = (typeof TYPES_LOCALISATION_METEO)[number];

export interface CoordonneesMeteo {
  lat: number;
  lon: number;
}

export interface PointMeteoPreconfigure extends CoordonneesMeteo {
  slug: "val-aigoual" | "paris" | "marseille";
  nom: string;
  label: string;
}

export interface LocalisationMeteoResolue {
  type: TypeLocalisationMeteo;
  demandee: CoordonneesMeteo;
  normalisee: CoordonneesMeteo;
  pointPreconfigure: PointMeteoPreconfigure | null;
  cleCache: string;
}

/**
 * Points de l'offre simple. Cette liste est la source commune du navigateur, de l'API
 * et des futurs jobs climatiques ; une modification de coordonnées doit donc rester explicite.
 */
export const POINTS_METEO_PRECONFIGURES: readonly PointMeteoPreconfigure[] = [
  {
    slug: "val-aigoual",
    nom: "Val-d’Aigoual",
    label: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
    lat: 44.081192,
    lon: 3.641467,
  },
  {
    slug: "paris",
    nom: "Paris",
    label: "Paris · Hôtel de Ville",
    lat: 48.8566,
    lon: 2.3522,
  },
  {
    slug: "marseille",
    nom: "Marseille",
    label: "Marseille · Hôtel de Ville",
    lat: 43.2965,
    lon: 5.3698,
  },
] as const;

export const POINT_METEO_PAR_DEFAUT = POINTS_METEO_PRECONFIGURES[0];

const DECIMALES_COORDONNEES_PRECISES = 4;

function sansZeroNegatif(valeur: number): number {
  return Object.is(valeur, -0) ? 0 : valeur;
}

export function trouverPointMeteoPreconfigure(
  lat: number,
  lon: number,
): PointMeteoPreconfigure | null {
  return POINTS_METEO_PRECONFIGURES.find((point) => point.lat === lat && point.lon === lon) ?? null;
}

/**
 * Une position précise est ramenée à une maille d'environ 11 m en latitude. Ce compromis
 * rend les clés de cache reproductibles sans assimiler une position GPS à un point fixe.
 */
export function normaliserCoordonneesMeteo(lat: number, lon: number): CoordonneesMeteo {
  return {
    lat: sansZeroNegatif(Number(lat.toFixed(DECIMALES_COORDONNEES_PRECISES))),
    lon: sansZeroNegatif(Number(lon.toFixed(DECIMALES_COORDONNEES_PRECISES))),
  };
}

export function resoudreLocalisationMeteo(lat: number, lon: number): LocalisationMeteoResolue {
  const pointPreconfigure = trouverPointMeteoPreconfigure(lat, lon);
  const demandee = { lat, lon };

  if (pointPreconfigure) {
    return {
      type: "preconfiguree",
      demandee,
      normalisee: { lat: pointPreconfigure.lat, lon: pointPreconfigure.lon },
      pointPreconfigure,
      cleCache: `preconfiguree:${pointPreconfigure.slug}`,
    };
  }

  const normalisee = normaliserCoordonneesMeteo(lat, lon);
  return {
    type: "precise",
    demandee,
    normalisee,
    pointPreconfigure: null,
    cleCache: `precise:${normalisee.lat.toFixed(DECIMALES_COORDONNEES_PRECISES)},${normalisee.lon.toFixed(DECIMALES_COORDONNEES_PRECISES)}`,
  };
}
