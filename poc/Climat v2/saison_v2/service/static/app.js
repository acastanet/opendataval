const form = document.querySelector("#coordinates-form");
const status = document.querySelector("#status");
const wheel = document.querySelector("#wheel");
const explanationWheel = document.querySelector("#explanation-wheel");
const placeholder = document.querySelector("#placeholder");
const downloads = document.querySelector(".telechargements");
const downloadSvg = document.querySelector("#download-svg");
const downloadPng = document.querySelector("#download-png");
const copyLink = document.querySelector("#copy-link");
const submit = form.querySelector("button[type=submit]");
const submitLabel = submit.querySelector("span");
const coordinates = document.querySelector("#coordinates");
const coordinateError = document.querySelector("#coordinates-error");
const wheelTitle = document.querySelector("#wheel-title");
const locate = document.querySelector("#locate");
const gpsHelp = document.querySelector(".aide-gps");
const resultDetails = document.querySelector("#result-details");
const resultSummary = document.querySelector("#result-summary");
const resultTableBody = document.querySelector("#result-table-body");
const qualityBadge = document.querySelector("#quality-badge");
const qualityNote = document.querySelector("#quality-note");
const requestedPoint = document.querySelector("#requested-point");
const gridPoint = document.querySelector("#grid-point");
const gridResolution = document.querySelector("#grid-resolution");
const gridDistance = document.querySelector("#grid-distance");
const earlyPeriodHeading = document.querySelector("#early-period");
const latePeriodHeading = document.querySelector("#late-period");
const tableCaption = document.querySelector("#result-table-caption");
const cadranContext = document.querySelector("#cadran-context");
const wheelCaption = document.querySelector("#wheel-caption");
const shiftCards = document.querySelector("#shift-cards");
const t25Value = document.querySelector("#t25-value");
const t75Value = document.querySelector("#t75-value");
const bootstrapValue = document.querySelector("#bootstrap-value");

const apiRoot = window.location.protocol === "file:" ? "http://127.0.0.1:8001" : "";
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const decimalFormatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let previewUrl = null;
let currentShareUrl = "";

gpsHelp.addEventListener("click", (event) => {
  event.preventDefault();
  const expanded = gpsHelp.getAttribute("aria-expanded") === "true";
  gpsHelp.setAttribute("aria-expanded", String(!expanded));
});

document.addEventListener("click", (event) => {
  if (!gpsHelp.contains(event.target)) gpsHelp.setAttribute("aria-expanded", "false");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") gpsHelp.setAttribute("aria-expanded", "false");
});

function clearCoordinateError() {
  coordinates.setCustomValidity("");
  coordinates.removeAttribute("aria-invalid");
  coordinateError.textContent = "";
}

function showCoordinateError(message) {
  coordinates.setCustomValidity(message);
  coordinates.setAttribute("aria-invalid", "true");
  coordinateError.textContent = message;
  coordinates.focus();
  form.reportValidity();
}

coordinates.addEventListener("input", clearCoordinateError);

function parseCoordinates(value) {
  if (!value.trim()) return { error: "Indiquez une latitude et une longitude." };
  const match = value.trim().match(
    /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*[,;]\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/
  );
  if (!match) return { error: "Collez les coordonnées au format latitude, longitude." };
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { error: "La latitude et la longitude doivent être des nombres." };
  }
  if (latitude < -90 || latitude > 90) {
    return { error: "La latitude doit être comprise entre −90 et 90." };
  }
  if (longitude < -180 || longitude > 180) {
    return { error: "La longitude doit être comprise entre −180 et 180." };
  }
  return { latitude, longitude };
}

locate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showStatusError("La géolocalisation n’est pas disponible dans ce navigateur.");
    return;
  }

  locate.disabled = true;
  setStatus("Recherche de votre position…", "loading");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      coordinates.value = `${coords.latitude.toFixed(8)}, ${coords.longitude.toFixed(8)}`;
      clearCoordinateError();
      setStatus("Position renseignée. Vous pouvez maintenant générer le cadran.", "ready");
      locate.disabled = false;
    },
    (error) => {
      const messages = {
        1: "L’autorisation de géolocalisation a été refusée.",
        2: "Votre position est indisponible pour le moment.",
        3: "La recherche de votre position a expiré.",
      };
      showStatusError(messages[error.code] || "Impossible de récupérer votre position.");
      locate.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
  );
});

function requestParameters(latitude, longitude, title = "") {
  const parameters = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
  if (title) parameters.set("title", title);
  return parameters;
}

function assetEndpoint(extension, latitude, longitude, title = "", download = false) {
  const parameters = requestParameters(latitude, longitude, title);
  if (download) parameters.set("download", "true");
  return `${apiRoot}/api/v1/wheel.${extension}?${parameters}`;
}

function resultEndpoint(latitude, longitude, title = "") {
  const parameters = requestParameters(latitude, longitude, title);
  parameters.set("format", "json");
  return `${apiRoot}/api/v1/wheel?${parameters}`;
}

function setStatus(message, state = "") {
  status.classList.remove("error");
  status.setAttribute("role", "status");
  status.dataset.state = state;
  status.textContent = message;
}

function showStatusError(message) {
  status.classList.add("error");
  status.setAttribute("role", "alert");
  status.dataset.state = "error";
  status.textContent = message;
  status.focus();
}

async function responseError(response) {
  let message = `Erreur ${response.status}`;
  try {
    const payload = await response.json();
    if (typeof payload.detail === "string") message = payload.detail;
    else if (payload.detail?.message) message = `${payload.detail.message} (${payload.detail.code})`;
  } catch (_) {
    // La réponse n'est pas nécessairement en JSON.
  }
  return new Error(message);
}

function formatDecimal(value, digits = 1) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCoordinate(value) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
}

function formatPeriod(period) {
  return Array.isArray(period) ? `${period[0]}–${period[1]}` : String(period).replace("-", "–");
}

function dateFromDayOfYear(value) {
  const date = new Date(Date.UTC(2021, 0, Math.round(value)));
  return dateFormatter.format(date);
}

function signedDays(value) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${decimalFormatter.format(Math.abs(value))} j`;
}

function boundaryEvolution(value) {
  if (Math.abs(value) < 0.05) return "sans déplacement notable";
  return `${decimalFormatter.format(Math.abs(value))} jours ${value < 0 ? "plus tôt" : "plus tard"}`;
}

function durationEvolution(value) {
  if (Math.abs(value) < 0.05) return "sans changement notable";
  return `${decimalFormatter.format(Math.abs(value))} jours ${value > 0 ? "de plus" : "de moins"}`;
}

function haversineKilometres(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lon - first.lon);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function qualityDescription(payload) {
  const quality = payload.quality || {};
  if (quality.status === "valid") {
    return {
      label: "Résultat exploitable",
      note: "Les contrôles de complétude et de cohérence sont satisfaits. Le résultat reste une comparaison descriptive de réanalyse maillée.",
    };
  }
  const caveat = (payload.caveats || []).find((item) => item.id === "smoother-sensitivity-above-threshold");
  return {
    label: "Interprétation prudente",
    note: caveat?.text || "Un contrôle de robustesse demande de présenter l’amplitude exacte avec réserve.",
  };
}

function renderResult(payload, title) {
  const data = payload.data;
  const periods = data.periods || payload.periods;
  const earlyKey = periods.early.join("-");
  const lateKey = periods.late.join("-");
  const early = data.decades[earlyKey];
  const late = data.decades[lateKey];
  const comparison = data.comparison;
  if (!early?.canonical_boundaries || !late?.canonical_boundaries || !comparison) {
    throw new Error("La réponse scientifique ne contient pas les frontières attendues.");
  }

  const requestedCoordinates = payload.location?.requested?.geometry?.coordinates;
  const requested = {
    lon: Number(requestedCoordinates?.[0] ?? data.tile.lon),
    lat: Number(requestedCoordinates?.[1] ?? data.tile.lat),
  };
  const represented = {
    lat: Number(payload.location?.represented?.grid_point?.lat ?? data.source.grid_lat),
    lon: Number(payload.location?.represented?.grid_point?.lon ?? data.source.grid_lon),
  };
  const resolution = Number(payload.location?.represented?.grid_resolution_deg ?? data.source.grid_resolution_deg);
  const distance = haversineKilometres(requested, represented);
  const earlyLabel = formatPeriod(periods.early);
  const lateLabel = formatPeriod(periods.late);
  const locationLabel = title || `point ${formatCoordinate(requested.lat)}° N, ${formatCoordinate(requested.lon)}° E`;
  const summary = `Entre ${earlyLabel} et ${lateLabel}, pour ${locationLabel}, l’été thermique commence ${boundaryEvolution(comparison.summer_start_shift_days)} et dure ${durationEvolution(comparison.summer_length_change_days)}.`;

  resultSummary.textContent = summary;
  requestedPoint.textContent = `${formatCoordinate(requested.lat)}° N · ${formatCoordinate(requested.lon)}° E`;
  gridPoint.textContent = `${formatCoordinate(represented.lat)}° N · ${formatCoordinate(represented.lon)}° E`;
  gridResolution.textContent = `${formatDecimal(resolution, 1)}° (résolution nominale)`;
  gridDistance.textContent = `${formatDecimal(distance, 1)} km`;
  earlyPeriodHeading.textContent = earlyLabel;
  latePeriodHeading.textContent = lateLabel;
  tableCaption.textContent = `Frontières et durée des saisons thermiques pour ${locationLabel}`;

  const rows = [
    ["Début du printemps", "spring_start", "spring_start_shift_days", "boundary"],
    ["Début de l’été", "summer_start", "summer_start_shift_days", "boundary"],
    ["Début de l’automne", "autumn_start", "autumn_start_shift_days", "boundary"],
    ["Début de l’hiver", "winter_start", "winter_start_shift_days", "boundary"],
    ["Durée de l’été", "summer_length", "summer_length_change_days", "duration"],
  ];
  resultTableBody.innerHTML = rows.map(([label, boundaryKey, comparisonKey, type]) => {
    const earlyValue = early.canonical_boundaries[boundaryKey];
    const lateValue = late.canonical_boundaries[boundaryKey];
    const change = comparison[comparisonKey];
    const earlyText = type === "boundary" ? dateFromDayOfYear(earlyValue) : `${formatDecimal(earlyValue)} jours`;
    const lateText = type === "boundary" ? dateFromDayOfYear(lateValue) : `${formatDecimal(lateValue)} jours`;
    const changeText = type === "boundary" ? boundaryEvolution(change) : durationEvolution(change);
    return `<tr><th scope="row">${label}</th><td>${earlyText}</td><td>${lateText}</td><td>${changeText}</td></tr>`;
  }).join("");

  const quality = qualityDescription(payload);
  const qualityStatus = payload.quality?.status || "partial";
  qualityBadge.textContent = quality.label;
  qualityBadge.dataset.quality = qualityStatus;
  qualityNote.textContent = quality.note;
  qualityNote.dataset.quality = qualityStatus;

  shiftCards.setAttribute("aria-label", `Principaux déplacements calculés pour ${locationLabel}`);
  const metricKinds = {
    spring_start_shift_days: "boundary",
    summer_start_shift_days: "boundary",
    autumn_start_shift_days: "boundary",
    winter_start_shift_days: "boundary",
    summer_length_change_days: "duration",
  };
  shiftCards.querySelectorAll("[data-metric]").forEach((card) => {
    const metric = card.dataset.metric;
    const value = comparison[metric];
    card.querySelector("strong").textContent = signedDays(value);
    card.querySelector("small").textContent = metricKinds[metric] === "duration"
      ? (value >= 0 ? "Plus longue" : "Plus courte")
      : (value < 0 ? "Début plus tôt" : "Début plus tard");
  });

  cadranContext.textContent = `Votre cadran superpose ${earlyLabel} et ${lateLabel}. La largeur des secteurs traduit leur durée ; les flèches indiquent le déplacement des frontières.`;
  wheelCaption.textContent = summary;
  t25Value.textContent = `· ${formatDecimal(data.thresholds.t25_c, 3)} °C`;
  t75Value.textContent = `· ${formatDecimal(data.thresholds.t75_c, 3)} °C`;
  bootstrapValue.textContent = `${Number(data.method.bootstrap_replicates).toLocaleString("fr-FR")} réplications`;
  resultDetails.hidden = false;
}

function buildShareUrl(latitude, longitude, title) {
  const url = window.location.protocol === "file:"
    ? new URL(`${apiRoot}/`)
    : new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("lat", latitude.toFixed(8));
  url.searchParams.set("lon", longitude.toFixed(8));
  if (title) url.searchParams.set("title", title);
  return url;
}

copyLink.addEventListener("click", async () => {
  if (!currentShareUrl) return;
  try {
    await navigator.clipboard.writeText(currentShareUrl);
    setStatus("Lien du résultat copié dans le presse-papiers.", "ready");
  } catch (_) {
    window.prompt("Copiez le lien de ce résultat :", currentShareUrl);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const parsed = parseCoordinates(coordinates.value);
  if (parsed.error) {
    showCoordinateError(parsed.error);
    return;
  }
  if (!form.reportValidity()) return;

  clearCoordinateError();
  const { latitude, longitude } = parsed;
  const title = wheelTitle.value.trim();
  submit.disabled = true;
  submitLabel.textContent = "Calcul en cours…";
  form.setAttribute("aria-busy", "true");
  downloads.hidden = true;
  resultDetails.hidden = true;
  setStatus("Coordonnées vérifiées. Calcul de la maille ERA5-Land en cours…", "loading");

  try {
    const jsonResponse = await fetch(resultEndpoint(latitude, longitude, title));
    if (!jsonResponse.ok) throw await responseError(jsonResponse);
    const payload = await jsonResponse.json();
    renderResult(payload, title);
    setStatus("Calcul terminé. Préparation du cadran…", "loading");

    const svgResponse = await fetch(assetEndpoint("svg", latitude, longitude, title));
    if (!svgResponse.ok) throw await responseError(svgResponse);
    const blob = await svgResponse.blob();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    wheel.src = previewUrl;
    explanationWheel.src = previewUrl;
    const alternative = title
      ? `Cadran des saisons thermiques — ${title}`
      : `Cadran des saisons thermiques du point ${latitude}, ${longitude}`;
    wheel.alt = alternative;
    explanationWheel.alt = alternative;
    wheel.hidden = false;
    placeholder.hidden = true;

    downloadSvg.href = assetEndpoint("svg", latitude, longitude, title, true);
    downloadPng.href = assetEndpoint("png", latitude, longitude, title, true);
    currentShareUrl = buildShareUrl(latitude, longitude, title).href;
    if (window.location.protocol !== "file:") history.replaceState(null, "", currentShareUrl);
    downloads.hidden = false;
    setStatus("Cadran prêt. Le résumé, les valeurs et les téléchargements sont disponibles.", "ready");
    resultDetails.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultDetails.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  } catch (error) {
    showStatusError(error.message || "Impossible de générer le cadran.");
  } finally {
    submit.disabled = false;
    submitLabel.textContent = "Générer le cadran";
    form.removeAttribute("aria-busy");
  }
});

const navigationLinks = [...document.querySelectorAll(".sommaire a")];
const navigationSections = navigationLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
      if (!visible) return;
      navigationLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`);
      });
    },
    { rootMargin: "-20% 0px -55%", threshold: [0.05, 0.25, 0.6] }
  );
  navigationSections.forEach((section) => sectionObserver.observe(section));
}

const initialParameters = new URL(window.location.href).searchParams;
const initialLatitude = initialParameters.get("lat");
const initialLongitude = initialParameters.get("lon");
if (initialLatitude !== null || initialLongitude !== null) {
  if (initialLatitude === null || initialLongitude === null) {
    showCoordinateError("Le lien doit contenir une latitude et une longitude.");
  } else {
    coordinates.value = `${initialLatitude}, ${initialLongitude}`;
    wheelTitle.value = initialParameters.get("title") || "";
    const parsed = parseCoordinates(coordinates.value);
    if (parsed.error) showCoordinateError(`Lien invalide : ${parsed.error}`);
    else window.setTimeout(() => form.requestSubmit(), 0);
  }
}
