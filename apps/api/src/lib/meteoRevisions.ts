type ObjetJson = Record<string, unknown>;

export type NiveauRevision = "faible" | "moderee" | "marquee";

export interface ValeursRevisionJour {
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationMm: number | null;
  codeMeteo: number | null;
  condition: string | null;
}

export interface ComparaisonRevisionJour {
  date: string;
  jMoins1: ValeursRevisionJour;
  j: ValeursRevisionJour;
  ecarts: {
    temperatureMinC: number | null;
    temperatureMaxC: number | null;
    precipitationMm: number | null;
    heuresScenarioComparees: number;
    heuresScenarioModifiees: number;
    tauxScenarioModifiePct: number | null;
  };
  niveauRevision: NiveauRevision;
}

export interface ResumeRevisions {
  joursComparables: number;
  ecartMoyenTemperatureMinC: number | null;
  ecartMoyenTemperatureMaxC: number | null;
  ecartMoyenPrecipitationMm: number | null;
  joursScenarioRevise: number;
  repartition: Record<NiveauRevision, number>;
}

interface AccumulateurJour {
  date: string;
  temperaturesJMoins1: number[];
  temperaturesJ: number[];
  precipitationsJMoins1: number[];
  precipitationsJ: number[];
  codesJMoins1: number[];
  codesJ: number[];
  heuresScenarioComparees: number;
  heuresScenarioModifiees: number;
}

function estObjet(value: unknown): value is ObjetJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serie(objet: ObjetJson, cle: string): unknown[] {
  return Array.isArray(objet[cle]) ? objet[cle] as unknown[] : [];
}

function nombre(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrondir(value: number | null, decimales = 1): number | null {
  if (value === null) return null;
  const facteur = 10 ** decimales;
  return Math.round(value * facteur) / facteur;
}

function somme(valeurs: readonly number[]): number | null {
  return valeurs.length ? arrondir(valeurs.reduce((total, valeur) => total + valeur, 0)) : null;
}

function minimum(valeurs: readonly number[]): number | null {
  return valeurs.length ? arrondir(Math.min(...valeurs)) : null;
}

function maximum(valeurs: readonly number[]): number | null {
  return valeurs.length ? arrondir(Math.max(...valeurs)) : null;
}

function ecart(apres: number | null, avant: number | null): number | null {
  return apres === null || avant === null ? null : arrondir(apres - avant);
}

function categorieCode(code: number): string {
  if (code <= 3) return "ciel";
  if (code === 45 || code === 48) return "brouillard";
  if (code >= 51 && code <= 57) return "bruine";
  if (code >= 61 && code <= 67) return "pluie";
  if (code >= 71 && code <= 77) return "neige";
  if (code >= 80 && code <= 82) return "averses";
  if (code === 85 || code === 86) return "averses-neige";
  if (code >= 95) return "orage";
  return `code-${code}`;
}

function libelleCode(code: number): string {
  if (code === 0) return "Ciel dégagé";
  if (code === 1) return "Peu nuageux";
  if (code === 2) return "Partiellement nuageux";
  if (code === 3) return "Couvert";
  if (code === 45 || code === 48) return "Brouillard";
  if (code >= 51 && code <= 57) return "Bruine";
  if (code >= 61 && code <= 67) return "Pluie";
  if (code >= 71 && code <= 77) return "Neige";
  if (code >= 80 && code <= 82) return "Averses";
  if (code === 85 || code === 86) return "Averses de neige";
  if (code >= 95) return "Orages";
  return `Code météo ${code}`;
}

function severiteCode(code: number): number {
  const categorie = categorieCode(code);
  const severites: Record<string, number> = {
    ciel: code,
    brouillard: 4,
    bruine: 5,
    pluie: 6,
    neige: 7,
    averses: 8,
    "averses-neige": 9,
    orage: 10,
  };
  return severites[categorie] ?? 0;
}

function codeSignificatif(codes: readonly number[]): number | null {
  if (!codes.length) return null;
  return [...codes].sort((a, b) => severiteCode(b) - severiteCode(a))[0] ?? null;
}

function valeursJour(
  temperatures: readonly number[],
  precipitations: readonly number[],
  codes: readonly number[],
): ValeursRevisionJour {
  const codeMeteo = codeSignificatif(codes);
  return {
    temperatureMinC: minimum(temperatures),
    temperatureMaxC: maximum(temperatures),
    precipitationMm: somme(precipitations),
    codeMeteo,
    condition: codeMeteo === null ? null : libelleCode(codeMeteo),
  };
}

function classerRevision(
  ecartMin: number | null,
  ecartMax: number | null,
  ecartPrecipitation: number | null,
  tauxScenarioModifiePct: number | null,
): NiveauRevision {
  const amplitudeTemperature = Math.max(Math.abs(ecartMin ?? 0), Math.abs(ecartMax ?? 0));
  const amplitudePrecipitation = Math.abs(ecartPrecipitation ?? 0);
  const tauxScenario = tauxScenarioModifiePct ?? 0;
  if (amplitudeTemperature >= 3 || amplitudePrecipitation >= 10 || tauxScenario >= 50) return "marquee";
  if (amplitudeTemperature >= 1.5 || amplitudePrecipitation >= 3 || tauxScenario >= 20) return "moderee";
  return "faible";
}

export function agregerRevisions(donnees: unknown): ComparaisonRevisionJour[] {
  if (!estObjet(donnees) || !estObjet(donnees.hourly)) return [];
  const hourly = donnees.hourly;
  const temps = serie(hourly, "time");
  const temperaturesJ = serie(hourly, "temperature_2m");
  const temperaturesJMoins1 = serie(hourly, "temperature_2m_previous_day1");
  const precipitationsJ = serie(hourly, "precipitation");
  const precipitationsJMoins1 = serie(hourly, "precipitation_previous_day1");
  const codesJ = serie(hourly, "weather_code");
  const codesJMoins1 = serie(hourly, "weather_code_previous_day1");
  const jours = new Map<string, AccumulateurJour>();

  for (let index = 0; index < temps.length; index++) {
    const horodatage = temps[index];
    if (typeof horodatage !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(horodatage)) continue;
    const date = horodatage.slice(0, 10);
    let jour = jours.get(date);
    if (!jour) {
      jour = {
        date,
        temperaturesJMoins1: [],
        temperaturesJ: [],
        precipitationsJMoins1: [],
        precipitationsJ: [],
        codesJMoins1: [],
        codesJ: [],
        heuresScenarioComparees: 0,
        heuresScenarioModifiees: 0,
      };
      jours.set(date, jour);
    }

    const temperatureJ = nombre(temperaturesJ[index]);
    const temperatureJMoins1 = nombre(temperaturesJMoins1[index]);
    const precipitationJ = nombre(precipitationsJ[index]);
    const precipitationJMoins1 = nombre(precipitationsJMoins1[index]);
    const codeJ = nombre(codesJ[index]);
    const codeJMoins1 = nombre(codesJMoins1[index]);
    if (temperatureJ !== null) jour.temperaturesJ.push(temperatureJ);
    if (temperatureJMoins1 !== null) jour.temperaturesJMoins1.push(temperatureJMoins1);
    if (precipitationJ !== null) jour.precipitationsJ.push(precipitationJ);
    if (precipitationJMoins1 !== null) jour.precipitationsJMoins1.push(precipitationJMoins1);
    if (codeJ !== null) jour.codesJ.push(codeJ);
    if (codeJMoins1 !== null) jour.codesJMoins1.push(codeJMoins1);
    if (codeJ !== null && codeJMoins1 !== null) {
      jour.heuresScenarioComparees++;
      if (categorieCode(codeJ) !== categorieCode(codeJMoins1)) jour.heuresScenarioModifiees++;
    }
  }

  return [...jours.values()].map((jour) => {
    const jMoins1 = valeursJour(jour.temperaturesJMoins1, jour.precipitationsJMoins1, jour.codesJMoins1);
    const j = valeursJour(jour.temperaturesJ, jour.precipitationsJ, jour.codesJ);
    const ecartMin = ecart(j.temperatureMinC, jMoins1.temperatureMinC);
    const ecartMax = ecart(j.temperatureMaxC, jMoins1.temperatureMaxC);
    const ecartPrecipitation = ecart(j.precipitationMm, jMoins1.precipitationMm);
    const tauxScenarioModifiePct = jour.heuresScenarioComparees
      ? Math.round((100 * jour.heuresScenarioModifiees) / jour.heuresScenarioComparees)
      : null;
    return {
      date: jour.date,
      jMoins1,
      j,
      ecarts: {
        temperatureMinC: ecartMin,
        temperatureMaxC: ecartMax,
        precipitationMm: ecartPrecipitation,
        heuresScenarioComparees: jour.heuresScenarioComparees,
        heuresScenarioModifiees: jour.heuresScenarioModifiees,
        tauxScenarioModifiePct,
      },
      niveauRevision: classerRevision(ecartMin, ecartMax, ecartPrecipitation, tauxScenarioModifiePct),
    };
  }).filter((jour) => (
    jour.jMoins1.temperatureMinC !== null
    && jour.j.temperatureMinC !== null
    && jour.jMoins1.temperatureMaxC !== null
    && jour.j.temperatureMaxC !== null
  ));
}

function moyenneSignee(valeurs: readonly (number | null)[]): number | null {
  const disponibles = valeurs.filter((valeur): valeur is number => valeur !== null);
  if (!disponibles.length) return null;
  return arrondir(disponibles.reduce((total, valeur) => total + valeur, 0) / disponibles.length);
}

export function resumerRevisions(comparaisons: readonly ComparaisonRevisionJour[]): ResumeRevisions {
  const repartition: Record<NiveauRevision, number> = { faible: 0, moderee: 0, marquee: 0 };
  for (const comparaison of comparaisons) repartition[comparaison.niveauRevision]++;
  return {
    joursComparables: comparaisons.length,
    ecartMoyenTemperatureMinC: moyenneSignee(comparaisons.map((jour) => jour.ecarts.temperatureMinC)),
    ecartMoyenTemperatureMaxC: moyenneSignee(comparaisons.map((jour) => jour.ecarts.temperatureMaxC)),
    ecartMoyenPrecipitationMm: moyenneSignee(comparaisons.map((jour) => jour.ecarts.precipitationMm)),
    joursScenarioRevise: comparaisons.filter((jour) => jour.ecarts.heuresScenarioModifiees > 0).length,
    repartition,
  };
}
