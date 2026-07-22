import assert from "node:assert/strict";
import test from "node:test";
import { createGeographyResolver, departmentCodeFromInsee } from "./geography.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function administrativeResponse(city: string, citycode: string, context: string): unknown {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { city, citycode, context } }],
  };
}

function resolverFor(
  administrative: unknown,
  altitude: unknown = { elevations: [{ z: 35.4 }] },
) {
  return createGeographyResolver({
    fetch: async (input) => {
      const url = new URL(String(input));
      return url.pathname.includes("/geocodage/")
        ? jsonResponse(administrative)
        : jsonResponse(altitude);
    },
    now: () => Date.parse("2026-07-22T12:00:00.000Z"),
  });
}

test("résout Paris vers la commune 75056 et le département 75", async () => {
  const resolver = resolverFor(
    administrativeResponse("Paris 4e Arrondissement", "75104", "75, Paris, Île-de-France"),
  );

  const result = await resolver.resolve(48.8566, 2.3522);

  assert.deepEqual(result.municipality, { name: "Paris", inseeCode: "75056" });
  assert.deepEqual(result.department, { name: "Paris", code: "75" });
  assert.equal(result.altitudeM, 35);
  assert.equal(result.label, "Paris");
  assert.deepEqual(result.unavailableSources, []);
});

test("normalise les arrondissements de Marseille vers la commune 13055", async () => {
  const resolver = resolverFor(
    administrativeResponse(
      "Marseille 2e Arrondissement",
      "13202",
      "13, Bouches-du-Rhône, Provence-Alpes-Côte d’Azur",
    ),
  );

  const result = await resolver.resolve(43.2965, 5.3698);

  assert.deepEqual(result.municipality, { name: "Marseille", inseeCode: "13055" });
  assert.deepEqual(result.department, { name: "Bouches-du-Rhône", code: "13" });
});

test("résout Val-d’Aigoual vers le Gard", async () => {
  const resolver = resolverFor(
    administrativeResponse("Val-d’Aigoual", "30339", "30, Gard, Occitanie"),
    { elevations: [{ z: 351.2 }] },
  );

  const result = await resolver.resolve(44.081192, 3.641467);

  assert.deepEqual(result.municipality, { name: "Val-d’Aigoual", inseeCode: "30339" });
  assert.deepEqual(result.department, { name: "Gard", code: "30" });
  assert.equal(result.altitudeM, 351);
});

test("conserve les codes départementaux corses et ultramarins", () => {
  assert.equal(departmentCodeFromInsee("2A004"), "2A");
  assert.equal(departmentCodeFromInsee("2B033"), "2B");
  assert.equal(departmentCodeFromInsee("97105"), "971");
});

test("dégrade séparément l’altitude quand le service altimétrique échoue", async () => {
  const resolver = createGeographyResolver({
    fetch: async (input) => {
      const url = new URL(String(input));
      return url.pathname.includes("/geocodage/")
        ? jsonResponse(administrativeResponse("Paris", "75056", "75, Paris, Île-de-France"))
        : jsonResponse({ error: "indisponible" }, 503);
    },
  });

  const result = await resolver.resolve(48.8566, 2.3522);

  assert.equal(result.department?.code, "75");
  assert.equal(result.altitudeM, null);
  assert.equal(result.resolution.administrative, "ign");
  assert.equal(result.resolution.altitude, "unavailable");
  assert.deepEqual(result.unavailableSources, ["Altimétrie IGN"]);
});

test("renvoie un état neutre pour une réponse vide ou hors de France", async () => {
  const resolver = resolverFor(
    { type: "FeatureCollection", features: [] },
    { elevations: [{ z: -99_999 }] },
  );

  const result = await resolver.resolve(51.5074, -0.1278);

  assert.equal(result.label, "Position sélectionnée");
  assert.equal(result.municipality, null);
  assert.equal(result.department, null);
  assert.equal(result.altitudeM, null);
  assert.deepEqual(result.unavailableSources, ["Géocodage IGN", "Altimétrie IGN"]);
});

test("un timeout IGN ne fait pas échouer la résolution", async () => {
  const resolver = createGeographyResolver({
    timeoutMs: 5,
    fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
  });

  const result = await resolver.resolve(48.8566, 2.3522);

  assert.equal(result.department, null);
  assert.equal(result.altitudeM, null);
  assert.deepEqual(result.unavailableSources, ["Géocodage IGN", "Altimétrie IGN"]);
});

test("met en cache une maille précise sans multiplier les appels IGN", async () => {
  let calls = 0;
  const resolver = createGeographyResolver({
    fetch: async (input) => {
      calls += 1;
      const url = new URL(String(input));
      return url.pathname.includes("/geocodage/")
        ? jsonResponse(administrativeResponse("Paris", "75056", "75, Paris, Île-de-France"))
        : jsonResponse({ elevations: [{ z: 35 }] });
    },
  });

  await resolver.resolve(48.85661, 2.35221);
  await resolver.resolve(48.85662, 2.35222);

  assert.equal(calls, 2);
});
