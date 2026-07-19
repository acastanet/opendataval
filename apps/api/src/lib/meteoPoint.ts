export interface IntervalleProbabiliste {
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

export interface ResumeEnsembleJour {
  date: string;
  membres: number;
  temperatureMinC: IntervalleProbabiliste;
  temperatureMaxC: IntervalleProbabiliste;
  precipitationMm: IntervalleProbabiliste;
  rafaleKmh: IntervalleProbabiliste;
  probabilitePluiePct: number | null;
  probabilitePluieFortePct: number | null;
  probabiliteRafaleFortePct: number | null;
  incertitude: "faible" | "moyenne" | "forte";
}

type ObjetJson = Record<string, unknown>;

const SEUIL_JOUR_PLUVIEUX_MM = 0.2;
const SEUIL_PLUIE_FORTE_MM = 20;
const SEUIL_RAFALE_FORTE_KMH = 70;

function estObjet(value: unknown): value is ObjetJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nombres(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function chaines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function quantile(valeurs: readonly number[], fraction: number): number | null {
  if (!valeurs.length) return null;
  const tries = [...valeurs].sort((a, b) => a - b);
  const position = Math.max(0, Math.min(1, fraction)) * (tries.length - 1);
  const bas = Math.floor(position);
  const haut = Math.ceil(position);
  const valeurBasse = tries[bas];
  const valeurHaute = tries[haut];
  if (valeurBasse === undefined || valeurHaute === undefined) return null;
  return valeurBasse + (valeurHaute - valeurBasse) * (position - bas);
}

function arrondir(value: number | null, decimales = 1): number | null {
  if (value === null) return null;
  const facteur = 10 ** decimales;
  return Math.round(value * facteur) / facteur;
}

function intervalle(valeurs: readonly number[]): IntervalleProbabiliste {
  return {
    p10: arrondir(quantile(valeurs, 0.1)),
    p50: arrondir(quantile(valeurs, 0.5)),
    p90: arrondir(quantile(valeurs, 0.9)),
  };
}

function valeursMembres(daily: ObjetJson, variable: string, index: number): number[] {
  const cles = Object.keys(daily).filter((cle) => cle === variable || cle.startsWith(`${variable}_member`));
  const valeurs: number[] = [];
  for (const cle of cles) {
    const serie = daily[cle];
    if (!Array.isArray(serie)) continue;
    const valeur = serie[index];
    if (typeof valeur === "number" && Number.isFinite(valeur)) valeurs.push(valeur);
  }
  return valeurs;
}

function probabilite(valeurs: readonly number[], seuil: number): number | null {
  if (!valeurs.length) return null;
  return Math.round((100 * valeurs.filter((valeur) => valeur >= seuil).length) / valeurs.length);
}

function largeur(intervalleValeurs: IntervalleProbabiliste): number {
  if (intervalleValeurs.p10 === null || intervalleValeurs.p90 === null) return 0;
  return intervalleValeurs.p90 - intervalleValeurs.p10;
}

/**
 * Lecture simplifiée de la dispersion ECMWF. Ce n'est pas un indice officiel : les intervalles
 * P10-P90 restent présents dans la réponse afin que l'interface expose les valeurs sous-jacentes.
 */
function classerIncertitude(
  temperature: IntervalleProbabiliste,
  precipitation: IntervalleProbabiliste,
  probabilitePluiePct: number | null,
): ResumeEnsembleJour["incertitude"] {
  const largeurTemperature = largeur(temperature);
  const largeurPrecipitation = largeur(precipitation);
  const pluieIndecise = probabilitePluiePct !== null && probabilitePluiePct >= 35 && probabilitePluiePct <= 65;
  if (largeurTemperature >= 8 || largeurPrecipitation >= 20 || pluieIndecise) return "forte";
  if (largeurTemperature >= 4 || largeurPrecipitation >= 8 || (probabilitePluiePct !== null && probabilitePluiePct >= 20 && probabilitePluiePct <= 80)) {
    return "moyenne";
  }
  return "faible";
}

export function resumerEnsemble(donnees: unknown): ResumeEnsembleJour[] {
  if (!estObjet(donnees) || !estObjet(donnees.daily)) return [];
  const daily = donnees.daily;
  const dates = chaines(daily.time);

  return dates.map((date, index) => {
    const temperaturesMin = valeursMembres(daily, "temperature_2m_min", index);
    const temperaturesMax = valeursMembres(daily, "temperature_2m_max", index);
    const precipitations = valeursMembres(daily, "precipitation_sum", index);
    const rafales = valeursMembres(daily, "wind_gusts_10m_max", index);
    const temperatureMaxC = intervalle(temperaturesMax);
    const precipitationMm = intervalle(precipitations);
    const probabilitePluiePct = probabilite(precipitations, SEUIL_JOUR_PLUVIEUX_MM);

    return {
      date,
      membres: Math.max(temperaturesMin.length, temperaturesMax.length, precipitations.length, rafales.length),
      temperatureMinC: intervalle(temperaturesMin),
      temperatureMaxC,
      precipitationMm,
      rafaleKmh: intervalle(rafales),
      probabilitePluiePct,
      probabilitePluieFortePct: probabilite(precipitations, SEUIL_PLUIE_FORTE_MM),
      probabiliteRafaleFortePct: probabilite(rafales, SEUIL_RAFALE_FORTE_KMH),
      incertitude: classerIncertitude(temperatureMaxC, precipitationMm, probabilitePluiePct),
    };
  });
}

export function validerCoordonnees(latBrut: unknown, lonBrut: unknown): { lat: number; lon: number } | null {
  const lat = typeof latBrut === "string" || typeof latBrut === "number" ? Number(latBrut) : Number.NaN;
  const lon = typeof lonBrut === "string" || typeof lonBrut === "number" ? Number(lonBrut) : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rayonTerreKm = 6371;
  const radians = (degres: number): number => (degres * Math.PI) / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLon = radians(b.lon - a.lon);
  const valeur =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(deltaLon / 2) ** 2;
  return rayonTerreKm * 2 * Math.atan2(Math.sqrt(valeur), Math.sqrt(1 - valeur));
}

export function extraireTableauNumerique(objet: unknown, cle: string): number[] {
  return estObjet(objet) ? nombres(objet[cle]) : [];
}
