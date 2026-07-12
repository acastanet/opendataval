export const TERRITOIRE = {
  commune: {
    codeInsee: "30339",
    nom: "Val-d'Aigoual",
    siren: "200082725",
    codePostal: "30570",
    centre: { lon: 3.6272, lat: 44.081 },
    superficieHa: 9561.82,
  },
  epci: {
    code: "200034601",
    nom: "CC Causses Aigoual Cévennes – Terres Solidaires",
    nomCourt: "CC Causses Aigoual Cévennes",
  },
  montAigoual: { lon: 3.5814, lat: 44.1216, altitudeM: 1567 },
  stationMeteo: {
    numPoste: "30339001",
    synop: "07560",
    nom: "Mont Aigoual",
    altitudeM: 1567,
    // Normales officielles 1991-2020, fiche climatologique Météo-France du poste 30339001
    normales: { periode: "1991-2020", tMoyC: 5.7, precipMmAn: 1970, joursGelAn: 128 },
  },
  // [ouest, sud, est, nord]
  bbox: [3.52, 44.02, 3.75, 44.15] as [number, number, number, number],
} as const;

export const COMMUNES_EPCI = [
  { codeInsee: "30074", nom: "Causse-Bégon", population: 25 },
  { codeInsee: "30105", nom: "Dourbies", population: 177 },
  { codeInsee: "30108", nom: "L'Estréchure", population: 151 },
  { codeInsee: "30139", nom: "Lanuéjols", population: 341 },
  { codeInsee: "30140", nom: "Lasalle", population: 1202 },
  { codeInsee: "30195", nom: "Peyrolles-en-Cévennes", population: 30 },
  { codeInsee: "30198", nom: "Les Plantiers", population: 228 },
  { codeInsee: "30213", nom: "Revens", population: 37 },
  { codeInsee: "30229", nom: "Saint-André-de-Majencoules", population: 599 },
  { codeInsee: "30231", nom: "Saint-André-de-Valborgne", population: 366 },
  { codeInsee: "30297", nom: "Saint-Sauveur-Camprieu", population: 207 },
  { codeInsee: "30310", nom: "Saumane", population: 303 },
  { codeInsee: "30322", nom: "Soudorgues", population: 269 },
  { codeInsee: "30332", nom: "Trèves", population: 116 },
  { codeInsee: "30339", nom: "Val-d'Aigoual", population: 1412 },
] as const;

// `CATALOGUE_SOURCES` (sources amont) et `COUCHES` (couches cartographiques) ont été
// déplacés vers `./catalogue.ts` (chantier A, étape 1). Ce fichier ne porte plus que
// les constantes de territoire.
