<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { ajouterControleFondIgn, urlStyle } from "../lib/carte";
  import RechercheLieux from "./RechercheLieux.svelte";

  interface Result { itineraire: { duree_s: number; distance_km: number; geojson: GeoJSON.LineString }; obstacles_evites: Array<{ nom: string; type: string; valeur: string | number; geometry?: GeoJSON.LineString }>; gabarits_trajet: Array<{ nom: string; limites: Array<{ type: string; valeur: string; unite?: string }>; incompatible: boolean; geometry?: GeoJSON.LineString }>; gabarit_non_verifie: { part_lineaire: number; longueur_km: number; geojson: GeoJSON.FeatureCollection }; confiance: { niveau: string; part_verifiee: number }; avertissements: string[]; }
  const DEFAULT = { lonDepart: "3.641467", latDepart: "44.081192", lonArrivee: "3.6103", latArrivee: "43.9925", hauteur: "4.1", largeur: "2.55", longueur: "16.5", poids: "38", essieu: "11.5", nbEssieux: "5", dangereux: "0" };
  let values = { ...DEFAULT }; let gpsDepart = ""; let gpsArrivee = ""; let gpsError = ""; let mapContainer: HTMLDivElement; let map: maplibregl.Map | undefined; let loading = false; let errorMessage = ""; let result: Result | null = null; let statusMessage = "Renseignez le gabarit du véhicule puis lancez le calcul.";
  const number = (value: string) => Number(value.replace(",", "."));
  const limitLabel = (limit: { type: string; valeur: string; unite?: string }) => `${limit.type} : ${limit.valeur}${limit.unite ? ` ${limit.unite}` : ""}`;
  const countLabel = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
  const durationLabel = (seconds: number) => { const minutes = Math.round(seconds / 60); const hours = Math.floor(minutes / 60); return hours ? `${hours} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`; };
  const obstacleLabel = (item: Result["obstacles_evites"][number]) => {
    const names: Record<string, string> = { hauteur: "Hauteur maximale", largeur: "Largeur maximale", longueur: "Longueur maximale", poids: "Poids maximal", charge_essieu: "Charge à l’essieu", poids_lourd: "Accès poids lourd", matieres_dangereuses: "Matières dangereuses" };
    const unit = ["hauteur", "largeur", "longueur"].includes(item.type) ? " m" : ["poids", "charge_essieu"].includes(item.type) ? " t" : "";
    return `${names[item.type] ?? item.type} : ${item.valeur}${unit}`;
  };
  $: valid = Object.values(values).every((value) => value !== "" && Number.isFinite(number(value))) && number(values.lonDepart) >= -180 && number(values.lonDepart) <= 180 && number(values.latDepart) >= -90 && number(values.latDepart) <= 90 && number(values.lonArrivee) >= -180 && number(values.lonArrivee) <= 180 && number(values.latArrivee) >= -90 && number(values.latArrivee) <= 90;
  $: query = new URLSearchParams({ lon_depart: values.lonDepart, lat_depart: values.latDepart, lon_arrivee: values.lonArrivee, lat_arrivee: values.latArrivee, hauteur_m: values.hauteur, largeur_m: values.largeur, longueur_m: values.longueur, poids_t: values.poids, charge_essieu_t: values.essieu, nb_essieux: values.nbEssieux, matieres_dangereuses: values.dangereux }).toString();
  $: routeWarnings = result?.avertissements.filter((warning) => !warning.startsWith("Outil d’aide à la décision")) ?? [];
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  function choosePlace(kind: "depart" | "arrivee", event: CustomEvent<{ lon?: number; lat?: number }>): void {
    const { lon, lat } = event.detail; if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    values = kind === "depart" ? { ...values, lonDepart: String(lon), latDepart: String(lat) } : { ...values, lonArrivee: String(lon), latArrivee: String(lat) };
  }
  function parseGps(value: string): { lat: number; lon: number } | null {
    const match = value.trim().match(/^([+-]?(?:\d+(?:[.,]\d+)?))\s*[,;\s]\s*([+-]?(?:\d+(?:[.,]\d+)?)$)/);
    if (!match) return null;
    const lat = number(match[1] ?? ""); const lon = number(match[2] ?? "");
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
  }
  function applyGps(kind: "depart" | "arrivee"): void {
    const raw = kind === "depart" ? gpsDepart : gpsArrivee; const point = parseGps(raw);
    if (!point) { gpsError = "Utilisez le format latitude, longitude, par exemple 47.14887795332278, 6.330929504107199."; return; }
    gpsError = "";
    values = kind === "depart" ? { ...values, latDepart: String(point.lat), lonDepart: String(point.lon) } : { ...values, latArrivee: String(point.lat), lonArrivee: String(point.lon) };
    map?.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), 12), essential: true });
  }
  function display(data: Result | null): void {
    if (!map) return; const route = data ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: data.itineraire.geojson }] } as GeoJSON.FeatureCollection : empty;
    (map.getSource("itineraire") as maplibregl.GeoJSONSource | undefined)?.setData(route);
    (map.getSource("inconnu") as maplibregl.GeoJSONSource | undefined)?.setData(data?.gabarit_non_verifie.geojson ?? empty);
    const gauges = data ? { type: "FeatureCollection", features: data.gabarits_trajet.flatMap((item) => {
      const coordinates = item.geometry?.coordinates; if (!coordinates?.length) return [];
      return [{ type: "Feature" as const, properties: { nom: item.nom, limites: item.limites.map((limit) => `${limit.type} : ${limit.valeur}${limit.unite ? ` ${limit.unite}` : ""}`).join(" · "), incompatible: item.incompatible }, geometry: { type: "Point" as const, coordinates: coordinates[Math.floor(coordinates.length / 2)]! } }];
    }) } as GeoJSON.FeatureCollection : empty;
    (map.getSource("gabarits") as maplibregl.GeoJSONSource | undefined)?.setData(gauges);
    const obstacles = data ? { type: "FeatureCollection", features: data.obstacles_evites.flatMap((item) => {
      const coordinates = item.geometry?.coordinates; if (!coordinates?.length) return [];
      return [{ type: "Feature" as const, properties: item, geometry: { type: "Point" as const, coordinates: coordinates[Math.floor(coordinates.length / 2)]! } }];
    }) } as GeoJSON.FeatureCollection : empty;
    (map.getSource("obstacles") as maplibregl.GeoJSONSource | undefined)?.setData(obstacles);
    if (data?.itineraire.geojson.coordinates.length) { const [first, ...rest] = data.itineraire.geojson.coordinates; const bounds = rest.reduce((current, coordinate) => current.extend(coordinate as [number, number]), new maplibregl.LngLatBounds(first as [number, number], first as [number, number])); map.fitBounds(bounds, { padding: 55, duration: 600 }); }
  }
  async function calculate(): Promise<void> {
    if (!valid || loading) return; loading = true; errorMessage = ""; statusMessage = "Calcul de l’itinéraire camion et audit des restrictions OSM…";
    try { const response = await fetch(`/api/v2/itineraire/poids-lourd?${query}`, { headers: { accept: "application/json" } }); const payload = await response.json() as Result & { error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message ?? `Erreur HTTP ${response.status}`); result = payload; display(payload); statusMessage = "Calcul terminé. Le résultat distingue les données connues des portions à vérifier."; }
    catch (error) { result = null; display(null); errorMessage = error instanceof Error ? error.message : "Le calcul est indisponible."; statusMessage = "L’itinéraire n’a pas pu être calculé."; }
    finally { loading = false; }
  }
  function exportGeoJson(): void { if (!result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result.itineraire.geojson, null, 2)], { type: "application/geo+json" })); const link = document.createElement("a"); link.href = url; link.download = "itineraire-poids-lourd.geojson"; link.click(); URL.revokeObjectURL(url); }
  onMount(() => { map = new maplibregl.Map({ container: mapContainer, style: urlStyle("territoire", { fond: "photo" }), center: [3.64, 44.05], zoom: 11, attributionControl: { compact: true } }); map.addControl(new maplibregl.NavigationControl(), "bottom-right"); map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left"); map.on("load", () => { ajouterControleFondIgn(map!, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo", autresLayerIds: ["basemap-satellite"], actif: "photo" }); map!.addSource("itineraire", { type: "geojson", data: empty }); map!.addLayer({ id: "itineraire-solide", type: "line", source: "itineraire", paint: { "line-color": "#17384b", "line-width": 6, "line-opacity": .9 }, layout: { "line-cap": "round", "line-join": "round" } }); map!.addSource("inconnu", { type: "geojson", data: empty }); map!.addLayer({ id: "itineraire-inconnu", type: "line", source: "inconnu", paint: { "line-color": "#f7cf58", "line-width": 4, "line-dasharray": [1.5, 1.3] }, layout: { "line-cap": "round" } }); map!.addSource("gabarits", { type: "geojson", data: empty }); map!.addLayer({ id: "gabarits", type: "circle", source: "gabarits", paint: { "circle-color": ["case", ["get", "incompatible"], "#b5533c", "#1b6a72"], "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } }); map!.addSource("obstacles", { type: "geojson", data: empty }); map!.addLayer({ id: "obstacles", type: "circle", source: "obstacles", paint: { "circle-color": "#b5533c", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      map!.on("click", "gabarits", (event) => { const properties = event.features?.[0]?.properties; if (!properties) return; new maplibregl.Popup({ offset: 12 }).setLngLat(event.lngLat).setText(`${properties.nom} — ${properties.limites}`).addTo(map!); });
      map!.on("click", "obstacles", (event) => { const properties = event.features?.[0]?.properties; if (!properties) return; new maplibregl.Popup({ offset: 12 }).setLngLat(event.lngLat).setText(`${properties.nom} — obstacle évité`).addTo(map!); });
      for (const layer of ["gabarits", "obstacles"]) { map!.on("mouseenter", layer, () => { map!.getCanvas().style.cursor = "pointer"; }); map!.on("mouseleave", layer, () => { map!.getCanvas().style.cursor = ""; }); }
      if (result) display(result); }); });
  onDestroy(() => map?.remove());
</script>

<section class="outil">
  <aside class="panneau">
    <form on:submit|preventDefault={calculate}>
      <h2>Parcours et véhicule</h2>
      <div class="lieux"><p class="label-lieu">Départ</p><RechercheLieux on:selection={(event) => choosePlace("depart", event)} /></div><div class="lieux"><p class="label-lieu">Arrivée</p><RechercheLieux on:selection={(event) => choosePlace("arrivee", event)} /></div>
      <div class="gps"><label>Coordonnées GPS départ<input bind:value={gpsDepart} on:change={() => applyGps("depart")} inputmode="decimal" placeholder="47.14887795332278, 6.330929504107199" aria-describedby="aide-gps" /></label><label>Coordonnées GPS arrivée<input bind:value={gpsArrivee} on:change={() => applyGps("arrivee")} inputmode="decimal" placeholder="latitude, longitude" aria-describedby="aide-gps" /></label></div>
      <p id="aide-gps" class="aide-gps">Format accepté : latitude, longitude. Les coordonnées sont appliquées lorsque vous quittez le champ.</p>{#if gpsError}<p class="erreur" role="alert">{gpsError}</p>{/if}
      <details class="coordonnees-techniques"><summary>Coordonnées détaillées</summary><div class="grille"><label>Longitude départ<input bind:value={values.lonDepart} inputmode="decimal" /></label><label>Latitude départ<input bind:value={values.latDepart} inputmode="decimal" /></label><label>Longitude arrivée<input bind:value={values.lonArrivee} inputmode="decimal" /></label><label>Latitude arrivée<input bind:value={values.latArrivee} inputmode="decimal" /></label></div></details>
      <div class="grille"><label>Hauteur (m)<input bind:value={values.hauteur} inputmode="decimal" /></label><label>Largeur (m)<input bind:value={values.largeur} inputmode="decimal" /></label><label>Longueur (m)<input bind:value={values.longueur} inputmode="decimal" /></label><label>PTAC (t)<input bind:value={values.poids} inputmode="decimal" /></label><label>Charge essieu (t)<input bind:value={values.essieu} inputmode="decimal" /></label><label>Essieux<input bind:value={values.nbEssieux} inputmode="numeric" /></label></div>
      <label class="select">Matières dangereuses<select bind:value={values.dangereux}><option value="0">Non</option><option value="1">Oui</option></select></label>
      <button class="primaire" type="submit" disabled={!valid || loading}>{loading ? "Calcul en cours…" : "Calculer l’itinéraire"}</button>
      {#if !valid}<p class="erreur">Vérifiez les coordonnées et les valeurs du véhicule.</p>{/if}{#if errorMessage}<p class="erreur" role="alert">{errorMessage}</p>{/if}<p class="statut" role="status">{statusMessage}</p>
    </form>
    {#if result}
      <section class="resultat" aria-labelledby="titre-resultat">
        <header class="resultat-entete"><div><p class="surtitre">Itinéraire recommandé</p><h2 id="titre-resultat">{result.itineraire.distance_km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km <span>· {durationLabel(result.itineraire.duree_s)}</span></h2></div><p class="badge {result.confiance.niveau}">{Math.round(result.confiance.part_verifiee * 100)}% du trajet documenté</p></header>
        <div class="couverture" role="progressbar" aria-label="Part du trajet documentée en données de gabarit" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(result.confiance.part_verifiee * 100)}><span style={`width: ${Math.round(result.confiance.part_verifiee * 100)}%`}></span></div>
        <p class="diagnostic"><strong>{result.gabarit_non_verifie.longueur_km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km restent à vérifier</strong> : aucune limite de gabarit explicite n’est publiée sur ces portions.</p>
        <div class="indicateurs"><article><strong>{result.gabarits_trajet.length}</strong><span>{result.gabarits_trajet.length === 1 ? "gabarit connu" : "gabarits connus"}</span></article><article class:alerte={result.obstacles_evites.length > 0}><strong>{result.obstacles_evites.length}</strong><span>{result.obstacles_evites.length === 1 ? "obstacle évité" : "obstacles évités"}</span></article></div>
        <div class="legende"><span><i class="repere connu"></i> Gabarit connu</span><span><i class="repere incompatible"></i> Incompatible</span><span><i class="trait inconnu"></i> Donnée absente</span><small>Cliquez sur un repère pour afficher son détail.</small></div>
        <details open={result.gabarits_trajet.length <= 6}><summary>{countLabel(result.gabarits_trajet.length, "gabarit renseigné", "gabarits renseignés")} sur le trajet</summary>{#if result.gabarits_trajet.length}<ul class="liste-donnees">{#each result.gabarits_trajet as item}<li class:alerte={item.incompatible}><strong>{item.nom}</strong><span>{item.limites.map(limitLabel).join(" · ")}</span>{#if item.incompatible}<em>Incompatible avec le véhicule</em>{/if}</li>{/each}</ul>{:else}<p>Aucune donnée de gabarit structurée n’a été trouvée sur cet itinéraire.</p>{/if}</details>
        {#if result.obstacles_evites.length}<details><summary>{result.obstacles_evites.length === 1 ? "1 obstacle connu évité" : `${result.obstacles_evites.length} obstacles connus évités`}</summary><ul class="liste-donnees">{#each result.obstacles_evites as item}<li class="alerte"><strong>{item.nom}</strong><span>{obstacleLabel(item)}</span></li>{/each}</ul></details>{/if}
        {#if routeWarnings.length}<details><summary>Points d’attention</summary><ul>{#each routeWarnings as warning}<li>{warning}</li>{/each}</ul></details>{/if}
        <button type="button" on:click={exportGeoJson}>Exporter le tracé GeoJSON</button>
      </section>
    {/if}
  </aside>
  <div bind:this={mapContainer} class="carte" role="region" aria-label="Carte de l’itinéraire poids lourd"></div>
</section>
<section class="avertissement"><strong>Outil d’aide à la décision fondé sur des données ouvertes.</strong> Sans valeur réglementaire : seul l’arrêté du gestionnaire de voirie fait foi. L’absence de restriction connue ne garantit pas la praticabilité.</section>

<style>
  .outil { display: grid; grid-template-columns: minmax(20rem, 27rem) 1fr; min-height: 68vh; border: 1px solid #c9cdca; background: #fff; } .panneau { padding: 1.15rem; overflow-y: auto; border-right: 1px solid #c9cdca; background: #fcfcfa; } form { display: grid; gap: .8rem; } h2 { margin: 0; color: #17252d; font-family: var(--font-display); } .lieux { position: relative; min-height: 2.5rem; } .label-lieu { margin: 0 0 .25rem; color: #4c565c; font-size: .7rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; } .lieux :global(.recherche) { position: static; width: 100%; } .grille, .gps { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; } .aide-gps { margin: -.35rem 0 0; color: #59666c; font-size: .75rem; line-height: 1.4; } label { display: grid; gap: .25rem; color: #4c565c; font-size: .7rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; } input, select { min-height: 2.45rem; padding: .45rem .55rem; border: 1px solid #9aa4a9; background: #fff; color: #17252d; font: 600 .88rem var(--font-mono); } .primaire, .resultat button { min-height: 2.6rem; padding: .55rem .75rem; border: 1px solid #17384b; background: #17384b; color: #fff; font-weight: 800; cursor: pointer; } button:disabled { opacity: .55; cursor: wait; } .erreur { margin: 0; padding: .6rem; border-left: 3px solid #b5533c; background: #f8eae7; color: #78281f; font-size: .8rem; } .statut, .resultat p { margin: 0; color: #59666c; font-size: .8rem; line-height: 1.5; } .resultat { display: grid; gap: .7rem; margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #17384b; } .badge { width: max-content; padding: .25rem .5rem; border-radius: 999px; font-weight: 900; text-transform: uppercase; } .badge.elevee { background: #e4efdf; color: #315226; } .badge.moyenne { background: #faedcd; color: #74530e; } .badge.faible { background: #f8eae7; color: #78281f; } .resultat button { width: max-content; min-height: 2rem; background: #fff; color: #17384b; } details { font-size: .8rem; } .carte { min-height: 68vh; } .avertissement { margin: 1rem 0 2rem; padding: 1rem 1.15rem; border: 1px solid #d5b35b; background: #fff8e5; color: #513e11; font-size: .86rem; line-height: 1.55; } .avertissement strong { display: block; } @media (max-width: 820px) { .outil { grid-template-columns: 1fr; } .panneau { border-right: 0; border-bottom: 1px solid #c9cdca; } .carte { min-height: 58vh; } } @media (max-width: 420px) { .grille, .gps { grid-template-columns: 1fr; } }
  .coordonnees-techniques { padding: .55rem .65rem; border: 1px solid #d5d9d7; background: #f5f6f4; }
  .coordonnees-techniques summary, .resultat summary { color: #17384b; font-weight: 800; cursor: pointer; }
  .coordonnees-techniques .grille { margin-top: .65rem; }
  .resultat-entete { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; }
  .resultat-entete .surtitre { margin-bottom: .15rem; color: #667177; font-size: .67rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .resultat-entete h2 { font-size: 1.55rem; line-height: 1.05; }
  .resultat-entete h2 span { color: #59666c; font-size: 1rem; font-weight: 700; }
  .resultat-entete .badge { max-width: 9rem; margin: 0; text-align: center; font-size: .65rem; line-height: 1.3; }
  .couverture { height: .55rem; overflow: hidden; border-radius: 999px; background: #e1e4e2; }
  .couverture span { display: block; height: 100%; min-width: .2rem; border-radius: inherit; background: #1b6a72; }
  .diagnostic { padding: .65rem .75rem; border-left: 3px solid #d5b35b; background: #fff8e5; color: #513e11 !important; }
  .diagnostic strong { display: block; }
  .indicateurs { display: grid; grid-template-columns: 1fr 1fr; gap: .55rem; }
  .indicateurs article { display: grid; padding: .65rem; border: 1px solid #cfd6d3; background: #fff; }
  .indicateurs article.alerte { border-color: #ddb4aa; background: #fff4f1; }
  .indicateurs strong { color: #17384b; font: 900 1.3rem var(--font-display); }
  .indicateurs span { color: #59666c; font-size: .72rem; }
  .legende { display: flex; flex-wrap: wrap; gap: .45rem .8rem; padding: .55rem 0; border-block: 1px solid #dde1df; color: #59666c; font-size: .7rem; }
  .legende span { display: inline-flex; gap: .3rem; align-items: center; }
  .legende small { flex-basis: 100%; color: #69757a; }
  .repere { width: .7rem; height: .7rem; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #7b8589; background: #1b6a72; }
  .repere.incompatible { background: #b5533c; }
  .trait { width: 1.3rem; border-top: 3px dashed #d5b35b; }
  .resultat details { padding: .65rem .7rem; border: 1px solid #d5d9d7; background: #fff; }
  .resultat details p { margin-top: .55rem; }
  .liste-donnees { display: grid; gap: .45rem; margin: .65rem 0 0; padding: 0; list-style: none; }
  .liste-donnees li { display: grid; gap: .15rem; padding: .5rem .55rem; border-left: 3px solid #1b6a72; background: #f3f8f7; }
  .liste-donnees li.alerte { border-left-color: #b5533c; background: #fff3f0; }
  .liste-donnees li span { color: #59666c; line-height: 1.4; }
  .liste-donnees li em { color: #8a3125; font-style: normal; font-weight: 800; }
  @media (max-width: 420px) { .resultat-entete { display: grid; } .resultat-entete .badge { max-width: none; } }
</style>
