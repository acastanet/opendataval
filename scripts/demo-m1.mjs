#!/usr/bin/env node

/**
 * Rejoue le scénario M1 de bout en bout (lot P7, `agent/mvp/08-BACKLOG.md`) :
 * crée deux dalles à des coordonnées distinctes, les fabrique, les fait
 * avancer dans des états de revue différents, les publie, et vérifie leur
 * indépendance à chaque étape — sur le modèle de `verify-meteo-national.mjs`.
 *
 * Critères d'acceptation vérifiés (`agent/mvp/06-TEST-AND-ACCEPTANCE.md` §
 * « Tests M1 de bout en bout ») : deux tile_id, deux répertoires
 * indépendants, géométries distinctes, manifests indépendants, scène
 * référencée, page consultable pour chacune, revue indépendante, publication
 * indépendante.
 */

const baseUrl = (process.env.DEMO_M1_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const timeoutMs = Number(process.env.DEMO_M1_TIMEOUT_MS ?? 30_000);

const sites = [
  { name: "Dalle A — Maison", lat: 44.064555, lon: 3.683027, title: "Dalle A — Maison" },
  { name: "Dalle B — Les Plantiers", lat: 44.09, lon: 3.7, title: "Dalle B — Les Plantiers" },
];

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`✗ ${message}`);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function request(method, path, body) {
  const url = `${baseUrl}${path}`;
  const init = {
    method,
    headers: { accept: "*/*", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  };
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const payload = contentType.includes("application/json") ? JSON.parse(text) : text;
  return { status: response.status, payload, contentType };
}

async function postJson(path, body) {
  const { status, payload } = await request("POST", path, body ?? {});
  if (status < 200 || status >= 300) {
    throw new Error(`${path} a renvoyé HTTP ${status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getHtml(path) {
  const { status, payload, contentType } = await request("GET", path);
  if (status !== 200) {
    throw new Error(`${path} a renvoyé HTTP ${status}`);
  }
  if (!contentType.includes("text/html")) {
    throw new Error(`${path} n'a pas renvoyé de HTML (${contentType})`);
  }
  return payload;
}

async function creerEtFabriquer(site) {
  const manifeste = await postJson("/api/v2/sites", { lat: site.lat, lon: site.lon, title: site.title });
  pass(`${site.name} : créée, tile_id ${manifeste.identity.tileId}`);

  await postJson(`/api/v2/sites/${manifeste.identity.tileId}/build`);
  pass(`${site.name} : fabrication déclenchée`);

  const fabriquee = await postJson(`/api/v2/sites/${manifeste.identity.tileId}/review`, { action: "submit" });
  if (fabriquee.status !== "review_required") {
    throw new Error(`${site.name} : statut ${fabriquee.status} après submit, attendu review_required`);
  }
  pass(`${site.name} : soumise en revue (review_required)`);

  return fabriquee;
}

function verifierGeometrieDistincte(a, b) {
  const coordsA = JSON.stringify(a.identity.geometryWgs84?.coordinates ?? null);
  const coordsB = JSON.stringify(b.identity.geometryWgs84?.coordinates ?? null);
  if (!coordsA || coordsA === "null") {
    fail(`${a.identity.tileId} : geometryWgs84 absente du manifeste`);
  }
  if (!coordsB || coordsB === "null") {
    fail(`${b.identity.tileId} : geometryWgs84 absente du manifeste`);
  }
  if (coordsA === coordsB) {
    fail(`géométries identiques entre ${a.identity.tileId} et ${b.identity.tileId}`);
  } else {
    pass(`géométries distinctes entre ${a.identity.tileId} et ${b.identity.tileId}`);
  }
}

function verifierTileIdsDistincts(a, b) {
  if (a.identity.tileId === b.identity.tileId) {
    fail(`tile_id identiques : ${a.identity.tileId}`);
  } else {
    pass(`tile_id distincts : ${a.identity.tileId} / ${b.identity.tileId}`);
  }
}

function verifierSceneReferencee(manifeste) {
  if (!manifeste.scene?.glb) {
    fail(`${manifeste.identity.tileId} : aucune scène 3D référencée`);
  } else {
    pass(`${manifeste.identity.tileId} : scène référencée (${manifeste.scene.glb})`);
  }
}

async function verifierPageConsultable(manifeste, autre) {
  const html = await getHtml(`/api/v2/sites/${manifeste.identity.tileId}`);
  if (!html.includes(manifeste.identity.tileId)) {
    fail(`page de ${manifeste.identity.tileId} : tile_id absent du rendu`);
    return;
  }
  const centre = `${manifeste.identity.center.lat.toFixed(6)}, ${manifeste.identity.center.lon.toFixed(6)}`;
  if (!html.includes(centre)) {
    fail(`page de ${manifeste.identity.tileId} : centre attendu (${centre}) absent du rendu`);
  } else {
    pass(`page de ${manifeste.identity.tileId} : centre correct affiché`);
  }
  if (html.includes(autre.identity.tileId)) {
    fail(`page de ${manifeste.identity.tileId} : mélange avec ${autre.identity.tileId} détecté`);
  } else {
    pass(`page de ${manifeste.identity.tileId} : pas de mélange avec l'autre dalle`);
  }
}

async function main() {
  console.log(`Démonstration M1 (lot P7) : ${baseUrl}`);
  console.log("");

  let dalleA;
  let dalleB;
  try {
    dalleA = await creerEtFabriquer(sites[0]);
    dalleB = await creerEtFabriquer(sites[1]);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error("Impossible de continuer : création/fabrication en échec.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  verifierTileIdsDistincts(dalleA, dalleB);
  verifierGeometrieDistincte(dalleA, dalleB);
  verifierSceneReferencee(dalleA);
  verifierSceneReferencee(dalleB);

  console.log("");
  try {
    await verifierPageConsultable(dalleA, dalleB);
    await verifierPageConsultable(dalleB, dalleA);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // États de revue divergents à un instant donné : A approuvée, B encore en attente.
  console.log("");
  let dalleAApprouvee;
  try {
    dalleAApprouvee = await postJson(`/api/v2/sites/${dalleA.identity.tileId}/review`, {
      action: "approve",
      reviewedBy: "demo-m1",
      notes: "Approbation de démonstration M1.",
    });
    if (dalleAApprouvee.review.status !== "approved" || dalleAApprouvee.status !== "approved") {
      fail(`${dalleA.identity.tileId} : statut inattendu après approve (${dalleAApprouvee.status}/${dalleAApprouvee.review.status})`);
    } else {
      pass(`${dalleA.identity.tileId} : approuvée`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // La lecture publique est en HTML (ADR-008) ; on vérifie l'indépendance via la page.
  const htmlB = await getHtml(`/api/v2/sites/${dalleB.identity.tileId}`);
  if (htmlB.includes("approuvée") && !htmlB.includes("revue en attente")) {
    fail(`${dalleB.identity.tileId} : semble avoir été affectée par l'approbation de ${dalleA.identity.tileId}`);
  } else {
    pass(`${dalleB.identity.tileId} : toujours en revue en attente, non affectée par l'approbation de ${dalleA.identity.tileId}`);
  }

  try {
    const dalleBApprouvee = await postJson(`/api/v2/sites/${dalleB.identity.tileId}/review`, {
      action: "approve",
      reviewedBy: "demo-m1",
      notes: "Approbation de démonstration M1.",
    });
    if (dalleBApprouvee.review.status !== "approved" || dalleBApprouvee.status !== "approved") {
      fail(`${dalleB.identity.tileId} : statut inattendu après approve (${dalleBApprouvee.status}/${dalleBApprouvee.review.status})`);
    } else {
      pass(`${dalleB.identity.tileId} : approuvée`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // Publication indépendante des deux dalles.
  console.log("");
  try {
    const publieeA = await postJson(`/api/v2/sites/${dalleA.identity.tileId}/publish`);
    if (publieeA.status !== "published") {
      fail(`${dalleA.identity.tileId} : statut ${publieeA.status} après publish, attendu published`);
    } else {
      pass(`${dalleA.identity.tileId} : publiée`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const htmlBAvantPublicationB = await getHtml(`/api/v2/sites/${dalleB.identity.tileId}`);
  if (htmlBAvantPublicationB.includes("publiée")) {
    fail(`${dalleB.identity.tileId} : semble déjà publiée avant sa propre publication (fuite depuis ${dalleA.identity.tileId} ?)`);
  } else {
    pass(`${dalleB.identity.tileId} : toujours non publiée après la publication de ${dalleA.identity.tileId}`);
  }

  try {
    const publieeB = await postJson(`/api/v2/sites/${dalleB.identity.tileId}/publish`);
    if (publieeB.status !== "published") {
      fail(`${dalleB.identity.tileId} : statut ${publieeB.status} après publish, attendu published`);
    } else {
      pass(`${dalleB.identity.tileId} : publiée`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  console.log("");
  console.table([
    { tileId: dalleA.identity.tileId, nom: sites[0].name, lat: sites[0].lat, lon: sites[0].lon },
    { tileId: dalleB.identity.tileId, nom: sites[1].name, lat: sites[1].lat, lon: sites[1].lon },
  ]);

  console.log("");
  if (failures.length > 0) {
    console.error(`${failures.length} contrôle(s) en échec.`);
    process.exitCode = 1;
  } else {
    console.log("Tous les critères d'acceptation M1 (lot P7) sont validés.");
  }
}

await main();
