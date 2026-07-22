import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HourlyStrip } from "./components/HourlyStrip";
import { LocationSelector } from "./components/LocationSelector";
import { WeatherHero } from "./components/WeatherHero";
import { essentialWeatherFixture, locations } from "./mocks/fixtures";

afterEach(cleanup);

describe("accessibilité et petits écrans", () => {
  it("rend la bande horaire focalisable et explicite son défilement", () => {
    const weather = essentialWeatherFixture({ latitude: 48.8566, longitude: 2.3522 });

    render(<HourlyStrip hours={weather.nextHours} />);

    const list = screen.getByRole("list", { name: "Prévisions heure par heure" });
    expect(list).toHaveAttribute("tabindex", "0");
    expect(list).toHaveAttribute("aria-describedby", "hourly-scroll-help");
    expect(
      screen.getByText("Faites défiler horizontalement pour consulter toutes les heures."),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Rafales \d+ km\/h/).length).toBeGreaterThan(0);
  });

  it("annonce le lieu actif et la recherche de position", () => {
    const firstLocation = locations[0];
    const secondLocation = locations[1];
    if (!firstLocation || !secondLocation) {
      throw new Error("Deux lieux rapides sont requis pour ce test.");
    }

    const onSelect = vi.fn();
    const selected = {
      latitude: firstLocation.latitude,
      longitude: firstLocation.longitude,
    };

    const { rerender } = render(
      <LocationSelector
        locations={locations}
        selected={selected}
        locating={false}
        onLocate={vi.fn()}
        onSelect={onSelect}
      />,
    );

    const group = screen.getByRole("group", { name: "Lieux rapides" });
    const active = within(group).getByRole("button", { name: firstLocation.shortLabel });
    expect(active).toHaveAttribute("aria-pressed", "true");

    const second = within(group).getByRole("button", { name: secondLocation.shortLabel });
    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith(secondLocation);

    rerender(
      <LocationSelector
        locations={locations}
        selected={selected}
        locating
        onLocate={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "Localisation…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Recherche de votre position en cours.");
  });

  it("conserve une température négative à deux chiffres dans le contenu principal", () => {
    const base = essentialWeatherFixture({ latitude: 43.2965, longitude: 5.3698 });
    const weather = {
      ...base,
      location: {
        ...base.location,
        label: "Sommet exposé — point de mesure à libellé volontairement long",
      },
      current: {
        ...base.current,
        temperatureC: -12.4,
        apparentTemperatureC: -15.2,
      },
    };

    render(<WeatherHero weather={weather} />);

    expect(screen.getByTestId("current-temperature")).toHaveTextContent("-12°");
    expect(
      screen.getByRole("heading", {
        name: "Sommet exposé — point de mesure à libellé volontairement long",
      }),
    ).toBeInTheDocument();
  });
});
