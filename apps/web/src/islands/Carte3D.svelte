<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import "../styles/map-controls.css";
  import { urlStyle, RELIEF_TERRAIN_SOURCE_ID } from "../lib/carte";

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
  let presentation = "route";
  let menuPresentationOuvert = false;
  let labels3D = [];
  let popupOuvert = false;
  let questionSelectionnee = null;
  let imageEnPleinEcran = false;
  let chargement = true;
  const PRESENTATIONS = [
    { id: "relief", label: "3D seul", description: "Relief sans fond de carte" },
    { id: "route", label: "3D · carte routière", description: "Relief avec le Plan IGN" },
    { id: "aerien", label: "3D · vue aérienne", description: "Relief avec les photographies aériennes" },
  ];
  const QUESTIONS_AIGOUAL = [
    {
      titre: "Qu'est-ce qu'une ligne de crête ?",
      image: "/image/partage.png",
      alt: "Schéma de la ligne de partage des eaux autour du mont Aigoual",
      texte: "Au mont Aigoual, la ligne de crête sépare les eaux qui partent vers des versants différents. C'est une véritable ligne de partage des eaux : une pluie tombée d'un côté rejoint le bassin de l'Hérault et la Méditerranée ; de l'autre, elle alimente d'autres cours d'eau."
    },
    {
      titre: "Qu'est-ce qu'un bassin versant ?",
      image: "/image/bassin.png",
      alt: "Schéma du bassin versant de l'Hérault depuis le mont Aigoual",
      texte: "Le bassin versant est le territoire dont toutes les eaux s'écoulent vers un même cours d'eau. Depuis les pentes du mont Aigoual, ruisseaux et ravins se rassemblent progressivement pour alimenter l'Hérault, qui poursuit son voyage jusqu'à la mer Méditerranée à Agde."
    },
    {
      titre: "Qu'est-ce qu'un épisode cévenol ?",
      image: "/image/episode.png",
      alt: "Schéma d'un épisode cévenol sur le mont Aigoual",
      texte: "Un épisode cévenol est une forte pluie, souvent très concentrée dans le temps, provoquée lorsque l'air humide venu de Méditerranée rencontre le relief. Le massif de l'Aigoual force cet air à s'élever et peut renforcer les précipitations : les cours d'eau réagissent alors très vite."
    }
  ];

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

  function choisirPresentation(id) {
    presentation = id;
    menuPresentationOuvert = false;
    appliquerPresentation();
  }

  function appliquerPresentation() {
    if (!map) return;
    const terrain = map.getLayer("relief-hillshade");
    const coucheCarte = map.getLayer("basemap-plan");
    const couchePhoto = map.getLayer("basemap-photo");

    // Source dédiée au terrain : la partager avec l'ombrage ferait chuter d'un cran le
    // zoom des tuiles d'altitude sur lesquelles celui-ci est calculé.
    map.setTerrain({ source: RELIEF_TERRAIN_SOURCE_ID, exaggeration: 1.8 });
    if (terrain) map.setLayoutProperty("relief-hillshade", "visibility", "visible");
    if (coucheCarte) map.setLayoutProperty("basemap-plan", "visibility", presentation === "route" ? "visible" : "none");
    if (couchePhoto) map.setLayoutProperty("basemap-photo", "visibility", presentation === "aerien" ? "visible" : "none");
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      hash: "map",
      maxPitch: 80,
      scrollZoom: true,
      attributionControl: { compact: true },
      style: urlStyle("relief", { fond: "plan", terrain: true, exageration: 1.8 }),
    });

    map.on("load", () => {
      chargement = false;
      if (map.getLayer("relief-hillshade")) map.setPaintProperty("relief-hillshade", "hillshade-shadow-color", "#2b4a3f");
      appliquerPresentation();

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
            questionSelectionnee = null;
            imageEnPleinEcran = false;
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
    <div class="controles opendata-carte-controls" aria-label="Commandes de la carte">
      <button class="opendata-carte-button" on:click={recentrerAxeFleuve} data-tooltip="Voir tout le parcours Aigoual–Agde" aria-label="Recentrer sur l'axe Aigoual vers Agde">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
      </button>

      <button class="opendata-carte-button" on:click={orienterNord} data-tooltip="Orienter la carte vers le nord" aria-label="Orienter la carte vers le nord">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
        </svg>
      </button>

      <div class="presentation-control">
        <button
          class="opendata-carte-button actif"
          type="button"
          aria-haspopup="true"
          aria-expanded={menuPresentationOuvert}
          on:click={() => menuPresentationOuvert = !menuPresentationOuvert}
          data-tooltip="Choisir la présentation 3D"
          aria-label="Choisir la présentation 3D"
        >
          <span aria-hidden="true">3D</span>
        </button>

        {#if menuPresentationOuvert}
          <div class="presentation-menu" aria-label="Présentations de la carte">
            {#each PRESENTATIONS as option}
              <button
                type="button"
                class="presentation-option"
                class:selectionnee={presentation === option.id}
                aria-pressed={presentation === option.id}
                on:click={() => choisirPresentation(option.id)}
              >
                <span class="presentation-label">{option.label}</span>
                <span class="presentation-description">{option.description}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <a class="opendata-carte-button" href="/eau/tableau-de-bord/" data-tooltip="Voir toutes les données Eau" aria-label="Accéder au tableau de bord de toutes les données Eau">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
        </svg>
      </a>
    </div>

    {#if popupOuvert}
      <div class="popup-overlay" role="presentation" on:click|self={() => popupOuvert = false}>
        <div class="popup">
          <div class="popup-header">
            <h3>Mont Aigoual</h3>
            <button class="popup-close" aria-label="Fermer" on:click={() => popupOuvert = false}>×</button>
          </div>

          {#if !questionSelectionnee}
            <div class="popup-options">
              <p class="popup-intro">Choisissez une question pour comprendre le rôle particulier du mont Aigoual dans le voyage de l'eau.</p>
              {#each QUESTIONS_AIGOUAL as question}
                <button class="popup-option" on:click={() => questionSelectionnee = question}>
                  <span class="option-label">{question.titre}</span>
                  <span class="option-desc">Voir l'image et l'explication</span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="popup-detail">
              <h4>{questionSelectionnee.titre}</h4>
              <button class="image-button" on:click={() => imageEnPleinEcran = true} aria-label="Agrandir l'image en plein écran">
                <img src={questionSelectionnee.image} alt={questionSelectionnee.alt} class="popup-image" />
                <span class="image-hint">Cliquer sur l'image pour l'agrandir</span>
              </button>
              <p class="popup-texte">{questionSelectionnee.texte}</p>
              <button class="popup-back" on:click={() => questionSelectionnee = null}>← Les trois questions</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if imageEnPleinEcran && questionSelectionnee}
      <div class="fullscreen-overlay" role="presentation" on:click|self={() => imageEnPleinEcran = false}>
        <button class="fullscreen-close" aria-label="Fermer l'image en plein écran" on:click={() => imageEnPleinEcran = false}>×</button>
        <img class="fullscreen-image" src={questionSelectionnee.image} alt={questionSelectionnee.alt} />
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
    border-radius: var(--rayon, 4px);
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  }

  .chargement-overlay {
    position: absolute;
    inset: 2rem;
    border-radius: var(--rayon, 4px);
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
    top: 2.6rem;
    right: 2.6rem;
    z-index: 10;
  }

  .presentation-control {
    position: relative;
    width: var(--map-control-size);
    height: var(--map-control-size);
  }

  .presentation-menu {
    position: absolute;
    top: 0;
    right: calc(100% + 12px);
    width: min(270px, calc(100vw - 7rem));
    padding: 0.35rem;
    border: 1px solid rgba(23, 56, 75, 0.55);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 4px 18px rgba(23, 56, 75, 0.28);
  }

  .presentation-option {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #17384b;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .presentation-option:hover,
  .presentation-option:focus-visible {
    border-color: #9aa8b0;
    background: #edf3f6;
    outline: none;
  }

  .presentation-option.selectionnee {
    color: #fff;
    border-color: #17384b;
    background: #17384b;
  }

  .presentation-label {
    font-size: 0.88rem;
    font-weight: 800;
  }

  .presentation-description {
    font-size: 0.75rem;
    line-height: 1.3;
    opacity: 0.82;
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
    background: var(--surface-fond);
    color: var(--texte-principal);
    border-radius: var(--rayon, 4px);
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
    border-bottom: 1px solid var(--bordure);
  }

  .popup-header h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }

  .popup-close {
    background: none;
    border: none;
    color: var(--texte-principal);
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

  .popup-intro {
    margin: 0 0 0.3rem;
    font-size: 0.9rem;
  }

  .popup-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--bordure);
    border-radius: var(--rayon, 4px);
    background: var(--encadre-bg);
    color: var(--texte-principal);
    cursor: pointer;
    text-align: left;
    transition: background 150ms, border-color 150ms;
  }

  .popup-option:hover {
    background: var(--bordure);
    border-color: var(--texte-principal);
  }

  .option-label {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .option-desc {
    font-size: 0.82rem;
    opacity: 0.8;
  }

  .popup-detail {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    overflow-y: auto;
  }

  .popup-detail h4, .popup-texte { margin: 0; }

  .popup-detail h4 { font-size: 1rem; }

  .popup-texte { font-size: 0.92rem; line-height: 1.55; }

  .image-button {
    position: relative;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
    text-align: left;
  }

  .popup-image {
    width: 100%;
    height: auto;
    border-radius: var(--rayon, 4px);
    border: 1px solid var(--bordure);
  }

  .image-hint {
    display: block;
    margin-top: 0.35rem;
    color: var(--texte-principal);
    font-size: 0.78rem;
    opacity: 0.75;
    text-align: center;
  }

  .popup-back {
    align-self: flex-start;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--bordure);
    border-radius: 999px;
    background: var(--encadre-bg);
    color: var(--texte-principal);
    cursor: pointer;
    font-size: 0.82rem;
  }

  .popup-back:hover {
    background: var(--bordure);
  }

  .fullscreen-overlay {
    position: fixed;
    z-index: 110;
    inset: 0;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
  }

  .fullscreen-image {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    cursor: default;
  }

  .fullscreen-close {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 1.7rem;
    line-height: 1;
    cursor: pointer;
  }
</style>
