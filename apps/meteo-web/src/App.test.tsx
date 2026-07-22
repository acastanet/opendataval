import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { essentialWeatherFixture, locations } from "./mocks/fixtures";

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

describe("essential weather screen", () => {
  it("answers the four priority questions on the default location", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "Mairie de Val-d’Aigoual, Valleraugue",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-temperature")).toHaveTextContent("27°");
    expect(screen.getByText("Prochain changement")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Aucune vigilance particulière" }),
    ).toBeInTheDocument();
  });

  it("changes the whole reading when a quick location is selected", async () => {
    renderApp();
    await screen.findByRole("heading", {
      name: "Mairie de Val-d’Aigoual, Valleraugue",
    });

    fireEvent.click(screen.getByRole("button", { name: "Marseille" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Marseille" })).toBeInTheDocument();
    });
    expect(screen.getByText("Soleil, mistral modéré")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vigilance orange" })).toBeInTheDocument();
  });
});
