import { readFileSync } from "node:fs";
import type { GatewayConfig } from "../config.js";
import { MAIRIE_VAL_D_AIGOUAL } from "../services-catalog.js";
import { escapeHtml } from "./layout.js";

const SOCLE_CSS = readFileSync(new URL("../../public/valfeu/design-system.css", import.meta.url), "utf8");

export const APP_MANIFEST = {
  name: "LAV.feu — Veille incendie",
  short_name: "LAV.feu",
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

// Géométrie reprise du favicon officiel (apps/web/public/favicon.svg) : cadre arrondi,
// deux montagnes. La flamme est posée sur la montagne avant, en --risques.
export const APP_ICONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
<title id="title">LAV.feu</title>
<path d="M104 16h304c48.6 0 88 39.4 88 88v304c0 48.6-39.4 88-88 88H104c-48.6 0-88-39.4-88-88V104C16 55.4 55.4 16 104 16Z" fill="#fbfcfa" stroke="#89958e" stroke-width="10"/>
<path d="M96 372 258 154l88 118 66-72 104 172H96Z" fill="#173e2b"/>
<path d="M330 372c-8-42 22-70 40-104 4 32 22 46 40 60-4 26 4 44 14 44 8 0 14-8 14-20 0-38-32-64-56-100-6 46-46 68-46 112 0 22 12 38 28 38 20 0 34-16 34-36 0-16-8-28-18-38 2 12-2 22-8 26 2-10-2-20 2-30" fill="#f4513b"/>
</svg>`;

const STYLES = `
${SOCLE_CSS}
:root {
  color-scheme: light;
  --ok-bg: color-mix(in srgb, var(--vigilance-vert) 14%, var(--surface-plate)); --ok-fg: var(--vigilance-vert-texte);
  --ko-bg: color-mix(in srgb, var(--vigilance-rouge) 14%, var(--surface-plate)); --ko-fg: var(--vigilance-rouge-texte);
  --warn-bg: color-mix(in srgb, var(--vigilance-jaune) 22%, var(--surface-plate)); --warn-fg: var(--vigilance-jaune-texte);
  --alert-bg: color-mix(in srgb, var(--vigilance-orange) 16%, var(--surface-plate)); --alert-fg: var(--vigilance-orange-texte);
  --hauteur-feuille: 300px;
  --largeur-rail: 25.5rem;
  --hauteur-bandeau: 4.5rem;
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { margin: 0; background: var(--surface-fond); color: var(--texte-principal); font: var(--txt-m)/1.5 var(--font-body); }
button, a { font: inherit; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
#map, .map-fallback { position: fixed; inset: 0; width: 100%; height: 100dvh; }
.map-fallback { display: grid; place-items: center; padding: calc(var(--hauteur-bandeau) + var(--esp-2xl)) var(--esp-xl) calc(var(--hauteur-feuille) + var(--esp-2xl) + env(safe-area-inset-bottom)); background: var(--surface-fond); color: var(--texte-secondaire); text-align: center; }
.map-fallback p { margin: 0 0 .2rem; }

.bandeau { position: fixed; z-index: 7; top: 0; left: 0; right: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--esp-s); padding: calc(var(--esp-s) + env(safe-area-inset-top)) var(--esp-s) 0; pointer-events: none; }
.bandeau > * { pointer-events: auto; }
.marque { display: flex; align-items: center; gap: .55rem; padding: var(--esp-2xs) var(--esp-s); border: 1px solid var(--bordure-forte); border-radius: var(--rayon); background: var(--surface-plate); box-shadow: var(--ombre-courte); text-decoration: none; color: inherit; }
.marque img { display: block; width: 2.1rem; height: 2.1rem; }
.marque strong { display: block; font-family: var(--font-display); font-size: var(--txt-l); font-weight: var(--poids-normal); letter-spacing: var(--ls-titre); color: var(--couleur-action); line-height: 1.15; }
.marque__suffixe { color: var(--risques-texte); }
.marque small { display: block; margin-top: .05rem; font-family: var(--font-mono); font-size: .58rem; font-weight: var(--poids-appui); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--texte-secondaire); }
.urgence { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; padding: 0 var(--esp-m); border: 1px solid var(--ko-fg); border-radius: 999px; background: var(--surface-plate); text-decoration: none; box-shadow: var(--ombre-courte); }
.urgence strong { font-size: var(--txt-l); font-weight: var(--poids-fort); color: var(--ko-fg); line-height: 1; }
.urgence small { font-size: var(--txt-micro); font-weight: var(--poids-appui); letter-spacing: .04em; text-transform: uppercase; color: var(--texte-secondaire); }
.urgence:hover { background: var(--ko-bg); }

.legende { position: fixed; z-index: 3; right: var(--esp-s); bottom: calc(var(--hauteur-feuille) + var(--esp-s) + env(safe-area-inset-bottom)); display: flex; gap: var(--esp-xs); padding: var(--esp-2xs) var(--esp-s); border: 1px solid var(--bordure-forte); border-radius: var(--rayon); background: var(--surface-plate); box-shadow: var(--ombre-courte); color: var(--texte-secondaire); font-size: var(--txt-micro); font-weight: var(--poids-fort); transition: bottom .25s var(--courbe); }
.legende__item { display: inline-flex; align-items: center; gap: var(--esp-3xs); }
.legende__forme { width: .6rem; height: .6rem; border-radius: 50%; }
.legende__item--recent .legende__forme { background: var(--vigilance-rouge); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vigilance-rouge) 32%, transparent); }
.legende__item--intermediaire .legende__forme { background: var(--vigilance-orange); border: 1.5px solid var(--surface-plate); box-shadow: 0 0 0 1px var(--vigilance-orange); }
.legende__item--ancien .legende__forme { background: transparent; border: 2px solid var(--vigilance-jaune-texte); }

.panneau { position: fixed; z-index: 5; left: var(--esp-xs); right: var(--esp-xs); bottom: 0; max-height: 64dvh; display: flex; flex-direction: column; border: 1px solid var(--bordure-forte); border-radius: var(--rayon) var(--rayon) 0 0; background: var(--surface-plate); box-shadow: var(--ombre); overflow: hidden; }
.panneau__corps { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: var(--bordure) transparent; }
.bloc { padding: var(--esp-m) var(--esp-l); border-top: 1px solid var(--bordure); }
.bloc:first-child { border-top: 0; }
.bloc__titre { margin: 0 0 var(--esp-2xs); color: var(--texte-secondaire); font-size: var(--txt-micro); font-weight: var(--poids-fort); letter-spacing: var(--ls-label); text-transform: uppercase; }
.bloc__principal { margin: 0; font-family: var(--font-display); font-size: var(--txt-l); font-weight: var(--poids-normal); }
.bloc__secondaire { margin: .1rem 0 0; color: var(--texte-secondaire); font-size: var(--txt-s); }
.boutons-point { display: grid; grid-template-columns: 1fr 1fr; gap: var(--esp-xs); margin-top: var(--esp-s); }
.bouton-secondaire { min-height: 44px; padding: var(--esp-xs); border: 1px solid var(--bordure); border-radius: var(--rayon); background: var(--surface-fond); color: var(--texte-principal); font-size: var(--txt-s); font-weight: var(--poids-appui); cursor: pointer; }
.bouton-secondaire:hover { border-color: var(--couleur-action); color: var(--couleur-action); }
.panneau__pied { flex: 0 0 auto; padding: var(--esp-s) var(--esp-l) calc(var(--esp-s) + env(safe-area-inset-bottom)); border-top: 1px solid var(--bordure); }
.fraicheur { display: flex; align-items: center; margin: 0; color: var(--texte-secondaire); font-size: var(--txt-xs); }
.fraicheur__point { flex: 0 0 auto; display: inline-block; width: .52rem; height: .52rem; margin-right: var(--esp-2xs); border-radius: 50%; background: var(--texte-tertiaire); box-shadow: 0 0 0 3px color-mix(in srgb, var(--texte-tertiaire) 14%, transparent); }
.fraicheur__point[data-state="available"] { background: var(--ok-fg); }
.fraicheur__point[data-state="partial"] { background: var(--warn-fg); }
.fraicheur__point[data-state="unavailable"] { background: var(--ko-fg); }
.note-securite { margin: var(--esp-2xs) 0 0; color: var(--texte-secondaire); font-size: var(--txt-xs); line-height: 1.35; }
.note-securite a { color: var(--ko-fg); font-weight: var(--poids-fort); }

.segments { display: grid; padding: var(--esp-3xs); border: 1px solid var(--bordure); border-radius: var(--rayon); background: var(--couleur-action-douce); }
.segments--rayon { grid-template-columns: repeat(3, 1fr); }
.segments--fenetre { grid-template-columns: repeat(2, 1fr); margin-top: var(--esp-xs); }
.segments button { min-width: 44px; min-height: 44px; padding: 0; border: 0; border-radius: var(--rayon-fin); background: transparent; color: var(--texte-secondaire); font-size: var(--txt-xs); font-weight: var(--poids-fort); cursor: pointer; }
.segments button[aria-pressed="true"] { background: var(--surface-plate); color: var(--couleur-action); box-shadow: var(--ombre-courte); }
.action-primaire { width: 100%; min-height: 48px; margin-top: var(--esp-s); padding: var(--esp-xs) var(--esp-l); border: 0; border-radius: var(--rayon); background: var(--couleur-action-active); color: var(--texte-sur-sombre); font-size: var(--txt-m); font-weight: var(--poids-fort); cursor: pointer; box-shadow: var(--ombre-courte); }
.action-primaire:hover { background: var(--couleur-action); }
.action-primaire[aria-busy="true"] { opacity: .6; }

.notice { padding: var(--esp-m); margin: var(--esp-s) 0; border-left: 4px solid currentColor; border-radius: var(--rayon); background: var(--warn-bg); color: var(--warn-fg); }
.notice.error { background: var(--ko-bg); color: var(--ko-fg); }
.warning-list { margin: var(--esp-s) 0; padding-left: 1.2rem; }
.request-id { color: var(--texte-secondaire); font-size: var(--txt-xs); overflow-wrap: anywhere; }
.retry { min-height: 44px; margin-top: var(--esp-s); padding: var(--esp-xs) var(--esp-l); border: 0; border-radius: var(--rayon); background: var(--couleur-action-active); color: var(--texte-sur-sombre); font-weight: var(--poids-fort); cursor: pointer; }
.etat-vide { margin: var(--esp-s) 0 0; color: var(--texte-secondaire); }
.synthese { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--esp-2xs); margin: var(--esp-s) 0; padding: var(--esp-s); border-radius: var(--rayon); background: var(--surface-fond); }
.synthese strong { color: var(--couleur-action); font-size: var(--txt-m); }
.synthese span { color: var(--texte-secondaire); font-size: var(--txt-s); }
.liste-resultats { display: grid; gap: var(--esp-s); list-style: none; margin: var(--esp-s) 0 0; padding: 0; }
.liste-resultats button { width: 100%; min-height: 60px; padding: var(--esp-s) var(--esp-m); border: 1px solid var(--bordure); border-radius: var(--rayon); background: var(--surface-plate); color: var(--texte-principal); text-align: left; cursor: pointer; }
.liste-resultats button:hover { border-color: var(--risques); }
.liste-resultats strong, .liste-resultats span { display: block; }
.liste-resultats strong { color: var(--couleur-action); font-size: var(--txt-m); }
.liste-resultats span { margin-top: .18rem; color: var(--texte-secondaire); font-size: var(--txt-xs); }
.jour { margin: var(--esp-l) 0 var(--esp-2xs); color: var(--couleur-action); font-size: var(--txt-s); letter-spacing: .02em; text-transform: capitalize; }
.details { display: grid; grid-template-columns: 1fr 1fr; gap: var(--esp-xs); padding: var(--esp-m); border: 1px solid var(--bordure); border-radius: var(--rayon); background: var(--surface-fond); }
.details p { margin: 0; padding: var(--esp-xs); border-radius: var(--rayon-fin); background: var(--surface-plate); }
.details p:first-child { grid-column: 1 / -1; background: var(--alert-bg); color: var(--alert-fg); }

.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { bottom: calc(var(--hauteur-feuille) + var(--esp-l) + env(safe-area-inset-bottom)); transition: bottom .25s var(--courbe); }

@media (min-width: 900px) {
  .map-fallback { padding: calc(var(--hauteur-bandeau) + var(--esp-2xl)) calc(var(--largeur-rail) + var(--esp-2xl)) var(--esp-2xl) var(--esp-xl); }
  .bandeau { left: auto; right: var(--esp-l); width: var(--largeur-rail); padding: var(--esp-l) 0 0; }
  .legende { top: var(--esp-l); left: var(--esp-l); right: auto; bottom: auto; }
  .panneau { left: auto; right: var(--esp-l); bottom: var(--esp-l); top: calc(var(--hauteur-bandeau) + var(--esp-l) + var(--esp-s)); width: var(--largeur-rail); max-height: none; border-radius: var(--rayon); }
  .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { bottom: var(--esp-l) !important; left: var(--esp-l) !important; right: auto !important; }
}
@media (max-width: 480px) {
  .bandeau { padding: calc(var(--esp-xs) + env(safe-area-inset-top)) var(--esp-xs) 0; }
  .marque strong { font-size: var(--txt-m); }
  .urgence { min-height: 40px; padding: 0 var(--esp-s); }
  .urgence strong { font-size: var(--txt-m); }
  .bloc { padding: var(--esp-s); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;

const CLIENT_SCRIPT = `
(function () {
  "use strict";
  var origin = window.__terrainOrigin;
  var state = { point: { lat: origin.lat, lon: origin.lon, label: origin.libelle }, rayon: 5, fenetre: 1, lastFire: null, map: null, mapReady: false, loadingVendor: false };
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var panneau = document.getElementById("panneau");
  var pointLibelle = document.getElementById("point-libelle");
  var pointAdresse = document.getElementById("point-adresse");
  var resultats = document.getElementById("resultats");
  var boutonRecherche = document.getElementById("rechercher");
  var sourceDot = document.getElementById("source-dot");
  var sourceText = document.getElementById("source-text");

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
  function libelleFenetre() { return state.fenetre === 7 ? "7 jours" : "24 h"; }
  function majBoutonRecherche() {
    boutonRecherche.textContent = "Rechercher · " + state.rayon + " km · " + libelleFenetre();
  }
  function majHauteurFeuille() {
    if (typeof panneau.getBoundingClientRect !== "function") return;
    var hauteur = panneau.getBoundingClientRect().height;
    if (hauteur > 0) document.documentElement.style.setProperty("--hauteur-feuille", Math.round(hauteur) + "px");
  }
  function afficherResultats(html) {
    resultats.innerHTML = html;
    window.requestAnimationFrame ? window.requestAnimationFrame(majHauteurFeuille) : majHauteurFeuille();
  }
  function setPoint(point) {
    state.point = point;
    pointLibelle.textContent = point.label || (number(point.lat, 5) + ", " + number(point.lon, 5));
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
  function detections(payload) {
    return payload && payload.history && Array.isArray(payload.history.suspicions) ? payload.history.suspicions : [];
  }
  function peindreFeux(payload, radius) {
    var items = detections(payload);
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
    if (coordinates.length === 1) return fly(state.point, radius <= 5 ? 13 : radius <= 20 ? 11 : 10);
    var bounds = coordinates.reduce(function (box, coordinate) { return box.extend(coordinate); }, new window.maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    state.map.fitBounds(bounds, { padding: { top: 90, bottom: 220, left: 45, right: 45 }, maxZoom: 14, duration: reducedMotion ? 0 : 700 });
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
    afficherResultats(
      '<h2 class="bloc__titre">Détail de la suspicion satellitaire</h2>' +
      '<div class="details"><p><strong>Suspicion satellitaire non confirmée</strong></p>' +
      "<p>Distance : " + number(item.distance_km, 2) + " km</p>" +
      "<p>Observation : " + esc(dateTime(item.observed_at)) + "</p>" +
      "<p>Satellite : " + esc(item.satellite || "non renseigné") + "</p>" +
      "<p>Instrument : " + esc(item.instrument || "non renseigné") + "</p>" +
      "<p>Confiance : " + esc(item.confidence && item.confidence.normalized || "inconnue") + "</p>" +
      "<p>Puissance radiative : " + (typeof item.frp_mw === "number" ? number(item.frp_mw, 1) + " MW" : "non renseignée") + "</p></div>" +
      fireWarnings(state.lastFire || {}));
  }
  function syntheseTexte(items) {
    var plusProche = items.slice().sort(function (a, b) { return a.distance_km - b.distance_km; })[0];
    return '<div class="synthese"><strong>' + items.length + (items.length > 1 ? " suspicions" : " suspicion") +
      '</strong><span>la plus proche à ' + number(plusProche.distance_km, 2) + " km · " + esc(dateTime(plusProche.observed_at)) + '</span></div>';
  }
  function fireList(payload) {
    var items = detections(payload).slice().sort(function (a, b) { return a.distance_km - b.distance_km; });
    var intro = fireWarnings(payload);
    if (!items.length) {
      return intro + '<p class="etat-vide">Aucune suspicion satellitaire remontée dans ce rayon sur cette fenêtre. Ce résultat ne constitue pas une garantie d’absence de feu.</p>';
    }
    var byId = {};
    items.forEach(function (item) { byId[item.id] = item; });
    window.__terrainDetections = byId;
    var synthese = syntheseTexte(items);
    function carte(item) {
      return '<li><button type="button" data-detection="' + esc(item.id) + '"><strong>' +
        number(item.distance_km, 2) + ' km · suspicion satellitaire</strong><span>' +
        esc(dateTime(item.observed_at)) + " · " + esc(sourceLabel(item.source)) + "</span></button></li>";
    }
    if (state.fenetre !== 7) {
      return intro + synthese + '<ul class="liste-resultats">' + items.map(carte).join("") + "</ul>";
    }
    var groups = {};
    items.forEach(function (item) {
      var key = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(item.observed_at));
      (groups[key] = groups[key] || []).push(item);
    });
    return intro + synthese + Object.keys(groups).sort().reverse().map(function (key) {
      var group = groups[key];
      return '<h3 class="jour">' + esc(dayLabel(group[0].observed_at)) + " — " + group.length +
        (group.length > 1 ? " suspicions" : " suspicion") + '</h3><ul class="liste-resultats">' +
        group.map(carte).join("") + "</ul>";
    }).join("");
  }
  async function chargerFeux() {
    var radius = state.rayon;
    var days = state.fenetre;
    boutonRecherche.setAttribute("aria-busy", "true");
    setSourceState("partial", "Sources satellite : chargement…");
    afficherResultats('<h2 class="bloc__titre">Résultats — ' + radius + " km · " + libelleFenetre() + '</h2><p>Interrogation des sources satellite…</p>');
    try {
      var params = new URLSearchParams({ lat: String(state.point.lat), lon: String(state.point.lon), radius_km: String(radius), history_days: String(days) });
      var payload = await json("/api/v2/fire/nearby?" + params);
      state.lastFire = payload;
      var sourceProblem = payload.data_status !== "available" || (payload.sources || []).some(function (source) { return source.state !== "available"; });
      setSourceState(sourceProblem ? "partial" : "available", sourceProblem ? "Sources satellite : incomplètes" : "Sources satellite : disponibles");
      peindreFeux(payload, radius);
      afficherResultats('<h2 class="bloc__titre">Résultats — ' + radius + " km · " + libelleFenetre() + '</h2>' + fireList(payload));
    } catch (error) {
      setSourceState("unavailable", "Sources satellite : indisponibles");
      var failure = requestError(error.payload, "Le service de détection est temporairement indisponible.");
      afficherResultats('<h2 class="bloc__titre">Données feu indisponibles</h2>' + failure + '<button class="retry" id="retry-fire" type="button">Réessayer</button>');
    } finally {
      boutonRecherche.removeAttribute("aria-busy");
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
  async function localiser() {
    if (!navigator.geolocation) {
      afficherResultats('<h2 class="bloc__titre">Position indisponible</h2><div class="notice error">La géolocalisation n’est pas prise en charge. Le point actif reste la mairie.</div>');
      return;
    }
    afficherResultats('<h2 class="bloc__titre">Ma position</h2><p>Recherche de votre position…</p>');
    navigator.geolocation.getCurrentPosition(async function (position) {
      var point = { lat: position.coords.latitude, lon: position.coords.longitude, label: "Ma position" };
      setPoint(point); updateActivePoint(position.coords.accuracy); fly(point, 15);
      pointAdresse.textContent = number(point.lat, 6) + ", " + number(point.lon, 6);
      var raw = "<p>Coordonnées : " + number(point.lat, 6) + ", " + number(point.lon, 6) + "</p>";
      try {
        var params = new URLSearchParams({
          lat: String(point.lat), lon: String(point.lon),
          horizontalAccuracyMeters: String(position.coords.accuracy),
          positionSource: "browser-geolocation"
        });
        var payload = await json("/api/v2/geography/resolve?" + params);
        afficherResultats('<h2 class="bloc__titre">Ma position</h2>' + renderGeography(payload) + raw);
      } catch (error) {
        afficherResultats('<h2 class="bloc__titre">Ma position</h2>' + raw + '<div class="notice">Adresse indisponible ; les coordonnées restent utilisables.</div>' +
          requestError(error.payload, "Le service géographique est temporairement indisponible."));
      }
    }, function (error) {
      var messages = { 1: "Autorisation refusée.", 2: "Position indisponible.", 3: "Délai de géolocalisation dépassé." };
      afficherResultats('<h2 class="bloc__titre">Position indisponible</h2><div class="notice error">' + esc(messages[error.code] || "La géolocalisation a échoué.") +
        " Le point actif reste " + esc(state.point.label || "inchangé") + ".</div>");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  function reinitialiserOrigine() {
    setPoint({ lat: origin.lat, lon: origin.lon, label: origin.libelle });
    pointAdresse.textContent = origin.adresse;
    clearFire(); fly(state.point, 12);
    afficherResultats("<p><strong>" + esc(origin.adresse) + "</strong></p><p>Point d’origine de l’application de terrain.</p>");
  }
  function choisirPointCarte(lngLat) {
    setPoint({ lat: lngLat.lat, lon: lngLat.lng, label: "Point choisi sur la carte" });
    pointAdresse.textContent = number(state.point.lat, 6) + ", " + number(state.point.lon, 6);
    clearFire(); fly(state.point, state.map.getZoom());
    afficherResultats("<p>Coordonnées : " + number(state.point.lat, 6) + ", " + number(state.point.lon, 6) +
      "</p><p>Les prochaines requêtes utiliseront ce point.</p>");
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
        choisirPointCarte(lngLat);
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
    // Couleurs alignées sur les jetons Style VAL (MapLibre n'accepte pas var()) :
    // #ff8c00 = --vigilance-orange, #e1001a = --vigilance-rouge, #f5d800 = --vigilance-jaune,
    // #3d6f7d = --torrent. Les trois âges se distinguent aussi par forme (cf. .legende__item--*).
    state.map.addLayer({ id: "search-radius-fill", type: "fill", source: "search-radius", paint: { "fill-color": "#ff8c00", "fill-opacity": .12 } });
    state.map.addLayer({ id: "search-radius-line", type: "line", source: "search-radius", paint: { "line-color": "#ff8c00", "line-width": 2, "line-dasharray": [2, 2] } });
    state.map.addSource("accuracy", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#3d6f7d", "fill-opacity": .13 } });
    state.map.addSource("active-point", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "active-point", type: "circle", source: "active-point", paint: { "circle-radius": 8, "circle-color": "#3d6f7d", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
    state.map.addSource("detections", { type: "geojson", data: featureCollection([]) });
    state.map.addLayer({ id: "detections", type: "circle", source: "detections", paint: {
      "circle-color": ["case", ["<", ["get", "ageHours"], 3], "#e1001a", ["<", ["get", "ageHours"], 24], "#ff8c00", "#f5d800"],
      "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 6, 100, 13],
      "circle-opacity": ["case", ["<", ["get", "ageHours"], 24], .85, .55],
      "circle-stroke-color": ["case", ["<", ["get", "ageHours"], 3], "#e1001a", "#fff"],
      "circle-stroke-width": ["case", ["<", ["get", "ageHours"], 3], 5, ["<", ["get", "ageHours"], 24], 1.5, 2
    ] } });
    updateActivePoint();
    state.map.on("click", "detections", function (event) {
      var id = event.features && event.features[0] && event.features[0].properties.id;
      var item = window.__terrainDetections && window.__terrainDetections[id];
      if (item) detail(item);
    });
    state.map.on("mouseenter", "detections", function () { state.map.getCanvas().style.cursor = "pointer"; });
    state.map.on("mouseleave", "detections", function () { state.map.getCanvas().style.cursor = ""; });
    state.map.on("contextmenu", function (event) {
      choisirPointCarte(event.lngLat);
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
  document.getElementById("origine").addEventListener("click", reinitialiserOrigine);
  document.getElementById("localiser").addEventListener("click", localiser);
  boutonRecherche.addEventListener("click", chargerFeux);
  document.querySelectorAll("[data-rayon]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.rayon = Number(button.getAttribute("data-rayon"));
      document.querySelectorAll("[data-rayon]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
      majBoutonRecherche();
    });
  });
  document.querySelectorAll("[data-fenetre]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.fenetre = Number(button.getAttribute("data-fenetre"));
      document.querySelectorAll("[data-fenetre]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
      majBoutonRecherche();
    });
  });
  resultats.addEventListener("click", function (event) {
    var target = event.target.closest && event.target.closest("[data-detection]");
    if (target) {
      var item = window.__terrainDetections && window.__terrainDetections[target.getAttribute("data-detection")];
      if (item) detail(item);
    }
    if (event.target.id === "retry-fire") chargerFeux();
  });
  document.getElementById("map").addEventListener("click", function (event) {
    if (event.target && event.target.id === "retry-map") retryMap();
  });
  window.addEventListener("resize", majHauteurFeuille);
  majBoutonRecherche();
  majHauteurFeuille();
  // maplibre-gl.js est chargé en "defer" : ce script inline s'exécute avant lui, il faut
  // donc attendre "load" pour disposer de window.maplibregl (même approche que la démo carte).
  if (document.readyState === "complete") initMap();
  else window.addEventListener("load", initMap);
})();
`;

export function renderAppTerrain(config: GatewayConfig): string {
  const origin = JSON.stringify(MAIRIE_VAL_D_AIGOUAL).replace(/</g, "\\u003c");
  const title = escapeHtml(`LAV.feu — Veille incendie ${config.version}`);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#17362f">
<meta name="description" content="LAV.feu : veille des suspicions satellitaires de feu autour de Val-d’Aigoual.">
<title>${title}</title>
<link rel="manifest" href="/valfeu/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/SourceSerif4-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/api/v2/map/vendor/maplibre-gl.css" data-maplibre>
<script defer src="/api/v2/map/vendor/maplibre-gl.js"></script>
<style>${STYLES}</style>
</head>
<body>
<div id="map" aria-label="Carte de terrain centrée sur la mairie de Val-d’Aigoual"></div>
<div class="bandeau">
  <a class="marque" href="/" aria-label="LAV.feu — retour au portail">
    <img src="/favicon.svg" width="34" height="34" alt="">
    <span><strong>LAV<span class="marque__suffixe">.feu</span></strong><small>Veille incendie</small></span>
  </a>
  <a class="urgence" href="tel:112" aria-label="Appeler les secours au 112"><strong>112</strong><small>Urgence</small></a>
</div>
<aside class="legende" aria-label="Légende des suspicions">
  <span class="legende__item legende__item--recent"><span class="legende__forme" aria-hidden="true"></span>&lt; 3 h</span>
  <span class="legende__item legende__item--intermediaire"><span class="legende__forme" aria-hidden="true"></span>&lt; 24 h</span>
  <span class="legende__item legende__item--ancien"><span class="legende__forme" aria-hidden="true"></span>+ 24 h</span>
</aside>
<section class="panneau" id="panneau">
  <div class="panneau__corps" id="corps">
    <section class="bloc" id="bloc-recherche">
      <h2 class="bloc__titre">Rayon et fenêtre</h2>
      <div class="segments segments--rayon" role="group" aria-label="Rayon de recherche">
        <button type="button" data-rayon="5" aria-pressed="true">5 km</button>
        <button type="button" data-rayon="20" aria-pressed="false">20 km</button>
        <button type="button" data-rayon="50" aria-pressed="false">50 km</button>
      </div>
      <div class="segments segments--fenetre" role="group" aria-label="Fenêtre temporelle">
        <button type="button" data-fenetre="1" aria-pressed="true">24 h</button>
        <button type="button" data-fenetre="7" aria-pressed="false">7 jours</button>
      </div>
      <button class="action-primaire" id="rechercher" type="button">Rechercher · 5 km · 24 h</button>
    </section>
    <section class="bloc" id="bloc-point">
      <h2 class="bloc__titre">Point actif</h2>
      <p class="bloc__principal" id="point-libelle">${escapeHtml(MAIRIE_VAL_D_AIGOUAL.libelle)}</p>
      <p class="bloc__secondaire" id="point-adresse">${escapeHtml(MAIRIE_VAL_D_AIGOUAL.adresse)}</p>
      <div class="boutons-point">
        <button class="bouton-secondaire" id="origine" type="button">⌂ Mairie</button>
        <button class="bouton-secondaire" id="localiser" type="button">◎ Ma position</button>
      </div>
    </section>
    <section class="bloc bloc--resultats" id="bloc-resultats">
      <div id="resultats">
        <p class="bloc__secondaire">Recherchez les suspicions à proximité ou faites un appui long sur la carte pour choisir un autre point.</p>
      </div>
    </section>
  </div>
  <footer class="panneau__pied">
    <p class="fraicheur"><span class="fraicheur__point" id="source-dot"></span><span id="source-text">Sources en attente</span></p>
    <p class="note-securite">Les points sont des suspicions satellite, pas des incendies confirmés. Feu observé : <a href="tel:18">appelez le 18</a>.</p>
  </footer>
</section>
<script>window.__terrainOrigin=${origin};</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
