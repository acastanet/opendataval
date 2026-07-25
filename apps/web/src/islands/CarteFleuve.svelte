<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { urlStyle, ajouterControleFondIgn } from "../lib/carte";

  // Stations de l'Hérault, ordonnées amont → aval.
  const STATIONS = [
    { code: "Y200001002", nom: "Valleraugue", lon: 3.653119, lat: 44.078963, vigicrues: false },
    { code: "Y200002701", nom: "St-André-de-Majencoules", lon: 3.680813, lat: 44.014378, vigicrues: true },
    { code: "Y210001001", nom: "Ganges", lon: 3.702161, lat: 43.932108, vigicrues: true },
    { code: "Y210002001", nom: "Laroque", lon: 3.735832, lat: 43.915407, vigicrues: true },
    { code: "Y214002001", nom: "St-Guilhem-le-Désert", lon: 3.599180, lat: 43.749189, vigicrues: true },
    { code: "Y214001002", nom: "Gignac-Aval", lon: 3.534624, lat: 43.651523, vigicrues: true },
    { code: "Y230002001", nom: "Aspiran", lon: 3.470101, lat: 43.570381, vigicrues: true },
    { code: "Y233001002", nom: "Montagnac", lon: 3.444189, lat: 43.476127, vigicrues: true },
    { code: "Y237001002", nom: "Florensac", lon: 3.446707, lat: 43.384050, vigicrues: false },
    { code: "Y237002001", nom: "Agde", lon: 3.478336, lat: 43.326099, vigicrues: true },
  ];

  export let hauteur = "60vh";

  let mapContainer;
  let map;
  let erreurCarte = "";

  function construirePopup(st, rang) {
    const el = document.createElement("div");
    el.className = "popup-fleuve";
    const titre = document.createElement("strong");
    titre.textContent = `${rang}. ${st.nom}`;
    el.appendChild(titre);
    const p = document.createElement("p");
    p.textContent = st.vigicrues ? "Station télésuivie en direct." : "Station non télésuivie en direct.";
    el.appendChild(p);
    if (st.vigicrues) {
      const a = document.createElement("a");
      a.href = `https://www.vigicrues.gouv.fr/fr/station/${st.code}/`;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Voir sur Vigicrues →";
      el.appendChild(a);
    }
    return el;
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      // `territoire` conserve la bascule Plan/Photo historique de cette carte pédagogique.
      style: urlStyle("territoire", { fond: "plan" }),
      bounds: [3.35, 43.28, 3.82, 44.13],
      fitBoundsOptions: { padding: 48 },
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("error", (event) => {
      console.error("carte du fleuve indisponible", event.error);
      erreurCarte = "La représentation cartographique est momentanément indisponible.";
    });

    map.on("load", () => {
      ajouterControleFondIgn(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo" });

      map.addSource("fleuve-ligne-src", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: STATIONS.map((s) => [s.lon, s.lat]) },
          properties: {},
        },
      });
      map.addLayer({
        id: "fleuve-ligne",
        type: "line",
        source: "fleuve-ligne-src",
        paint: { "line-color": "#3e6e82", "line-width": 3, "line-opacity": 0.7 },
      });

      STATIONS.forEach((st, i) => {
        const rang = i + 1;
        const wrap = document.createElement("div");
        wrap.className = "marqueur-station" + (st.vigicrues ? "" : " non-suivie");

        const pastille = document.createElement("span");
        pastille.className = "marqueur-pastille";
        pastille.textContent = String(rang);
        wrap.appendChild(pastille);

        const label = document.createElement("span");
        label.className = "marqueur-label";
        label.textContent = st.nom;
        wrap.appendChild(label);

        const popup = new maplibregl.Popup({ offset: 14, closeButton: true }).setDOMContent(construirePopup(st, rang));
        new maplibregl.Marker({ element: wrap, anchor: "left" })
          .setLngLat([st.lon, st.lat])
          .setPopup(popup)
          .addTo(map);
      });
    });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<div class="carte-fleuve">
  <div class="carte" bind:this={mapContainer} style={`height:${hauteur}`}></div>
  {#if erreurCarte}<p class="erreur">{erreurCarte}</p>{/if}
  <p class="legende-carte">
    <span class="puce amont"></span> amont (Valleraugue, ~350 m)
    <span class="fleche">→</span>
    <span class="puce aval"></span> embouchure (Agde, niveau de la mer). Cliquez une station.
  </p>
</div>

<style>
  .carte-fleuve { margin: 1rem 0; }
  .carte { width: 100%; border-radius: var(--radius, 4px); border: 1px solid var(--border, #6b7280); overflow: hidden; }
  .erreur { margin: 0.5rem 0 0; color: var(--danger, #9f2f2f); font-size: 0.78rem; }
  .legende-carte { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--border, #6b7280); display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem; }
  .puce { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; }
  .puce.amont { background: #3e6e82; }
  .puce.aval { background: #b5533c; }
  .fleche { color: var(--border, #6b7280); }
  :global(.marqueur-station) { display: flex; align-items: center; gap: 0.3rem; cursor: pointer; white-space: nowrap; }
  :global(.marqueur-pastille) { display: inline-flex; align-items: center; justify-content: center; width: 1.25rem; height: 1.25rem; border-radius: 50%; background: #3e6e82; color: #fff; font-size: 0.72rem; font-weight: 700; border: 1.5px solid #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); flex-shrink: 0; }
  :global(.marqueur-station.non-suivie .marqueur-pastille) { background: #6b7280; }
  :global(.marqueur-label) { font-size: 0.72rem; font-weight: 600; color: #2b3238; background: rgba(237, 237, 234, 0.9); padding: 0.05rem 0.3rem; border-radius: 3px; }
  :global(.popup-fleuve) { font-family: var(--font-body, sans-serif); font-size: 0.82rem; line-height: 1.4; }
  :global(.popup-fleuve strong) { display: block; margin-bottom: 0.2rem; }
  :global(.popup-fleuve p) { margin: 0 0 0.3rem; color: #6b7280; }
</style>
