import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const geography = {
  query: { latitude: 44.081192, longitude: 3.641467, positionSource: "manual" },
  territory: { status: "available", data: { label: "Territoire Val-d'Aigoual", commune: { name: "Val-d'Aigoual", inseeCode: "30339" }, department: { name: "Gard", code: "30" } } },
  address: { status: "available", data: { formatted: "Rue de la Mairie, 30570 Val-d'Aigoual", precision: "street", distanceMeters: 18 } },
  elevation: { status: "available", data: { meters: 351 } }, requestId: "geo-1",
};
const temperature = {
  location: { latitude: 44.081192, longitude: 3.641467, altitudeMeters: 351 },
  temperature: { valueCelsius: 37.4, nature: "station_observation", referenceTime: "2026-07-23T14:00:00.000Z", ageMinutes: 12, stale: false, quality: "good" },
  stationSelection: { status: "selected", selectedStation: { name: "Le Vigan", network: "meteofrance", distanceKilometers: 10.4, altitudeDifferenceMeters: 100 } },
  provenance: { source: { provider: "Météo-France", product: "DPObs" } }, degraded: false, unavailableSources: [], requestId: "weather-1",
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => String(input).includes("geography") ? geography : temperature }) as Response)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderApp() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><App /></QueryClientProvider>); }

describe("live gateway weather screen", () => {
  it("affiche la température et le contexte fournis par les deux nouveaux services", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "Territoire Val-d'Aigoual" })).toBeInTheDocument();
    expect(screen.getByTestId("current-temperature")).toHaveTextContent("37°C");
    expect(screen.getAllByText("Le Vigan")).toHaveLength(2);
    expect(screen.getByText(/10\.4 km de votre position/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v2/geography/resolve?"), expect.any(Object));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v2/weather/temperature?"), expect.any(Object));
  });

  it("rejoue les deux appels gateway en changeant de lieu", async () => {
    renderApp(); await screen.findByRole("heading", { name: "Territoire Val-d'Aigoual" });
    fireEvent.click(screen.getByRole("button", { name: "Le Vigan" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("lon=3.606"), expect.any(Object));
  });

  it("expose les réponses Geography et Weather dans le démonstrateur", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Territoire Val-d'Aigoual" });
    fireEvent.click(screen.getByRole("tab", { name: "Démonstrateur" }));

    expect(await screen.findByRole("heading", { name: "Les deux services, sans boîte noire." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Résolution du lieu" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Détermination de température" })).toBeInTheDocument();
    expect(screen.getByText("geo-1")).toBeInTheDocument();
    expect(screen.getByText("weather-1")).toBeInTheDocument();
  });
});
