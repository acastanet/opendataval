import type { GatewayConfig } from "../config.js";
import { MAIRIE_VAL_D_AIGOUAL } from "../services-catalog.js";
import { escapeHtml } from "./layout.js";

export const APP_MANIFEST = {
  name: "valfeu — Veille incendie",
  short_name: "valfeu",
  start_url: "/valfeu/",
  scope: "/valfeu/",
  display: "standalone",
  background_color: "#f4f1eb",
  theme_color: "#17362f",
  orientation: "portrait-primary",
  icons: [
    {
      src: "/valfeu/icone.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
} as const;

export const APP_ICONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
<title id="title">valfeu</title>
<rect width="512" height="512" rx="108" fill="#17362f"/>
<path d="M70 405 174 235l74 92 61-80 133 158H70Z" fill="#e8e1d4"/>
<path d="M271 82c-16 63-91 91-91 174 0 55 40 100 93 100s96-43 96-98c0-46-25-88-71-126 5 42-14 63-35 75 8-41-1-80 8-125Z" fill="#e95b32"/>
<path d="M275 224c-5 25-36 40-36 72 0 22 16 40 37 40 22 0 39-17 39-39 0-19-10-34-28-50 1 17-5 26-13 31 3-18-1-35 1-54Z" fill="#ffd166"/>
</svg>`;

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f4f1eb; --surface: #fffdf9; --surface-alpha: rgba(255,253,249,.96);
  --surface-soft: #f1ede4; --border: #d9d3c7; --text: #17211e; --muted: #66716c;
  --forest: #17362f; --forest-soft: #dce8e1; --accent: #dc4c2a; --accent-strong: #b9371b;
  --ok-bg: #e3f0e7; --ok-fg: #247348; --ko-bg: #fae7e2; --ko-fg: #a93221;
  --warn-bg: #fff1cf; --warn-fg: #745615; --alert-bg: #fee9df; --alert-fg: #9c351f;
  --shadow: 0 14px 42px rgba(23,33,30,.18); --dock-height: 146px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101714; --surface: #17211e; --surface-alpha: rgba(23,33,30,.96);
    --surface-soft: #202c28; --border: #34443e; --text: #f3f0e9; --muted: #a9b4af;
    --forest: #e4eee8; --forest-soft: #263d35; --accent: #f27a55; --accent-strong: #ff9878;
    --ok-bg: #183528; --ok-fg: #73d49e; --ko-bg: #421f1b; --ko-fg: #ff9c89;
    --warn-bg: #3a3019; --warn-fg: #f0c866; --alert-bg: #44251c; --alert-fg: #ff9b7d;
  }
  #map canvas { filter: brightness(.76) saturate(.78) contrast(1.06); }
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
button, a { font: inherit; }
button:focus-visible, a:focus-visible { outline: 3px solid #f3a185; outline-offset: 3px; }
#map, .map-fallback { position: fixed; inset: 0; width: 100%; height: 100dvh; }
.map-fallback { display: grid; place-items: center; padding: 7rem 2rem calc(var(--dock-height) + 2rem + env(safe-area-inset-bottom)); background: var(--bg); color: var(--muted); text-align: center; }
.map-fallback p { margin: 0 0 .2rem; }
.hud { position: fixed; z-index: 4; top: 0; left: 0; right: 0; padding: calc(.75rem + env(safe-area-inset-top)) .75rem .5rem; pointer-events: none; }
.hud-card { max-width: 38rem; margin: auto; padding: .75rem; border: 1px solid color-mix(in srgb,var(--border) 80%,transparent); border-radius: 1rem; background: var(--surface-alpha); box-shadow: 0 8px 30px rgba(23,33,30,.14); backdrop-filter: blur(16px) saturate(1.2); }
.hud-main { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: .7rem; }
.brand-mark { width: 2.35rem; height: 2.35rem; display: grid; place-items: center; border-radius: .75rem; background: var(--forest); color: var(--surface); font-size: 1.15rem; font-weight: 900; }
.eyebrow { display: block; margin-bottom: .06rem; color: var(--accent-strong); font-size: .67rem; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
.hud-copy { min-width: 0; }
.hud strong { display: block; overflow: hidden; color: var(--forest); font-size: .98rem; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.source-status { display: flex; align-items: center; min-width: 0; margin-top: .28rem; color: var(--muted); font-size: .75rem; }
.source-status span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-dot { flex: 0 0 auto; display: inline-block; width: .52rem; height: .52rem; margin-right: .38rem; border-radius: 50%; background: var(--muted); box-shadow: 0 0 0 3px color-mix(in srgb,var(--muted) 14%,transparent); }
.source-dot[data-state="available"] { background: var(--ok-fg); }
.source-dot[data-state="partial"] { background: var(--warn-fg); }
.source-dot[data-state="unavailable"] { background: var(--ko-fg); }
.emergency { min-width: 48px; min-height: 48px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; border-radius: .75rem; background: var(--ko-bg); color: var(--ko-fg); font-size: 1rem; font-weight: 900; line-height: 1; text-decoration: none; pointer-events: auto; }
.emergency small { margin-top: .2rem; font-size: .59rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.safety-note { margin: .65rem 0 0; padding-top: .55rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .7rem; line-height: 1.35; }
.safety-note a { color: var(--ko-fg); font-weight: 800; pointer-events: auto; }
.map-legend { position: fixed; z-index: 3; top: calc(8.8rem + env(safe-area-inset-top)); right: .75rem; display: flex; gap: .45rem; padding: .4rem .55rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-alpha); box-shadow: 0 5px 18px rgba(23,33,30,.1); color: var(--muted); font-size: .67rem; font-weight: 700; backdrop-filter: blur(12px); }
.legend-item { display: inline-flex; align-items: center; gap: .25rem; }
.legend-dot { width: .48rem; height: .48rem; border-radius: 50%; background: #d1242f; }
.legend-dot.orange { background: #f0883e; }
.legend-dot.yellow { background: #e3b341; }
.sheet { position: fixed; z-index: 5; left: .5rem; right: .5rem; bottom: calc(var(--dock-height) + .65rem + env(safe-area-inset-bottom)); max-height: min(68dvh,42rem); display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 1.2rem; background: var(--surface-alpha); box-shadow: var(--shadow); backdrop-filter: blur(16px) saturate(1.2); transform: translateY(calc(100% - 68px)); transition: transform .25s cubic-bezier(.2,.75,.25,1); }
.sheet[data-state="hidden"] { transform: translateY(100%); }
.sheet[data-state="expanded"] { transform: translateY(0); }
.sheet-head { display: grid; grid-template-columns: 1fr auto; align-items: center; min-height: 67px; padding: .55rem .65rem .55rem 1rem; }
.sheet-heading { min-width: 0; }
.sheet-kicker { display: block; color: var(--accent-strong); font-size: .65rem; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
.sheet-title { display: block; overflow: hidden; margin-top: .05rem; font-size: 1.05rem; font-weight: 820; text-overflow: ellipsis; white-space: nowrap; }
.sheet-handle { width: 48px; min-height: 48px; display: grid; place-items: center; border: 0; border-radius: .8rem; background: var(--surface-soft); color: var(--forest); cursor: pointer; }
.sheet-handle::before { content: ""; width: .65rem; height: .65rem; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg) translate(-2px,-2px); transition: transform .2s ease; }
.sheet[data-state="expanded"] .sheet-handle::before { transform: rotate(225deg) translate(-2px,-2px); }
.sheet-body { overflow-y: auto; padding: .1rem 1rem 1.1rem; border-top: 1px solid var(--border); overscroll-behavior: contain; scrollbar-color: var(--border) transparent; }
.sheet p { margin: .45rem 0; }
.notice { padding: .8rem .85rem; margin: .7rem 0; border-left: 4px solid currentColor; border-radius: .7rem; background: var(--warn-bg); color: var(--warn-fg); }
.notice.error { background: var(--ko-bg); color: var(--ko-fg); }
.warning-list { margin: .55rem 0; padding-left: 1.2rem; }
.request-id { color: var(--muted); font-size: .75rem; overflow-wrap: anywhere; }
.retry { min-height: 48px; margin-top: .55rem; padding: .65rem 1rem; border: 0; border-radius: .7rem; background: var(--forest); color: var(--surface); font-weight: 800; cursor: pointer; }
.result-list { display: grid; gap: .55rem; list-style: none; margin: .7rem 0; padding: 0; }
.result-list button { width: 100%; min-height: 64px; padding: .7rem .8rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface); color: var(--text); text-align: left; box-shadow: 0 3px 12px rgba(23,33,30,.05); cursor: pointer; }
.result-list button:hover { border-color: var(--accent); transform: translateY(-1px); }
.result-list strong, .result-list span { display: block; }
.result-list strong { color: var(--forest); font-size: .92rem; }
.result-list span { margin-top: .18rem; color: var(--muted); font-size: .78rem; }
.nearest { padding: .85rem; border: 1px solid color-mix(in srgb,var(--accent) 30%,var(--border)); border-radius: .8rem; background: var(--alert-bg); color: var(--alert-fg); }
.day { margin: 1rem 0 .35rem; color: var(--forest); font-size: .82rem; letter-spacing: .02em; text-transform: capitalize; }
.details { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; padding: .8rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface); }
.details p { margin: 0; padding: .5rem; border-radius: .5rem; background: var(--surface-soft); }
.details p:first-child { grid-column: 1/-1; background: var(--alert-bg); color: var(--alert-fg); }
.actions { position: fixed; z-index: 6; left: .5rem; right: .5rem; bottom: calc(.5rem + env(safe-area-inset-bottom)); height: var(--dock-height); display: grid; grid-template-rows: 58px 1fr; gap: .5rem; padding: .55rem; border: 1px solid var(--border); border-radius: 1.2rem; background: var(--surface-alpha); box-shadow: 0 12px 40px rgba(23,33,30,.2); backdrop-filter: blur(18px) saturate(1.2); }
.fire-search { display: grid; grid-template-columns: minmax(112px,.9fr) 1.4fr; gap: .5rem; }
.action { min-width: 0; }
.action-main { width: 100%; min-height: 52px; display: flex; align-items: center; justify-content: center; gap: .4rem; padding: .45rem .35rem; border: 1px solid transparent; border-radius: .8rem; background: transparent; color: var(--forest); font-size: .78rem; font-weight: 780; cursor: pointer; }
.action-main[aria-busy="true"] { opacity: .55; }
.action-main:hover { background: var(--surface-soft); }
.action-main .icon { font-size: 1.05rem; line-height: 1; }
.fire-primary { border-color: var(--accent); background: var(--accent); color: #fff; font-size: .9rem; box-shadow: 0 5px 15px rgba(185,55,27,.25); }
.fire-primary:hover { background: var(--accent-strong); }
.segments { display: grid; grid-template-columns: 1fr 1fr; padding: .22rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface-soft); }
.segments button { min-width: 48px; min-height: 48px; padding: 0; border: 0; border-radius: .62rem; background: transparent; color: var(--muted); font-size: .76rem; font-weight: 800; cursor: pointer; }
.segments button[aria-pressed="true"] { background: var(--surface); color: var(--forest); box-shadow: 0 2px 8px rgba(23,33,30,.12); }
.secondary-actions { display: grid; grid-template-columns: repeat(3,1fr); gap: .25rem; border-top: 1px solid var(--border); padding-top: .35rem; }
.maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { bottom: calc(var(--dock-height) + 1rem + env(safe-area-inset-bottom)); }
@media (min-width: 700px) {
  :root { --dock-height: 140px; }
  .hud { left: 1rem; right: auto; width: 27rem; padding-left: 0; }
  .map-legend { top: calc(1rem + env(safe-area-inset-top)); }
  .sheet { left: 1rem; right: auto; width: 27rem; }
  .actions { left: 50%; right: auto; width: min(35rem,calc(100% - 2rem)); transform: translateX(-50%); }
}
@media (min-width: 700px) and (max-width: 899px) and (orientation: portrait) {
  :root { --dock-height: 130px; }
  .hud { left: .75rem; width: 25rem; padding-top: calc(.65rem + env(safe-area-inset-top)); }
  .hud-card { padding: .65rem; }
  .safety-note { margin-top: .48rem; padding-top: .42rem; font-size: .65rem; }
  .map-legend { top: calc(.75rem + env(safe-area-inset-top)); right: .75rem; }
  .sheet {
    left: .75rem;
    width: 25rem;
    bottom: calc(var(--dock-height) + .7rem + env(safe-area-inset-bottom));
    max-height: 58dvh;
  }
  .sheet-head { min-height: 62px; }
  .sheet-body { padding-bottom: .85rem; }
  .result-list button { min-height: 58px; padding: .6rem .7rem; }
  .actions {
    width: min(34rem,calc(100% - 1.5rem));
    height: var(--dock-height);
    grid-template-rows: 54px 1fr;
    padding: .45rem;
  }
  .action-main { min-height: 46px; }
  .segments button { min-height: 46px; }
  .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { bottom: calc(var(--dock-height) + .9rem + env(safe-area-inset-bottom)); }
}
@media (max-width: 480px) {
  :root { --dock-height: 128px; }
  .hud { padding: calc(.4rem + env(safe-area-inset-top)) .45rem .25rem; }
  .hud-card { padding: .52rem .58rem; border-radius: .9rem; }
  .hud-main { gap: .5rem; }
  .brand-mark { width: 2rem; height: 2rem; border-radius: .62rem; font-size: 1rem; }
  .eyebrow { font-size: .58rem; letter-spacing: .1em; }
  .hud strong { font-size: .9rem; }
  .source-status { margin-top: .18rem; font-size: .68rem; }
  .emergency { min-width: 44px; min-height: 44px; border-radius: .65rem; font-size: .9rem; }
  .emergency small { font-size: .5rem; }
  .safety-note { margin-top: .42rem; padding-top: .38rem; font-size: .61rem; line-height: 1.25; }
  .map-legend { top: calc(6.75rem + env(safe-area-inset-top)); right: .45rem; gap: .35rem; padding: .32rem .48rem; font-size: .6rem; }
  .sheet {
    left: .4rem; right: .4rem;
    bottom: calc(var(--dock-height) + .45rem + env(safe-area-inset-bottom));
    max-height: 48dvh;
    border-radius: 1rem;
    transform: translateY(calc(100% - 59px));
  }
  .sheet-head { min-height: 58px; padding: .4rem .5rem .4rem .8rem; }
  .sheet-kicker { font-size: .57rem; }
  .sheet-title { font-size: .95rem; }
  .sheet-handle { width: 44px; min-height: 44px; border-radius: .7rem; }
  .sheet-body { padding: .05rem .8rem .8rem; font-size: .88rem; }
  .warning-list { margin: .45rem 0; padding-left: 1.05rem; font-size: .8rem; line-height: 1.4; }
  .notice { padding: .65rem .7rem; margin: .5rem 0; }
  .nearest { padding: .7rem; }
  .result-list { gap: .4rem; margin: .5rem 0; }
  .result-list button { min-height: 58px; padding: .58rem .65rem; }
  .details { gap: .4rem; padding: .6rem; font-size: .8rem; }
  .actions {
    left: .4rem; right: .4rem;
    bottom: calc(.35rem + env(safe-area-inset-bottom));
    height: var(--dock-height);
    grid-template-rows: 52px 1fr;
    gap: .3rem;
    padding: .42rem;
    border-radius: 1rem;
  }
  .fire-search { grid-template-columns: 9rem minmax(0,1fr); gap: .38rem; }
  .segments { padding: .17rem; border-radius: .7rem; }
  .segments button { min-height: 44px; border-radius: .55rem; font-size: .7rem; }
  .action-main { min-height: 44px; padding: .25rem .2rem; border-radius: .65rem; font-size: .69rem; }
  .fire-primary { font-size: .78rem; }
  .secondary-actions { padding-top: .22rem; }
  .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { bottom: calc(var(--dock-height) + .75rem + env(safe-area-inset-bottom)); }
}
@media (max-width: 370px) {
  :root { --dock-height: 124px; }
  .actions { left: .3rem; right: .3rem; bottom: calc(.3rem + env(safe-area-inset-bottom)); padding: .45rem; }
  .action-main { font-size: .7rem; }
  .safety-note { display: none; }
  .map-legend { top: calc(4.8rem + env(safe-area-inset-top)); }
  .fire-search { grid-template-columns: 8.2rem minmax(0,1fr); }
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
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      timeZone: "Europe/Paris", timeZoneName: "short"
    }).format(date);
  }
  function dayLabel(value) {
    var date = new Date(value);
    return isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris"
    }).format(date);
  }
  function sourceLabel(value) {
    var labels = {
      FIRMS_VIIRS_SNPP_NRT: "Suomi NPP · VIIRS",
      FIRMS_VIIRS_NOAA20_NRT: "NOAA-20 · VIIRS",
      FIRMS_VIIRS_NOAA21_NRT: "NOAA-21 · VIIRS",
      EUMETSAT_MTG_CAP: "Meteosat · EUMETSAT"
    };
    return labels[value] || value || "Source inconnue";
  }
  function setSheet(title, html, expanded) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    sheet.setAttribute("data-state", expanded === false ? "collapsed" : "expanded");
    document.getElementById("sheet-handle").setAttribute("aria-expanded", expanded === false ? "false" : "true");
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
            esc(dateTime(item.observed_at)) + " · " + esc(sourceLabel(item.source)) + "</span></button></li>";
        }).join("") + "</ul>";
    }
    var groups = {};
    items.forEach(function (item) {
      var key = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(item.observed_at));
      (groups[key] = groups[key] || []).push(item);
    });
    return intro + Object.keys(groups).sort().reverse().map(function (key) {
      var group = groups[key];
      return '<h3 class="day">' + esc(dayLabel(group[0].observed_at)) + " — " + group.length +
        (group.length > 1 ? " suspicions" : " suspicion") + '</h3><ul class="result-list">' +
        group.map(function (item) {
          return '<li><button type="button" data-detection="' + esc(item.id) + '"><strong>' +
            number(item.distance_km, 2) + ' km · suspicion satellitaire</strong><span>' +
            esc(dateTime(item.observed_at)) + " · " + esc(sourceLabel(item.source)) + "</span></button></li>";
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
  function chooseMapPoint(lngLat) {
    setPoint({ lat: lngLat.lat, lon: lngLat.lng, label: "Point choisi sur la carte" });
    clearFire(); fly(state.point, state.map.getZoom());
    setSheet("Point choisi", "<p>Coordonnées : " + number(state.point.lat, 6) + ", " + number(state.point.lon, 6) +
      "</p><p>Les prochaines requêtes utiliseront ce point.</p>", true);
  }
  function addLongPressGesture() {
    var container = state.map.getCanvasContainer();
    var timer = null;
    var start = null;
    var fired = false;

    function cancel() {
      if (timer) window.clearTimeout(timer);
      timer = null;
      start = null;
    }
    container.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      cancel();
      fired = false;
      start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      timer = window.setTimeout(function () {
        if (!start) return;
        fired = true;
        var rect = container.getBoundingClientRect();
        var lngLat = state.map.unproject([start.x - rect.left, start.y - rect.top]);
        chooseMapPoint(lngLat);
        cancel();
      }, 650);
    }, { passive: true });
    container.addEventListener("pointermove", function (event) {
      if (!start || event.pointerId !== start.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) cancel();
    }, { passive: true });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) {
      container.addEventListener(type, cancel, { passive: true });
    });
    container.addEventListener("click", function (event) {
      if (!fired) return;
      event.preventDefault();
      event.stopPropagation();
      fired = false;
    }, true);
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
      chooseMapPoint(event.lngLat);
    });
    addLongPressGesture();
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
      state.map = new window.maplibregl.Map({ container: "map", style: "/api/v2/map/styles/carte.json?fond=plan&ombrage=aucun", center: [origin.lon, origin.lat], zoom: 12, attributionControl: true });
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
    var next = current === "expanded" ? "collapsed" : "expanded";
    sheet.setAttribute("data-state", next);
    document.getElementById("sheet-handle").setAttribute("aria-expanded", next === "expanded" ? "true" : "false");
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
  const title = escapeHtml(`valfeu — Veille incendie ${config.version}`);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#17362f">
<meta name="description" content="valfeu : veille des suspicions satellitaires de feu autour de Val-d’Aigoual.">
<title>${title}</title>
<link rel="manifest" href="/valfeu/manifest.webmanifest">
<link rel="icon" href="/valfeu/icone.svg" type="image/svg+xml">
<link rel="stylesheet" href="/api/v2/map/vendor/maplibre-gl.css" data-maplibre>
<script defer src="/api/v2/map/vendor/maplibre-gl.js"></script>
<style>${STYLES}</style>
</head>
<body>
<div id="map" aria-label="Carte de terrain centrée sur la mairie de Val-d’Aigoual"></div>
<header class="hud">
  <div class="hud-card">
    <div class="hud-main">
      <div class="brand-mark" aria-hidden="true">f·v</div>
      <div class="hud-copy">
        <span class="eyebrow">valfeu · point actif</span>
        <strong id="hud-point">${escapeHtml(MAIRIE_VAL_D_AIGOUAL.libelle)}</strong>
        <span class="source-status"><span class="source-dot" id="source-dot"></span><span id="source-text">Sources en attente</span></span>
      </div>
      <a class="emergency" href="tel:112" aria-label="Appeler les secours au 112">112<small>Urgence</small></a>
    </div>
    <p class="safety-note">Les points sont des suspicions satellite, pas des incendies confirmés. Feu observé : <a href="tel:18">appelez le 18</a>.</p>
  </div>
</header>
<aside class="map-legend" aria-label="Légende des suspicions">
  <span class="legend-item"><span class="legend-dot"></span>&lt; 3 h</span>
  <span class="legend-item"><span class="legend-dot orange"></span>&lt; 24 h</span>
  <span class="legend-item"><span class="legend-dot yellow"></span>+ 24 h</span>
</aside>
<section class="sheet" id="sheet" data-state="collapsed" aria-labelledby="sheet-title">
  <div class="sheet-head">
    <div class="sheet-heading">
      <span class="sheet-kicker">Informations terrain</span>
      <strong class="sheet-title" id="sheet-title">${escapeHtml(MAIRIE_VAL_D_AIGOUAL.libelle)}</strong>
    </div>
    <button class="sheet-handle" id="sheet-handle" type="button" aria-label="Afficher ou réduire les résultats" aria-expanded="false"></button>
  </div>
  <div class="sheet-body" id="sheet-body">
    <p><strong>${escapeHtml(MAIRIE_VAL_D_AIGOUAL.adresse)}</strong></p>
    <p>Recherchez les suspicions à proximité ou faites un appui long sur la carte pour choisir un autre point.</p>
  </div>
</section>
<nav class="actions" aria-label="Actions de terrain">
  <div class="fire-search">
    <div class="segments" role="group" aria-label="Rayon de recherche des feux">
      <button type="button" data-radius="5" aria-pressed="true">5 km</button>
      <button type="button" data-radius="50" aria-pressed="false">50 km</button>
    </div>
    <button class="action-main fire-primary" id="fire-action" type="button"><span class="icon" aria-hidden="true">◉</span>Rechercher les feux</button>
  </div>
  <div class="secondary-actions">
    <div class="action"><button class="action-main" id="origin-action" type="button"><span class="icon" aria-hidden="true">⌂</span>Mairie</button></div>
    <div class="action"><button class="action-main" id="locate-action" type="button"><span class="icon" aria-hidden="true">◎</span>Ma position</button></div>
    <div class="action"><button class="action-main" id="history-action" type="button"><span class="icon" aria-hidden="true">↶</span>Historique 7 j</button></div>
  </div>
</nav>
<script>window.__terrainOrigin=${origin};</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
