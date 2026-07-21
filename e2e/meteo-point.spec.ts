import { expect, test, type Page } from "@playwright/test";

const heures = Array.from({ length: 24 }, (_, index) => `2026-07-19T${String(index).padStart(2, "0")}:00`);
const jours = Array.from({ length: 10 }, (_, index) => `2026-07-${String(19 + index).padStart(2, "0")}`);

const prevision = {
  localisation: { demandee: { lat: 44.064579, lon: 3.683019 }, dansTerritoire: true },
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
  await expect(bloc.locator(".date-heure")).toHaveText("DIM. 19 JUIL. · 10:05");
  await expect(bloc.getByRole("button", { name: "Utiliser ma position" })).toBeVisible();
  const vigilance = bloc.locator(".vigilance-essentiel");
  await expect(vigilance).toBeVisible();
  await expect(vigilance.getByText("Vigilance Gard · 30")).toBeVisible();
  await expect(vigilance.getByText("Vigilance Orange")).toBeVisible();
  await expect(vigilance.getByText("Aujourd’hui")).toBeVisible();
  await expect(vigilance.getByText("Canicule").first()).toBeVisible();
  await expect(vigilance.getByText("Orages")).toBeVisible();
  await expect(vigilance.getByText("Jaune")).toBeVisible();
  await expect(bloc.getByTestId("temperature-actuelle")).toHaveText("18°C");
  await expect(bloc.getByTestId("temperature-plus-trois")).toHaveText("20°C");
  await expect(bloc.getByRole("heading", { name: "Les 3 jours à venir" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Demain" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Heure par heure" })).toHaveCount(0);
  await expect(bloc.getByRole("heading", { name: "Qualité de l’air" })).toHaveCount(0);
  await expect(bloc.getByText("Tendance probabiliste ECMWF")).toHaveCount(0);
  await expect(bloc.getByText("Précision réelle et sources")).toHaveCount(0);

  await expect(bloc).toHaveScreenshot("meteo-essentiel.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });

  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 44.064757, longitude: 3.682706 });
  await bloc.getByRole("button", { name: "Utiliser ma position" }).click();
  await expect(bloc.getByText("La Borie du Ponteil (Valleraugue) 30570 Val-d’Aigoual")).toBeVisible();
});
