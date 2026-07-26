import type { GatewayConfig } from "./../config.js";
import type { DemoField, ServiceDescriptor } from "./../services-catalog.js";
import { serviceHasCoordinates, VAL_D_AIGOUAL } from "./../services-catalog.js";
import { PRESENTERS_SCRIPT } from "./demo-presentation.js";
import { escapeAttr, escapeHtml, renderPage } from "./layout.js";

/**
 * Page de démonstration interactive d'un microservice, servie à
 * `GET /api/v2/demo/:service`. Le formulaire est généré depuis le descripteur ;
 * un script inline construit l'URL de la route publique, l'appelle et affiche
 * le résultat sous deux formes : une synthèse lisible (onglet « Résultat ») et
 * le JSON brut (onglet « JSON brut »).
 *
 * Pour les services géographiques (champs `lat`/`lon`), la page ajoute un bouton
 * « Me localiser » et une carte Leaflet chargée depuis unpkg (avec SRI). En cas
 * d'indisponibilité du CDN, le formulaire reste pleinement utilisable.
 */

/** Balises Leaflet (CSS + JS) chargées depuis unpkg avec contrôle d'intégrité. */
const LEAFLET_HEAD = `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>`;

/** MapLibre est servi par map-service : aucune dépendance CDN pour cette démo. */
const MAPLIBRE_HEAD = `<link rel="stylesheet" href="/api/v2/map/vendor/maplibre-gl.css">
<script defer src="/api/v2/map/vendor/maplibre-gl.js"></script>`;

const MAP_DEMO_SCRIPT = `
(function () {
  var select = document.getElementById("map-style");
  var mapEl = document.getElementById("map");
  var status = document.getElementById("map-status");
  var url = document.getElementById("map-style-url");
  if (!select || !mapEl || !status || !url) return;

  function styleUrl() { return "/api/v2/map/styles/" + encodeURIComponent(select.value) + ".json"; }
  function showUrl() { url.textContent = "GET " + styleUrl(); }
  function unavailable(message) {
    mapEl.classList.add("map-fallback");
    mapEl.textContent = message;
    status.textContent = "Carte indisponible";
  }
  function loadStyle(map) {
    var nextUrl = styleUrl();
    showUrl();
    status.textContent = "Chargement du style « " + select.options[select.selectedIndex].text + " »…";
    map.setStyle(nextUrl);
  }

  function init() {
    if (!window.maplibregl) {
      unavailable("MapLibre est indisponible. Vérifiez que map-service est démarré.");
      return;
    }
    showUrl();
    var map = new window.maplibregl.Map({
      container: mapEl,
      style: styleUrl(),
      center: [3.6421, 44.0812],
      zoom: 9,
      attributionControl: true,
    });
    map.addControl(new window.maplibregl.NavigationControl(), "top-right");
    map.on("load", function () { status.textContent = "Style chargé. Utilisez la souris pour explorer la carte."; });
    map.on("error", function () { status.textContent = "Le style ou une tuile n'a pas pu être chargé."; });
    select.addEventListener("change", function () { loadStyle(map); });
  }
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
`;

function renderMapDemo(config: GatewayConfig, service: ServiceDescriptor): string {
  const body = `<h2>Démo &mdash; ${escapeHtml(service.name)}</h2>
<p class="lead">Explorez les styles cartographiques servis localement par map-service. Les tuiles, le relief et les légendes sont fournis via <span class="route">/api/v2/map/*</span>.</p>
<p><span class="route">${escapeHtml(service.method)} ${escapeHtml(service.publicRoute)}</span> &middot; code&nbsp;: <span class="route">${escapeHtml(service.repo)}</span></p>
<div class="field">
  <label for="map-style">Style cartographique</label>
  <select id="map-style">
    <option value="territoire" selected>Territoire</option>
    <option value="plan">Plan</option>
    <option value="relief">Relief</option>
    <option value="hypsometrique">Hypsométrique</option>
  </select>
</div>
<p class="called-url" id="map-style-url">—</p>
<p class="status-line" id="map-status" role="status" aria-live="polite">Chargement de la carte…</p>
<div id="map" class="map" role="region" aria-label="Démo cartographique interactive"></div>
<p class="hint">Les données restent proxifiées par le service cartographique ; aucun CDN cartographique n’est utilisé.</p>
<p><a class="btn-secondary" href="/api/v2/map/legends">Voir les légendes JSON</a></p>
<script>${MAP_DEMO_SCRIPT}</script>`;
  return renderPage({
    title: `Démo ${service.name} — API v2`,
    version: config.version,
    body,
    showBackLink: true,
    head: MAPLIBRE_HEAD,
  });
}

function renderField(field: DemoField): string {
  const id = `f_${field.name}`;
  const optionalTag = field.optional ? ` <span class="hint">(facultatif)</span>` : "";
  const hint = field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : "";
  let control: string;
  if (field.type === "select") {
    const options = (field.options ?? [])
      .map(
        (option) =>
          `<option value="${escapeAttr(option.value)}"${option.value === field.example ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
      )
      .join("");
    control = `<select id="${escapeAttr(id)}" name="${escapeAttr(field.name)}">${options}</select>`;
  } else {
    // Champ texte simple : `inputmode` adapte le clavier mobile sans imposer la
    // validation stricte du type `number` (qui rejette une saisie partielle).
    control = `<input id="${escapeAttr(id)}" name="${escapeAttr(field.name)}" type="text" inputmode="${field.type === "number" ? "decimal" : "text"}" value="${escapeAttr(field.example)}">`;
  }
  return `<div class="field">
  <label for="${escapeAttr(id)}">${escapeHtml(field.label)}${optionalTag}</label>
  ${control}
  ${hint}
</div>`;
}

/**
 * Sérialise en toute sécurité une valeur JSON destinée à un bloc `<script>`
 * inline (neutralise toute séquence `</script>`).
 */
function toInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const DEMO_SCRIPT = `
(function () {
  var cfg = window.__demo;
  var form = document.getElementById("demo-form");
  var urlOut = document.getElementById("called-url");
  var out = document.getElementById("result");
  var statusOut = document.getElementById("result-status");
  var summaryOut = document.getElementById("panel-resume");
  if (!form) return;

  // --- Onglets « Résultat » / « JSON brut » (motif ARIA tabs) ---
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab) {
    tabs.forEach(function (item) {
      var selected = item === tab;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(item.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    });
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { selectTab(tab); });
    tab.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (next) { event.preventDefault(); next.focus(); selectTab(next); }
    });
  });

  function buildUrl() {
    var path = cfg.basePath;
    var params = new URLSearchParams();
    cfg.fields.forEach(function (f) {
      var el = form.elements.namedItem(f.name);
      if (!el) return;
      var value = ("" + el.value).trim();
      if (value === "") return;
      if (f.appendToPath) {
        path = cfg.basePath + (value.charAt(0) === "/" ? value : "/" + value);
      } else {
        params.set(f.name, value);
      }
    });
    var qs = params.toString();
    return qs ? path + "?" + qs : path;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var url = buildUrl();
    urlOut.textContent = "GET " + url;
    statusOut.textContent = "Appel en cours…";
    out.textContent = "";
    if (summaryOut) summaryOut.textContent = "";
    fetch(url, { headers: { accept: "application/json" } })
      .then(function (response) {
        var reqId = response.headers.get("x-request-id");
        return response.text().then(function (text) {
          var pretty = text;
          var parsed = null;
          try { parsed = JSON.parse(text); pretty = JSON.stringify(parsed, null, 2); } catch (e) {}
          statusOut.textContent = "HTTP " + response.status + (reqId ? " · request-id " + reqId : "");
          out.textContent = pretty;
          if (summaryOut && window.__presenters) window.__presenters.render(cfg.serviceId, parsed, summaryOut);
          if (parsed && window.__map) window.__map.onResult(parsed);
        });
      })
      .catch(function (error) {
        statusOut.textContent = "Échec de la requête";
        out.textContent = String(error);
      });
  });

  if (!cfg.hasCoordinates) return;

  // --- Champs géographiques : lecture/écriture des coordonnées ---
  function fieldByName(name) { return name ? form.elements.namedItem(name) : null; }
  function readCoords() {
    var latEl = fieldByName("lat");
    var lonEl = fieldByName("lon");
    var lat = latEl ? parseFloat(latEl.value) : NaN;
    var lon = lonEl ? parseFloat(lonEl.value) : NaN;
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat: lat, lon: lon };
  }
  function writeCoords(lat, lon, source, accuracy) {
    var latEl = fieldByName("lat");
    var lonEl = fieldByName("lon");
    if (latEl) latEl.value = lat.toFixed(5);
    if (lonEl) lonEl.value = lon.toFixed(5);
    var accEl = fieldByName(cfg.accuracyField);
    if (accEl && typeof accuracy === "number") accEl.value = String(Math.round(accuracy));
    var srcEl = fieldByName(cfg.sourceField);
    if (srcEl && source) srcEl.value = source;
    // Vide les critères de localisation concurrents (ex. code département) pour
    // que le service résolve la position à partir des coordonnées fournies.
    (cfg.clearOnLocate || []).forEach(function (name) {
      var el = fieldByName(name);
      if (el) el.value = "";
    });
  }

  // --- Carte Leaflet (dégradation gracieuse si le CDN est indisponible) ---
  var map = null;
  var marker = null;
  var overlays = null;
  function initMap() {
    var mapEl = document.getElementById("map");
    if (!mapEl) return;
    if (!window.L) {
      mapEl.classList.add("map-fallback");
      mapEl.textContent = "Carte indisponible (CDN inaccessible). Le formulaire reste utilisable.";
      return;
    }
    var start = readCoords() || { lat: parseFloat(cfg.defaultCenter.lat), lon: parseFloat(cfg.defaultCenter.lon) };
    map = L.map(mapEl).setView([start.lat, start.lon], 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    marker = L.marker([start.lat, start.lon]).addTo(map);
    overlays = L.layerGroup().addTo(map);
    map.on("click", function (event) {
      writeCoords(event.latlng.lat, event.latlng.lng, "manual");
      moveMarker(event.latlng.lat, event.latlng.lng);
    });

    window.__map = {
      recenter: function (lat, lon) { if (map) { map.setView([lat, lon], 12); moveMarker(lat, lon); } },
      onResult: function (data) { if (cfg.drawDetections) drawFire(data); },
    };
  }
  function moveMarker(lat, lon) {
    if (!map) return;
    if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  }
  // Trace le rayon de recherche et les suspicions retournées par le service fire.
  function drawFire(data) {
    if (!map || !overlays) return;
    overlays.clearLayers();
    var location = data.location || {};
    if (typeof location.latitude !== "number" || typeof location.longitude !== "number") return;
    var center = [location.latitude, location.longitude];
    var circle = L.circle(center, { radius: (location.radius_km || 0) * 1000, color: "#1f6feb", weight: 1, fillOpacity: 0.05 });
    circle.addTo(overlays);
    var detections = [];
    var realtime = data.realtime || {};
    if (Array.isArray(realtime.suspicions)) detections = detections.concat(realtime.suspicions);
    if (data.last_detection_50km) detections.push(data.last_detection_50km);
    detections.forEach(function (detection) {
      if (typeof detection.latitude !== "number" || typeof detection.longitude !== "number") return;
      var dot = L.circleMarker([detection.latitude, detection.longitude], {
        radius: 6, color: "#b3261e", fillColor: "#b3261e", fillOpacity: 0.7,
      });
      var popup = document.createElement("div");
      popup.appendChild(popupLine("Source", detection.source));
      popup.appendChild(popupLine("Observé", detection.observed_at));
      if (typeof detection.distance_km === "number") popup.appendChild(popupLine("Distance", detection.distance_km.toFixed(1) + " km"));
      dot.bindPopup(popup);
      dot.addTo(overlays);
    });
    try { map.fitBounds(circle.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }
  function popupLine(label, value) {
    var p = document.createElement("div");
    var strong = document.createElement("strong");
    strong.textContent = label + " : ";
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value === undefined || value === null ? "—" : String(value)));
    return p;
  }

  // --- Bouton « Me localiser » ---
  var locateBtn = document.getElementById("locate-btn");
  var locateStatus = document.getElementById("locate-status");
  var locateOp = 0;
  if (locateBtn) {
    locateBtn.addEventListener("click", function () {
      if (!window.isSecureContext || !navigator.geolocation) {
        if (locateStatus) locateStatus.textContent = "La localisation nécessite une connexion sécurisée (HTTPS).";
        return;
      }
      var op = ++locateOp;
      locateBtn.setAttribute("aria-busy", "true");
      if (locateStatus) locateStatus.textContent = "Localisation…";
      navigator.geolocation.getCurrentPosition(
        function (position) {
          if (op !== locateOp) return;
          locateBtn.removeAttribute("aria-busy");
          var coords = position.coords;
          writeCoords(coords.latitude, coords.longitude, "browser-geolocation", coords.accuracy);
          if (locateStatus) locateStatus.textContent = "Position obtenue (précision ± " + Math.round(coords.accuracy) + " m).";
          if (window.__map) window.__map.recenter(coords.latitude, coords.longitude);
        },
        function (error) {
          if (op !== locateOp) return;
          locateBtn.removeAttribute("aria-busy");
          if (locateStatus) {
            locateStatus.textContent = error.code === error.PERMISSION_DENIED
              ? "Localisation refusée. Autorisez l'accès puis réessayez."
              : "Localisation indisponible pour le moment.";
          }
        },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 },
      );
    });
  }

  if (document.readyState === "complete") initMap();
  else window.addEventListener("load", initMap);
})();
`;

export function renderDemo(config: GatewayConfig, service: ServiceDescriptor): string {
  if (service.id === "map") return renderMapDemo(config, service);
  const fields = service.demo.map(renderField).join("\n");
  const fieldNames = new Set(service.demo.map((field) => field.name));
  const hasCoordinates = serviceHasCoordinates(service);
  const accuracyField = fieldNames.has("horizontalAccuracyMeters")
    ? "horizontalAccuracyMeters"
    : fieldNames.has("accuracy")
      ? "accuracy"
      : null;
  const clientConfig = {
    basePath: service.publicRoute,
    serviceId: service.id,
    hasCoordinates,
    defaultCenter: VAL_D_AIGOUAL,
    accuracyField,
    sourceField: fieldNames.has("positionSource") ? "positionSource" : null,
    clearOnLocate: service.demo.filter((field) => field.clearedByGeolocation).map((field) => field.name),
    drawDetections: service.id === "fire",
    fields: service.demo.map((field) => ({
      name: field.name,
      appendToPath: field.appendToPath === true,
    })),
  };

  const locateControls = hasCoordinates
    ? `<button class="btn-secondary" type="button" id="locate-btn">Me localiser</button>`
    : "";
  const mapBlock = hasCoordinates
    ? `<p class="status-line" id="locate-status" role="status" aria-live="polite"></p>
<div id="map" class="map" role="region" aria-label="Carte de la position"></div>
<p class="hint">Cliquez sur la carte pour remplir la latitude et la longitude.</p>`
    : "";

  const body = `<h2>Démo &mdash; ${escapeHtml(service.name)}</h2>
<p class="lead">${escapeHtml(service.role)}</p>
<p><span class="route">${escapeHtml(service.method)} ${escapeHtml(service.displayRoute ?? service.publicRoute)}</span> &middot; code&nbsp;: <span class="route">${escapeHtml(service.repo)}</span></p>
<form class="demo" id="demo-form">
${fields}
<div class="form-actions"><button class="btn" type="submit">Lancer l'appel</button>${locateControls}</div>
</form>
${mapBlock}
<div class="result-block">
  <p class="status-line" id="result-status" role="status" aria-live="polite">Renseignez le formulaire puis lancez l'appel.</p>
  <div class="tabs" role="tablist" aria-label="Format du résultat">
    <button class="tab" type="button" role="tab" id="tab-resume" aria-controls="panel-resume" aria-selected="true">Résultat</button>
    <button class="tab" type="button" role="tab" id="tab-json" aria-controls="panel-json" aria-selected="false" tabindex="-1">JSON brut</button>
  </div>
  <div class="tabpanel" id="panel-resume" role="tabpanel" aria-labelledby="tab-resume">
    <p class="summary-note">Le résultat lisible s'affichera ici après l'appel.</p>
  </div>
  <div class="tabpanel" id="panel-json" role="tabpanel" aria-labelledby="tab-json" hidden>
    <p class="called-url" id="called-url">—</p>
    <pre class="result" id="result" aria-live="polite"></pre>
  </div>
</div>
<script>window.__demo = ${toInlineJson(clientConfig)};</script>
<script>${PRESENTERS_SCRIPT}</script>
<script>${DEMO_SCRIPT}</script>`;

  return renderPage({
    title: `Démo ${service.name} — API v2`,
    version: config.version,
    body,
    showBackLink: true,
    head: hasCoordinates ? LEAFLET_HEAD : undefined,
  });
}
