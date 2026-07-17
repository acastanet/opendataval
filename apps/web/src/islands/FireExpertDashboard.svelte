<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { IGN_WMTS } from "../lib/carte";

  interface GeoJsonFeature { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown>; }
  interface GeoJsonCollection { type: "FeatureCollection"; features: GeoJsonFeature[]; }
  interface FireSituation {
    detections_24h: { coeur: number; proche: number; veille: number };
    firms: { etat: string; derniere_collecte: string | null; erreur?: string };
    zones_initialisees: boolean;
  }

  let etat: "chargement" | "ok" | "erreur" = "chargement";
  let situation: FireSituation | null = null;
  let detections: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let dernieresDetections: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let heures = 24;
  let fondPrincipal: "plan" | "aerien" = "plan";
  let fondDernieres: "plan" | "aerien" = "plan";
  let mapContainer: HTMLDivElement;
  let dernieresMapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let dernieresMap: maplibregl.Map | undefined;

  function formaterDate(value: string | null): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
  }
  async function fetchJson<T>(url: string): Promise<T> { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); return (await response.json()) as T; }

  function popupDetection(feature: maplibregl.MapGeoJSONFeature): HTMLElement {
    const properties = feature.properties ?? {};
    const element = document.createElement("div");
    element.innerHTML = `<strong>Détection thermique</strong><p>Observée : ${formaterDate(String(properties.observee_a ?? ""))}</p><p>Position : ${String(properties.position ?? "—")}</p><p>Satellite : ${String(properties.satellite ?? "—")}</p><p>Confiance : ${String(properties.confiance ?? "—")}</p>`;
    return element;
  }

  function ajouterFondsCarte(carte: maplibregl.Map, prefixe: string): void {
    carte.addSource(`${prefixe}-plan-ign`, { type: "raster", tiles: [IGN_WMTS("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")], tileSize: 256, attribution: "© IGN" });
    carte.addLayer({ id: `${prefixe}-plan-ign`, type: "raster", source: `${prefixe}-plan-ign` });
    carte.addSource(`${prefixe}-orthophoto-ign`, { type: "raster", tiles: [IGN_WMTS("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")], tileSize: 256, attribution: "© IGN" });
    carte.addLayer({ id: `${prefixe}-orthophoto-ign`, type: "raster", source: `${prefixe}-orthophoto-ign`, layout: { visibility: "none" } });
  }

  function appliquerFond(carte: maplibregl.Map | undefined, prefixe: string, nouveauFond: "plan" | "aerien"): void {
    if (!carte?.isStyleLoaded()) return;
    carte.setLayoutProperty(`${prefixe}-plan-ign`, "visibility", nouveauFond === "plan" ? "visible" : "none");
    carte.setLayoutProperty(`${prefixe}-orthophoto-ign`, "visibility", nouveauFond === "aerien" ? "visible" : "none");
  }

  function choisirFondPrincipal(nouveauFond: "plan" | "aerien"): void {
    fondPrincipal = nouveauFond;
    appliquerFond(map, "principal", nouveauFond);
  }

  function choisirFondDernieres(nouveauFond: "plan" | "aerien"): void {
    fondDernieres = nouveauFond;
    appliquerFond(dernieresMap, "dernieres", nouveauFond);
  }

  function initialiserCarte(zones: GeoJsonCollection): void {
    map = new maplibregl.Map({ container: mapContainer, style: { version: 8, sources: {}, layers: [], glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf" }, center: [3.66, 44.12], zoom: 9.05, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.on("load", () => {
      if (!map) return;
      ajouterFondsCarte(map, "principal");
      map.addSource("zones-incendies", { type: "geojson", data: zones as GeoJSON.FeatureCollection });
      for (const zone of [{ type: "veille_15km", color: "#d69d00" }, { type: "proche_5km", color: "#e67524" }, { type: "coeur", color: "#bb2435" }]) {
        map.addLayer({ id: `zone-${zone.type}-fill`, type: "fill", source: "zones-incendies", filter: ["==", ["get", "type_zone"], zone.type], paint: { "fill-color": zone.color, "fill-opacity": zone.type === "coeur" ? 0.1 : 0.045 } });
        map.addLayer({ id: `zone-${zone.type}-line`, type: "line", source: "zones-incendies", filter: ["==", ["get", "type_zone"], zone.type], paint: { "line-color": zone.color, "line-width": zone.type === "coeur" ? 2.2 : 1.2 } });
      }
      map.addSource("detections-incendies", { type: "geojson", data: detections as GeoJSON.FeatureCollection });
      map.addLayer({ id: "detections-incendies", type: "circle", source: "detections-incendies", paint: { "circle-radius": 6, "circle-color": "#bb2435", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      map.on("click", "detections-incendies", (event) => { const feature = event.features?.[0]; if (feature?.geometry.type === "Point") new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(popupDetection(feature)).addTo(map!); });
      map.on("mouseenter", "detections-incendies", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "detections-incendies", () => { if (map) map.getCanvas().style.cursor = ""; });
    });
  }

  function cadrerDernieresDetections(): void {
    if (!dernieresMap || dernieresDetections.features.length === 0) return;
    const limites = new maplibregl.LngLatBounds();
    for (const detection of dernieresDetections.features) {
      if (detection.geometry.type !== "Point") continue;
      const coordinates = detection.geometry.coordinates as [number, number];
      limites.extend(coordinates);
    }
    if (!limites.isEmpty()) dernieresMap.fitBounds(limites, { padding: 48, maxZoom: 12, duration: 0 });
  }

  function initialiserCarteDernieres(zones: GeoJsonCollection): void {
    dernieresMap = new maplibregl.Map({ container: dernieresMapContainer, style: { version: 8, sources: {}, layers: [], glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf" }, center: [3.66, 44.12], zoom: 9.05, attributionControl: { compact: true }, interactive: true });
    dernieresMap.addControl(new maplibregl.NavigationControl(), "bottom-right");
    dernieresMap.on("load", () => {
      if (!dernieresMap) return;
      ajouterFondsCarte(dernieresMap, "dernieres");
      dernieresMap.addSource("perimetre-veille", { type: "geojson", data: zones as GeoJSON.FeatureCollection });
      dernieresMap.addLayer({ id: "perimetre-veille", type: "line", source: "perimetre-veille", filter: ["==", ["get", "type_zone"], "veille_15km"], paint: { "line-color": "#d69d00", "line-width": 2.2, "line-opacity": 0.9, "line-dasharray": [2, 1] } });
      dernieresMap.addSource("trois-dernieres-detections", { type: "geojson", data: { type: "FeatureCollection", features: dernieresDetections.features.slice(0, 3) } as GeoJSON.FeatureCollection });
      dernieresMap.addLayer({ id: "trois-dernieres-detections", type: "circle", source: "trois-dernieres-detections", paint: { "circle-radius": 8, "circle-color": "#bb2435", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      dernieresMap.on("click", "trois-dernieres-detections", (event) => { const feature = event.features?.[0]; if (feature?.geometry.type === "Point") new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(popupDetection(feature)).addTo(dernieresMap!); });
      cadrerDernieresDetections();
    });
  }

  async function choisirPeriode(prochainesHeures: number): Promise<void> {
    heures = prochainesHeures;
    try {
      detections = await fetchJson<GeoJsonCollection>(`/api/incendies/detections?hours=${heures}`);
      const source = map?.getSource("detections-incendies") as maplibregl.GeoJSONSource | undefined;
      source?.setData(detections as GeoJSON.FeatureCollection);
    } catch (error) { console.error("détections incendies indisponibles", error); }
  }

  async function charger(): Promise<void> {
    try {
      const [prochaineSituation, prochainesDetections, prochainesDernieresDetections, zones] = await Promise.all([fetchJson<FireSituation>("/api/incendies/situation"), fetchJson<GeoJsonCollection>("/api/incendies/detections?hours=24"), fetchJson<GeoJsonCollection>("/api/incendies/detections/dernieres"), fetchJson<GeoJsonCollection>("/api/incendies/zones")]);
      situation = prochaineSituation; detections = prochainesDetections; dernieresDetections = prochainesDernieresDetections; etat = "ok";
      await tick(); initialiserCarte(zones); initialiserCarteDernieres(zones);
    } catch (error) { console.error("tableau de bord incendies indisponible", error); etat = "erreur"; }
  }
  onMount(() => { void charger(); }); onDestroy(() => { map?.remove(); dernieresMap?.remove(); });
</script>

{#if etat === "chargement"}
  <p class="etat">Chargement des données techniques…</p>
{:else if etat === "erreur"}
  <p class="etat erreur">Les données en temps réel sont temporairement indisponibles.</p>
{:else if situation}
  <section class="resume" aria-label="Résumé des détections thermiques">
    <article><p>Détections FIRMS — 24 h</p><strong>{situation.detections_24h.coeur + situation.detections_24h.proche + situation.detections_24h.veille}</strong><span>dans la zone de veille</span></article>
    <article><p>Dernière collecte</p><strong class="date">{situation.firms.etat === "ok" ? formaterDate(situation.firms.derniere_collecte) : "Indisponible"}</strong><span>NASA FIRMS · anomalie thermique ≠ feu confirmé</span></article>
  </section>
  <section class="exploration" aria-labelledby="titre-exploration">
    <div class="titre-ligne"><div><p class="eyebrow">Exploration</p><h2 id="titre-exploration">Détections et périmètres de veille</h2></div><div class="periodes" aria-label="Période"><button class:actif={heures === 6} on:click={() => choisirPeriode(6)} type="button">6 h</button><button class:actif={heures === 24} on:click={() => choisirPeriode(24)} type="button">24 h</button><button class:actif={heures === 72} on:click={() => choisirPeriode(72)} type="button">72 h</button></div></div>
    <div class="carte-wrap"><div class="carte" bind:this={mapContainer}></div><div class="fonds-carte" aria-label="Fond de carte"><button class:actif={fondPrincipal === "plan"} on:click={() => choisirFondPrincipal("plan")} type="button" aria-label="Afficher le Plan IGN" title="Plan IGN"><span aria-hidden="true">▤</span></button><button class:actif={fondPrincipal === "aerien"} on:click={() => choisirFondPrincipal("aerien")} type="button" aria-label="Afficher la vue aérienne" title="Vue aérienne"><span aria-hidden="true">◒</span></button></div></div>
    <div class="legende"><span class="point"></span> Détection thermique &nbsp; <span class="coeur"></span> Cœur &nbsp; <span class="proche"></span> 5 km &nbsp; <span class="veille"></span> 15 km</div>
  </section>
  <section class="liste" aria-labelledby="titre-liste"><h2 id="titre-liste">Détections sur les {heures} dernières heures</h2>{#if detections.features.length === 0}<p>Aucune détection reçue dans la zone de veille. Cela ne signifie pas qu’aucun incendie n’est en cours.</p>{:else}<ol>{#each detections.features as detection}<li><strong>{formaterDate(String(detection.properties.observee_a ?? ""))}</strong><span>{String(detection.properties.position ?? "—")} · {String(detection.properties.satellite ?? "—")} · confiance {String(detection.properties.confiance ?? "—")}</span></li>{/each}</ol>{/if}</section>
  <section class="dernieres" aria-labelledby="titre-dernieres">
    <div><p class="eyebrow">Synthèse historique</p><h2 id="titre-dernieres">Les 3 dernières détections dans le périmètre</h2></div>
    <p>Ces trois points les plus récents ne sont soumis à aucune limite de temps ; le contour pointillé délimite la zone de veille à 15 km.</p>
    <div class="carte-wrap"><div class="carte carte-dernieres" bind:this={dernieresMapContainer}></div><div class="fonds-carte" aria-label="Fond de carte"><button class:actif={fondDernieres === "plan"} on:click={() => choisirFondDernieres("plan")} type="button" aria-label="Afficher le Plan IGN" title="Plan IGN"><span aria-hidden="true">▤</span></button><button class:actif={fondDernieres === "aerien"} on:click={() => choisirFondDernieres("aerien")} type="button" aria-label="Afficher la vue aérienne" title="Vue aérienne"><span aria-hidden="true">◒</span></button></div></div>
    {#if dernieresDetections.features.length === 0}<p class="absence-detection">Aucune détection thermique historique n’est enregistrée dans le périmètre.</p>{/if}
  </section>
  <p class="avertissement">Les détections NASA FIRMS signalent des anomalies thermiques et ne constituent pas une alerte opérationnelle. En cas de feu observé, appelez le 112 ou le 18.</p>
{/if}

<style>
  .etat { padding: 2rem 0; color: var(--muted); font-weight: 600; } .erreur { color: #9f2637; }.resume { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }.resume article,.exploration,.dernieres,.liste { border:1px solid var(--line-strong); border-radius:8px; padding:clamp(1rem,3vw,1.6rem); background:var(--surface); box-shadow:0 2px 8px rgba(23,56,75,.08); }.resume p,.resume span,.eyebrow,.legende { margin:0; color:var(--muted); }.resume p,.eyebrow { color:var(--navy); font-size:.74rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }.resume strong { display:block; margin-top:.4rem; color:var(--fg); font-family:var(--font-display); font-size:2.9rem; line-height:1; }.resume strong.date { font-family:inherit; font-size:1.25rem; line-height:1.25; }.resume span { display:block; margin-top:.45rem; font-size:.88rem; font-weight:600; line-height:1.4; }.exploration,.dernieres,.liste { margin-top:1.25rem; }.titre-ligne { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1rem; }.titre-ligne h2,.dernieres h2,.liste h2 { margin:.3rem 0 0; color:var(--fg); font-family:var(--font-display); font-size:1.6rem; }.periodes { display:flex; gap:.25rem; padding:.25rem; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface-muted); }.periodes button { min-height:40px; border:1px solid transparent; border-radius:4px; padding:.45rem .8rem; color:var(--fg); background:transparent; font:inherit; font-weight:800; cursor:pointer; }.periodes button.actif { color:#ffffff; border-color:var(--navy); background:var(--navy); }.periodes button:focus-visible,.fonds-carte button:focus-visible { outline:3px solid #2472a4; outline-offset:2px; }.carte-wrap { position:relative; }.carte { height:clamp(330px,58vw,580px); border:1px solid var(--line-strong); border-radius:5px; overflow:hidden; }.fonds-carte { position:absolute; top:.75rem; right:.75rem; display:grid; gap:.3rem; padding:.25rem; border:1px solid rgba(23,56,75,.65); border-radius:5px; background:rgba(255,255,255,.92); box-shadow:0 1px 4px rgba(23,56,75,.22); }.fonds-carte button { display:grid; width:38px; height:38px; place-items:center; border:1px solid transparent; border-radius:3px; color:var(--navy); background:#ffffff; font:inherit; font-size:1.2rem; font-weight:900; cursor:pointer; }.fonds-carte button.actif { color:#ffffff; border-color:var(--navy); background:var(--navy); }.carte-dernieres { height:clamp(260px,38vw,400px); margin-top:1rem; }.legende { margin-top:.75rem; font-size:.86rem; font-weight:600; }.legende span { display:inline-block; width:.75rem; height:.75rem; vertical-align:-.05rem; border:1px solid #17242c; border-radius:50%; }.point{ background:#bb2435; }.coeur{ background:#bb2435; border-radius:2px!important; }.proche{ background:#e67524; border-radius:2px!important; }.veille{ background:#d69d00; border-radius:2px!important; }.dernieres > p { max-width:75ch; margin:.75rem 0 0; color:var(--muted); font-weight:600; line-height:1.5; }.dernieres .absence-detection { color:var(--fg); }.liste p { color:var(--fg); font-weight:600; line-height:1.55; }.liste ol { display:grid; gap:.75rem; padding-left:1.2rem; }.liste li strong { color:var(--fg); }.liste li span { display:block; margin-top:.2rem; color:var(--muted); font-size:.9rem; font-weight:600; }.avertissement { max-width:75ch; margin:1.25rem auto 0; color:var(--muted); font-size:.86rem; font-weight:600; line-height:1.5; text-align:center; }
  @media(max-width:760px) { .titre-ligne{ align-items:flex-start; flex-direction:column; }.periodes{ width:100%; }.periodes button{ flex:1; } } @media(max-width:650px) { .resume{ grid-template-columns:1fr; }.liste h2,.dernieres h2{ font-size:1.4rem; } }
</style>
