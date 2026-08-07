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

const ASSOCIATION_EXPORT_COLUMNS = [
  ["rnaId", "Identifiant RNA"],
  ["legacyId", "Identifiant historique"],
  ["title", "Titre"],
  ["shortTitle", "Nom court"],
  ["purpose", "Objet"],
  ["categoryPrimary", "Catégorie principale"],
  ["categorySecondary", "Catégorie secondaire"],
  ["administrativeStatus", "Statut administratif"],
  ["creationDate", "Date de création"],
  ["declarationDate", "Date de déclaration"],
  ["dissolutionDate", "Date de dissolution"],
  ["website", "Site internet"],
  ["siren", "SIREN"],
  ["siret", "SIRET"],
  ["address.label", "Adresse"],
  ["address.street", "Voie"],
  ["address.postalCode", "Code postal"],
  ["address.municipalityName", "Commune"],
  ["address.sourceCommuneCode", "Code INSEE source"],
  ["address.normalizedCommuneCode", "Code INSEE normalisé"],
  ["location.latitude", "Latitude"],
  ["location.longitude", "Longitude"],
  ["location.precision", "Précision géocodage"],
  ["location.score", "Score géocodage"],
  ["source.name", "Source"],
  ["source.sourceUpdatedAt", "Source mise à jour"],
  ["source.importedAt", "Importé le"],
] as const;

/**
 * Préréglages d'ombrage servis par map-service (`packages/shared/src/carto.ts`). Le
 * gateway est volontairement isolé du paquet partagé — son image Docker ne l'embarque
 * pas — donc cette liste y est recopiée, comme les libellés de fonds cartographiques.
 */
const PREREGLAGES_OMBRAGE = [
  { id: "aucun", libelle: "Aucun", intention: "Fond nu, sans ombrage du relief." },
  { id: "doux", libelle: "Doux", intention: "Modelé discret qui n’assombrit pas le fond : à privilégier sous la photographie aérienne et le plan IGN." },
  { id: "naturel", libelle: "Naturel", intention: "Éclairage lambertien classique, du nord-ouest à 45° : lecture physique du terrain." },
  { id: "sculpte", libelle: "Sculpté", intention: "Intensité liée à la pente : crêtes, ravins et gorges ressortent nettement." },
  { id: "multi", libelle: "Multi-directions", intention: "Quatre sources lumineuses : aucun versant ne reste dans une ombre plate, au prix d’un rendu plus lisse." },
] as const;

const MAP_DEMO_SCRIPT = `
(function () {
  var fond = document.getElementById("map-fond");
  var geologie = document.getElementById("map-geologie");
  var teintes = document.getElementById("map-teintes");
  var ombrage = document.getElementById("map-ombrage");
  var altitude = document.getElementById("map-altitude");
  var terrain = document.getElementById("map-terrain");
  var exageration = document.getElementById("map-exageration");
  var exagerationValue = document.getElementById("map-exageration-value");
  var mapEl = document.getElementById("map");
  var status = document.getElementById("map-status");
  var url = document.getElementById("map-style-url");
  var description = document.getElementById("map-ombrage-description");
  var reset = document.getElementById("map-reset");
  var styleJson = document.getElementById("map-style-json");
  var styleHttp = document.getElementById("map-style-http");
  var legendSelect = document.getElementById("map-legend");
  var legendOut = document.getElementById("map-legend-result");
  var activity = document.getElementById("map-activity");
  if (!fond || !geologie || !teintes || !ombrage || !altitude || !terrain || !exageration || !mapEl || !status || !url) return;

  var intentions = ${toInlineJson(Object.fromEntries(PREREGLAGES_OMBRAGE.map((reglage) => [reglage.id, reglage.intention])))};
  var map = null;

  // --- Onglets du bandeau (motif ARIA tabs) ---
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#map-panel [role="tab"]'));
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

  /** Grise le seul réglage qui puisse rester sans effet, et explique pourquoi. */
  function marquer(id, inactif, message) {
    var bloc = document.getElementById(id);
    if (!bloc) return;
    bloc.setAttribute("data-inactive", inactif ? "true" : "false");
    var note = bloc.querySelector(".option__inactive");
    if (note) note.textContent = inactif ? message : "";
  }
  function syncDisponibilite() {
    exageration.disabled = !terrain.checked;
    marquer("option-exageration", !terrain.checked, "Sans terrain 3D, l’exagération reste sans effet.");
  }

  function styleUrl() {
    var params = new URLSearchParams();
    params.set("fond", fond.value);
    if (geologie.checked) params.set("geologie", "true");
    if (teintes.checked) params.set("teintes", "true");
    params.set("ombrage", ombrage.value);
    if (altitude.value !== "standard") params.set("altitude", altitude.value);
    if (terrain.checked) { params.set("terrain", "true"); params.set("exageration", exageration.value); }
    return "/api/v2/map/styles/carte.json?" + params.toString();
  }
  function showUrl() {
    var next = styleUrl();
    url.textContent = next;
    if (url.tagName === "A") url.href = next;
  }
  function showDescription() { if (description) description.textContent = intentions[ombrage.value] || ""; }
  function record(label, response) {
    if (!activity) return;
    var details = response ? "HTTP " + response.status + (response.headers.get("x-cache") ? " · cache " + response.headers.get("x-cache") : "") + (response.headers.get("x-request-id") ? " · " + response.headers.get("x-request-id") : "") : "en attente";
    var item = document.createElement("li");
    item.textContent = label + " — " + details;
    activity.prepend(item);
    while (activity.children.length > 6) activity.removeChild(activity.lastChild);
  }
  function inspectStyle(nextUrl) {
    fetch(nextUrl, { headers: { accept: "application/json" } })
      .then(function (response) {
        record("Style", response);
        if (styleHttp) styleHttp.textContent = "HTTP " + response.status + " · cache-control " + (response.headers.get("cache-control") || "—") + " · request-id " + (response.headers.get("x-request-id") || "—");
        return response.json();
      })
      .then(function (data) { if (styleJson) styleJson.textContent = JSON.stringify(data, null, 2); })
      .catch(function (error) { if (styleHttp) styleHttp.textContent = "Inspection indisponible : " + String(error); });
  }
  function unavailable(message) {
    mapEl.classList.add("map-fallback");
    mapEl.textContent = message;
    status.textContent = "Carte indisponible";
  }
  function loadStyle() {
    syncDisponibilite();
    var nextUrl = styleUrl();
    showUrl();
    showDescription();
    if (exagerationValue) exagerationValue.textContent = exageration.value;
    status.textContent = "Chargement du style (ombrage « " + ombrage.options[ombrage.selectedIndex].text + " »)…";
    inspectStyle(nextUrl);
    if (map) {
      map.setStyle(nextUrl);
      map.easeTo({ pitch: terrain.checked ? 55 : 0, duration: 350 });
    }
  }
  function loadLegend() {
    if (!legendSelect || !legendOut || !legendSelect.value) return;
    var endpoint = "/api/v2/map/legends/" + encodeURIComponent(legendSelect.value);
    legendOut.textContent = "Chargement…";
    fetch(endpoint, { headers: { accept: "application/json" } })
      .then(function (response) { record("Légende", response); return response.json(); })
      .then(function (data) { legendOut.textContent = JSON.stringify(data, null, 2); })
      .catch(function (error) { legendOut.textContent = String(error); });
  }
  function loadLegendIndex() {
    if (!legendSelect) return;
    fetch("/api/v2/map/legends", { headers: { accept: "application/json" } })
      .then(function (response) { record("Index des légendes", response); return response.json(); })
      .then(function (items) {
        if (!Array.isArray(items)) return;
        items.forEach(function (item) {
          var option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.libelle;
          legendSelect.appendChild(option);
        });
      });
  }

  function init() {
    if (!window.maplibregl) {
      unavailable("MapLibre est indisponible. Vérifiez que map-service est démarré.");
      return;
    }
    map = new window.maplibregl.Map({
      container: mapEl,
      style: styleUrl(),
      center: [3.6421, 44.0812],
      zoom: 9,
      attributionControl: true,
    });
    map.addControl(new window.maplibregl.NavigationControl(), "top-right");
    if (window.maplibregl.FullscreenControl) map.addControl(new window.maplibregl.FullscreenControl(), "top-right");
    map.on("load", function () { status.textContent = "Style chargé. Utilisez la souris pour explorer la carte."; });
    map.on("error", function () { status.textContent = "Le style ou une tuile n'a pas pu être chargé."; });
    loadStyle();
  }
  [fond, geologie, teintes, ombrage, altitude, terrain, exageration].forEach(function (control) { control.addEventListener("change", loadStyle); });
  exageration.addEventListener("input", function () { if (exagerationValue) exagerationValue.textContent = exageration.value; });
  if (legendSelect) legendSelect.addEventListener("change", loadLegend);
  if (reset) reset.addEventListener("click", function () { if (map) { map.easeTo({ center: [3.6421, 44.0812], zoom: 9, pitch: 0, bearing: 0 }); } });
  syncDisponibilite();
  showUrl();
  showDescription();
  loadLegendIndex();
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
`;

function renderMapDemo(config: GatewayConfig, service: ServiceDescriptor): string {
  const body = `<h2>Démo &mdash; ${escapeHtml(service.name)}</h2>
<p class="lead">map-service ne sert qu’un seul style cartographique&nbsp;: toutes ses couches y sont toujours présentes, et les réglages ci-contre ne pilotent que leur visibilité et leur peinture. Tuiles, relief et légendes viennent de <span class="route">/api/v2/map/*</span>.</p>
<p><span class="route">${escapeHtml(service.method)} ${escapeHtml(service.publicRoute)}</span> &middot; code&nbsp;: <span class="route">${escapeHtml(service.repo)}</span></p>
<div class="split">
  <div class="split__stage">
    <p class="status-line" id="map-status" role="status" aria-live="polite">Chargement de la carte…</p>
    <div id="map" class="map map--stage" role="region" aria-label="Démo cartographique interactive"></div>
    <p class="called-url">Style appelé&nbsp;: <a id="map-style-url" href="/api/v2/map/styles/carte.json" target="_blank" rel="noreferrer">—</a></p>
    <div class="form-actions">
      <button class="btn-secondary" id="map-reset" type="button">Réinitialiser la vue</button>
      <span class="hint">Styles, tuiles, relief, glyphes et MapLibre sont servis par map-service&nbsp;: aucun CDN cartographique.</span>
    </div>
  </div>
  <aside class="panel" id="map-panel" aria-label="Réglages de la démo cartographique">
    <div class="tabs" role="tablist" aria-label="Contenu du bandeau">
      <button class="tab" type="button" role="tab" id="tab-map-options" aria-controls="panel-map-options" aria-selected="true">Options</button>
      <button class="tab" type="button" role="tab" id="tab-map-style-json" aria-controls="panel-map-style-json" aria-selected="false" tabindex="-1">Style JSON</button>
      <button class="tab" type="button" role="tab" id="tab-map-legend" aria-controls="panel-map-legend" aria-selected="false" tabindex="-1">Légendes</button>
      <button class="tab" type="button" role="tab" id="tab-map-activity" aria-controls="panel-map-activity" aria-selected="false" tabindex="-1">Activité</button>
    </div>

    <div class="tabpanel" id="panel-map-options" role="tabpanel" aria-labelledby="tab-map-options">
      <p class="summary-note">Chaque réglage est traduit en paramètre de la requête de style, et chacun a toujours un effet — sauf l’exagération, qui suppose le terrain 3D.</p>
      <div class="option" id="option-fond" data-inactive="false">
        <div class="field">
          <label for="map-fond">Fond cartographique</label>
          <select id="map-fond">
            <option value="plan" selected>Plan IGN</option>
            <option value="photo">Photographie aérienne</option>
            <option value="satellite">Satellite</option>
            <option value="nu">Sans fond</option>
          </select>
        </div>
        <span class="option__effect">Bascule la visibilité des couches raster déjà présentes dans le style&nbsp;: aucune tuile n’est rechargée au changement.</span>
        <span class="option__param">fond=plan|photo|satellite|nu</span>
        <span class="option__inactive"></span>
      </div>
      <div class="option" id="option-geologie" data-inactive="false">
        <div class="field">
          <label><input id="map-geologie" type="checkbox"> Afficher la géologie BRGM</label>
        </div>
        <span class="option__effect">Rend visible la couche raster BRGM superposée au fond, à 72&nbsp;% d’opacité.</span>
        <span class="option__param">geologie=true</span>
        <span class="option__inactive"></span>
      </div>
      <div class="option" id="option-teintes" data-inactive="false">
        <div class="field">
          <label><input id="map-teintes" type="checkbox"> Teintes hypsométriques</label>
        </div>
        <span class="option__effect">Colore le modèle d’altitude selon la palette hypsométrique du territoire, du fond de vallée au sommet de l’Aigoual.</span>
        <span class="option__param">teintes=true</span>
        <span class="option__inactive"></span>
      </div>
      <div class="option" id="option-ombrage" data-inactive="false">
        <div class="field">
          <label for="map-ombrage">Qualité de l’ombrage</label>
          <select id="map-ombrage">
${PREREGLAGES_OMBRAGE.map(
  (reglage) =>
    `            <option value="${escapeAttr(reglage.id)}"${reglage.id === "naturel" ? " selected" : ""}>${escapeHtml(reglage.libelle)}</option>`,
).join("\n")}
          </select>
        </div>
        <span class="option__effect" id="map-ombrage-description"></span>
        <span class="option__param">ombrage=${PREREGLAGES_OMBRAGE.map((reglage) => reglage.id).join("|")}</span>
        <span class="option__inactive"></span>
      </div>
      <div class="option" id="option-altitude" data-inactive="false">
        <div class="field">
          <label for="map-altitude">Définition du relief</label>
          <select id="map-altitude">
            <option value="standard" selected>Standard — archives locales</option>
            <option value="hd">Haute définition — RGE ALTI 1 m</option>
          </select>
        </div>
        <span class="option__effect">Standard&nbsp;: modèle embarqué, jusqu’à 1,7&nbsp;m par pixel — au-delà, l’image est agrandie. Haute définition&nbsp;: le RGE ALTI de l’IGN converti à la demande, qui pousse le détail réel jusqu’à 0,86&nbsp;m par pixel, soit un niveau de zoom de plus, mais dépend de la Géoplateforme.</span>
        <span class="option__param">altitude=standard|hd</span>
        <span class="option__inactive"></span>
      </div>
      <div class="option" id="option-terrain" data-inactive="false">
        <div class="field">
          <label><input id="map-terrain" type="checkbox"> Afficher le relief en 3D</label>
        </div>
        <span class="option__effect">Pose le terrain 3D et le ciel, puis incline la caméra à 55°. L’ombrage, lui, reste visible même à plat.</span>
        <span class="option__param">terrain=true</span>
        <span class="option__inactive"></span>
      </div>
      <div class="option" id="option-exageration" data-inactive="false">
        <div class="field">
          <label for="map-exageration">Exagération du relief&nbsp;: <output id="map-exageration-value">1.3</output></label>
          <input id="map-exageration" type="range" min="0.5" max="3" step="0.1" value="1.3">
        </div>
        <span class="option__effect">Multiplie l’altitude du terrain 3D (0,5 à 3&nbsp;; 1,3 par défaut). L’intensité de l’ombrage, elle, relève du préréglage ci-dessus.</span>
        <span class="option__param">exageration=1.3</span>
        <span class="option__inactive"></span>
      </div>
    </div>

    <div class="tabpanel" id="panel-map-style-json" role="tabpanel" aria-labelledby="tab-map-style-json" hidden>
      <h3>Style servi</h3>
      <p class="status-line" id="map-style-http" role="status" aria-live="polite">Le style sera inspecté au chargement.</p>
      <pre class="result" id="map-style-json" aria-live="polite"></pre>
    </div>

    <div class="tabpanel" id="panel-map-legend" role="tabpanel" aria-labelledby="tab-map-legend" hidden>
      <h3>Légendes visuelles</h3>
      <div class="field">
        <label for="map-legend">Couche</label>
        <select id="map-legend"><option value="">Choisir une légende…</option></select>
      </div>
      <p class="option__param">/api/v2/map/legends/&lt;couche&gt;</p>
      <pre class="result" id="map-legend-result" aria-live="polite">Sélectionnez une couche pour appeler son endpoint de légende.</pre>
    </div>

    <div class="tabpanel" id="panel-map-activity" role="tabpanel" aria-labelledby="tab-map-activity" hidden>
      <h3>Activité des appels API</h3>
      <p class="summary-note">Statut, identifiant de requête et, lorsqu’il est renvoyé, état du cache des appels déclenchés par cette démo.</p>
      <ul class="activity" id="map-activity" aria-live="polite"></ul>
    </div>
  </aside>
</div>
<div class="result-block">
  <h2>Ressources exposées par le microservice</h2>
  <div class="summary">
    <div class="kv"><span class="k">Style MapLibre</span><span class="v">JSON dynamique</span></div>
    <div class="kv"><span class="k">Fonds et géologie</span><span class="v">Tuiles IGN / BRGM</span></div>
    <div class="kv"><span class="k">Relief</span><span class="v">DEM Terrarium PMTiles</span></div>
    <div class="kv"><span class="k">Rendu</span><span class="v">Glyphes et MapLibre locaux</span></div>
  </div>
  <p class="summary-note">Les données métier (recherche, GeoJSON et couches thématiques) ne sont pas stockées ni agrégées par ce service.</p>
</div>
<script>${MAP_DEMO_SCRIPT}</script>`;
  return renderPage({
    title: `Démo ${service.name} — API v2`,
    version: config.version,
    body,
    showBackLink: true,
    head: MAPLIBRE_HEAD,
    wide: true,
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
  var exportButton = document.getElementById("associations-export");
  var associationItems = [];
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

  function fetchJson(url) {
    return fetch(url, { headers: { accept: "application/json" } }).then(function (response) {
      var reqId = response.headers.get("x-request-id");
      return response.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error("Réponse JSON illisible"); }
        if (!response.ok) throw new Error((data.error && data.error.message) || "HTTP " + response.status);
        return { data: data, status: response.status, requestId: reqId };
      });
    });
  }

  function loadAssociationPages(url) {
    var pages = 0;
    var items = [];
    var first = null;
    function load(nextUrl) {
      return fetchJson(nextUrl).then(function (result) {
        pages += 1;
        if (!first) first = result;
        var pageItems = Array.isArray(result.data.items) ? result.data.items : [];
        items = items.concat(pageItems);
        if (!result.data.nextCursor) return { first: first, items: items, pages: pages };
        var next = new URL(nextUrl, window.location.origin);
        next.searchParams.set("cursor", result.data.nextCursor);
        next.searchParams.set("limit", "100");
        return load(next.pathname + "?" + next.searchParams.toString());
      });
    }
    return load(url);
  }

  function xml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function associationValue(item, path) {
    return path.split(".").reduce(function (value, key) {
      return value === null || value === undefined ? null : value[key];
    }, item);
  }
  function selectedExportColumns() {
    var selected = {};
    Array.prototype.slice.call(document.querySelectorAll("#associations-export-columns input:checked"))
      .forEach(function (input) { selected[input.value] = true; });
    return (cfg.exportColumns || []).filter(function (column) { return selected[column.key]; });
  }
  function exportAssociations() {
    var columns = selectedExportColumns();
    if (columns.length === 0) {
      window.alert("Sélectionnez au moins une colonne à exporter.");
      return;
    }
    var headers = columns.map(function (column) { return column.label; });
    var rows = [headers].concat(associationItems.map(function (item) {
      return columns.map(function (column) { return associationValue(item, column.key); });
    }));
    var sheet = rows.map(function (row) { return "<Row>" + row.map(function (value) { return "<Cell><Data ss:Type=\\"String\\">" + xml(value) + "</Data></Cell>"; }).join("") + "</Row>"; }).join("");
    var documentXml = "<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>" +
      "<Workbook xmlns=\\"urn:schemas-microsoft-com:office:spreadsheet\\" xmlns:ss=\\"urn:schemas-microsoft-com:office:spreadsheet\\"><Worksheet ss:Name=\\"Associations\\"><Table>" + sheet + "</Table></Worksheet></Workbook>";
    var blob = new Blob([documentXml], { type: "application/vnd.ms-excel;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "associations.xls";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }
  if (exportButton) exportButton.addEventListener("click", exportAssociations);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var url = buildUrl();
    urlOut.textContent = "GET " + url;
    statusOut.textContent = "Appel en cours…";
    out.textContent = "";
    if (summaryOut) summaryOut.textContent = "";
    if (exportButton) exportButton.disabled = true;
    if (cfg.serviceId === "associations") {
      loadAssociationPages(url)
        .then(function (result) {
          var parsed = result.first.data;
          parsed.items = result.items;
          parsed.nextCursor = null;
          associationItems = result.items;
          statusOut.textContent = "HTTP " + result.first.status + " · " + result.items.length + " association(s) chargée(s) sur " + result.pages + " page(s)" + (result.first.requestId ? " · request-id " + result.first.requestId : "");
          out.textContent = JSON.stringify(parsed, null, 2);
          if (summaryOut && window.__presenters) window.__presenters.render(cfg.serviceId, parsed, summaryOut);
          if (exportButton) exportButton.disabled = associationItems.length === 0;
        })
        .catch(function (error) {
          statusOut.textContent = "Échec de la requête";
          out.textContent = String(error);
        });
      return;
    }
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

  // --- Synthèse géologique à la demande (bouton par fiche, coûteux : scraping + LLM vision) ---
  if (summaryOut) {
    summaryOut.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest ? event.target.closest(".btn-synthese") : null;
      if (!btn) return;
      var reference = btn.getAttribute("data-reference");
      var card = btn.closest(".kv");
      var zone = card ? card.querySelector(".synthese-zone") : null;
      if (!reference || !zone) return;

      btn.disabled = true;
      var libelleInitial = btn.textContent;
      btn.textContent = "Analyse en cours…";
      zone.hidden = false;
      zone.textContent = "Analyse en cours…";

      fetch("/api/v2/geologie/bss/synthese?reference=" + encodeURIComponent(reference), {
        headers: { accept: "application/json" },
      })
        .then(function (response) {
          return response.text().then(function (text) {
            var parsed = null;
            try { parsed = JSON.parse(text); } catch (e) {}
            var payload = response.ok
              ? parsed
              : { error: (parsed && parsed.error) || { message: "HTTP " + response.status } };
            if (window.__presenters && window.__presenters.renderSynthese) {
              window.__presenters.renderSynthese(zone, payload);
            }
          });
        })
        .catch(function (error) {
          zone.textContent = "Échec de la requête : " + String(error);
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = libelleInitial;
        });
    });
  }

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
  var fireLegend = null;
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
      onResult: function (data) {
        if (cfg.drawDetections) drawFire(data);
        if (cfg.drawGeologieResults) drawGeologieMarkers(data);
      },
    };
  }
  function moveMarker(lat, lon) {
    if (!map) return;
    if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  }
  var FIRE_SOURCE_COLORS = {
    FIRMS_VIIRS_SNPP_NRT: "#d73027",
    FIRMS_VIIRS_NOAA20_NRT: "#fc8d59",
    FIRMS_VIIRS_NOAA21_NRT: "#4575b4",
    FIRMS_MODIS_NRT: "#1a9850",
    EUMETSAT_MTG_CAP: "#7b3294",
  };
  function fireSourceColor(source) {
    return FIRE_SOURCE_COLORS[source] || "#5b6470";
  }
  function fireValue(value, suffix) {
    if (value === undefined || value === null || value === "") return "—";
    return String(value) + (suffix || "");
  }
  function fireConfidence(confidence) {
    if (!confidence || typeof confidence !== "object") return "—";
    var value = confidence.normalized || "unknown";
    if (confidence.raw !== undefined && confidence.raw !== null && String(confidence.raw) !== String(value)) {
      value += " (brut : " + confidence.raw + ")";
    }
    return value;
  }
  function addFireLegend(data, markerCounts) {
    if (!map) return;
    if (fireLegend) map.removeControl(fireLegend);
    fireLegend = L.control({ position: "bottomright" });
    fireLegend.onAdd = function () {
      var box = document.createElement("div");
      box.className = "leaflet-control";
      box.style.background = "var(--surface)";
      box.style.color = "var(--text)";
      box.style.border = "1px solid var(--border)";
      box.style.borderRadius = "8px";
      box.style.padding = ".55rem .65rem";
      box.style.maxWidth = "260px";
      box.style.fontSize = ".75rem";
      box.style.lineHeight = "1.35";
      var title = document.createElement("strong");
      title.textContent = "Sources satellitaires";
      box.appendChild(title);
      var reports = Array.isArray(data.sources) ? data.sources : [];
      var names = reports.map(function (report) { return report.source; });
      Object.keys(markerCounts).forEach(function (source) {
        if (names.indexOf(source) === -1) names.push(source);
      });
      names.forEach(function (source) {
        var report = reports.find(function (item) { return item.source === source; }) || {};
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = ".4rem";
        row.style.marginTop = ".3rem";
        var swatch = document.createElement("span");
        swatch.style.width = ".7rem";
        swatch.style.height = ".7rem";
        swatch.style.borderRadius = "50%";
        swatch.style.flex = "0 0 auto";
        swatch.style.background = fireSourceColor(source);
        var label = document.createElement("span");
        var count = markerCounts[source] || 0;
        label.textContent = source + " · " + count + " affichée" + (count === 1 ? "" : "s")
          + (report.state ? " · " + report.state : "");
        row.appendChild(swatch);
        row.appendChild(label);
        box.appendChild(row);
      });
      L.DomEvent.disableClickPropagation(box);
      return box;
    };
    fireLegend.addTo(map);
  }
  // Trace le rayon et l'historique complet retourné par toutes les sources fire.
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
    var history = data.history || {};
    if (Array.isArray(history.suspicions)) detections = history.suspicions.slice();
    else {
      if (Array.isArray(realtime.suspicions)) detections = detections.concat(realtime.suspicions);
      if (data.last_detection_50km) detections.push(data.last_detection_50km);
    }
    var realtimeIds = {};
    if (Array.isArray(realtime.suspicions)) {
      realtime.suspicions.forEach(function (detection) { realtimeIds[detection.id] = true; });
    }
    var seen = {};
    var markerCounts = {};
    detections.forEach(function (detection) {
      if (typeof detection.latitude !== "number" || typeof detection.longitude !== "number") return;
      var key = detection.id || [detection.source, detection.latitude, detection.longitude, detection.observed_at].join(":");
      if (seen[key]) return;
      seen[key] = true;
      var source = detection.source || "SOURCE_INCONNUE";
      markerCounts[source] = (markerCounts[source] || 0) + 1;
      var color = fireSourceColor(source);
      var dot = L.circleMarker([detection.latitude, detection.longitude], {
        radius: realtimeIds[detection.id] ? 7 : 5,
        color: color,
        weight: realtimeIds[detection.id] ? 3 : 1,
        fillColor: color,
        fillOpacity: 0.78,
      });
      var popup = document.createElement("div");
      popup.appendChild(popupLine("Source", source));
      popup.appendChild(popupLine("Observé", detection.observed_at));
      popup.appendChild(popupLine("Distance", typeof detection.distance_km === "number" ? detection.distance_km.toFixed(2) + " km" : "—"));
      popup.appendChild(popupLine("Satellite", fireValue(detection.satellite)));
      popup.appendChild(popupLine("Instrument", fireValue(detection.instrument)));
      popup.appendChild(popupLine("Confiance", fireConfidence(detection.confidence)));
      popup.appendChild(popupLine("Certitude", fireValue(detection.certainty)));
      popup.appendChild(popupLine("Puissance radiative", fireValue(detection.frp_mw, " MW")));
      popup.appendChild(popupLine("Jour / nuit", fireValue(detection.daynight)));
      popup.appendChild(popupLine("Type", fireValue(detection.type_code)));
      popup.appendChild(popupLine("Rayon du pixel", fireValue(detection.pixel_radius_km, " km")));
      popup.appendChild(popupLine("Classification", fireValue(detection.classification)));
      popup.appendChild(popupLine("Identifiant", fireValue(detection.id)));
      dot.bindPopup(popup);
      dot.bindTooltip(source);
      dot.addTo(overlays);
    });
    addFireLegend(data, markerCounts);
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

  // Place un marqueur par ouvrage BSS retourné, avec une popup résumant son intérêt et un
  // lien direct vers sa fiche InfoTerre.
  function drawGeologieMarkers(data) {
    if (!map || !overlays) return;
    overlays.clearLayers();
    var results = Array.isArray(data.results) ? data.results : [];
    var latlngs = [];
    results.forEach(function (result) {
      if (typeof result.latitude !== "number" || typeof result.longitude !== "number") return;
      var point = [result.latitude, result.longitude];
      latlngs.push(point);
      var marker = L.circleMarker(point, {
        radius: 7,
        color: "#1f6feb",
        weight: 2,
        fillColor: "#1f6feb",
        fillOpacity: 0.6,
      });
      var popup = document.createElement("div");
      popup.appendChild(popupLine("Rang", "#" + result.rank));
      popup.appendChild(popupLine("Désignation", result.designation || result.bss_id));
      popup.appendChild(popupLine("Nature", result.nature_brgm));
      popup.appendChild(popupLine("Distance", typeof result.distance_m === "number" ? result.distance_m.toFixed(0) + " m" : "—"));
      popup.appendChild(popupLine("Pertinence", typeof result.relevance_score === "number" ? result.relevance_score + "/100" : "—"));
      if (result.reason) popup.appendChild(popupLine("Raison", result.reason));
      if (result.fiche_infoterre) {
        var link = document.createElement("a");
        link.href = result.fiche_infoterre;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Fiche InfoTerre ↗";
        popup.appendChild(link);
      }
      marker.bindPopup(popup);
      marker.bindTooltip(result.designation || result.bss_id);
      marker.addTo(overlays);
    });
    if (latlngs.length > 0) {
      try { map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] }); } catch (e) {}
    }
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
    drawGeologieResults: service.id === "geologie",
    exportColumns: service.id === "associations"
      ? ASSOCIATION_EXPORT_COLUMNS.map(([key, label]) => ({ key, label }))
      : [],
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
  const associationExportControls = service.id === "associations"
    ? ASSOCIATION_EXPORT_COLUMNS.map(
      ([key, label]) =>
        `<label><input type="checkbox" name="association-export-column" value="${escapeAttr(key)}" checked> ${escapeHtml(label)}</label>`,
    ).join("\n")
    : "";

  const body = `<h2>Démo &mdash; ${escapeHtml(service.name)}</h2>
<p class="lead">${escapeHtml(service.role)}</p>
<p><span class="route">${escapeHtml(service.method)} ${escapeHtml(service.displayRoute ?? service.publicRoute)}</span> &middot; code&nbsp;: <span class="route">${escapeHtml(service.repo)}</span></p>
<form class="demo" id="demo-form">
${fields}
<div class="form-actions"><button class="btn" type="submit">Lancer l'appel</button>${locateControls}</div>
</form>
${service.id === "associations" ? `<fieldset id="associations-export-columns" class="field"><legend>Colonnes à exporter</legend><div class="export-columns">${associationExportControls}</div></fieldset><p><button class="btn-secondary" type="button" id="associations-export" disabled>Exporter les colonnes sélectionnées au format Excel</button></p><p class="hint">L’export inclut toutes les pages correspondant aux filtres.</p>` : ""}
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
