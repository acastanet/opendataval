import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NextChangeCard } from "./NextChangeCard";

afterEach(cleanup);

describe("NextChangeCard", () => {
  it("présente une situation stable sans grand aplat d’alerte", () => {
    render(
      <NextChangeCard
        change={{
          type: "stable",
          startsAt: null,
          summary: "Conditions globalement stables dans les prochaines heures.",
          probabilityPercent: null,
        }}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Pas de changement marqué" });
    expect(heading.closest("section")).toHaveClass("next-change--quiet");
    expect(screen.queryByText(/^Vers /)).not.toBeInTheDocument();
  });

  it("conserve le traitement fort pour un changement significatif", () => {
    render(
      <NextChangeCard
        change={{
          type: "rain",
          startsAt: "2026-07-22T22:00:00.000Z",
          summary: "Pluie attendue dans la soirée.",
          probabilityPercent: 70,
        }}
      />,
    );

    const section = screen.getByRole("heading", { name: /^Vers / }).closest("section");
    expect(section).toHaveClass("next-change--rain");
    expect(section).not.toHaveClass("next-change--quiet");
    expect(screen.getByText("70%")).toBeInTheDocument();
  });
});
