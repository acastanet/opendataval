<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { ajouterControleFondIgn, urlStyle } from "../lib/carte";

  interface GeoJsonGeometry {
    type: string;
    coordinates: unknown;
  }
  interface GeoJsonFeature {
    type: "Feature";
    id?: string | number;
    geometry: GeoJsonGeometry;
    properties: Record<string, unknown>;
  }
  interface GeoJsonCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
  }
  interface OldResponse {
    status: "indicatif" | "provisoire";
    applicable: boolean | null;
    calculation: {
      method: string;
      basedOnBuilding: boolean;
      includesPrivateAccess: boolean;
      includesUrbanParcelPortion: boolean;
      surfaceM2: number;
      generatedAt: string;
    };
    applicability: {
      status: string;
      applicable: boolean | null;
      zones: number[];
      objects?: Array<{ dateArrete?: string | null; referenceUrl?: string | null }>;
    };
    parcel: {
      status: string;
      data: null | {
        id?: string;
        section?: string;
        numero?: string;
        commune?: string;
        contenanceM2?: number;
      };
    };
    urbanism: {
      status: string;
      zones: Array<{
        type: string | null;
        label: string | null;
        validAt: string | null;
        urban: boolean;
      }>;
    };
    building: {
      status: string;
      selected: null | { id?: string; nature?: string; usage?: string };
    };
    warnings: string[];
    geojson: GeoJsonCollection;
  }

  const DEFAULT_LON = 3.68302778;
  const DEFAULT_LAT = 44.06455556;
  const EMPTY: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  const SOURCE_ID = "old-resultat";

  let lon = String(DEFAULT_LON);
  let lat = String(DEFAULT_LAT);
  let distanceM = "50";
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let pointMarker: maplibregl.Marker | undefined;
  let loading = false;
  let errorMessage = "";
  let result: OldResponse | null = null;
  let mapReady = false;
  let statusMessage = "Cliquez sur la carte ou utilisez les coordonnées proposées.";
  let showPerimeter = true;
  let showBuilding = true;
  let showParcel = true;

  $: parsedLon = Number(lon.replace(",", "."));
  $: parsedLat = Number(lat.replace(",", "."));
  $: parsedDistance = Number(distanceM.replace(",", "."));
  $: validInput = Number.isFinite(parsedLon) && parsedLon >= -180 && parsedLon <= 180
    && Number.isFinite(parsedLat) && parsedLat >= -90 && parsedLat <= 90
    && Number.isFinite(parsedDistance) && parsedDistance >= 1 && parsedDistance <= 200;
  $: apiUrl = validInput
    ? `/api/v2/old/perimetre?lon=${encodeURIComponent(parsedLon)}&lat=${encodeURIComponent(parsedLat)}&distance_m=${encodeURIComponent(parsedDistance)}`
    : "";

  function layerVisibility(ids: string[], visible: boolean): void {
    if (!map) return;
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }

  function applyLayerVisibility(): void {
    layerVisibility(["old-perimetre-fill", "old-perimetre-line"], showPerimeter);
    layerVisibility(["old-batiment-fill", "old-batiment-line"], showBuilding);
    layerVisibility(["old-parcelle-line"], showParcel);
  }

  function placeMarker(longitude: number, latitude: number): void {
    if (!map) return;
    pointMarker?.remove();
    pointMarker = new maplibregl.Marker({ color: "#b5533c" })
      .setLngLat([longitude, latitude])
      .addTo(map);
  }

  function collectPositions(value: unknown, positions: Array<[number, number]>): void {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      positions.push([value[0], value[1]]);
      return;
    }
    value.forEach((item) => collectPositions(item, positions));
  }

  function displayGeoJson(data: GeoJsonCollection): void {
    if (!mapReady || !map) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as never);
    applyLayerVisibility();
    const perimeter = data.features.find((feature) => feature.properties.layer === "old-perimetre-calcule");
    const positions: Array<[number, number]> = [];
    collectPositions(perimeter?.geometry.coordinates, positions);
    if (!positions.length) return;
    const bounds = positions.reduce(
      (current, position) => current.extend(position),
      new maplibregl.LngLatBounds(positions[0], positions[0]),
    );
    map.fitBounds(bounds, { padding: 52, maxZoom: 18, duration: 700 });
  }

  async function analyze(): Promise<void> {
    if (!validInput || loading) return;
    loading = true;
    errorMessage = "";
    statusMessage = "Interrogation du bâtiment, du cadastre, du PLU et du zonage OLD…";
    placeMarker(parsedLon, parsedLat);
    try {
      const response = await fetch(apiUrl, { headers: { accept: "application/json" } });
      const payload = await response.json() as OldResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? `Erreur HTTP ${response.status}`);
      result = payload;
      displayGeoJson(payload.geojson);
      statusMessage = payload.calculation.basedOnBuilding
        ? "Périmètre calculé depuis l’emprise du bâtiment."
        : "Cercle provisoire calculé depuis le point.";
    } catch (error) {
      result = null;
      displayGeoJson(EMPTY);
      errorMessage = error instanceof Error ? error.message : "Le calcul est indisponible.";
      statusMessage = "Le périmètre n’a pas pu être calculé.";
    } finally {
      loading = false;
    }
  }

  function geolocate(): void {
    if (!navigator.geolocation) {
      errorMessage = "La géolocalisation n’est pas disponible sur cet appareil.";
      return;
    }
    statusMessage = "Recherche de votre position…";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        lon = position.coords.longitude.toFixed(8);
        lat = position.coords.latitude.toFixed(8);
        map?.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 18 });
        void analyze();
      },
      () => {
        errorMessage = "La position n’a pas pu être obtenue.";
        statusMessage = "Utilisez la carte ou saisissez les coordonnées.";
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  function download(filename: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportGeoJson(): void {
    if (!result) return;
    download(
      "perimetre-old.geojson",
      JSON.stringify(result.geojson, null, 2),
      "application/geo+json;charset=utf-8",
    );
  }

  function xml(value: unknown): string {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function ringKml(ring: unknown): string {
    if (!Array.isArray(ring)) return "";
    return ring
      .filter((position) => Array.isArray(position) && position.length >= 2)
      .map((position) => `${position[0]},${position[1]},0`)
      .join(" ");
  }

  function polygonKml(polygon: unknown): string {
    if (!Array.isArray(polygon) || !polygon[0]) return "";
    const holes = polygon.slice(1).map((ring) =>
      `<innerBoundaryIs><LinearRing><coordinates>${ringKml(ring)}</coordinates></LinearRing></innerBoundaryIs>`,
    ).join("");
    return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ringKml(polygon[0])}</coordinates></LinearRing></outerBoundaryIs>${holes}</Polygon>`;
  }

  function exportKml(): void {
    if (!result) return;
    const placemarks = result.geojson.features.flatMap((feature) => {
      const layer = feature.properties.layer;
      if (feature.geometry.type === "Polygon") {
        return [`<Placemark><name>${xml(layer)}</name>${polygonKml(feature.geometry.coordinates)}</Placemark>`];
      }
      if (feature.geometry.type === "MultiPolygon" && Array.isArray(feature.geometry.coordinates)) {
        return [`<Placemark><name>${xml(layer)}</name><MultiGeometry>${feature.geometry.coordinates.map(polygonKml).join("")}</MultiGeometry></Placemark>`];
      }
      return [];
    }).join("");
    download(
      "perimetre-old.kml",
      `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Périmètre OLD</name>${placemarks}</Document></kml>`,
      "application/vnd.google-earth.kml+xml;charset=utf-8",
    );
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: urlStyle("territoire", { fond: "photo" }),
      center: [DEFAULT_LON, DEFAULT_LAT],
      zoom: 17,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("click", (event) => {
      lon = event.lngLat.lng.toFixed(8);
      lat = event.lngLat.lat.toFixed(8);
      placeMarker(event.lngLat.lng, event.lngLat.lat);
      statusMessage = "Point sélectionné. Lancez l’analyse.";
    });
    map.on("load", () => {
      mapReady = true;
      ajouterControleFondIgn(map!, {
        planLayerId: "basemap-plan",
        photoLayerId: "basemap-photo",
        autresLayerIds: ["basemap-satellite"],
        actif: "photo",
      });
      map!.addSource(SOURCE_ID, { type: "geojson", data: EMPTY as never });
      map!.addLayer({
        id: "old-perimetre-fill",
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["get", "layer"], "old-perimetre-calcule"],
        paint: { "fill-color": "#d94835", "fill-opacity": 0.22 },
      });
      map!.addLayer({
        id: "old-perimetre-line",
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "layer"], "old-perimetre-calcule"],
        paint: { "line-color": "#9f1d14", "line-width": 3, "line-dasharray": [2, 1.5] },
      });
      map!.addLayer({
        id: "old-parcelle-line",
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "layer"], "old-parcelle"],
        paint: { "line-color": "#f4c542", "line-width": 3 },
      });
      map!.addLayer({
        id: "old-batiment-fill",
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["get", "layer"], "old-batiment-source"],
        paint: { "fill-color": "#17384b", "fill-opacity": 0.72 },
      });
      map!.addLayer({
        id: "old-batiment-line",
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "layer"], "old-batiment-source"],
        paint: { "line-color": "#071a24", "line-width": 2 },
      });
      placeMarker(DEFAULT_LON, DEFAULT_LAT);
      if (result) displayGeoJson(result.geojson);
    });
    map.on("error", () => {
      statusMessage = "Une ressource cartographique n’a pas pu être chargée.";
    });
    void analyze();
  });

  onDestroy(() => {
    pointMarker?.remove();
    map?.remove();
  });
</script>

<section class="outil" aria-label="Calcul du périmètre OLD">
  <aside class="panneau">
    <form on:submit|preventDefault={analyze}>
      <div class="coordonnees">
        <label>
          <span>Longitude</span>
          <input bind:value={lon} inputmode="decimal" autocomplete="off" />
        </label>
        <label>
          <span>Latitude</span>
          <input bind:value={lat} inputmode="decimal" autocomplete="off" />
        </label>
      </div>
      <label>
        <span>Profondeur du tampon</span>
        <div class="unite"><input bind:value={distanceM} inputmode="decimal" autocomplete="off" /><span>m</span></div>
      </label>
      <div class="actions">
        <button class="primaire" type="submit" disabled={!validInput || loading}>
          {loading ? "Calcul en cours…" : "Calculer le périmètre"}
        </button>
        <button type="button" on:click={geolocate}>Me localiser</button>
      </div>
      {#if !validInput}<p class="erreur">Vérifiez les coordonnées et la distance (1 à 200 m).</p>{/if}
      {#if errorMessage}<p class="erreur" role="alert">{errorMessage}</p>{/if}
      <p class="statut" role="status" aria-live="polite">{statusMessage}</p>
    </form>

    {#if result}
      <section class="resultat" aria-labelledby="old-resultat-titre">
        <p class:oui={result.applicable === true} class:non={result.applicable === false} class:inconnu={result.applicable === null} class="badge">
          {result.applicable === true ? "OLD applicables" : result.applicable === false ? "Hors zonage OLD identifié" : "Applicabilité non vérifiée"}
        </p>
        <h2 id="old-resultat-titre">{result.calculation.surfaceM2.toLocaleString("fr-FR")} m²</h2>
        <p class="precision">Surface {result.status} · tampon de {parsedDistance.toLocaleString("fr-FR")} m</p>

        <dl>
          <div><dt>Base du calcul</dt><dd>{result.calculation.basedOnBuilding ? "Emprise du bâtiment" : "Point provisoire"}</dd></div>
          <div><dt>Bâtiment</dt><dd>{result.building.selected?.usage ?? result.building.status}</dd></div>
          <div><dt>Parcelle</dt><dd>{result.parcel.data?.id ?? result.parcel.status}</dd></div>
          <div><dt>Zone d’urbanisme</dt><dd>{result.urbanism.zones.map((zone) => zone.type).filter(Boolean).join(", ") || result.urbanism.status}</dd></div>
          <div><dt>Zonage OLD</dt><dd>{result.applicability.zones.length ? `zone${result.applicability.zones.length > 1 ? "s" : ""} ${result.applicability.zones.join(" + ")}` : result.applicability.status}</dd></div>
          <div><dt>Accès privé</dt><dd>Non inclus</dd></div>
        </dl>

        <fieldset>
          <legend>Couches affichées</legend>
          <label><input type="checkbox" bind:checked={showPerimeter} on:change={applyLayerVisibility} /> <i class="legende perimetre"></i>Périmètre calculé</label>
          <label><input type="checkbox" bind:checked={showBuilding} on:change={applyLayerVisibility} /> <i class="legende batiment"></i>Bâtiment source</label>
          <label><input type="checkbox" bind:checked={showParcel} on:change={applyLayerVisibility} /> <i class="legende parcelle"></i>Parcelle cadastrale</label>
        </fieldset>

        <div class="exports">
          <button type="button" on:click={exportGeoJson}>GeoJSON</button>
          <button type="button" on:click={exportKml}>KML</button>
          <button type="button" on:click={() => window.print()}>Imprimer / PDF</button>
          <a href={apiUrl} target="_blank" rel="noreferrer">Réponse API</a>
        </div>

        <details>
          <summary>Points à vérifier ({result.warnings.length})</summary>
          <ul>{#each result.warnings as warning}<li>{warning}</li>{/each}</ul>
        </details>
      </section>
    {/if}
  </aside>

  <div class="carte-wrap">
    <div bind:this={mapContainer} class="carte" role="region" aria-label="Carte du périmètre indicatif de débroussaillement"></div>
    <p class="aide-carte">Cliquez sur le bâtiment à analyser · vue aérienne IGN</p>
  </div>
</section>

<section class="avertissement">
  <strong>Outil d’aide, pas bornage réglementaire.</strong>
  Le calcul dépend des données IGN, cadastrales et d’urbanisme disponibles. Vérifiez l’arrêté préfectoral, les dépendances, les installations, la voie d’accès et matérialisez les distances sur le terrain. Une autorité compétente ou un géomètre peut être nécessaire pour trancher une limite.
</section>

<style>
  .outil { display: grid; grid-template-columns: minmax(18rem, 25rem) 1fr; min-height: 68vh; border: 1px solid #c9cdca; background: #fff; }
  .panneau { z-index: 2; padding: 1.15rem; overflow-y: auto; border-right: 1px solid #c9cdca; background: #fcfcfa; }
  form { display: grid; gap: 0.85rem; }
  label > span { display: block; margin-bottom: 0.3rem; color: #4c565c; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
  input { width: 100%; min-height: 2.65rem; padding: 0.6rem 0.7rem; border: 1px solid #9aa4a9; border-radius: 2px; background: #fff; color: #17252d; font: 600 0.92rem var(--font-mono); }
  input:focus { outline: 3px solid rgba(62, 110, 130, 0.23); border-color: #3e6e82; }
  .coordonnees { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
  .unite { display: grid; grid-template-columns: 1fr 2.5rem; align-items: center; }
  .unite span { display: grid; place-items: center; align-self: stretch; border: 1px solid #9aa4a9; border-left: 0; background: #edf0ee; font-weight: 800; }
  .actions, .exports { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button, .exports a { min-height: 2.5rem; padding: 0.55rem 0.75rem; border: 1px solid #17384b; border-radius: 2px; background: #fff; color: #17384b; font-weight: 800; cursor: pointer; text-decoration: none; }
  button:hover, .exports a:hover { background: #e9eff1; }
  button.primaire { flex: 1; background: #17384b; color: #fff; }
  button.primaire:hover { background: #0e2938; }
  button:disabled { cursor: wait; opacity: 0.55; }
  .statut, .precision { margin: 0; color: #59666c; font-size: 0.78rem; line-height: 1.45; }
  .erreur { margin: 0; padding: 0.65rem; border-left: 3px solid #b5533c; background: #f8eae7; color: #78281f; font-size: 0.82rem; }
  .resultat { margin-top: 1.1rem; padding-top: 1rem; border-top: 2px solid #17384b; }
  .resultat h2 { margin: 0.45rem 0 0.1rem; color: #17252d; font-family: var(--font-display); font-size: 2rem; }
  .badge { display: inline-flex; margin: 0; padding: 0.3rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 900; letter-spacing: 0.03em; text-transform: uppercase; }
  .badge.oui { background: #e4efdf; color: #315226; }
  .badge.non { background: #ecefed; color: #475158; }
  .badge.inconnu { background: #faedcd; color: #74530e; }
  dl { margin: 1rem 0; border-top: 1px solid #d8dcda; }
  dl div { display: grid; grid-template-columns: 7.5rem 1fr; gap: 0.5rem; padding: 0.48rem 0; border-bottom: 1px solid #d8dcda; font-size: 0.78rem; }
  dt { color: #657178; } dd { margin: 0; overflow-wrap: anywhere; font-weight: 700; }
  fieldset { display: grid; gap: 0.45rem; margin: 0.8rem 0; padding: 0.75rem; border: 1px solid #c9cdca; }
  legend { padding: 0 0.35rem; color: #59666c; font-size: 0.7rem; font-weight: 900; text-transform: uppercase; }
  fieldset label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 700; }
  fieldset input { width: auto; min-height: auto; }
  .legende { width: 1.25rem; height: 0.7rem; display: inline-block; }
  .legende.perimetre { border: 2px dashed #9f1d14; background: rgba(217,72,53,.22); }
  .legende.batiment { background: #17384b; }
  .legende.parcelle { border-top: 3px solid #e8b900; }
  .exports { margin-top: 0.75rem; }
  .exports button, .exports a { min-height: 2rem; padding: 0.4rem 0.55rem; font-size: 0.72rem; }
  details { margin-top: 0.85rem; font-size: 0.78rem; }
  summary { cursor: pointer; font-weight: 800; }
  ul { padding-left: 1.2rem; line-height: 1.5; }
  .carte-wrap { position: relative; min-height: 68vh; }
  .carte { position: absolute; inset: 0; }
  .aide-carte { position: absolute; z-index: 2; left: 50%; bottom: 0.6rem; transform: translateX(-50%); width: max-content; max-width: calc(100% - 2rem); margin: 0; padding: 0.4rem 0.7rem; border: 1px solid rgba(23,56,75,.25); border-radius: 2px; background: rgba(255,255,255,.92); color: #32454f; font-size: 0.72rem; font-weight: 800; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
  .avertissement { margin: 1rem 0 2rem; padding: 1rem 1.15rem; border: 1px solid #d5b35b; background: #fff8e5; color: #513e11; font-size: 0.86rem; line-height: 1.55; }
  .avertissement strong { display: block; margin-bottom: 0.25rem; }
  @media (max-width: 820px) {
    .outil { grid-template-columns: 1fr; }
    .panneau { border-right: 0; border-bottom: 1px solid #c9cdca; }
    .carte-wrap { min-height: 62vh; }
  }
  @media (max-width: 420px) { .coordonnees { grid-template-columns: 1fr; } }
  @media print {
    .actions, .exports, fieldset, .aide-carte { display: none; }
    .outil { grid-template-columns: 18rem 1fr; min-height: 18cm; }
    .carte-wrap { min-height: 18cm; }
    .panneau { overflow: visible; }
  }
</style>
