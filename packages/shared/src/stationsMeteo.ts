export interface StationMeteo {
  id: string;
  nom: string;
  altitudeM: number;
  lon: number;
  lat: number;
  reseau: "meteofrance" | "infoclimat";
  /** Météo-France uniquement : RADOME (capteurs complets, 6 min) ou ETENDU (température + pluie horaires). */
  pack?: "RADOME" | "ETENDU";
  licence: string;
  /** Station située dans le périmètre de la CC Causses Aigoual Cévennes. */
  dansEpci?: boolean;
}

const LICENCE_OUVERTE = "Licence Ouverte 2.0 (ETALAB)";
const CC_BY_NC = "CC BY-NC 4.0";
const CC_BY = "CC BY 4.0";

/**
 * Réseau d'observation temps réel autour de Val-d'Aigoual : stations Météo-France (API DPObs v2,
 * identifiants et coordonnées relevés via DPObs/v2/liste-stations) et stations amateurs Infoclimat
 * (réseau StatIC, identifiants et coordonnées relevés via le GeoJSON open data data.gouv.fr).
 * Liste figée manuellement (pas de découverte dynamique) — à revérifier périodiquement.
 */
export const STATIONS_METEO: readonly StationMeteo[] = [
  // Météo-France — RADOME (données 6 min)
  { id: "30339001", nom: "Mont Aigoual", altitudeM: 1567, lon: 3.5815, lat: 44.121333, reseau: "meteofrance", pack: "RADOME", licence: LICENCE_OUVERTE, dansEpci: true },
  { id: "30297001", nom: "Saint-Sauveur-Camprieu", altitudeM: 1107, lon: 3.4745, lat: 44.119333, reseau: "meteofrance", pack: "RADOME", licence: LICENCE_OUVERTE, dansEpci: true },
  { id: "48020003", nom: "Bassurels", altitudeM: 1042, lon: 3.630667, lat: 44.1965, reseau: "meteofrance", pack: "RADOME", licence: LICENCE_OUVERTE },
  { id: "48176002", nom: "Saint-Pierre-des-Tripiers", altitudeM: 929, lon: 3.3035, lat: 44.2465, reseau: "meteofrance", pack: "RADOME", licence: LICENCE_OUVERTE },
  { id: "30176002", nom: "Montdardier", altitudeM: 640, lon: 3.58, lat: 43.947, reseau: "meteofrance", pack: "RADOME", licence: LICENCE_OUVERTE },
  { id: "30132004", nom: "La Grand-Combe", altitudeM: 499, lon: 4.010167, lat: 44.243, reseau: "meteofrance", pack: "RADOME", licence: LICENCE_OUVERTE },

  // Météo-France — ETENDU (température + pluie horaires)
  { id: "30009001", nom: "Alzon", altitudeM: 611, lon: 3.444, lat: 43.979, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "30087002", nom: "Colognac", altitudeM: 589, lon: 3.825, lat: 44.021833, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "30129001", nom: "Générargues", altitudeM: 139, lon: 3.977667, lat: 44.073333, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "30263001", nom: "Saint-Hippolyte-du-Fort", altitudeM: 237, lon: 3.835167, lat: 43.9615, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "30269006", nom: "Saint-Jean-du-Gard", altitudeM: 196, lon: 3.872, lat: 44.1105, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "30350001", nom: "Le Vigan", altitudeM: 222, lon: 3.6115, lat: 43.99, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "34064003", nom: "Le Caylar", altitudeM: 729, lon: 3.3085, lat: 43.867167, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "34174002", nom: "Moulès-et-Baucels", altitudeM: 252, lon: 3.752, lat: 43.948, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48036001", nom: "Cassagnas", altitudeM: 801, lon: 3.746833, lat: 44.270333, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48051002", nom: "Le Collet-de-Dèze", altitudeM: 490, lon: 3.931833, lat: 44.259167, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48061002", nom: "Florac", altitudeM: 618, lon: 3.596333, lat: 44.309, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48069001", nom: "Gatuzières", altitudeM: 965, lon: 3.499, lat: 44.195333, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48130002", nom: "Les Rousses", altitudeM: 812, lon: 3.5845, lat: 44.206833, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48148004", nom: "Saint-Étienne-Vallée-Française", altitudeM: 518, lon: 3.854167, lat: 44.165833, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },
  { id: "48186001", nom: "La Salle-Prunet", altitudeM: 903, lon: 3.650667, lat: 44.315667, reseau: "meteofrance", pack: "ETENDU", licence: LICENCE_OUVERTE },

  // Infoclimat — réseau StatIC (stations amateurs)
  { id: "000UB", nom: "Valleraugue", altitudeM: 400, lon: 3.62148, lat: 44.0828, reseau: "infoclimat", licence: CC_BY_NC, dansEpci: true },
  { id: "000GK", nom: "Thoiras", altitudeM: 200, lon: 3.918016, lat: 44.081944, reseau: "infoclimat", licence: CC_BY_NC },
  { id: "000I1", nom: "Laroque", altitudeM: 150, lon: 3.7333333, lat: 43.9166667, reseau: "infoclimat", licence: CC_BY_NC },
  { id: "000VE", nom: "Mas-Saint-Chély — Causse Méjean", altitudeM: 923, lon: 3.39569, lat: 44.26691, reseau: "infoclimat", licence: CC_BY_NC },
  { id: "000YB", nom: "Vialas — Nojaret", altitudeM: 680, lon: 3.909748, lat: 44.34022, reseau: "infoclimat", licence: CC_BY_NC },
  { id: "STATIC0397", nom: "Gorniès", altitudeM: 210, lon: 3.62302, lat: 43.8884, reseau: "infoclimat", licence: CC_BY_NC },
  { id: "STATIC0403", nom: "Chamborigaud — Mas Jourdon", altitudeM: 598, lon: 3.93694, lat: 44.3104, reseau: "infoclimat", licence: CC_BY },
];

export const STATIONS_PAR_ID: ReadonlyMap<string, StationMeteo> = new Map(
  STATIONS_METEO.map((s) => [s.id, s]),
);

export const stationsMeteoFrance = (): StationMeteo[] =>
  STATIONS_METEO.filter((s) => s.reseau === "meteofrance");

export const stationsRadome = (): StationMeteo[] =>
  STATIONS_METEO.filter((s) => s.pack === "RADOME");

export const stationsInfoclimat = (): StationMeteo[] =>
  STATIONS_METEO.filter((s) => s.reseau === "infoclimat");
