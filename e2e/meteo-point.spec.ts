import { expect, test, type Page } from "@playwright/test";

const heures = Array.from({ length: 24 }, (_, index) => `2026-07-19T${String(index).padStart(2, "0")}:00`);
const jours = Array.from({ length: 10 }, (_, index) => `2026-07-${String(19 + index).padStart(2, "0")}`);

const prevision = {
  localisation: {
    type: "precise",
    demandee: { lat: 44.064579, lon: 3.683019 },
    normalisee: { lat: 44.0646, lon: 3.683 },
    pointPreconfigure: null,
    dansTerritoire: true,
  },
  genereLe: "2026-07-19T10:00:00.000Z",
  observation: {
    station: { id: "30100001", nom: "Mont Aigoual", altitudeM: 1567, distanceKm: 4.8, reseau: "meteofrance" },
    mesure: { heure_utc: "2026-07-19T09:54:00.000Z", t: 18.4, humidite: 61, vent_kmh: 17, rafale_kmh: 36, pluie_1h_mm: 0 },
    perime: false,
  },
  courtTerme: {
    modele: "Météo-France AROME HD / AROME, puis ARPEGE",
    resolution: "1,5 à 2,5 km jusqu'à 48 h, puis 11 à 25 km",
    pointModele: { altitudeM: 1210 },
    current: {
      time: "2026-07-19T10:00",
      temperature_2m: 18.4,
      apparent_temperature: 17.2,
      relative_humidity_2m: 61,
      surface_pressure: 886,
      precipitation: 0,
      weather_code: 1,
      wind_speed_10m: 17,
      wind_direction_10m: 45,
      wind_gusts_10m: 36,
    },
    hourly: {
      time: heures,
      temperature_2m: heures.map((_, index) => 15 + (index % 8)),
      apparent_temperature: heures.map((_, index) => 14 + (index % 8)),
      relative_humidity_2m: heures.map((_, index) => 58 + (index % 10)),
      surface_pressure: heures.map(() => 886),
      precipitation: heures.map((_, index) => (index === 5 ? 1.2 : 0)),
      wind_speed_10m: heures.map((_, index) => 12 + index / 2),
      wind_direction_10m: heures.map(() => 45),
      wind_gusts_10m: heures.map((_, index) => 22 + index),
      weather_code: heures.map((_, index) => index === 5 ? 61 : 1),
    },
    daily: {
      time: jours.slice(0, 4),
      weather_code: [1, 2, 61, 3],
      temperature_2m_min: [13, 14, 12, 11],
      temperature_2m_max: [24, 25, 20, 21],
      precipitation_sum: [0, 0.3, 7.4, 1.1],
      snowfall_sum: [0, 0, 0, 0],
      wind_gusts_10m_max: [33, 41, 56, 38],
    },
  },
  qualiteAir: {
    modele: "Copernicus CAMS European Air Quality Ensemble",
    resolution: "environ 11 km",
    current: { european_aqi: 24, pm10: 12.1, pm2_5: 6.4, nitrogen_dioxide: 4.8, ozone: 71.2 },
  },
  moyenTerme: {
    modele: "IFS HRES 9 km + IFS ENS 51 scénarios à 0,25°",
    membresEnsemble: 51,
    daily: {
      time: jours,
      weather_code: [1, 2, 61, 3, 2, 80, 3, 1, 2, 61],
      temperature_2m_min: [13, 14, 12, 11, 10, 11, 9, 10, 12, 11],
      temperature_2m_max: [24, 25, 20, 21, 22, 19, 20, 23, 24, 19],
      precipitation_sum: [0, 0.3, 7.4, 1.1, 0.2, 3.1, 0.4, 0, 0.1, 8],
      snowfall_sum: Array(10).fill(0),
      wind_gusts_10m_max: [33, 41, 56, 38, 30, 46, 34, 29, 31, 48],
    },
    ensemble: jours.map((date, index) => ({
      date,
      temperatureMinC: { p10: 7 + index / 2, p50: 10 + index / 2, p90: 13 + index / 2 },
      temperatureMaxC: { p10: 16 + index / 2, p50: 20 + index / 2, p90: 24 + index / 2 },
      precipitationMm: { p10: 0, p50: index % 3 === 0 ? 2 : 0.2, p90: index % 3 === 0 ? 12 : 3 },
      probabilitePluiePct: index % 3 === 0 ? 67 : 24,
      probabilitePluieFortePct: index % 3 === 0 ? 18 : 0,
      probabiliteRafaleFortePct: index === 4 ? 12 : 0,
      incertitude: index % 3 === 0 ? "forte" : "moyenne",
    })),
  },
  vigilance: {
    departement: "Gard",
    code: "30",
    url: "https://vigilance.meteofrance.fr/fr/gard",
    miseAJour: "2026-07-20T14:00:35.000Z",
    couleurMax: "orange",
    periodes: [
      {
        echeance: "J",
        debut: "2026-07-20T14:00:00.000Z",
        fin: "2026-07-20T22:00:00.000Z",
        couleurMax: "orange",
        phenomenes: [
          { id: "6", nom: "Canicule", couleur: "orange" },
        ],
      },
      {
        echeance: "J1",
        debut: "2026-07-20T22:00:00.000Z",
        fin: "2026-07-21T22:00:00.000Z",
        couleurMax: "orange",
        phenomenes: [
          { id: "6", nom: "Canicule", couleur: "orange" },
          { id: "3", nom: "Orages", couleur: "jaune" },
        ],
      },
    ],
    indisponible: false,
    perime: false,
  },
  liens: { ecmwf: "https://charts.ecmwf.int/", meteoFrance: "https://meteofrance.com/" },
  sourcesIndisponibles: [],
  perime: false,
};

const contexteClimatique = {
  disponible: true,
  point: { type: "preconfiguree", slug: "val-aigoual", nom: "Mairie de Val-d’Aigoual, Valleraugue" },
  reference: {
    debut: 1991,
    fin: 2020,
    fenetreJours: 15,
    produit: "ERA5-Land",
    version: "1.0.0",
    nbValeurs: 450,
    completudePct: 100,
    calculeLe: "2026-07-19T07:00:00.000Z",
  },
  temperatureMax: { mediane: 19, p10: 14, p90: 23 },
  temperatureMin: { mediane: 11, p10: 7, p90: 15 },
  altitudeMailleM: 386,
  limite: "Estimation climatique maillée, moins précise en zone de relief et lorsque l’altitude réelle diffère de celle de la maille.",
};

const bilanThermique = {
  disponible: true,
  point: { type: "preconfiguree", slug: "val-aigoual", nom: "Mairie de Val-d’Aigoual, Valleraugue" },
  periode: { annee: 2026, mois: 6, debut: "2026-06-01", fin: "2026-06-30" },
  utci: { maximumC: 39.4, categorie: "stress thermique très fort" },
  jours: { stressFort: 15, stressTresFort: 3, stressExtreme: 0, nuitsTropicales: 4 },
  dates: {
    stressFort: ["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22", "2026-06-23"],
    stressTresFort: ["2026-06-20", "2026-06-21", "2026-06-22"],
    stressExtreme: [],
  },
  reference: { debut: 1991, fin: 2020, joursStressFort: 3.5, anomalieJoursStress: 11.5 },
  source: { produit: "ERA5-HEAT / UTCI", version: "1.1", calculeLe: "2026-07-08T07:10:00.000Z", completudePct: 100 },
  limite: "Estimation ERA5-HEAT sur une maille d’environ 0,25°, qui ne représente pas les microclimats ni toutes les différences d’altitude.",
};

const comparaisonRevisions = {
  localisation: {
    type: "preconfiguree",
    demandee: { lat: 44.081192, lon: 3.641467 },
    normalisee: { lat: 44.081192, lon: 3.641467 },
    pointPreconfigure: { slug: "val-aigoual", nom: "Val-d’Aigoual" },
    dansTerritoire: true,
  },
  genereLe: "2026-07-19T08:00:00.000Z",
  periode: { debut: "2026-07-05", fin: "2026-07-18", joursDemandes: 14 },
  disponible: true,
  derniere: {
    date: "2026-07-18",
    jMoins1: { temperatureMinC: 12, temperatureMaxC: 22, precipitationMm: 1, codeMeteo: 3, condition: "Couvert" },
    j: { temperatureMinC: 13, temperatureMaxC: 24, precipitationMm: 5, codeMeteo: 63, condition: "Pluie" },
    ecarts: { temperatureMinC: 1, temperatureMaxC: 2, precipitationMm: 4, heuresScenarioComparees: 24, heuresScenarioModifiees: 8, tauxScenarioModifiePct: 33 },
    niveauRevision: "moderee",
  },
  historique: [
    {
      date: "2026-07-18",
      jMoins1: { temperatureMinC: 12, temperatureMaxC: 22, precipitationMm: 1, codeMeteo: 3, condition: "Couvert" },
      j: { temperatureMinC: 13, temperatureMaxC: 24, precipitationMm: 5, codeMeteo: 63, condition: "Pluie" },
      ecarts: { temperatureMinC: 1, temperatureMaxC: 2, precipitationMm: 4, heuresScenarioComparees: 24, heuresScenarioModifiees: 8, tauxScenarioModifiePct: 33 },
      niveauRevision: "moderee",
    },
    {
      date: "2026-07-17",
      jMoins1: { temperatureMinC: 11, temperatureMaxC: 23, precipitationMm: 0, codeMeteo: 1, condition: "Peu nuageux" },
      j: { temperatureMinC: 11.5, temperatureMaxC: 23.5, precipitationMm: 0, codeMeteo: 2, condition: "Partiellement nuageux" },
      ecarts: { temperatureMinC: 0.5, temperatureMaxC: 0.5, precipitationMm: 0, heuresScenarioComparees: 24, heuresScenarioModifiees: 0, tauxScenarioModifiePct: 0 },
      niveauRevision: "faible",
    },
  ],
  resume: {
    joursComparables: 2,
    ecartMoyenTemperatureMinC: 0.8,
    ecartMoyenTemperatureMaxC: 1.3,
    ecartMoyenPrecipitationMm: 2,
    joursScenarioRevise: 1,
    repartition: { faible: 1, moderee: 1, marquee: 0 },
  },
  interpretation: "Ces écarts mesurent la révision du modèle entre J−1 et J, pas son erreur par rapport au temps réellement observé.",
  source: { nom: "Open-Meteo Previous Runs API", modele: "Météo-France AROME / ARPEGE seamless", url: "https://open-meteo.com/en/docs/previous-runs-api" },
};

let requetesPoint = 0;

async function installerMocks(page: Page) {
  await page.route(/\/api\//, (route) => {
    const chemin = new URL(route.request().url()).pathname;
    if (chemin === "/api/meteo/point") {
      requetesPoint += 1;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(prevision) });
    }
    if (chemin === "/api/meteo/localisation") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ lieu: { label: "La Borie du Ponteil (Valleraugue) 30570 Val-d’Aigoual", nom: "La Borie du Ponteil", type: "locality", distanceM: 32, lat: 44.064757, lon: 3.682706 } }),
      });
    }
    if (chemin === "/api/meteo/lieux") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ lieux: [{ label: "Valleraugue 30570 Val-d’Aigoual", nom: "Valleraugue", type: "locality", lat: 44.082639, lon: 3.640504 }] }),
      });
    }
    if (chemin === "/api/meteo/contexte-climatique") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(contexteClimatique) });
    }
    if (chemin === "/api/meteo/bilan-thermique") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(bilanThermique) });
    }
    if (chemin === "/api/meteo/revisions") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(comparaisonRevisions) });
    }
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });
  await page.route("https://vigilance.meteofrance.fr/**", (route) => route.fulfill({
    contentType: "text/html",
    body: "<meta charset='utf-8'><main style='font:16px Arial;padding:16px;color:#202020'><strong>Vigilance Météo-France</strong><p>Gard : aucun phénomène dangereux en cours.</p></main>",
  }));
  await page.route("https://data.geopf.fr/**", (route) => route.abort());
}

test.beforeEach(async ({ page }) => {
  requetesPoint = 0;
  await page.addInitScript(() => {
    Date.now = () => new Date("2026-07-19T08:05:00.000Z").getTime();
  });
  await installerMocks(page);
});

test("hiérarchise les informations météo d'un point", async ({ page }) => {
  await page.goto("/meteo/");

  const bloc = page.getByTestId("meteo-point");
  await expect(bloc.getByRole("heading", { name: "La Borie du Ponteil" })).toBeVisible();
  await expect(bloc.getByTestId("precision-localisation")).toContainText("Lieu-dit BAN");
  await expect(bloc.getByText("Ressenti 17 °C")).toBeVisible();
  await expect(bloc.getByText("Pas de phénomène marqué à court terme")).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Heure par heure" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Les 4 prochains jours" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Qualité de l’air" })).toBeVisible();
  await expect(bloc.getByText("Relais progressif ARPEGE")).toBeVisible();
  await expect(bloc.getByText("Niveau global : Orange")).toBeVisible();
  await expect(bloc.getByText("Aujourd'hui")).toBeVisible();
  await expect(bloc.getByText("Canicule").first()).toBeVisible();
  await expect(bloc.getByText("Demain")).toBeVisible();
  await expect(bloc.getByText("Orages")).toBeVisible();
  await expect(bloc.locator(".meteo-hero")).toHaveScreenshot("meteo-accueil.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });

  await bloc.locator("details.tendance-ecmwf > summary").click({ force: true });
  await expect(bloc.getByText("≥ 20 mm : 18% · rafale ≥ 70 km/h : 0%").first()).toBeVisible();
  await expect(bloc.getByRole("link", { name: /Vérifier le météogramme officiel ECMWF/ })).toBeVisible();

  await bloc.locator("details.choisir-lieu > summary").click({ force: true });
  await expect(bloc.locator(".carte-point .maplibregl-marker")).toBeVisible();
  await bloc.getByLabel("Latitude").fill("44.065000");
  await bloc.getByLabel("Longitude").fill("3.683000");
  await bloc.getByLabel("Longitude").press("Enter");
  await expect.poll(() => requetesPoint).toBeGreaterThan(1);

  await bloc.getByLabel("Rechercher une adresse ou un lieu-dit").fill("Valleraugue");
  await expect(bloc.getByRole("button", { name: /Valleraugue 30570/ })).toBeVisible();
});

test("affiche la météo essentielle sans navigation du site", async ({ page }) => {
  await page.goto("/meteo/essentiel/");

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const bloc = page.getByTestId("meteo-point");
  await expect(page.locator(".entete-site")).toHaveCount(0);
  await expect(page.locator(".pied-site")).toHaveCount(0);
  await expect(bloc.getByText("Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue")).toBeVisible();
  await expect(bloc.getByRole("button", { name: "Afficher la météo de Val-d’Aigoual" })).toHaveAttribute("aria-pressed", "true");
  await expect(bloc.getByRole("button", { name: "Afficher la météo de Paris" })).toBeVisible();
  await expect(bloc.getByRole("button", { name: "Afficher la météo de Marseille" })).toBeVisible();
  await expect(bloc.locator(".date-heure")).toContainText("DIM. 19 JUIL.");
  await expect(bloc.locator(".date-heure")).toContainText("consulté à 10:05");
  await expect(bloc.getByText(/Prévision mise à jour à 19 juil\., 12:00/)).toBeVisible();
  await expect(bloc.getByRole("button", { name: "Utiliser ma position" })).toBeVisible();
  const vigilance = bloc.locator(".vigilance-essentiel");
  await expect(vigilance).toBeVisible();
  await expect(vigilance.getByText("Vigilance Gard · 30")).toBeVisible();
  await expect(vigilance.getByText("Vigilance Orange")).toBeVisible();
  await expect(vigilance.getByText("Aujourd’hui")).toBeVisible();
  await expect(vigilance.getByText("Canicule").first()).toBeVisible();
  await expect(vigilance.getByText("Orages")).toBeVisible();
  await expect(vigilance.getByText("Jaune")).toBeVisible();
  await expect(vigilance.getByText(/Vigilance mise à jour à/)).toBeVisible();
  await expect(bloc.getByTestId("temperature-actuelle")).toHaveText("18°C");
  await expect(bloc.getByText("Ressenti estimé : 17 °C")).toBeVisible();
  await expect(bloc.getByText("Altitude du point modèle : 1 210 m")).toBeVisible();
  await expect(bloc.getByTestId("temperature-plus-trois")).toHaveText("20°C");
  await expect(bloc.locator(".graphique-heures li")).toHaveCount(4);
  await expect(bloc.locator(".graphique-heures circle")).toHaveCount(0);
  await expect(bloc.locator(".graphique-heures .graduation")).toHaveCount(3);
  await expect(bloc.locator(".graphique-heures .barre")).toHaveCount(4);
  await expect(bloc.locator(".graphique-heures .barre").first()).toHaveCSS("fill", "rgb(215, 38, 30)");
  await expect(bloc.getByText(/Hausse de 1,6 °C dans les trois prochaines heures/)).toBeVisible();
  await expect(bloc.locator(".contrepoints")).toHaveCount(0);
  await expect(bloc.getByRole("heading", { name: "Les 3 jours à venir" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Demain" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Heure par heure" })).toHaveCount(0);
  await expect(bloc.getByRole("heading", { name: "Qualité de l’air" })).toHaveCount(0);
  await expect(bloc.getByText("Tendance probabiliste ECMWF")).toHaveCount(0);
  await expect(bloc.getByText("Précision réelle et sources")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "24 °C prévus" })).toBeVisible();
  await expect(page.getByText("Environ +5 °C par rapport à la référence 1991–2020")).toBeVisible();
  await expect(page.getByText("Plus chaud que 90 % des journées comparables")).toBeVisible();
  await expect(page.getByRole("heading", { name: "15 jours de fort stress thermique" })).toBeVisible();
  await expect(bloc.getByRole("link", { name: "Bilan thermique" })).toBeVisible();
  await expect(bloc.getByRole("link", { name: "À propos de cette météo et sources des données" })).toHaveAttribute("href", "/meteo/informations/?lieu=val-aigoual");
  await expect(page.getByRole("link", { name: "Voir le bilan thermique" })).toBeVisible();

  await expect(bloc).toHaveScreenshot("meteo-essentiel.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });

  const requeteParis = page.waitForRequest((requete) => {
    const url = new URL(requete.url());
    return url.pathname === "/api/meteo/point"
      && url.searchParams.get("lat") === "48.8566"
      && url.searchParams.get("lon") === "2.3522";
  });
  await bloc.getByRole("button", { name: "Afficher la météo de Paris" }).click();
  await requeteParis;
  await expect(bloc.getByText("Paris · Hôtel de Ville")).toBeVisible();
  await expect(bloc.getByRole("button", { name: "Afficher la météo de Paris" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const requeteMarseille = page.waitForRequest((requete) => {
    const url = new URL(requete.url());
    return url.pathname === "/api/meteo/point"
      && url.searchParams.get("lat") === "43.2965"
      && url.searchParams.get("lon") === "5.3698";
  });
  await bloc.getByRole("button", { name: "Afficher la météo de Marseille" }).click();
  await requeteMarseille;
  await expect(bloc.getByText("Marseille · Hôtel de Ville")).toBeVisible();
  await expect(bloc.getByRole("button", { name: "Afficher la météo de Marseille" })).toHaveAttribute("aria-pressed", "true");

  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 44.064757, longitude: 3.682706, accuracy: 24 });
  await bloc.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(bloc.getByText("La Borie du Ponteil (Valleraugue) 30570 Val-d’Aigoual")).toBeVisible();
  await expect(bloc.getByText("Position GPS · précision ± 24 m")).toBeVisible();
  await expect(bloc.locator('.points-rapides button[aria-pressed="true"]')).toHaveCount(0);
});

test("présente le dernier bilan thermique complet", async ({ page }) => {
  const requeteBilan = page.waitForRequest((requete) => new URL(requete.url()).pathname === "/api/meteo/bilan-thermique");
  await page.goto("/meteo/bilan-thermique/");
  expect(new URL((await requeteBilan).url()).searchParams.get("v")).toBe("2");

  const bilan = page.getByTestId("bilan-thermique");
  const lienMeteo = bilan.getByRole("link", { name: "Retour à la météo essentielle" });
  await expect(bilan.locator(".date-heure")).toBeVisible();
  expect(await bilan.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(720);
  await expect(lienMeteo).toHaveAttribute("href", "/meteo/essentiel/?lieu=val-aigoual");
  await expect(bilan.getByRole("heading", { name: "Bilan thermique du mois dernier" })).toBeVisible();
  await expect(bilan.getByRole("heading", { name: "juin 2026" })).toBeVisible();
  await expect(bilan.getByText("39,4")).toBeVisible();
  await expect(bilan.getByText("stress thermique très fort")).toBeVisible();
  await expect(bilan.getByText("4", { exact: true })).toBeVisible();
  await expect(bilan.getByRole("heading", { name: "11,5 jours de plus" })).toBeVisible();
  await expect(bilan.getByText("Complétude : 100 %")).toBeVisible();

  const valeurStressFort = bilan.getByRole("button", { name: /15.*afficher les dates exactes/i });
  await valeurStressFort.hover();
  await expect(bilan.getByRole("tooltip").filter({ hasText: "Stress fort ou plus" })).toContainText("2 juin 2026");
  await expect(bilan.getByRole("tooltip").filter({ hasText: "Stress fort ou plus" })).toContainText("23 juin 2026");

  const valeurStressTresFort = bilan.getByRole("button", { name: /3.*afficher les dates exactes/i });
  await valeurStressTresFort.focus();
  await expect(bilan.getByRole("tooltip").filter({ hasText: "Stress très fort" })).toContainText("20 juin 2026");

  const valeurStressExtreme = bilan.getByRole("button", { name: /0.*afficher les dates exactes/i });
  await valeurStressExtreme.focus();
  await expect(bilan.getByRole("tooltip").filter({ hasText: "Aucune date de stress extrême" })).toBeVisible();

  await bilan.getByRole("button", { name: "Paris" }).click();
  await expect(bilan.getByText("Paris · Hôtel de Ville")).toBeVisible();
  await expect(bilan.getByRole("button", { name: "Paris" })).toHaveAttribute("aria-pressed", "true");
  await expect(lienMeteo).toHaveAttribute("href", "/meteo/essentiel/?lieu=paris");

  await lienMeteo.click();
  await expect(page).toHaveURL(/\/meteo\/essentiel\/\?lieu=paris$/);
  await expect(page.getByTestId("meteo-point").getByRole("button", { name: "Afficher la météo de Paris" })).toHaveAttribute("aria-pressed", "true");
});

test("conserve le lieu précédent quand un changement de point échoue", async ({ page }) => {
  await page.goto("/meteo/essentiel/");
  const bloc = page.getByTestId("meteo-point");
  await expect(bloc.getByText("Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue")).toBeVisible();

  await page.route(/\/api\/meteo\/point/, (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("lat") === "48.8566") {
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "indisponible" }) });
    }
    return route.fallback();
  });

  await bloc.getByRole("button", { name: "Afficher la météo de Paris" }).click();
  await expect(bloc.getByRole("alert")).toContainText("La dernière météo reste affichée");
  await expect(bloc.getByText("Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue")).toBeVisible();
  await expect(bloc.getByRole("button", { name: "Afficher la météo de Val-d’Aigoual" })).toHaveAttribute("aria-pressed", "true");
});

test("présente les informations météo dans une page à deux onglets", async ({ page }) => {
  await page.goto("/meteo/informations/?lieu=paris");
  const informations = page.getByTestId("meteo-informations");
  await expect(informations.getByRole("heading", { name: "Comprendre cette météo" })).toBeVisible();
  expect(await informations.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(720);
  await expect(informations.getByRole("link", { name: "Retour à la météo essentielle" })).toHaveAttribute("href", "/meteo/essentiel/?lieu=paris");
  await expect(informations.getByText("Où est mesurée cette météo ?")).toBeVisible();

  const usage = informations.getByRole("tab", { name: "Ce que fait la page" });
  await usage.focus();
  await usage.press("ArrowRight");
  const sources = informations.getByRole("tab", { name: "Sources des données" });
  await expect(sources).toHaveAttribute("aria-selected", "true");
  await expect(sources).toBeFocused();
  await expect(informations.getByText("Détail des sources utilisées")).toBeVisible();
});

test("compare les versions J−1 et J sans les présenter comme des observations", async ({ page }) => {
  await page.goto("/meteo/comparaison/?lieu=val-aigoual");
  const comparaison = page.getByTestId("meteo-comparaison");

  await expect(comparaison.getByRole("heading", { name: "Ce qui a changé depuis la veille" })).toBeVisible();
  await expect(comparaison.getByRole("heading", { name: "Une révision n’est pas une erreur de prévision" })).toBeVisible();
  await expect(comparaison.getByRole("heading", { name: "2 journées comparées" })).toBeVisible();
  await expect(comparaison.getByRole("heading", { name: "samedi 18 juillet 2026" })).toBeVisible();
  await expect(comparaison.getByRole("cell", { name: "+2 °C" })).toBeVisible();
  await expect(comparaison.getByText("8 h / 24")).toBeVisible();
  await expect(comparaison.getByText(/pas son erreur par rapport au temps réellement observé/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(comparaison).toHaveScreenshot("meteo-comparaison.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
});

test("utilise le même menu sur les quatre pages de la météo essentielle", async ({ page }) => {
  const pages = [
    ["/meteo/essentiel/?lieu=val-aigoual", "Météo essentielle"],
    ["/meteo/comparaison/?lieu=val-aigoual", "Révisions J−1 / J"],
    ["/meteo/bilan-thermique/?lieu=val-aigoual", "Bilan thermique"],
    ["/meteo/informations/?lieu=val-aigoual", "Informations"],
  ];
  const libelles = ["Retour à la météo essentielle", "Comparer les prévisions J−1 et J", "Bilan thermique", "À propos de cette météo et sources des données"];

  for (const [url, titreCourant] of pages) {
    await page.goto(url);
    const menu = page.getByRole("navigation", { name: "Navigation météo" });
    await expect(menu.getByRole("link")).toHaveCount(4);
    await expect(menu.getByRole("link").allTextContents().then((textes) => textes.map((texte) => texte.trim()))).resolves.toEqual(["Météo essentielle", "Révisions J−1 / J", "Bilan thermique", "Informations"]);
    for (const libelle of libelles) await expect(menu.getByRole("link", { name: libelle })).toBeVisible();
    await expect(menu.getByRole("link", { name: titreCourant === "Météo essentielle" ? "Retour à la météo essentielle" : titreCourant === "Révisions J−1 / J" ? "Comparer les prévisions J−1 et J" : titreCourant === "Informations" ? "À propos de cette météo et sources des données" : titreCourant })).toHaveAttribute("aria-current", "page");
  }
});

test("reste utilisable à 320 px avec les animations réduites", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/meteo/essentiel/");

  await expect(page.getByTestId("meteo-point")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= 320)).toBe(true);
  await expect(page.getByRole("button", { name: "Afficher la météo de Marseille" })).toBeVisible();
  await expect(page.getByText("Ressenti estimé : 17 °C")).toBeVisible();
  await expect(page.locator(".graphique-heures li")).toHaveCount(4);

  await page.goto("/meteo/comparaison/");
  await expect(page.getByTestId("meteo-comparaison")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= 320)).toBe(true);
});

test("n'affiche jamais un niveau vert quand la vigilance est indisponible", async ({ page }) => {
  // Sécurité : le niveau réel est inconnu quand la source est indisponible — ne jamais rassurer
  // à tort avec un bandeau vert qui pourrait masquer une vigilance orange/rouge en cours.
  await page.route(/\/api\/meteo\/point/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ...prevision,
      vigilance: {
        departement: "Gard",
        code: "30",
        url: "https://vigilance.meteofrance.fr/fr/gard",
        miseAJour: null,
        couleurMax: "vert",
        periodes: [],
        indisponible: true,
        perime: false,
      },
    }),
  }));

  await page.goto("/meteo/essentiel/");

  const bloc = page.getByTestId("meteo-point");
  const vigilance = bloc.locator(".vigilance-essentiel");
  await expect(vigilance).toBeVisible();
  await expect(vigilance.getByText("Vigilance Gard · 30")).toBeVisible();
  await expect(vigilance.getByText("Aucune vigilance")).toHaveCount(0);
  await expect(vigilance.locator(".niveau-vert")).toHaveCount(0);
  await expect(vigilance.locator(".vigilance-bord-vert")).toHaveCount(0);
  await expect(vigilance.getByText("Niveau inconnu")).toBeVisible();
  await expect(vigilance.getByRole("alert")).toContainText("le niveau réel ne peut pas être confirmé");
  await expect(vigilance.getByRole("link", { name: /bulletin officiel Météo-France/ })).toBeVisible();
});
