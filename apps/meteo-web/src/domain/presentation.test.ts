import { describe, expect, it } from "vitest";
import { alertRank, temperature } from "./presentation";

describe("weather presentation", () => {
  it("arrondit la température pour une lecture immédiate", () => {
    expect(temperature(26.6)).toBe("27");
    expect(temperature(-2.6)).toBe("-3");
  });

  it("classe les niveaux de vigilance dans l'ordre officiel", () => {
    expect(alertRank("green")).toBeLessThan(alertRank("yellow"));
    expect(alertRank("yellow")).toBeLessThan(alertRank("orange"));
    expect(alertRank("orange")).toBeLessThan(alertRank("red"));
  });
});
