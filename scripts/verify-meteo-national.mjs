#!/usr/bin/env node

const baseUrl = (process.env.METEO_BASE_URL ?? "http://localhost:8080")
  .replace(/\/+$/, "");
const allowDegraded = process.env.ALLOW_DEGRADED === "true";
const timeoutMs = Number(process.env.METEO_VERIFY_TIMEOUT_MS ?? 20_000);

const locations = [
  {
    name: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    departmentCode: "75",
  },
  {
    name: "Marseille",
    latitude: 43.2965,
    longitude: 5.3698,
    departmentCode: "13",
  },
  {
    name: "Val-d’Aigoual",
    latitude: 44.081192,
    longitude: 3.641467,
    departmentCode: "30",
  },
];

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`✗ ${message}`);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function getJson(path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${url} a renvoyé un corps non JSON (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`${url} a renvoyé HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

async function verifyHealth() {
  const health = await getJson("/api/v1/meteo/health");

  if (health.schemaVersion !== "1") {
    fail(`schéma de santé inattendu : ${String(health.schemaVersion)}`);
  } else {
    pass("schéma de santé 1");
  }

  if (health.status !== "ok") {
    const reasons = Array.isArray(health.degradedReasons)
      ? health.degradedReasons.join(", ")
      : "raison inconnue";
    if (allowDegraded) {
      console.warn(`! santé dégradée autorisée : ${reasons}`);
    } else {
      fail(`santé météo dégradée : ${reasons}`);
    }
  } else {
    pass("chaîne météo déclarée saine");
  }

  const stationCount = health.catalogue?.stationCount;
  const minimumExpected = health.catalogue?.minimumExpectedStations;
  if (!finiteNumber(stationCount) || !finiteNumber(minimumExpected) || stationCount < minimumExpected) {
    fail(`catalogue insuffisant : ${String(stationCount)} / ${String(minimumExpected)}`);
  } else {
    pass(`catalogue national : ${stationCount} stations`);
  }

  const freshStationCount = health.observations?.freshStationCount;
  const latestAge = health.observations?.latestObservationAgeMinutes;
  const maximumAge = health.observations?.maximumAgeMinutes;
  if (!finiteNumber(freshStationCount) || freshStationCount <= 0) {
    fail(`aucune station fraîche : ${String(freshStationCount)}`);
  } else {
    pass(`${freshStationCount} stations avec observation fraîche`);
  }
  if (!finiteNumber(latestAge) || !finiteNumber(maximumAge) || latestAge > maximumAge) {
    fail(`dernière observation trop ancienne : ${String(latestAge)} min`);
  } else {
    pass(`dernière observation âgée de ${latestAge} min`);
  }

  for (const criticalSource of ["meteo_stations", "meteo_obs_national"]) {
    const job = health.ingestion?.find((entry) => entry.source === criticalSource);
    if (!job?.lastSuccessAt) {
      fail(`${criticalSource} n’a aucun succès enregistré`);
    } else {
      pass(`${criticalSource} réussi à ${job.lastSuccessAt}`);
    }
  }

  return health;
}

async function verifyLocation(location) {
  const query = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
  });
  const payload = await getJson(`/api/v1/meteo/essential?${query}`);
  const actualDepartment = payload.location?.department?.code;
  if (actualDepartment !== location.departmentCode) {
    fail(`${location.name} : département ${String(actualDepartment)}, attendu ${location.departmentCode}`);
  } else {
    pass(`${location.name} : département ${actualDepartment}`);
  }

  const selection = payload.provenance?.stationSelection;
  const received = selection?.receivedMeasurements;
  if (!finiteNumber(received) || received <= 0) {
    fail(`${location.name} : aucune observation candidate reçue`);
  } else {
    pass(`${location.name} : ${received} observations candidates reçues`);
  }

  const nearest = selection?.nearestCandidate;
  if (!nearest) {
    fail(`${location.name} : aucune station candidate proche`);
  } else if (!finiteNumber(nearest.distanceKm) || nearest.distanceKm > 50) {
    fail(`${location.name} : candidate ${nearest.name ?? nearest.id} à ${String(nearest.distanceKm)} km`);
  } else {
    pass(`${location.name} : candidate ${nearest.name ?? nearest.id} à ${nearest.distanceKm} km`);
  }

  const station = payload.current?.station;
  const selectedLabel = station
    ? `${station.name} (${station.distanceKm} km)`
    : `repli modèle — ${selection?.reasonCode ?? "motif inconnu"}`;

  return {
    location: location.name,
    department: actualDepartment ?? null,
    nature: payload.current?.nature ?? null,
    selected: selectedLabel,
    receivedMeasurements: received ?? null,
    nearestCandidate: nearest?.name ?? nearest?.id ?? null,
    nearestDistanceKm: nearest?.distanceKm ?? null,
    selectionStatus: selection?.status ?? null,
    reasonCode: selection?.reasonCode ?? null,
  };
}

async function main() {
  console.log(`Vérification Météo nationale : ${baseUrl}`);
  console.log("");

  try {
    await verifyHealth();
  } catch (error) {
    fail(`endpoint de santé inaccessible : ${error instanceof Error ? error.message : String(error)}`);
  }

  const reports = [];
  for (const location of locations) {
    try {
      reports.push(await verifyLocation(location));
    } catch (error) {
      fail(`${location.name} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("");
  if (reports.length > 0) console.table(reports);

  if (failures.length > 0) {
    console.error("");
    console.error(`${failures.length} contrôle(s) en échec.`);
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("Tous les contrôles nationaux sont validés.");
  }
}

await main();
