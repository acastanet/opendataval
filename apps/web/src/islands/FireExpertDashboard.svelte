<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { urlStyle, ajouterControleIncendies } from "../lib/carte";

  interface GeoJsonFeature { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown>; }
  interface GeoJsonCollection { type: "FeatureCollection"; features: GeoJsonFeature[]; }
  interface FireSituation {
    detections_24h: { coeur: number; proche: number; veille: number };
    firms: {
      etat: string;
      fraicheur: "fraiche" | "ancienne" | "indisponible";
      age_minutes: number | null;
      derniere_collecte: string | null;
      derniere_tentative: string | null;
      message?: string;
    };
    zones_initialisees: boolean;
  }

  let etat: "chargement" | "ok" | "erreur" = "chargement";
  let situation: FireSituation | null = null;
  let detections: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let dernieresDetections: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let zonesDonnees: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let heures = 24;
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let erreurDetections: string | null = null;
  let erreurLocalisation: string | null = null;
  let avertissementZones: string | null = null;
  let periodeEnChargement = false;

  function formaterDate(value: string | null): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
  }
  function formaterDateUtc(value: string | null): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC", timeZoneName: "short" }).format(new Date(value));
  }
  function libellePosition(value: unknown): string {
    if (value === "coeur") return "dans la zone cœur";
    if (value === "proche") return "à moins de 5 km de la zone cœur";
    if (value === "veille") return "dans la veille à 15 km";
    return "position non qualifiée";
  }
  async function fetchJson<T>(url: string): Promise<T> { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); return (await response.json()) as T; }

  function popupDetection(feature: maplibregl.MapGeoJSONFeature): HTMLElement {
    const properties = feature.properties ?? {};
    const element = document.createElement("div");
    const titre = document.createElement("strong");
    titre.textContent = "Détection thermique";
    element.appendChild(titre);
    const ligne = (libelle: string, valeur: string): void => {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = `${libelle} : ${valeur}`;
      element.appendChild(paragraphe);
    };
    ligne("Observée", formaterDate(String(properties.observee_a ?? "")));
    ligne("UTC", formaterDateUtc(String(properties.observee_a ?? "")));
    ligne("Position", libellePosition(properties.position));
    ligne("Distance au cœur", `${Number(properties.distance_coeur_m ?? 0).toLocaleString("fr-FR")} m`);
    ligne("Satellite", String(properties.satellite ?? "—"));
    ligne("Confiance", String(properties.confiance ?? "—"));
    ligne("FRP", properties.frp === null || properties.frp === undefined ? "—" : `${String(properties.frp)} MW`);
    return element;
  }

  function recentrerCarte(carte: maplibregl.Map): void {
    carte.flyTo({ center: [3.66, 44.12], zoom: 9.05, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800, essential: false });
  }
  function meLocaliser(carte: maplibregl.Map, sourceId: string): void {
    erreurLocalisation = null;
    if (!navigator.geolocation) { erreurLocalisation = "La géolocalisation n’est pas disponible sur cet appareil."; return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position: [number, number] = [coords.longitude, coords.latitude];
        const source = carte.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: position } } as GeoJSON.Feature<GeoJSON.Point>;
        if (source) source.setData(point);
        else { carte.addSource(sourceId, { type: "geojson", data: point }); carte.addLayer({ id: sourceId, type: "circle", source: sourceId, paint: { "circle-radius": 8, "circle-color": "#1463a4", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } }); }
        carte.flyTo({ center: position, zoom: 12, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800, essential: false });
      },
      () => { erreurLocalisation = "Votre position n’a pas pu être obtenue. Vérifiez l’autorisation de localisation."; },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function initialiserCarte(zones: GeoJsonCollection): Promise<void> {
    const maplibre = (await import("maplibre-gl")).default;
    map = new maplibre.Map({ container: mapContainer, style: urlStyle("territoire", { prefixe: "principal", fond: "plan" }), center: [3.66, 44.12], zoom: 9.05, attributionControl: { compact: true } });
    map.addControl(new maplibre.NavigationControl(), "bottom-right");
    map.on("load", () => {
      if (!map) return;
      ajouterControleIncendies(map, { planLayerId: "principal-basemap-plan", photoLayerId: "principal-basemap-photo", onRecentrer: () => recentrerCarte(map!), onLocaliser: () => meLocaliser(map!, "position-utilisateur-principale") });
      map.addSource("zones-incendies", { type: "geojson", data: zones as GeoJSON.FeatureCollection });
      for (const zone of [{ type: "veille_15km", color: "#d69d00" }, { type: "proche_5km", color: "#e67524" }, { type: "coeur", color: "#bb2435" }]) {
        map.addLayer({ id: `zone-${zone.type}-fill`, type: "fill", source: "zones-incendies", filter: ["==", ["get", "type_zone"], zone.type], paint: { "fill-color": zone.color, "fill-opacity": zone.type === "coeur" ? 0.1 : 0.045 } });
        map.addLayer({ id: `zone-${zone.type}-line`, type: "line", source: "zones-incendies", filter: ["==", ["get", "type_zone"], zone.type], paint: { "line-color": zone.color, "line-width": zone.type === "coeur" ? 2.2 : 1.2 } });
      }
      map.addSource("detections-incendies", { type: "geojson", data: detections as GeoJSON.FeatureCollection });
      map.addLayer({ id: "detections-incendies", type: "circle", source: "detections-incendies", paint: { "circle-radius": 7, "circle-color": ["match", ["get", "position"], "coeur", "#bb2435", "proche", "#e67524", "veille", "#d69d00", "#687076"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      map.on("click", "detections-incendies", (event) => { const feature = event.features?.[0]; if (feature?.geometry.type === "Point") new maplibre.Popup().setLngLat(event.lngLat).setDOMContent(popupDetection(feature)).addTo(map!); });
      map.on("mouseenter", "detections-incendies", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "detections-incendies", () => { if (map) map.getCanvas().style.cursor = ""; });
    });
    map.on("error", () => { avertissementZones = "Une partie du fond cartographique est indisponible. La liste des détections reste exploitable."; });
  }

  async function choisirPeriode(prochainesHeures: number): Promise<void> {
    periodeEnChargement = true;
    erreurDetections = null;
    try {
      const prochainesDetections = await fetchJson<GeoJsonCollection>(`/api/incendies/detections?hours=${prochainesHeures}`);
      heures = prochainesHeures;
      detections = prochainesDetections;
      const source = map?.getSource("detections-incendies") as maplibregl.GeoJSONSource | undefined;
      source?.setData(detections as GeoJSON.FeatureCollection);
    } catch (error) {
      console.error("détections incendies indisponibles", error);
      erreurDetections = "La période demandée n’a pas pu être chargée. Les dernières données valides restent affichées.";
    } finally {
      periodeEnChargement = false;
    }
  }

  async function charger(): Promise<void> {
    const resultats = await Promise.allSettled([
      fetchJson<FireSituation>("/api/incendies/situation"),
      fetchJson<GeoJsonCollection>("/api/incendies/detections?hours=24"),
      fetchJson<GeoJsonCollection>("/api/incendies/detections/dernieres"),
      fetchJson<GeoJsonCollection>("/api/incendies/zones"),
    ] as const);
    if (resultats[0].status === "fulfilled") situation = resultats[0].value;
    if (resultats[1].status === "fulfilled") detections = resultats[1].value;
    else erreurDetections = "Les détections récentes sont temporairement indisponibles.";
    if (resultats[2].status === "fulfilled") dernieresDetections = resultats[2].value;
    const zones = resultats[3].status === "fulfilled" ? resultats[3].value : { type: "FeatureCollection" as const, features: [] };
    zonesDonnees = zones;
    if (zones.features.length === 0) avertissementZones = "Les périmètres cartographiques sont indisponibles. Les données textuelles restent accessibles.";
    if (!situation && resultats[1].status === "rejected" && resultats[2].status === "rejected") {
      etat = "erreur";
      return;
    }
    etat = "ok";
    await tick();
    try { await initialiserCarte(zones); }
    catch (error) { console.error("carte incendies indisponible", error); avertissementZones = "La carte est indisponible. Utilisez la liste accessible des détections."; }
  }
  onMount(() => { void charger(); }); onDestroy(() => { map?.remove(); });
</script>

{#if etat === "chargement"}
  <p class="etat" role="status" aria-live="polite">Chargement des données techniques…</p>
{:else if etat === "erreur"}
  <p class="etat erreur" role="alert">Les données satellitaires sont temporairement indisponibles.</p>
{:else}
  {#if situation}
    <section class="resume" aria-label="Résumé des détections thermiques">
      <article><p>Détections FIRMS — 24 h</p><strong>{situation.detections_24h.coeur + situation.detections_24h.proche + situation.detections_24h.veille}</strong><span>dans le périmètre exact de veille</span></article>
      <article><p>Dernière collecte valide</p><strong class="date">{formaterDate(situation.firms.derniere_collecte)}</strong><span class={`statut-source ${situation.firms.fraicheur}`}>{situation.firms.fraicheur === "fraiche" ? "Données fraîches" : situation.firms.fraicheur === "ancienne" ? "Données anciennes" : "Source indisponible"}{situation.firms.age_minutes !== null ? ` · ${situation.firms.age_minutes} min` : ""}</span></article>
      <dl class="repartition"><div><dt>Cœur</dt><dd>{situation.detections_24h.coeur}</dd></div><div><dt>Proche — 5 km</dt><dd>{situation.detections_24h.proche}</dd></div><div><dt>Veille — 15 km</dt><dd>{situation.detections_24h.veille}</dd></div></dl>
      {#if situation.firms.message}<p class="alerte-technique" role="status">{situation.firms.message}</p>{/if}
    </section>
  {:else}
    <p class="alerte-technique" role="status">Le résumé de fraîcheur est indisponible. Les détections accessibles ci-dessous restent affichées.</p>
  {/if}
  <section class="exploration" aria-labelledby="titre-exploration">
    <div class="titre-ligne"><div><p class="eyebrow">Exploration</p><h2 id="titre-exploration">Détections et périmètres de veille</h2></div><div class="periodes" aria-label="Période" aria-busy={periodeEnChargement}><button class:actif={heures === 6} aria-pressed={heures === 6} disabled={periodeEnChargement} on:click={() => choisirPeriode(6)} type="button">6 h</button><button class:actif={heures === 24} aria-pressed={heures === 24} disabled={periodeEnChargement} on:click={() => choisirPeriode(24)} type="button">24 h</button><button class:actif={heures === 72} aria-pressed={heures === 72} disabled={periodeEnChargement} on:click={() => choisirPeriode(72)} type="button">72 h</button></div></div>
    {#if avertissementZones}<p class="alerte-technique" role="status">{avertissementZones}</p>{/if}
    {#if situation && !situation.zones_initialisees}<p class="alerte-technique erreur" role="alert">Les trois périmètres attendus ne sont pas tous initialisés. Les positions affichées doivent être considérées comme incomplètes.</p>{/if}
    {#if erreurLocalisation}<p class="alerte-technique erreur" role="alert">{erreurLocalisation}</p>{/if}
    {#if erreurDetections}<p class="alerte-technique erreur" role="alert">{erreurDetections}</p>{/if}
    <div class="carte-wrap"><div class="carte" bind:this={mapContainer} role="region" aria-label="Carte complémentaire des détections thermiques et périmètres de veille"></div></div>
    <ul class="legende" aria-label="Légende de la carte"><li><span class="coeur"></span> Cœur</li><li><span class="proche"></span> Moins de 5 km</li><li><span class="veille"></span> Veille à 15 km</li></ul>
  </section>
  <section class="liste" aria-labelledby="titre-liste"><h2 id="titre-liste">Détections sur les {heures} dernières heures</h2>{#if detections.features.length === 0}<p>Aucune détection reçue dans la zone de veille. Cela ne signifie pas qu’aucun incendie n’est en cours.</p>{:else}<ol>{#each detections.features as detection}<li><strong>{formaterDate(String(detection.properties.observee_a ?? ""))}</strong><span>UTC : {formaterDateUtc(String(detection.properties.observee_a ?? ""))}</span><span>{libellePosition(detection.properties.position)} · distance au cœur {Number(detection.properties.distance_coeur_m ?? 0).toLocaleString("fr-FR")} m</span><span>{String(detection.properties.satellite ?? "—")} · {String(detection.properties.instrument ?? "—")} · confiance {String(detection.properties.confiance ?? "—")} · FRP {detection.properties.frp === null || detection.properties.frp === undefined ? "—" : `${String(detection.properties.frp)} MW`} · {detection.properties.jour_nuit === "D" ? "jour" : detection.properties.jour_nuit === "N" ? "nuit" : "cycle inconnu"}</span><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">Consulter la source NASA FIRMS</a></li>{/each}</ol>{/if}</section>
  <section class="dernieres" aria-labelledby="titre-dernieres">
    <div><p class="eyebrow">Synthèse historique</p><h2 id="titre-dernieres">Les 3 dernières détections dans le périmètre</h2></div>
    <p>Ces points ne sont soumis à aucune limite de temps. Leur ancienneté doit être vérifiée avant toute interprétation.</p>
    {#if dernieresDetections.features.length === 0}<p class="absence-detection">Aucune détection thermique historique n’est enregistrée dans le périmètre.</p>{:else}<ol class="historique">{#each dernieresDetections.features.slice(0, 3) as detection}<li><strong>{formaterDate(String(detection.properties.observee_a ?? ""))}</strong><span>{libellePosition(detection.properties.position)} · {String(detection.properties.satellite ?? "—")} · confiance {String(detection.properties.confiance ?? "—")}</span></li>{/each}</ol>{/if}
  </section>
  <section class="methodologie" aria-labelledby="titre-methodologie"><p class="eyebrow">Comprendre et vérifier</p><h2 id="titre-methodologie">Méthodologie, sources et limites</h2><p>La zone cœur réunit l’EPCI 200034601 et la ZNIEFF II 910011858. Les zones proche et veille sont des tampons de 5 km et 15 km calculés dans PostGIS. Les points demandés dans la boîte englobante FIRMS sont ensuite filtrés par le polygone exact de veille.</p><p>Version des périmètres : {String(zonesDonnees.features[0]?.properties.version_source ?? "non disponible")}.</p><ul><li><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS — anomalies thermiques VIIRS</a></li><li><a href="https://geo.api.gouv.fr/" target="_blank" rel="noreferrer">API Découpage administratif</a></li><li><a href="https://apicarto.ign.fr/api/nature/znieff2" target="_blank" rel="noreferrer">API Carto IGN — ZNIEFF</a></li></ul></section>
  <p class="avertissement">Les détections NASA FIRMS signalent des anomalies thermiques et ne constituent pas une alerte opérationnelle. En cas de feu observé, appelez le 112 ou le 18.</p>
{/if}

<style>
  .etat { padding: 2rem 0; color: var(--muted); font-weight: 600; } .erreur { color: #9f2637; }.resume { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }.resume article,.exploration,.dernieres,.liste,.methodologie { border:1px solid var(--line-strong); border-radius:8px; padding:clamp(1rem,3vw,1.6rem); background:var(--surface); box-shadow:0 2px 8px rgba(23,56,75,.08); }.resume p,.resume span,.eyebrow,.legende { margin:0; color:var(--muted); }.resume p,.eyebrow { color:var(--navy); font-size:.74rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }.resume strong { display:block; margin-top:.4rem; color:var(--fg); font-family:var(--font-display); font-size:2.9rem; line-height:1; }.resume strong.date { font-family:inherit; font-size:1.25rem; line-height:1.25; }.resume span { display:block; margin-top:.45rem; font-size:.88rem; font-weight:600; line-height:1.4; }.statut-source.fraiche { color:#18794e; }.statut-source.ancienne { color:#8a5a00; }.statut-source.indisponible { color:#9f2637; }.repartition { display:grid; grid-column:1/-1; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.65rem; margin:0; }.repartition div { padding:.7rem; border:1px solid var(--line-strong); border-radius:4px; background:var(--surface-muted); }.repartition dt { color:var(--muted); font-size:.8rem; font-weight:800; }.repartition dd { margin:.2rem 0 0; color:var(--fg); font-family:var(--font-display); font-size:1.65rem; font-weight:800; }.exploration,.dernieres,.liste,.methodologie { margin-top:1.25rem; }.titre-ligne { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1rem; }.titre-ligne h2,.dernieres h2,.liste h2,.methodologie h2 { margin:.3rem 0 0; color:var(--fg); font-family:var(--font-display); font-size:1.6rem; }.periodes { display:flex; gap:.25rem; padding:.25rem; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface-muted); }.periodes button { min-height:40px; border:1px solid transparent; border-radius:4px; padding:.45rem .8rem; color:var(--fg); background:transparent; font:inherit; font-weight:800; cursor:pointer; }.periodes button.actif { color:#ffffff; border-color:var(--navy); background:var(--navy); }.periodes button:disabled { cursor:wait; opacity:.7; }.periodes button:focus-visible { outline:3px solid #2472a4; outline-offset:2px; }.alerte-technique { grid-column:1/-1; margin:.8rem 0; padding:.75rem .85rem; border-left:5px solid #a56700; border-radius:4px; color:var(--fg)!important; background:#fff8e6; font-weight:750!important; line-height:1.5; text-transform:none!important; letter-spacing:normal!important; }.alerte-technique.erreur { border-left-color:#ad2434; background:#fff0f2; }.carte-wrap { position:relative; }.carte { height:clamp(330px,58vw,580px); border:1px solid var(--line-strong); border-radius:5px; overflow:hidden; }.legende { display:flex; flex-wrap:wrap; gap:.65rem 1rem; margin-top:.75rem; padding:0; list-style:none; font-size:.86rem; font-weight:700; }.legende span { display:inline-block; width:.75rem; height:.75rem; vertical-align:-.05rem; border:1px solid #17242c; border-radius:50%; }.coeur{ background:#bb2435; }.proche{ background:#e67524; }.veille{ background:#d69d00; }.dernieres > p,.methodologie > p { max-width:75ch; margin:.75rem 0 0; color:var(--muted); font-weight:600; line-height:1.5; }.dernieres .absence-detection { color:var(--fg); }.liste p { color:var(--fg); font-weight:600; line-height:1.55; }.liste ol,.historique { display:grid; gap:.75rem; padding-left:1.2rem; }.liste li,.historique li { padding:.75rem; border:1px solid var(--line-strong); border-radius:4px; background:var(--surface-muted); }.liste li strong,.historique li strong { color:var(--fg); }.liste li span,.historique li span { display:block; margin-top:.2rem; color:var(--muted); font-size:.9rem; font-weight:600; }.liste li a { display:inline-block; margin-top:.45rem; color:var(--navy); font-size:.86rem; font-weight:850; }.methodologie ul { line-height:1.8; }.methodologie a { color:var(--navy); font-weight:800; }.avertissement { max-width:75ch; margin:1.25rem auto 0; color:var(--muted); font-size:.86rem; font-weight:600; line-height:1.5; text-align:center; }
  @media(max-width:760px) { .titre-ligne{ align-items:flex-start; flex-direction:column; }.periodes{ width:100%; }.periodes button{ flex:1; } } @media(max-width:650px) { .resume{ grid-template-columns:1fr; }.repartition{grid-template-columns:1fr}.liste h2,.dernieres h2{ font-size:1.4rem; } }
</style>
