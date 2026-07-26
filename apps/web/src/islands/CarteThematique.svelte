<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import { urlStyle, ajouterControleFondIgn, ajouterCoucheCarte } from "../lib/carte";
  import { COUCHES_PAR_SLUG, titrePopup, lignesPopup } from "@opendata-vda/shared/catalogue";

  /** Slugs de couches (COUCHES) à afficher, chargées depuis /api/couches/:slug/geojson. */
  export let couches = [];
  /** Override du clustering ; `null` = valeur du descripteur (`couche.cluster`). */
  export let cluster = null;
  export let hauteur = "70vh";
  export let afficherContours = true;
  /** Affiche la carte en relief 3D incliné, caméra initiale inclinée sur le massif. */
  export let relief3d = false;
  /** Emprise initiale [ouest, sud, est, nord] ; par défaut TERRITOIRE.bbox. */
  export let bounds = null;

  let mapContainer;
  let map;
  let total = 0;
  let erreurCarte = "";

  function construirePopup(couche, feature) {
    const props = feature.properties ?? {};
    const el = document.createElement("div");
    el.className = "popup-carte-thematique";

    const titre = document.createElement("strong");
    titre.textContent = titrePopup(couche, props);
    el.appendChild(titre);

    for (const { libelle, valeur } of lignesPopup(couche, props)) {
      const p = document.createElement("p");
      p.textContent = libelle ? `${libelle} : ${valeur}` : valeur;
      el.appendChild(p);
    }
    return el;
  }

  function ouvrirPopup(couche, feature, lngLat) {
    if (!feature) return;
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(lngLat)
      .setDOMContent(construirePopup(couche, feature))
      .addTo(map);
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: urlStyle(relief3d ? "relief" : "territoire", {
        fond: "plan",
        terrain: relief3d,
        relief: relief3d,
        exageration: 1.3,
      }),
      bounds: bounds ?? TERRITOIRE.bbox,
      fitBoundsOptions: { padding: 24 },
      pitch: relief3d ? 55 : 0,
      bearing: relief3d ? -15 : 0,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: relief3d, visualizePitch: relief3d }), "bottom-right");
    map.on("error", (event) => {
      console.error("carte thématique indisponible", event.error);
      erreurCarte = "La représentation cartographique est momentanément indisponible.";
    });

    map.on("load", async () => {
      ajouterControleFondIgn(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo" });

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

      // Polygones d'abord pour qu'ils restent visuellement sous les points.
      const couchesResolues = couches
        .map((slug) => COUCHES_PAR_SLUG.get(slug))
        .filter((c) => c)
        .sort((a, b) => (a.geometrie === b.geometrie ? 0 : a.geometrie === "polygone" ? -1 : 1));

      for (const couche of couchesResolues) {
        try {
          const res = await fetch(`/api/couches/${couche.slug}/geojson`);
          const geojson = await res.json();
          total += geojson.features?.length ?? 0;
          const clusterEffectif = (cluster ?? couche.cluster ?? false) && couche.geometrie === "point";
          ajouterCoucheCarte(map, { ...couche, cluster: clusterEffectif }, geojson, true, (feature, lngLat) =>
            ouvrirPopup(couche, feature, lngLat),
          );
        } catch (err) {
          console.error(`couche ${couche.slug} indisponible`, err);
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
  {#if erreurCarte}<p class="erreur">{erreurCarte}</p>{/if}
  {#if total > 0}
    <p class="compteur">{total.toLocaleString("fr-FR")} objets affichés</p>
  {/if}
</div>

<style>
  .carte-thematique { margin-top: 1rem; }
  .carte {
    width: 100%;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .compteur, .erreur { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--border); }
  .erreur { color: var(--danger, #9f2f2f); }
  :global(.popup-carte-thematique) { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.4; }
  :global(.popup-carte-thematique strong) { display: block; margin-bottom: 0.35rem; }
</style>
