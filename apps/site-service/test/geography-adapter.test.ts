import test from "node:test";
import assert from "node:assert/strict";
import { creerClientGeographie, transformerReponseGeographie } from "../src/adapters/geography.js";

function reponseFixture(overrides: Record<string, unknown> = {}) {
  return {
    query: { latitude: 44.064555, longitude: 3.683027, positionSource: "manual" },
    territory: {
      status: "available",
      data: {
        label: "Valleraugue (30570)",
        commune: { name: "Valleraugue", inseeCode: "30341" },
        department: { name: "Gard", code: "30" },
        epci: null,
      },
      provenance: { source: "API Découpage administratif", resolvedAt: "2026-08-07T10:00:00.000Z" },
    },
    address: {
      status: "available",
      data: {
        formatted: "12 rue du Pont, 30570 Valleraugue",
        houseNumber: "12",
        street: "rue du Pont",
        postalCode: "30570",
        city: "Valleraugue",
        precision: "house",
        distanceMeters: 18.4,
      },
      provenance: { source: "IGN Géoplateforme — Géocodage inverse", resolvedAt: "2026-08-07T10:00:00.000Z" },
    },
    elevation: {
      status: "available",
      data: { meters: 542.1, verticalDatum: "NGF-IGN69", horizontalResolutionMeters: 5, verticalAccuracyMeters: null, interpolation: null },
      provenance: { source: "IGN Géoplateforme — RGE ALTI", resolvedAt: "2026-08-07T10:00:00.000Z" },
    },
    requestId: "req-1",
    ...overrides,
  };
}

test("transforme les trois blocs disponibles en données tracées par sphère", () => {
  const donnees = transformerReponseGeographie(reponseFixture());
  assert.equal(donnees.length, 3);

  const commune = donnees.find((d) => d.key === "commune")!;
  assert.equal(commune.sphere, "anthroposphere");
  assert.equal(commune.spatialRelation, "administrative");
  assert.equal(commune.value, "Valleraugue (30570)");
  assert.equal(commune.source.producer, "API Découpage administratif");
  assert.equal(commune.status.availability, "available");

  const adresse = donnees.find((d) => d.key === "adresse")!;
  assert.equal(adresse.sphere, "anthroposphere");
  assert.equal(adresse.spatialRelation, "nearest");
  assert.equal(adresse.value, "12 rue du Pont, 30570 Valleraugue");
  assert.equal(adresse.distanceM, 18.4);

  const altitude = donnees.find((d) => d.key === "altitude")!;
  assert.equal(altitude.sphere, "lithosphere");
  assert.equal(altitude.spatialRelation, "model_at_point");
  assert.equal(altitude.value, 542.1);
  assert.equal(altitude.unit, "m");
  assert.deepEqual(altitude.resolution, { spatialM: 5 });
});

test("enregistre l'absence comme une information plutôt que de l'omettre", () => {
  const donnees = transformerReponseGeographie(
    reponseFixture({
      address: { status: "not_found", data: null, provenance: { source: "IGN Géoplateforme — Géocodage inverse", resolvedAt: "2026-08-07T10:00:00.000Z" } },
    }),
  );
  const adresse = donnees.find((d) => d.key === "adresse")!;
  assert.equal(adresse.value, null);
  assert.equal(adresse.status.availability, "not_found");
});

test("normalise unavailable et timeout vers source_unavailable", () => {
  for (const status of ["unavailable", "timeout"] as const) {
    const donnees = transformerReponseGeographie(
      reponseFixture({
        elevation: { status, data: null, provenance: { source: "IGN Géoplateforme — RGE ALTI", resolvedAt: "2026-08-07T10:00:00.000Z" } },
      }),
    );
    const altitude = donnees.find((d) => d.key === "altitude")!;
    assert.equal(altitude.status.availability, "source_unavailable");
    assert.equal(altitude.value, null);
  }
});

test("le client appelle la route interne avec lat/lon et renvoie les données transformées", async () => {
  const appels: string[] = [];
  const client = creerClientGeographie({
    baseUrl: "http://geography-service:3000",
    timeoutMs: 1000,
    fetchImpl: (async (input: string | URL | Request) => {
      appels.push(String(input));
      return new Response(JSON.stringify(reponseFixture()), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });

  const donnees = await client.resoudre(44.064555, 3.683027);
  assert.equal(donnees.length, 3);
  assert.equal(appels.length, 1);
  assert.match(appels[0] ?? "", /^http:\/\/geography-service:3000\/internal\/v1\/geography\/resolve\?lat=44\.064555&lon=3\.683027$/);
});

test("une panne réseau renvoie un tableau vide plutôt que de faire échouer l'appelant", async () => {
  const client = creerClientGeographie({
    baseUrl: "http://geography-service:3000",
    timeoutMs: 1000,
    fetchImpl: (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch,
  });
  const donnees = await client.resoudre(44, 3);
  assert.deepEqual(donnees, []);
});

test("une réponse HTTP en erreur renvoie un tableau vide", async () => {
  const client = creerClientGeographie({
    baseUrl: "http://geography-service:3000",
    timeoutMs: 1000,
    fetchImpl: (async () => new Response("erreur", { status: 502 })) as typeof fetch,
  });
  const donnees = await client.resoudre(44, 3);
  assert.deepEqual(donnees, []);
});
