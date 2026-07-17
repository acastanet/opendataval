<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { IGN_WMTS, ajouterControleFondIgn } from "../lib/carte";

  const STATIONS = [
    { code: "Y200001001", nom: "Mont Aigoual", lon: 3.5814, lat: 44.1216, alt: 1567 },
    { code: "Y200001002", nom: "Valleraugue", lon: 3.653119, lat: 44.078963, alt: 350 },
    { code: "Y200002701", nom: "St-André-de-Majencoules", lon: 3.680813, lat: 44.014378, alt: 230 },
    { code: "Y210001001", nom: "Ganges", lon: 3.702161, lat: 43.932108, alt: 170 },
    { code: "Y210002001", nom: "Laroque", lon: 3.735832, lat: 43.915407, alt: 105 },
    { code: "Y214002001", nom: "St-Guilhem", lon: 3.599180, lat: 43.749189, alt: 75 },
    { code: "Y214001002", nom: "Gignac-Aval", lon: 3.534624, lat: 43.651523, alt: 45 },
    { code: "Y230002001", nom: "Aspiran", lon: 3.470101, lat: 43.570381, alt: 40 },
    { code: "Y233001002", nom: "Montagnac", lon: 3.444189, lat: 43.476127, alt: 18 },
    { code: "Y237001002", nom: "Florensac", lon: 3.446707, lat: 43.384050, alt: 10 },
    { code: "Y237002001", nom: "Agde", lon: 3.478336, lat: 43.326099, alt: 3 },
  ];

  export let hauteur = "100vh";

  let mapContainer;
  let map;
  let mode = 1;
  let fondCarte = "plan";
  let labels3D = [];
  let popupOuvert = false;
  let imageSelectionnee = null;
  let chargement = true;
  let hoverSlider = false;
  const labels = ["Carte", "Carte + 3D", "3D seul"];

  const BOUNDS_AIGOUAL_MER = [
    [3.35, 43.28],
    [3.82, 44.13],
  ];

  function recentrerAxeFleuve() {
    if (!map) return;
    map.fitBounds(BOUNDS_AIGOUAL_MER, {
      padding: 48,
      bearing: 90,
      pitch: 55,
      duration: 1500,
    });
  }

  function orienterNord() {
    if (!map) return;
    map.easeTo({ bearing: 0, duration: 1000 });
  }

  function appliquerMode() {
    if (!map) return;
    const terrain = map.getLayer("hillshade-3d");
    const coucheCarte = map.getLayer("basemap-plan");
    const couchePhoto = map.getLayer("basemap-photo");
    const visibiliteFond = mode === 2 ? "none" : "visible";
    const afficherFond = () => {
      if (coucheCarte) map.setLayoutProperty("basemap-plan", "visibility", fondCarte === "plan" ? visibiliteFond : "none");
      if (couchePhoto) map.setLayoutProperty("basemap-photo", "visibility", fondCarte === "photo" ? visibiliteFond : "none");
    };

    if (mode === 0) {
      map.setTerrain(null);
      if (terrain) map.setLayoutProperty("hillshade-3d", "visibility", "none");
      afficherFond();
    } else if (mode === 1) {
      map.setTerrain({ source: "terrainSource", exaggeration: 1.8 });
      if (terrain) map.setLayoutProperty("hillshade-3d", "visibility", "visible");
      afficherFond();
    } else if (mode === 2) {
      map.setTerrain({ source: "terrainSource", exaggeration: 1.8 });
      if (terrain) map.setLayoutProperty("hillshade-3d", "visibility", "visible");
      afficherFond();
    }
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      hash: "map",
      maxPitch: 80,
      scrollZoom: true,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          "basemap-plan-src": {
            type: "raster",
            tiles: [IGN_WMTS("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")],
            tileSize: 256,
            attribution: "© IGN",
          },
          "terrainSource": {
            type: "raster-dem",
            url: "https://tiles.mapterhorn.com/tilejson.json",
          },
          "hillshade-3d-src": {
            type: "raster-dem",
            url: "https://tiles.mapterhorn.com/tilejson.json",
          },
        },
        layers: [
          { id: "basemap-plan", type: "raster", source: "basemap-plan-src" },
          {
            id: "hillshade-3d",
            type: "hillshade",
            source: "hillshade-3d-src",
            paint: { "hillshade-shadow-color": "#2b4a3f" },
          },
        ],
        terrain: {
          source: "terrainSource",
          exaggeration: 1.8,
        },
        sky: {},
      },
    });

    map.on("load", () => {
      chargement = false;
      map.addSource("basemap-photo-src", { type: "raster", tiles: [IGN_WMTS("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")], tileSize: 256, attribution: "© IGN" });
      map.addLayer({ id: "basemap-photo", type: "raster", source: "basemap-photo-src", layout: { visibility: "none" } }, "hillshade-3d");
      ajouterControleFondIgn(map, {
        planLayerId: "basemap-plan",
        photoLayerId: "basemap-photo",
        onChange: (fond) => { fondCarte = fond; appliquerMode(); },
      });

      map.fitBounds(BOUNDS_AIGOUAL_MER, {
        padding: 48,
        bearing: 90,
        pitch: 55,
        duration: 0,
      });

      labels3D = [];
      STATIONS.forEach((st, i) => {
        const rang = i + 1;
        const wrap = document.createElement("div");
        wrap.className = "marqueur-station-3d";

        const pastille = document.createElement("span");
        pastille.className = "marqueur-pastille-3d";
        pastille.textContent = String(rang);
        wrap.appendChild(pastille);

        const label = document.createElement("span");
        label.className = "marqueur-label-3d";
        label.textContent = st.nom;
        label.style.transform = "rotate(-45deg)";
        label.style.transformOrigin = "left center";
        wrap.appendChild(label);

        labels3D.push(label);

        const marker = new maplibregl.Marker({ element: wrap, anchor: "left" })
          .setLngLat([st.lon, st.lat])
          .addTo(map);

        if (st.code === "Y200001001") {
          wrap.style.cursor = "pointer";
          wrap.addEventListener("click", () => {
            popupOuvert = true;
            imageSelectionnee = null;
          });
        }
      });

      function adapterLabels() {
        if (!map) return;
        const zoom = map.getZoom();
        const taille = Math.max(0.36, Math.min(0.68, 0.624 / Math.pow(1.15, zoom - 10)));
        labels3D.forEach((el) => {
          if (el) el.style.fontSize = `${taille}rem`;
        });
      }

      map.on("zoom", adapterLabels);
      adapterLabels();
    });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<div class="carte-3d" style={`height:${hauteur}`}>
  <div class="carte" bind:this={mapContainer}></div>

  {#if chargement}
    <div class="chargement-overlay">
      <div class="riviere">
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" class="riviere-svg">
          <defs>
            <linearGradient id="eau" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#0f4c75" />
              <stop offset="50%" stop-color="#3282b8" />
              <stop offset="100%" stop-color="#0f4c75" />
            </linearGradient>
          </defs>
          <path class="vague vague-1" d="M0,60 C50,40 100,80 150,60 C200,40 250,80 300,60 C350,40 400,80 400,60 L400,120 L0,120 Z" fill="url(#eau)" opacity="0.9" />
          <path class="vague vague-2" d="M0,70 C50,50 100,90 150,70 C200,50 250,90 300,70 C350,50 400,90 400,70 L400,120 L0,120 Z" fill="url(#eau)" opacity="0.7" />
          <path class="vague vague-3" d="M0,80 C50,60 100,100 150,80 C200,60 250,100 300,80 C350,60 400,100 400,80 L400,120 L0,120 Z" fill="url(#eau)" opacity="0.5" />
        </svg>
        <p class="chargement-texte">Chargement de la carte...</p>
      </div>
    </div>
  {:else}
    <div class="controles">
      <button class="btn-controle" on:click={recentrerAxeFleuve} title="Recentrer sur l'axe Aigoual → Agde">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
      </button>

      <button class="btn-controle" on:click={orienterNord} title="Orienter vers le nord">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
        </svg>
      </button>

      <div class="slider-controle">
        <input
          type="range"
          min="0"
          max="2"
          step="1"
          bind:value={mode}
          on:change={appliquerMode}
          on:mouseenter={() => hoverSlider = true}
          on:mouseleave={() => hoverSlider = false}
          class="slider"
        />
        <div class="slider-tooltip" class:visible={hoverSlider}>
          {labels[mode]}
        </div>
      </div>
    </div>

    {#if popupOuvert}
      <div class="popup-overlay" on:click={() => popupOuvert = false}>
        <div class="popup" on:click={(e) => e.stopPropagation()}>
          <div class="popup-header">
            <h3>Mont Aigoual</h3>
            <button class="popup-close" on:click={() => popupOuvert = false}>×</button>
          </div>

          {#if !imageSelectionnee}
            <div class="popup-options">
              <button class="popup-option" on:click={() => imageSelectionnee = "/image/episode.png"}>
                <span class="option-label">Épisode</span>
                <span class="option-desc">Afficher l'infographie épisode</span>
              </button>
              <button class="popup-option" on:click={() => imageSelectionnee = "/image/partage.png"}>
                <span class="option-label">Partage</span>
                <span class="option-desc">Afficher l'infographie partage</span>
              </button>
            </div>
          {:else}
            <div class="popup-image-container">
              <img src={imageSelectionnee} alt="Infographie Mont Aigoual" class="popup-image" />
              <button class="popup-back" on:click={() => imageSelectionnee = null}>← Retour</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .carte-3d {
    position: relative;
    width: 100%;
    height: var(--carte-hauteur, 100vh);
    padding: 2rem;
    box-sizing: border-box;
  }

  .carte {
    position: absolute;
    inset: 2rem;
    border-radius: var(--radius, 4px);
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  }

  .chargement-overlay {
    position: absolute;
    inset: 2rem;
    border-radius: var(--radius, 4px);
    overflow: hidden;
    background: linear-gradient(180deg, #0b1d2e 0%, #1a3a5c 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
  }

  .riviere {
    width: 100%;
    max-width: 600px;
    position: relative;
  }

  .riviere-svg {
    width: 100%;
    height: 120px;
    display: block;
  }

  .vague {
    animation: couler 3s ease-in-out infinite;
  }

  .vague-1 {
    animation-delay: 0s;
  }

  .vague-2 {
    animation-delay: 0.4s;
  }

  .vague-3 {
    animation-delay: 0.8s;
  }

  @keyframes couler {
    0%, 100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(-20px);
    }
  }

  .chargement-texte {
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
    font-family: var(--font-body);
    font-size: 0.95rem;
    margin-top: 1rem;
    letter-spacing: 0.05em;
    animation: pulsar 2s ease-in-out infinite;
  }

  @keyframes pulsar {
    0%, 100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }

  .controles {
    position: absolute;
    top: 1.2rem;
    right: 1.2rem;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .btn-controle {
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 1px solid rgba(255,255,255,0.5);
    border-radius: 0.5rem;
    background: rgba(0,0,0,0.45);
    color: #fff;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: background 150ms;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-controle:hover {
    background: rgba(0,0,0,0.65);
  }

  .slider-controle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.45);
    border: 1px solid rgba(255,255,255,0.5);
    border-radius: 0.5rem;
    padding: 0.5rem;
    backdrop-filter: blur(4px);
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100px;
    height: 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.25);
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid rgba(0,0,0,0.4);
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid rgba(0,0,0,0.4);
    cursor: pointer;
  }

  .slider-tooltip {
    position: absolute;
    bottom: -1.8rem;
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 150ms, transform 150ms;
  }

  .slider-tooltip.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  :global(.marqueur-station-3d) {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    white-space: nowrap;
  }

  :global(.marqueur-pastille-3d) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: #3e6e82;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    flex-shrink: 0;
  }

  :global(.marqueur-label-3d) {
    font-size: 0.78rem;
    font-weight: 600;
    color: #1a2633;
    background: rgba(255, 255, 255, 0.92);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transform: rotate(-45deg);
    transform-origin: left center;
  }

  .popup-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .popup {
    background: var(--bg);
    color: var(--fg);
    border-radius: var(--radius, 4px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .popup-header h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }

  .popup-close {
    background: none;
    border: none;
    color: var(--fg);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
  }

  .popup-close:hover {
    background: var(--encadre-bg);
  }

  .popup-options {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .popup-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius, 4px);
    background: var(--encadre-bg);
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    transition: background 150ms, border-color 150ms;
  }

  .popup-option:hover {
    background: var(--border);
    border-color: var(--fg);
  }

  .option-label {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .option-desc {
    font-size: 0.82rem;
    opacity: 0.8;
  }

  .popup-image-container {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    align-items: center;
  }

  .popup-image {
    width: 100%;
    height: auto;
    border-radius: var(--radius, 4px);
    border: 1px solid var(--border);
  }

  .popup-back {
    align-self: flex-start;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--encadre-bg);
    color: var(--fg);
    cursor: pointer;
    font-size: 0.82rem;
  }

  .popup-back:hover {
    background: var(--border);
  }
</style>
