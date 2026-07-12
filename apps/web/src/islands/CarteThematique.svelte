<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import {
    IGN_WMTS,
    COULEUR,
    NOM_COUCHE,
    ajouterCoucheClusterisee,
    enregistrerProtocolePmtiles,
    activerRelief,
  } from "../lib/carte";

  /** Slugs de couches (CATALOGUE_SOURCES) à afficher, chargées depuis /api/couches/:slug/geojson. */
  export let couches = [];
  export let cluster = true;
  export let hauteur = "70vh";
  export let afficherContours = true;
  /** Affiche la carte en relief 3D incliné (source Mapterhorn), caméra initiale inclinée sur le massif. */
  export let relief3d = false;
  /** Emprise initiale [ouest, sud, est, nord] ; par défaut TERRITOIRE.bbox (utile si les couches affichées débordent du territoire, ex. réseau de stations météo). */
  export let bounds = null;

  let mapContainer;
  let map;
  let total = 0;

  function construirePopup(slug, feature) {
    const props = feature.properties ?? {};
    const el = document.createElement("div");
    el.className = "popup-carte-thematique";

    const titre = document.createElement("strong");
    titre.textContent =
      slug === "adresse"
        ? [props.numero, props.rep, props.nom_voie].filter(Boolean).join(" ") || props.nom_ld || NOM_COUCHE.adresse
        : props.nom || NOM_COUCHE[slug] || slug;
    el.appendChild(titre);

    if (slug === "adresse") {
      const sousLigne = [props.code_postal, props.nom_commune].filter(Boolean).join(" ");
      if (sousLigne) {
        const p = document.createElement("p");
        p.textContent = sousLigne;
        el.appendChild(p);
      }
    }
    if (slug === "entreprise") {
      const sousLigne = [props.enseigne, props.naf, props.commune].filter(Boolean).join(" · ");
      if (sousLigne) {
        const p = document.createElement("p");
        p.textContent = sousLigne;
        el.appendChild(p);
      }
    }
    if (slug === "parcelle_agricole") {
      titre.textContent = props.libelleCulture || props.codeCulture || NOM_COUCHE[slug];
      if (props.surfaceHa) {
        const p = document.createElement("p");
        p.textContent = `${Number(props.surfaceHa).toLocaleString("fr-FR")} ha`;
        el.appendChild(p);
      }
    }
    if (slug === "station_meteo") {
      const lignes = [
        props.altitude_m != null ? `${props.altitude_m} m` : null,
        props.reseau === "meteofrance"
          ? `Météo-France${props.pack ? ` (${props.pack})` : ""}`
          : "Infoclimat (station amateur)",
        props.licence,
      ].filter(Boolean);
      if (lignes.length) {
        const p = document.createElement("p");
        p.textContent = lignes.join(" · ");
        el.appendChild(p);
      }
    }
    if (slug === "signe_qualite") {
      titre.textContent = props.commune || NOM_COUCHE[slug];
      // MapLibre GL sérialise les propriétés non scalaires (tableaux/objets) des sources GeoJSON
      // en chaîne JSON : `labels` arrive donc en string, pas en tableau, une fois la couche rendue.
      let labels = props.labels;
      if (typeof labels === "string") {
        try {
          labels = JSON.parse(labels);
        } catch {
          labels = [];
        }
      }
      if (!Array.isArray(labels)) labels = [];
      if (labels.length) {
        const p = document.createElement("p");
        p.textContent = labels.map((l) => `${l.label} (${l.type})`).join(" · ");
        el.appendChild(p);
      }
    }
    return el;
  }

  function ouvrirPopup(slug, feature, lngLat) {
    if (!feature) return;
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(lngLat)
      .setDOMContent(construirePopup(slug, feature))
      .addTo(map);
  }

  function ajouterCoucheSimple(slug, geojson, couleur) {
    const sourceId = `${slug}-src`;
    map.addSource(sourceId, { type: "geojson", data: geojson });

    const estPolygone = (geojson.features?.[0]?.geometry?.type ?? "").includes("Polygon");
    if (estPolygone) {
      const fillId = `${slug}-fill`;
      const lineId = `${slug}-line`;
      map.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": couleur, "fill-opacity": 0.35 },
      });
      map.addLayer({ id: lineId, type: "line", source: sourceId, paint: { "line-color": couleur, "line-width": 1 } });
      map.on("click", fillId, (e) => ouvrirPopup(slug, e.features?.[0], e.lngLat));
      map.on("mouseenter", fillId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", fillId, () => (map.getCanvas().style.cursor = ""));
      return;
    }

    const layerId = `${slug}-layer`;
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 5,
        "circle-color": couleur,
        "circle-stroke-width": 1.2,
        "circle-stroke-color": "#ededea",
      },
    });
    map.on("click", layerId, (e) => ouvrirPopup(slug, e.features?.[0], e.lngLat));
    map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
  }

  onMount(() => {
    if (relief3d) enregistrerProtocolePmtiles(maplibregl.addProtocol);

    map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {},
        layers: [],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      bounds: bounds ?? TERRITOIRE.bbox,
      fitBoundsOptions: { padding: 24 },
      pitch: relief3d ? 55 : 0,
      bearing: relief3d ? -15 : 0,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: relief3d, visualizePitch: relief3d }), "bottom-right");

    map.on("load", async () => {
      map.addSource("basemap-plan-src", {
        type: "raster",
        tiles: [IGN_WMTS("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")],
        tileSize: 256,
        attribution: "© IGN",
      });
      map.addLayer({ id: "basemap-plan", type: "raster", source: "basemap-plan-src" });

      if (relief3d) activerRelief(map, 1.3);

      if (afficherContours) {
        try {
          const res = await fetch("/api/territoire");
          const data = await res.json();
          if (data.commune?.geometry) {
            map.addSource("commune-src", { type: "geojson", data: { type: "Feature", geometry: data.commune.geometry, properties: {} } });
            map.addLayer({ id: "commune-line", type: "line", source: "commune-src", paint: { "line-color": "#2b3238", "line-width": 2.5 } });
          }
          if (data.epci?.communes?.length) {
            map.addSource("epci-src", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: data.epci.communes.map((c) => ({ type: "Feature", geometry: c.geometry, properties: {} })),
              },
            });
            map.addLayer({ id: "epci-line", type: "line", source: "epci-src", paint: { "line-color": "#9a9b93", "line-width": 1 } });
          }
        } catch (err) {
          console.error("territoire indisponible", err);
        }
      }

      for (const slug of couches) {
        try {
          const res = await fetch(`/api/couches/${slug}/geojson`);
          const geojson = await res.json();
          total += geojson.features?.length ?? 0;
          const couleur = COULEUR[slug] ?? "#9a9b93";
          const estPoint = geojson.features?.[0]?.geometry?.type === "Point";
          if (cluster && estPoint) {
            ajouterCoucheClusterisee(map, slug, geojson, couleur, true);
            const pointId = `${slug}-point`;
            map.on("click", pointId, (e) => ouvrirPopup(slug, e.features?.[0], e.lngLat));
          } else {
            ajouterCoucheSimple(slug, geojson, couleur);
          }
        } catch (err) {
          console.error(`couche ${slug} indisponible`, err);
        }
      }
    });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<div class="carte-thematique">
  <div class="carte" bind:this={mapContainer} style={`height:${hauteur}`}></div>
  {#if total > 0}
    <p class="compteur">{total.toLocaleString("fr-FR")} objets affichés</p>
  {/if}
</div>

<style>
  .carte-thematique {
    margin-top: 1rem;
  }

  .carte {
    width: 100%;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .compteur {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: var(--border);
  }

  :global(.popup-carte-thematique) {
    font-family: var(--font-body);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  :global(.popup-carte-thematique strong) {
    display: block;
    font-family: var(--font-display);
    font-size: 0.95rem;
    margin-bottom: 0.2rem;
  }

  :global(.popup-carte-thematique p) {
    margin: 0;
    color: var(--border);
  }
</style>
