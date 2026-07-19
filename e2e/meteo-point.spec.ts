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
    pointModele: { altitudeM: 1210 },
    hourly: {
      time: heures,
      temperature_2m: heures.map((_, index) => 15 + (index % 8)),
      precipitation: heures.map((_, index) => (index === 5 ? 1.2 : 0)),
      wind_gusts_10m: heures.map((_, index) => 22 + index),
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
    widgetUrl: "https://vigilance.meteofrance.fr/fr/widget-vigilance/vigilance-departement/30",
  },
  liens: { ecmwf: "https://charts.ecmwf.int/", meteoFrance: "https://meteofrance.com/" },
  sourcesIndisponibles: [],
  perime: false,
};

let requetesPoint = 0;

async function installerMocks(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/api/meteo/point?*", (route) => {
    requetesPoint += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(prevision) });
  });
  await page.route("https://vigilance.meteofrance.fr/**", (route) => route.fulfill({
    contentType: "text/html",
    body: "<meta charset='utf-8'><main style='font:16px Arial;padding:16px;color:#202020'><strong>Vigilance Météo-France</strong><p>Gard : aucun phénomène dangereux en cours.</p></main>",
  }));
  await page.route("https://data.geopf.fr/**", (route) => route.abort());
}

test.beforeEach(async ({ page }) => {
  requetesPoint = 0;
  await installerMocks(page);
});

test("hiérarchise les informations météo d'un point", async ({ page }) => {
  await page.goto("/meteo/");

  const bloc = page.getByTestId("meteo-point");
  await expect(bloc.getByRole("heading", { name: "Vigilance Météo-France — Gard" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Station Météo-France la plus proche" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "Prévision Météo-France AROME" })).toBeVisible();
  await expect(bloc.getByRole("heading", { name: "ECMWF IFS et ensemble de 51 scénarios" })).toBeVisible();
  await expect(bloc.getByText("Modèle européen")).toBeVisible();
  await expect(bloc.locator(".carte-point .maplibregl-marker")).toBeVisible();
  await expect(bloc).toHaveScreenshot("meteo-point.png", {
    animations: "disabled",
    mask: [bloc.locator(".carte-point")],
    maskColor: "#ffffff",
  });

  await bloc.locator(".carte-point").click({ position: { x: 160, y: 120 } });
  await expect.poll(() => requetesPoint).toBeGreaterThan(1);
});
