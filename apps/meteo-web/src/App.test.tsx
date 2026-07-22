import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { essentialWeatherFixture, locations } from "./mocks/fixtures";
import { AlertBanner } from "./components/AlertBanner";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://example.test");
      const data = url.pathname.endsWith("/locations")
        ? { locations }
        : essentialWeatherFixture({
            latitude: Number(url.searchParams.get("lat")),
            longitude: Number(url.searchParams.get("lon")),
          });

      return {
        ok: true,
        status: 200,
        json: async () => data,
      } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function position(latitude: number, longitude: number, accuracy = 20): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

function geolocationError(code: number): GeolocationPositionError {
  return {
    code,
    message: "test",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

function stubGeolocation() {
  let successCallback: PositionCallback | null = null;
  let errorCallback: PositionErrorCallback | null = null;
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, error?: PositionErrorCallback | null) => {
      successCallback = success;
      errorCallback = error ?? null;
    },
  );

  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition },
  });

  return {
    getCurrentPosition,
    succeed(value: GeolocationPosition) {
      if (!successCallback) throw new Error("Callback GPS de succès absent.");
      act(() => successCallback?.(value));
    },
    fail(value: GeolocationPositionError) {
      if (!errorCallback) throw new Error("Callback GPS d’erreur absent.");
      act(() => errorCallback?.(value));
    },
  };
}

describe("essential weather screen", () => {
  it("answers the four priority questions on the default location", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-temperature")).toHaveTextContent("27°");
    expect(screen.getAllByText("Mesure locale").length).toBeGreaterThan(0);
    expect(screen.getByText(/station Infoclimat Valleraugue/)).toBeInTheDocument();
    expect(screen.getByText(/Température mesurée.+· observation /)).toBeInTheDocument();
    expect(
      screen.getByText("Val-d’Aigoual · Gard (30) · 351 m d’altitude"),
    ).toBeInTheDocument();
    expect(screen.getByText("Prochain changement")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Aucune vigilance particulière" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("D’où viennent ces données ?"));
    expect(
      screen.getByRole("heading", { name: "Infoclimat StatIC — Réseau StatIC" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Observation effectuée")).toBeInTheDocument();
    expect(screen.getAllByText("Récupérée par OpenDataVal").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Sélection automatique · politique 1" }),
    ).toBeInTheDocument();
  });

  it("n’affiche pas un état vert lorsque la vigilance est indisponible", () => {
    render(
      <AlertBanner
        alert={{
          level: "green",
          title: "Vigilance Météo-France indisponible",
          phenomena: [],
          validUntil: new Date().toISOString(),
          sourceUrl: "https://vigilance.meteofrance.fr/fr",
          departmentCode: null,
          indisponible: true,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Vigilance indisponible" })).toBeInTheDocument();
    expect(screen.queryByText("Aucune vigilance particulière")).not.toBeInTheDocument();
  });

  it("changes the whole reading when a quick location is selected", async () => {
    renderApp();
    await screen.findByRole("heading", {
      name: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
    });

    fireEvent.click(screen.getByRole("button", { name: "Marseille" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Marseille · Hôtel de Ville" })).toBeInTheDocument();
    });
    expect(screen.getByText("Soleil, mistral modéré")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vigilance orange" })).toBeInTheDocument();
    expect(screen.getAllByText("Prévision modélisée")).toHaveLength(1);
    expect(screen.getByText(/AROME HD via Open-Meteo · prévision valable /)).toBeInTheDocument();
  });

  it("utilise les coordonnées GPS et leur précision", async () => {
    const geolocation = stubGeolocation();
    renderApp();
    await screen.findByRole("heading", {
      name: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
    });

    fireEvent.click(screen.getByRole("button", { name: "Me localiser" }));
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    geolocation.succeed(position(48.8566, 2.3522, 18));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Paris · Hôtel de Ville" })).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("accuracyM=18"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("ignore un callback GPS devenu obsolète après le choix d’un lieu rapide", async () => {
    const geolocation = stubGeolocation();
    renderApp();
    await screen.findByRole("heading", {
      name: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
    });

    fireEvent.click(screen.getByRole("button", { name: "Me localiser" }));
    fireEvent.click(screen.getByRole("button", { name: "Marseille" }));

    await screen.findByRole("heading", { name: "Marseille · Hôtel de Ville" });
    geolocation.succeed(position(48.8566, 2.3522));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Marseille · Hôtel de Ville" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Paris · Hôtel de Ville" })).not.toBeInTheDocument();
  });

  it("distingue un timeout GPS et conserve la météo affichée", async () => {
    const geolocation = stubGeolocation();
    renderApp();
    await screen.findByRole("heading", {
      name: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
    });

    fireEvent.click(screen.getByRole("button", { name: "Me localiser" }));
    geolocation.fail(geolocationError(3));

    expect(
      await screen.findByText(
        "Le téléphone n’a pas obtenu votre position à temps. Vérifiez que la localisation est activée puis réessayez.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Me localiser" })).toBeEnabled();
  });
});
