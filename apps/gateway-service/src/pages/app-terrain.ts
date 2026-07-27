import type { GatewayConfig } from "../config.js";
import { MAIRIE_VAL_D_AIGOUAL } from "../services-catalog.js";
import { escapeHtml } from "./layout.js";

export const APP_MANIFEST = {
  name: "Terrain — OpenDataVal",
  short_name: "Terrain",
  start_url: "/api/v2/app/",
  scope: "/api/v2/app/",
  display: "standalone",
  background_color: "#f6f7f9",
  theme_color: "#1f6feb",
  orientation: "portrait-primary",
  icons: [
    {
      src: "/api/v2/app/icone.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
} as const;

export const APP_ICONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
<title id="title">Terrain OpenDataVal</title>
<rect width="512" height="512" rx="108" fill="#1f6feb"/>
<path d="M74 352 176 204l68 91 54-71 140 128v86H74Z" fill="#fff" opacity=".92"/>
<path d="M256 72c-70 0-126 56-126 126 0 91 126 218 126 218s126-127 126-218c0-70-56-126-126-126Zm0 177a51 51 0 1 1 0-102 51 51 0 0 1 0 102Z" fill="#fff"/>
<circle cx="256" cy="198" r="25" fill="#f0883e"/>
</svg>`;

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9; --surface: #ffffff; --surface-alpha: rgba(255,255,255,.94);
  --border: #d8dde3; --text: #1b1f24; --muted: #5b6470; --accent: #1f6feb;
  --ok-bg: #e6f4ea; --ok-fg: #1a7f37; --ko-bg: #fbe9e7; --ko-fg: #b3261e;
  --warn-bg: #fff8e1; --warn-fg: #725b00; --alert-bg: #fdebd7; --alert-fg: #9a4f00;
  --shadow: 0 -5px 24px rgba(0,0,0,.18);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --surface: #161b22; --surface-alpha: rgba(22,27,34,.94);
    --border: #30363d; --text: #e6edf3; --muted: #9198a1; --accent: #58a6ff;
    --ok-bg: #12331f; --ok-fg: #4ac26b; --ko-bg: #3a1512; --ko-fg: #ff7b72;
    --warn-bg: #3a3012; --warn-fg: #e3b341; --alert-bg: #3d2410; --alert-fg: #f0883e;
  }
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
button, a { font: inherit; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
#map, .map-fallback { position: fixed; inset: 0; width: 100%; height: 100dvh; }
.map-fallback { display: grid; place-items: center; padding: 5rem 2rem calc(130px + env(safe-area-inset-bottom)); background: var(--bg); color: var(--muted); text-align: center; }
.map-fallback p { margin: 0 0 .2rem; }
.hud { position: fixed; z-index: 4; top: 0; left: 0; right: 0; padding: calc(.65rem + env(safe-area-inset-top)) .7rem .5rem; pointer-events: none; }
.hud-card { max-width: 34rem; margin: auto; padding: .55rem .7rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface-alpha); box-shadow: 0 3px 14px rgba(0,0,0,.15); backdrop-filter: blur(8px); }
.hud-row { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
.hud strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hud small { color: var(--muted); }
.source-dot { display: inline-block; width: .65rem; height: .65rem; margin-right: .35rem; border-radius: 50%; background: var(--muted); }
.source-dot[data-state="available"] { background: var(--ok-fg); }
.source-dot[data-state="partial"] { background: var(--warn-fg); }
.source-dot[data-state="unavailable"] { background: var(--ko-fg); }
.emergency { min-width: 48px; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; color: var(--ko-fg); font-weight: 800; pointer-events: auto; }
.sheet { position: fixed; z-index: 5; left: 0; right: 0; bottom: calc(112px + env(safe-area-inset-bottom)); max-height: 70dvh; display: flex; flex-direction: column; border: 1px solid var(--border); border-bottom: 0; border-radius: 1rem 1rem 0 0; background: var(--surface-alpha); box-shadow: var(--shadow); backdrop-filter: blur(10px); transform: translateY(calc(100% - 74px)); transition: transform .2s ease; }
.sheet[data-state="hidden"] { transform: translateY(100%); }
.sheet[data-state="expanded"] { transform: translateY(0); }
.sheet-handle { min-height: 48px; border: 0; background: transparent; color: var(--text); cursor: pointer; }
.sheet-handle::before { content: ""; display: block; width: 3rem; height: .3rem; margin: .45rem auto .3rem; border-radius: 1rem; background: var(--muted); opacity: .55; }
.sheet-title { display: block; padding: 0 .9rem .5rem; font-weight: 750; }
.sheet-body { overflow-y: auto; padding: 0 .9rem 1.25rem; overscroll-behavior: contain; }
.sheet p { margin: .45rem 0; }
.notice { padding: .65rem .75rem; margin: .55rem 0; border-radius: .55rem; background: var(--warn-bg); color: var(--warn-fg); }
.notice.error { background: var(--ko-bg); color: var(--ko-fg); }
.warning-list { margin: .55rem 0; padding-left: 1.2rem; }
.request-id { color: var(--muted); font-size: .75rem; overflow-wrap: anywhere; }
.retry { min-height: 48px; margin-top: .45rem; padding: .6rem .9rem; border: 1px solid var(--accent); border-radius: .55rem; background: transparent; color: var(--accent); font-weight: 700; }
.result-list { list-style: none; margin: .6rem 0; padding: 0; }
.result-list li { border-top: 1px solid var(--border); }
.result-list button { width: 100%; min-height: 48px; padding: .65rem .25rem; border: 0; background: transparent; color: var(--text); text-align: left; }
.result-list strong, .result-list span { display: block; }
.result-list span { color: var(--muted); font-size: .85rem; }
.nearest { padding: .65rem; border-radius: .55rem; background: var(--alert-bg); color: var(--alert-fg); }
.day { margin: .9rem 0 .25rem; font-size: .95rem; }
.details { padding: .65rem; border: 1px solid var(--border); border-radius: .55rem; }
.actions { position: fixed; z-index: 6; left: 0; right: 0; bottom: 0; min-height: calc(112px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(4,1fr); gap: .3rem; padding: .45rem .45rem calc(.45rem + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--surface-alpha); backdrop-filter: blur(10px); }
.action { min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: .2rem; }
.action-main { min-height: 54px; padding: .25rem .15rem; border: 0; border-radius: .65rem; background: transparent; color: var(--text); font-weight: 720; cursor: pointer; }
.action-main[aria-busy="true"] { opacity: .55; }
.action-main .icon { display: block; font-size: 1.25rem; }
.segments { display: grid; grid-template-columns: 1fr 1fr; }
.segments button { min-width: 48px; min-height: 48px; padding: 0; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: .75rem; font-weight: 750; }
.segments button:first-child { border-radius: .45rem 0 0 .45rem; }
.segments button:last-child { border-radius: 0 .45rem .45rem 0; }
.segments button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: white; }
.maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { bottom: calc(116px + env(safe-area-inset-bottom)); }
@media (min-width: 700px) {
  .sheet { left: 1rem; right: auto; width: min(28rem,calc(100% - 2rem)); }
  .actions { left: 50%; right: auto; width: min(38rem,100%); transform: translateX(-50%); border: 1px solid var(--border); border-bottom: 0; border-radius: .9rem .9rem 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;

const CLIENT_SCRIPT = `
(function () {
  "use strict";
  var origin = window.__terrainOrigin;
  var state = { point: { lat: origin.lat, lon: origin.lon, label: origin.libelle }, radius: 5, lastFire: null, lastMode: null, map: null, mapReady: false, loadingVendor: false };
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var sheet = document.getElementById("sheet");
  var sheetTitle = document.getElementById("sheet-title");
  var sheetBody = document.getElementById("sheet-body");
  var hudPoint = document.getElementById("hud-point");
  var sourceDot = document.getElementById("source-dot");
  var sourceText = document.getElementById("source-text");
  var fireButton = document.getElementById("fire-action");

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function number(value, digits) {
    return typeof value === "number" && isFinite(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—";
  }
  function dateTime(value) {
    var date = new Date(value);
    return isNaN(date.getTime()) ? "date inconnue" : new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris"
    }).format(date);
  }
  function dayLabel(value) {
    var date = new Date(value);
    return isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris"
    }).format(date);
  }
  function setSheet(title, html, expanded) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    sheet.setAttribute("data-state", expanded === false ? "collapsed" : "expanded");
  }
  function setPoint(point) {
    state.point = point;
    hudPoint.textContent = point.label || (number(point.lat, 5) + ", " + number(point.lon, 5));
    updateActivePoint();
  }
  function setSourceState(value, label) {
    sourceDot.setAttribute("data-state", value);
    sourceText.textContent = label;
  }
  function requestError(payload, fallback) {
    var error = payload && payload.error;
    var message = error && error.message ? error.message : fallback;
    var requestId = payload && payload.requestId;
    return '<div class="notice error">' + esc(message) + '</div>' +
      (requestId ? '<p class="request-id">Référence support : ' + esc(requestId) + '</p>' : "");
  }
  async function json(url) {
    var response = await fetch(url, { headers: { accept: "application/json" } });
    var payload;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) {
      var failure = new Error("HTTP " + response.status);
      failure.payload = payload;
      failure.status = response.status;
      throw failure;
    }
    return payload;
  }
  function fly(point, zoom) {
    if (!state.mapReady) return;
    state.map.flyTo({ center: [point.lon, point.lat], zoom: zoom || 12, duration: reducedMotion ? 0 : 700 });
  }
  function sourceData(id, data) {
    if (!state.mapReady) return;
    var source = state.map.getSource(id);
    if (source) source.setData(data);
  }
  function featureCollection(features) { return { type: "FeatureCollection", features: features }; }
  function pointFeature(point, properties) {
    return { type: "Feature", geometry: { type: "Point", coordinates: [point.lon, point.lat] }, properties: properties || {} };
  }
  function circleFeature(center, radiusKm) {
    var coords = [];
    var latDelta = radiusKm / 110.574;
    var cosine = Math.max(Math.cos(center.lat * Math.PI / 180), .01);
    var lonDelta = Math.min(180, radiusKm / (111.320 * cosine));
    for (var i = 0; i <= 72; i += 1) {
      var angle = i / 72 * Math.PI * 2;
      coords.push([center.lon + Math.cos(angle) * lonDelta, center.lat + Math.sin(angle) * latDelta]);
    }
    return { type: "Feature", properties: { radius_km: radiusKm }, geometry: { type: "Polygon", coordinates: [coords] } };
  }
  function updateActivePoint(accuracy) {
    sourceData("active-point", featureCollection([pointFeature(state.point, { accuracy: accuracy || 0 })]));
    if (typeof accuracy === "number" && accuracy > 0) {
      sourceData("accuracy", featureCollection([circleFeature(state.point, accuracy / 1000)]));
    } else {
      sourceData("accuracy", featureCollection([]));
    }
  }
  function clearFire() {
    sourceData("detections", featureCollection([]));
    sourceData("search-radius", featureCollection([]));
  }
  function detections(payload, mode) {
    return payload && payload.history && Array.isArray(payload.history.suspicions) ? payload.history.suspicions : [];
  }
  function paintFire(payload, mode, radius) {
    var items = detections(payload, mode);
    var now = Date.now();
    sourceData("search-radius", featureCollection([circleFeature(state.point, radius)]));
    sourceData("detections", featureCollection(items.map(function (item) {
      return pointFeature({ lat: item.latitude, lon: item.longitude }, {
        id: item.id, ageHours: Math.max(0, (now - Date.parse(item.observed_at)) / 3600000),
        frp: typeof item.frp_mw === "number" ? item.frp_mw : 0
      });
    })));
    if (!state.mapReady) return;
    var coordinates = [[state.point.lon, state.point.lat]].concat(items.map(function (item) { return [item.longitude, item.latitude]; }));
    if (coordinates.length === 1) return fly(state.point, radius === 5 ? 13 : 10);
    var bounds = coordinates.reduce(function (box, coordinate) { return box.extend(coordinate); }, new window.maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    state.map.fitBounds(bounds, { padding: { top: 110, bottom: 230, left: 45, right: 45 }, maxZoom: 14, duration: reducedMotion ? 0 : 700 });
  }
  function fireWarnings(payload) {
    var sources = Array.isArray(payload.sources) ? payload.sources : [];
    var degraded = payload.data_status !== "available" || sources.some(function (source) { return source.state !== "available"; });
    var html = degraded
      ? '<div class="notice"><strong>Données incomplètes.</strong> Une source n’a pas répondu : l’absence de point ne signifie pas l’absence de feu.</div>'
      : "";
    var warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    if (warnings.length) html += '<ul class="warning-list">' + warnings.map(function (warning) { return "<li>" + esc(warning.message) + "</li>"; }).join("") + "</ul>";
    return html;
  }
  function detail(item) {
    setSheet("Détail de la suspicion satellitaire",
      '<div class="details"><p><strong>Suspicion satellitaire non confirmée</strong></p>' +
      "<p>Distance : " + number(item.distance_km, 2) + " km</p>" +
      "<p>Observation : " + esc(dateTime(item.observed_at)) + "</p>" +
      "<p>Satellite : " + esc(item.satellite || "non renseigné") + "</p>" +
      "<p>Instrument : " + esc(item.instrument || "non renseigné") + "</p>" +
      "<p>Confiance : " + esc(item.confidence && item.confidence.normalized || "inconnue") + "</p>" +
      "<p>Puissance radiative : " + (typeof item.frp_mw === "number" ? number(item.frp_mw, 1) + " MW" : "non renseignée") + "</p></div>" +
      fireWarnings(state.lastFire || {}), true);
  }
  function fireList(payload, mode) {
    var items = detections(payload, mode).slice().sort(function (a, b) { return a.distance_km - b.distance_km; });
    var intro = fireWarnings(payload);
    if (!items.length) {
      return intro + '<p>Aucune suspicion satellitaire remontée dans cette fenêtre. Ce résultat ne constitue pas une garantie d’absence de feu.</p>';
    }
    var byId = {};
    items.forEach(function (item) { byId[item.id] = item; });
    window.__terrainDetections = byId;
    if (mode !== "history") {
      var nearest = items[0];
      return intro + '<div class="nearest"><strong>La plus proche : ' + number(nearest.distance_km, 2) +
        ' km</strong><br>Suspicion satellitaire observée ' + esc(dateTime(nearest.observed_at)) + '</div>' +
        '<ul class="result-list">' + items.map(function (item) {
          return '<li><button type="button" data-detection="' + esc(item.id) + '"><strong>' +
            number(item.distance_km, 2) + ' km · suspicion satellitaire</strong><span>' +
            esc(dateTime(item.observed_at)) + " · " + esc(item.source) + "</span></button></li>";
        }).join("") + "</ul>";
    }
    var groups = {};
    items.forEach(function (item) {
      var key = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(item.observed_at));
      (groups[key] = groups[key] || []).push(item);
    });
    return intro + Object.keys(groups).sort().reverse().map(function (key) {
      var group = groups[key];
      return '<h3 class="day">' + esc(dayLabel(group[0].observed_at)) + " — " + group.length + '</h3><ul class="result-list">' +
        group.map(function (item) {
          return '<li><button type="button" data-detection="' + esc(item.id) + '"><strong>' +
            number(item.distance_km, 2) + ' km · suspicion satellitaire</strong><span>' +
            esc(dateTime(item.observed_at)) + " · " + esc(item.source) + "</span></button></li>";
        }).join("") + "</ul>";
    }).join("");
  }
  async function loadFire(mode) {
    var radius = mode === "history" ? 50 : state.radius;
    var days = mode === "history" ? 7 : 1;
    state.lastMode = mode;
    fireButton.setAttribute("aria-busy", "true");
    setSourceState("partial", "Sources satellite : chargement…");
    setSheet(mode === "history" ? "Historique 7 jours" : "Feux — " + radius + " km", "<p>Interrogation des sources satellite…</p>", true);
    try {
      var params = new URLSearchParams({ lat: String(state.point.lat), lon: String(state.point.lon), radius_km: String(radius), history_days: String(days) });
      var payload = await json("/api/v2/fire/nearby?" + params);
      state.lastFire = payload; state.lastMode = mode;
      var sourceProblem = payload.data_status !== "available" || (payload.sources || []).some(function (source) { return source.state !== "available"; });
      setSourceState(sourceProblem ? "partial" : "available", sourceProblem ? "Sources satellite : incomplètes" : "Sources satellite : disponibles");
      paintFire(payload, mode, radius);
      setSheet(mode === "history" ? "Historique 7 jours — 50 km" : "Feux — " + radius + " km", fireList(payload, mode), true);
    } catch (error) {
      setSourceState("unavailable", "Sources satellite : indisponibles");
      var failure = requestError(error.payload, "Le service de détection est temporairement indisponible.");
      setSheet("Données feu indisponibles", failure + '<button class="retry" id="retry-fire" type="button">Réessayer</button>', true);
    } finally {
      fireButton.removeAttribute("aria-busy");
    }
  }
  function renderGeography(payload) {
    var address = payload.address || {};
    var territory = payload.territory || {};
    var elevation = payload.elevation || {};
    var html = "";
    if (address.status === "available" && address.data) html += "<p><strong>" + esc(address.data.formatted) + "</strong></p>";
    else html += '<div class="notice">Adresse indisponible pour ces coordonnées.</div>';
    if (territory.status === "available" && territory.data) {
      var commune = territory.data.commune || {};
      var department = territory.data.department || {};
      html += "<p>Commune : " + esc(commune.name || "—") + (commune.inseeCode ? " (" + esc(commune.inseeCode) + ")" : "") + "</p>";
      html += "<p>Département : " + esc(department.name || "—") + (department.code ? " (" + esc(department.code) + ")" : "") + "</p>";
    }
    if (elevation.status === "available" && elevation.data && typeof elevation.data.meters === "number") {
      html += "<p>Altitude : " + number(elevation.data.meters, 0) + " m</p>";
    }
    return html;
  }
  async function locate() {
    if (!navigator.geolocation) {
      setSheet("Position indisponible", '<div class="notice error">La géolocalisation n’est pas prise en charge. Le point actif reste la mairie.</div>', true);
      return;
    }
    setSheet("Ma position", "<p>Recherche de votre position…</p>", true);
    navigator.geolocation.getCurrentPosition(async function (position) {
      var point = { lat: position.coords.latitude, lon: position.coords.longitude, label: "Ma position" };
      setPoint(point); updateActivePoint(position.coords.accuracy); fly(point, 15);
      var raw = "<p>Coordonnées : " + number(point.lat, 6) + ", " + number(point.lon, 6) + "</p>";
      try {
        var params = new URLSearchParams({
          lat: String(point.lat), lon: String(point.lon),
          horizontalAccuracyMeters: String(position.coords.accuracy),
          positionSource: "browser-geolocation"
        });
        var payload = await json("/api/v2/geography/resolve?" + params);
        setSheet("Ma position", renderGeography(payload) + raw, true);
      } catch (error) {
        setSheet("Ma position", raw + '<div class="notice">Adresse indisponible ; les coordonnées restent utilisables.</div>' +
          requestError(error.payload, "Le service géographique est temporairement indisponible."), true);
      }
    }, function (error) {
      var messages = { 1: "Autorisation refusée.", 2: "Position indisponible.", 3: "Délai de géolocalisation dépassé." };
      setSheet("Position indisponible", '<div class="notice error">' + esc(messages[error.code] || "La géolocalisation a échoué.") +
        " Le point actif reste " + esc(state.point.label || "inchangé") + ".</div>", true);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  function resetOrigin() {
    setPoint({ lat: origin.lat, lon: origin.lon, label: origin.libelle });
    clearFire(); fly(state.point, 12);
    setSheet(origin.libelle, "<p><strong>" + esc(origin.adresse) + "</strong></p><p>Point d’origine de l’application de terrain.</p>", false);
  }
  function addMapLayers() {
    state.map.addSource("search-radius", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "search-radius-fill", type: "fill", source: "search-radius", paint: { "fill-color": "#f0883e", "fill-opacity": .12 } });
    state.map.addLayer({ id: "search-radius-line", type: "line", source: "search-radius", paint: { "line-color": "#f0883e", "line-width": 2, "line-dasharray": [2, 2] } });
    state.map.addSource("accuracy", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#1f6feb", "fill-opacity": .13 } });
    state.map.addSource("active-point", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "active-point", type: "circle", source: "active-point", paint: { "circle-radius": 8, "circle-color": "#1f6feb", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
    state.map.addSource("detections", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "detections", type: "circle", source: "detections", paint: {
      "circle-color": ["case", ["<", ["get", "ageHours"], 3], "#d1242f", ["<", ["get", "ageHours"], 24], "#f0883e", "#e3b341"],
      "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 6, 100, 13],
      "circle-opacity": .85, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5
    } });
    updateActivePoint();
    state.map.on("click", "detections", function (event) {
      var id = event.features && event.features[0] && event.features[0].properties.id;
      var item = window.__terrainDetections && window.__terrainDetections[id];
      if (item) detail(item);
    });
    state.map.on("mouseenter", "detections", function () { state.map.getCanvas().style.cursor = "pointer"; });
    state.map.on("mouseleave", "detections", function () { state.map.getCanvas().style.cursor = ""; });
    state.map.on("contextmenu", function (event) {
      setPoint({ lat: event.lngLat.lat, lon: event.lngLat.lng, label: "Point choisi sur la carte" });
      clearFire(); fly(state.point, state.map.getZoom());
      setSheet("Point choisi", "<p>Coordonnées : " + number(state.point.lat, 6) + ", " + number(state.point.lon, 6) + "</p><p>Les prochaines requêtes utiliseront ce point.</p>", false);
    });
  }
  function showMapFallback(message) {
    var container = document.getElementById("map");
    if (!container) return;
    container.classList.add("map-fallback");
    container.innerHTML = '<div><p>' + esc(message) + '</p><button class="retry" id="retry-map" type="button">Réessayer</button></div>';
  }
  function clearMapFallback() {
    var container = document.getElementById("map");
    if (!container) return;
    container.classList.remove("map-fallback");
    container.innerHTML = "";
  }
  function loadMapLibre(done) {
    if (window.maplibregl) { done(true); return; }
    if (state.loadingVendor) return;
    state.loadingVendor = true;
    var stylesheet = document.querySelector('link[data-maplibre]');
    if (stylesheet) stylesheet.href = "/api/v2/map/vendor/maplibre-gl.css?reessai=" + Date.now();
    var script = document.createElement("script");
    script.src = "/api/v2/map/vendor/maplibre-gl.js?reessai=" + Date.now();
    script.onload = function () { state.loadingVendor = false; done(!!window.maplibregl); };
    script.onerror = function () { state.loadingVendor = false; done(false); };
    document.head.appendChild(script);
  }
  function retryMap() {
    var button = document.getElementById("retry-map");
    if (button) { button.disabled = true; button.textContent = "Chargement…"; }
    loadMapLibre(function (available) {
      if (available) { initMap(); return; }
      showMapFallback("Carte toujours indisponible. La localisation et les résultats restent accessibles avec les boutons ci-dessous.");
      setSourceState("unavailable", "Carte indisponible · données accessibles");
    });
  }
  function initMap() {
    if (!window.maplibregl) {
      showMapFallback("Carte indisponible. La localisation et les résultats restent accessibles avec les boutons ci-dessous.");
      setSourceState("unavailable", "Carte indisponible · données accessibles");
      return;
    }
    clearMapFallback();
    try {
      state.map = new window.maplibregl.Map({ container: "map", style: "/api/v2/map/styles/plan.json", center: [origin.lon, origin.lat], zoom: 12, attributionControl: true });
      state.map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      state.map.on("load", function () { state.mapReady = true; addMapLayers(); });
      state.map.on("error", function () {
        if (!state.mapReady) setSourceState("partial", "Fond de carte indisponible · données accessibles");
      });
    } catch (_) {
      state.map = null;
      state.mapReady = false;
      showMapFallback("Carte indisponible. La localisation et les résultats restent accessibles.");
      setSourceState("unavailable", "Carte indisponible · données accessibles");
    }
  }
  document.getElementById("sheet-handle").addEventListener("click", function () {
    var current = sheet.getAttribute("data-state");
    sheet.setAttribute("data-state", current === "expanded" ? "collapsed" : current === "collapsed" ? "hidden" : "expanded");
  });
  document.getElementById("origin-action").addEventListener("click", resetOrigin);
  document.getElementById("locate-action").addEventListener("click", locate);
  fireButton.addEventListener("click", function () { loadFire("nearby"); });
  document.getElementById("history-action").addEventListener("click", function () { loadFire("history"); });
  document.querySelectorAll("[data-radius]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.radius = Number(button.getAttribute("data-radius"));
      document.querySelectorAll("[data-radius]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
    });
  });
  sheetBody.addEventListener("click", function (event) {
    var target = event.target.closest && event.target.closest("[data-detection]");
    if (target) {
      var item = window.__terrainDetections && window.__terrainDetections[target.getAttribute("data-detection")];
      if (item) detail(item);
    }
    if (event.target.id === "retry-fire" && state.lastMode) loadFire(state.lastMode);
  });
  document.getElementById("map").addEventListener("click", function (event) {
    if (event.target && event.target.id === "retry-map") retryMap();
  });
  // maplibre-gl.js est chargé en "defer" : ce script inline s'exécute avant lui, il faut
  // donc attendre "load" pour disposer de window.maplibregl (même approche que la démo carte).
  if (document.readyState === "complete") initMap();
  else window.addEventListener("load", initMap);
})();
`;

export function renderAppTerrain(config: GatewayConfig): string {
  const origin = JSON.stringify(MAIRIE_VAL_D_AIGOUAL).replace(/</g, "\\u003c");
  const title = escapeHtml(`Terrain — OpenDataVal ${config.version}`);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f6feb">
<meta name="description" content="Carte de terrain OpenDataVal : position et suspicions satellitaires de feu à proximité.">
<title>${title}</title>
<link rel="manifest" href="/api/v2/app/manifest.webmanifest">
<link rel="icon" href="/api/v2/app/icone.svg" type="image/svg+xml">
<link rel="stylesheet" href="/api/v2/map/vendor/maplibre-gl.css" data-maplibre>
<script defer src="/api/v2/map/vendor/maplibre-gl.js"></script>
<style>${STYLES}</style>
</head>
<body>
<div id="map" aria-label="Carte de terrain centrée sur la mairie de Val-d’Aigoual"></div>
<header class="hud">
  <div class="hud-card">
    <div class="hud-row">
      <div><strong id="hud-point">${escapeHtml(MAIRIE_VAL_D_AIGOUAL.libelle)}</strong><small><span class="source-dot" id="source-dot"></span><span id="source-text">Point actif · sources en attente</span></small></div>
      <a class="emergency" href="tel:112" aria-label="Appeler les secours au 112">112</a>
    </div>
    <small>Urgence : <a class="emergency" href="tel:18" aria-label="Appeler les pompiers au 18">18</a> · Toute détection affichée est une suspicion satellitaire non confirmée.</small>
  </div>
</header>
<section class="sheet" id="sheet" data-state="collapsed" aria-labelledby="sheet-title">
  <button class="sheet-handle" id="sheet-handle" type="button" aria-label="Afficher ou masquer les résultats"></button>
  <strong class="sheet-title" id="sheet-title">${escapeHtml(MAIRIE_VAL_D_AIGOUAL.libelle)}</strong>
  <div class="sheet-body" id="sheet-body">
    <p><strong>${escapeHtml(MAIRIE_VAL_D_AIGOUAL.adresse)}</strong></p>
    <p>Appui long sur la carte pour choisir un autre point.</p>
  </div>
</section>
<nav class="actions" aria-label="Actions de terrain">
  <div class="action"><button class="action-main" id="origin-action" type="button"><span class="icon" aria-hidden="true">⌂</span>Mairie</button></div>
  <div class="action"><button class="action-main" id="locate-action" type="button"><span class="icon" aria-hidden="true">◎</span>Ma position</button></div>
  <div class="action">
    <button class="action-main" id="fire-action" type="button"><span class="icon" aria-hidden="true">△</span>Feux</button>
    <div class="segments" role="group" aria-label="Rayon de recherche des feux">
      <button type="button" data-radius="5" aria-pressed="true">5 km</button>
      <button type="button" data-radius="50" aria-pressed="false">50 km</button>
    </div>
  </div>
  <div class="action"><button class="action-main" id="history-action" type="button"><span class="icon" aria-hidden="true">↶</span>Historique 7 j</button></div>
</nav>
<script>window.__terrainOrigin=${origin};</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
