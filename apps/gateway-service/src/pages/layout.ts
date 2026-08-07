/**
 * Coquille HTML partagée par la landing et les pages de démo du gateway.
 *
 * Styles et scripts sont inline, sans fichier statique ni bundler (le gateway
 * tourne via `tsx`). Seule exception : les démos géographiques chargent Leaflet
 * depuis unpkg (avec SRI) via l'option `head`. Le CSP appliqué par Caddy
 * autorise `'unsafe-inline'` pour `style-src`/`script-src`, `connect-src 'self'`
 * et les origines unpkg/tuiles OSM nécessaires à la carte.
 */

/** Échappe le texte destiné à un contenu HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Échappe une valeur destinée à un attribut HTML entre guillemets doubles. */
export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

export interface PageOptions {
  /** Titre de l'onglet et de l'en-tête de page. */
  title: string;
  /** Version du gateway affichée en pied de page. */
  version: string;
  /** Corps HTML déjà échappé/sûr. */
  body: string;
  /** Affiche un lien de retour vers la landing (`/api/v2`). */
  showBackLink?: boolean;
  /** Balises additionnelles déjà sûres injectées avant `</head>` (ex. Leaflet). */
  head?: string;
  /** Élargit la zone de contenu (démo carte : scène + bandeau latéral). */
  wide?: boolean;
}

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --border: #d8dde3;
  --text: #1b1f24;
  --muted: #5b6470;
  --accent: #1f6feb;
  --ok-bg: #e6f4ea; --ok-fg: #1a7f37;
  --ko-bg: #fbe9e7; --ko-fg: #b3261e;
  --warn-bg: #fff8e1; --warn-fg: #8a6d00;
  --alert-bg: #fdebd7; --alert-fg: #b25e00;
  --unknown-bg: #eceff1; --unknown-fg: #5b6470;
  --code-bg: #f0f2f4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #9198a1; --accent: #58a6ff;
    --ok-bg: #12331f; --ok-fg: #4ac26b;
    --ko-bg: #3a1512; --ko-fg: #ff7b72;
    --warn-bg: #3a3012; --warn-fg: #e3b341;
    --alert-bg: #3d2410; --alert-fg: #f0883e;
    --unknown-bg: #21262d; --unknown-fg: #9198a1;
    --code-bg: #0d1117;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}
a { color: var(--accent); }
main { max-width: 960px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
main.wide { max-width: 1440px; }
header.site {
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  padding: 1rem 1.25rem;
}
header.site .inner { max-width: 960px; margin: 0 auto; display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
/* En-tête et pied alignés sur la zone de contenu élargie (démo carte). */
body:has(main.wide) header.site .inner, body:has(main.wide) footer.site { max-width: 1440px; }
header.site h1 { font-size: 1.15rem; margin: 0; }
header.site .tag { color: var(--muted); font-size: .85rem; }
.back { display: inline-block; margin-bottom: 1rem; font-size: .9rem; }
h2 { font-size: 1.05rem; }
.lead { color: var(--muted); max-width: 60ch; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); margin-top: 1.5rem; }
.card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: .5rem;
}
.card h3 { margin: 0; font-size: 1rem; display: flex; align-items: center; gap: .5rem; }
.card .role { color: var(--muted); font-size: .9rem; margin: 0; flex: 1; }
.route { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; background: var(--code-bg); border-radius: 6px; padding: .15rem .4rem; }
.card-actions { margin-top: .25rem; }
.btn {
  display: inline-block;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: .5rem .9rem;
  font-size: .9rem;
  cursor: pointer;
  text-decoration: none;
}
.btn:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.badge {
  font-size: .72rem;
  font-weight: 600;
  padding: .1rem .45rem;
  border-radius: 999px;
  background: var(--unknown-bg);
  color: var(--unknown-fg);
  white-space: nowrap;
}
.badge[data-status="ok"] { background: var(--ok-bg); color: var(--ok-fg); }
.badge[data-status="unavailable"] { background: var(--ko-bg); color: var(--ko-fg); }
form.demo { display: grid; gap: 1rem; margin-top: 1.5rem; }
.field { display: flex; flex-direction: column; gap: .25rem; max-width: 28rem; }
.field label { font-weight: 600; font-size: .9rem; }
.field input, .field select {
  padding: .5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.hint, .field .hint { color: var(--muted); font-size: .8rem; }
.export-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: .45rem .9rem; margin-top: .5rem; }
.export-columns label { display: flex; align-items: flex-start; gap: .4rem; font-size: .9rem; }
.called-url { font-family: ui-monospace, monospace; font-size: .82rem; word-break: break-all; }
pre.result {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
  font-size: .82rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.result-block { margin-top: 1.5rem; }
.result-block h2 { margin-bottom: .5rem; }
.status-line { margin: 0 0 .75rem; font-size: .9rem; }
.form-actions { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
.btn-secondary {
  display: inline-block;
  background: var(--surface);
  color: var(--accent);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: .5rem .9rem;
  font-size: .9rem;
  cursor: pointer;
}
.btn-secondary[aria-busy="true"] { opacity: .6; cursor: wait; }
.btn-secondary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.map { height: 300px; width: 100%; border: 1px solid var(--border); border-radius: 10px; margin-top: .75rem; background: var(--code-bg); }
.map-fallback { display: flex; align-items: center; justify-content: center; text-align: center; color: var(--muted); font-size: .9rem; padding: 1rem; }
/* Scène cartographique à gauche, bandeau de réglages à droite : la carte reste
   visible pendant qu'on modifie les options, pour en comparer l'effet. */
.split { display: grid; gap: 1.25rem; grid-template-columns: minmax(0, 1fr) 23rem; align-items: start; margin-top: 1.25rem; }
.split__stage { position: sticky; top: 1rem; min-width: 0; }
.map--stage { height: min(72vh, 720px); margin-top: 0; }
.panel {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: .9rem;
}
.panel .tabs { position: sticky; top: 0; z-index: 1; background: var(--surface); overflow-x: auto; }
.panel .tab { white-space: nowrap; }
.panel .field { max-width: none; }
.panel pre.result { max-height: 22rem; overflow-y: auto; }
.panel h3 { margin: 0 0 .35rem; font-size: .95rem; }
.option { border-top: 1px solid var(--border); padding: .7rem 0; display: flex; flex-direction: column; gap: .3rem; }
.option:first-of-type { border-top: none; padding-top: .25rem; }
.option__effect { color: var(--muted); font-size: .82rem; }
.option__param { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; background: var(--code-bg); border-radius: 6px; padding: .1rem .35rem; align-self: flex-start; }
.option[data-inactive="true"] { opacity: .55; }
.option__inactive { color: var(--warn-fg); font-size: .8rem; }
.option__inactive:empty { display: none; }
.activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
.activity li { border: 1px solid var(--border); border-radius: 8px; padding: .35rem .5rem; font-size: .8rem; overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .split { grid-template-columns: 1fr; }
  .split__stage, .panel { position: static; max-height: none; }
  .map--stage { height: 60vh; }
}
.tabs { display: flex; gap: .25rem; border-bottom: 1px solid var(--border); margin-bottom: .75rem; }
.tab {
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--muted);
  font: inherit;
  font-size: .9rem;
  font-weight: 600;
  padding: .45rem .75rem;
  cursor: pointer;
}
.tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
.tab:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
.tabpanel[hidden] { display: none; }
.summary { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.summary .wide { grid-column: 1 / -1; }
.kv {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: .6rem .75rem;
  display: flex;
  flex-direction: column;
  gap: .15rem;
}
.kv .k { color: var(--muted); font-size: .78rem; }
.kv .v { font-weight: 600; font-size: .95rem; overflow-wrap: anywhere; }
.kv .v.big { font-size: 1.6rem; }
.summary-note { color: var(--muted); font-size: .85rem; margin: .25rem 0 0; }
.badges { display: flex; gap: .35rem; flex-wrap: wrap; }
.badge[data-level="green"] { background: var(--ok-bg); color: var(--ok-fg); }
.badge[data-level="yellow"] { background: var(--warn-bg); color: var(--warn-fg); }
.badge[data-level="orange"] { background: var(--alert-bg); color: var(--alert-fg); }
.badge[data-level="red"] { background: var(--ko-bg); color: var(--ko-fg); }
footer.site { max-width: 960px; margin: 2.5rem auto 0; padding: 1rem 1.25rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .85rem; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

/** Rend un document HTML complet à partir d'un corps déjà sûr. */
export function renderPage(options: PageOptions): string {
  const { title, version, body, showBackLink, head, wide } = options;
  const back = showBackLink
    ? `<a class="back" href="/api/v2">&larr; Retour à l'accueil des API v2</a>`
    : "";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<!-- Sans déclaration, le navigateur réclame /favicon.ico, que rien ne sert. -->
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="mask-icon" href="/favicon.svg" color="#1f6feb">
<style>${STYLES}</style>
${head ?? ""}
</head>
<body>
<header class="site"><div class="inner"><h1>OpenDataVal &mdash; API v2</h1><span class="tag">Gateway &middot; ${escapeHtml(version)}</span></div></header>
<main${wide ? ` class="wide"` : ""}>
${back}
${body}
</main>
<footer class="site">
Façade des microservices OpenDataVal. Documentation&nbsp;: <span class="route">doc/microservice/gateway-service/README.md</span> &middot; <span class="route">AGENTS.md</span>.
</footer>
</body>
</html>`;
}
