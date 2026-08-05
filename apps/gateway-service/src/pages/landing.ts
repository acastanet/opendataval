import type { GatewayConfig } from "./../config.js";
import { SERVICES } from "./../services-catalog.js";
import { escapeAttr, escapeHtml, renderPage } from "./layout.js";

/**
 * Landing page des API v2, servie à `GET /api/v2`. Présente rapidement chaque
 * microservice sous forme de carte (rôle, route, badge d'état live, lien démo).
 * Les badges sont alimentés côté navigateur par `GET /api/v2/status`.
 */

function renderCard(id: string, name: string, role: string, route: string, hasDemo: boolean): string {
  const demoLink = hasDemo
    ? `<div class="card-actions"><a class="btn" href="/api/v2/demo/${escapeAttr(id)}">Démo &rarr;</a></div>`
    : "";
  return `<article class="card">
  <h3>${escapeHtml(name)} <span class="badge" data-status="unknown" data-service="${escapeAttr(id)}">…</span></h3>
  <p class="role">${escapeHtml(role)}</p>
  <p><span class="route">GET ${escapeHtml(route)}</span></p>
  ${demoLink}
</article>`;
}

// Script inline : peint les badges d'état depuis /api/v2/status. Aucune donnée
// interpolée depuis le serveur (les ids proviennent du DOM), donc pas d'injection.
const STATUS_SCRIPT = `
(function () {
  var LABELS = { ok: "en ligne", unavailable: "indisponible", unknown: "…" };
  function paint(services) {
    var byId = {};
    (services || []).forEach(function (s) { byId[s.id] = s; });
    document.querySelectorAll(".badge[data-service]").forEach(function (el) {
      var s = byId[el.getAttribute("data-service")];
      var status = s ? s.status : "unknown";
      el.setAttribute("data-status", status);
      var suffix = s && typeof s.latencyMs === "number" ? " (" + s.latencyMs + " ms)" : "";
      el.textContent = (LABELS[status] || status) + suffix;
    });
  }
  function refresh() {
    fetch("/api/v2/status", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("status " + r.status)); })
      .then(function (data) { paint(data.services); })
      .catch(function () {
        document.querySelectorAll(".badge[data-service]").forEach(function (el) {
          el.setAttribute("data-status", "unknown");
          el.textContent = "état inconnu";
        });
      });
  }
  refresh();
  setInterval(refresh, 15000);
})();
`;

export function renderLanding(config: GatewayConfig): string {
  const cards = SERVICES
    .map((service) =>
      renderCard(
        service.id,
        service.name,
        service.role,
        service.displayRoute ?? service.publicRoute,
        service.hasDemo ?? service.demo.length > 0,
      ),
    )
    .join("\n");

  const body = `<h2>Applications</h2>
<div class="grid">
<section class="card">
  <h2>Application de terrain</h2>
  <p class="role">Carte, position et suspicions satellitaires de feu à proximité, dans une interface mobile.</p>
  <div class="card-actions"><a class="btn" href="/valfeu/">Ouvrir valfeu &rarr;</a></div>
</section>
<section class="card">
  <h2>Périmètre OLD</h2>
  <p class="role">Zonage réglementaire, emprise du bâtiment, cadastre et PLU pour préparer le débroussaillement.</p>
  <div class="card-actions"><a class="btn" href="/old/">Ouvrir l’outil OLD &rarr;</a></div>
</section>
</div>
<h2>Microservices de la plateforme</h2>
<p class="lead">Point d'entrée unique des API v2 d'OpenDataVal. Chaque service est joignable sous <span class="route">/api/v2/*</span> à travers cette façade. Ouvrez une démo pour l'essayer en direct.</p>
<p class="status-line" role="status" aria-live="polite">L'état de chaque service est rafraîchi automatiquement.</p>
<div class="grid">
${cards}
</div>
<script>${STATUS_SCRIPT}</script>`;

  return renderPage({ title: "OpenDataVal — API v2", version: config.version, body });
}
