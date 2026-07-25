<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import { urlStyle, PALETTE_HYPSOMETRIQUE, RELIEF_SOURCE_ID, reglerExagerationRelief } from "../lib/carte";

  const COLOR_RELIEF_ID = "relief-color";
  const HILLSHADE_ID = "relief-hillshade";
  const BASEMAP_PLAN_ID = "basemap-plan";
  const BASEMAP_PHOTO_ID = "basemap-photo";

  /** Méthodes d'ombrage MapLibre GL ≥ 5.6 (couche hillshade), du plus lisible au plus classique. */
  const METHODES = [
    { id: "multidirectional", label: "Multi-directions" },
    { id: "igor", label: "Igor (doux)" },
    { id: "combined", label: "Combiné" },
    { id: "standard", label: "Standard" },
  ];

  /** Fonds drapés sous l'ombrage. « nu » = teinte hypsométrique seule (rendu le plus lisible). */
  const FONDS = [
    { id: "nu", label: "Relief nu", opaciteTeinte: 0.92 },
    { id: "photo", label: "Photo aérienne", opaciteTeinte: 0.3 },
    { id: "plan", label: "Plan IGN", opaciteTeinte: 0.4 },
  ];

  let mapContainer;
  let map;

  let theme = "auto";
  let panneauOuvert = true;
  let exageration = 1.4;
  let methode = "multidirectional";
  let intensiteOmbrage = 0.55;
  let opaciteTeinte = 0.92;
  let fondActif = "nu";

  const altMin = PALETTE_HYPSOMETRIQUE[0].altitude;
  const altMax = PALETTE_HYPSOMETRIQUE[PALETTE_HYPSOMETRIQUE.length - 1].altitude;
  /** Dégradé CSS vertical (sommet en haut) pour la légende, calé sur les mêmes altitudes. */
  const degradeLegende = `linear-gradient(to top, ${PALETTE_HYPSOMETRIQUE.map(
    (p) => `${p.couleur} ${((p.altitude - altMin) / (altMax - altMin)) * 100}%`,
  ).join(", ")})`;
  /** Graduations d'altitude affichées à côté du dégradé (du sommet au fond de vallée). */
  const graduations = [...PALETTE_HYPSOMETRIQUE].reverse().map((p) => p.altitude);

  function appliquerTheme(t) {
    theme = t;
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* stockage indisponible, on ignore */
    }
  }

  function changerExageration(v) {
    exageration = v;
    if (map) reglerExagerationRelief(map, v);
  }

  function changerMethode(id) {
    methode = id;
    if (map?.getLayer(HILLSHADE_ID)) map.setPaintProperty(HILLSHADE_ID, "hillshade-method", id);
  }

  function changerIntensite(v) {
    intensiteOmbrage = v;
    if (map?.getLayer(HILLSHADE_ID)) map.setPaintProperty(HILLSHADE_ID, "hillshade-exaggeration", v);
  }

  function changerOpaciteTeinte(v) {
    opaciteTeinte = v;
    if (map?.getLayer(COLOR_RELIEF_ID)) map.setPaintProperty(COLOR_RELIEF_ID, "color-relief-opacity", v);
  }

  function changerFond(id) {
    fondActif = id;
    if (!map) return;
    if (map.getLayer(BASEMAP_PLAN_ID)) map.setLayoutProperty(BASEMAP_PLAN_ID, "visibility", id === "plan" ? "visible" : "none");
    if (map.getLayer(BASEMAP_PHOTO_ID)) map.setLayoutProperty(BASEMAP_PHOTO_ID, "visibility", id === "photo" ? "visible" : "none");
    const fond = FONDS.find((item) => item.id === id) ?? FONDS[0];
    changerOpaciteTeinte(fond.opaciteTeinte);
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: urlStyle("hypsometrique", { fond: "nu", terrain: true, exageration }),
      center: [TERRITOIRE.montAigoual.lon, TERRITOIRE.montAigoual.lat],
      zoom: 12,
      pitch: 62,
      bearing: -18,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");
    map.fitBounds(TERRITOIRE.bbox, { padding: 40, pitch: 62, bearing: -18, duration: 0 });

    map.on("load", async () => {
      changerFond(fondActif);
      if (map.getLayer(COLOR_RELIEF_ID)) map.setPaintProperty(COLOR_RELIEF_ID, "color-relief-opacity", opaciteTeinte);
      if (map.getLayer(HILLSHADE_ID)) {
        map.setPaintProperty(HILLSHADE_ID, "hillshade-method", methode);
        map.setPaintProperty(HILLSHADE_ID, "hillshade-exaggeration", intensiteOmbrage);
      }
      reglerExagerationRelief(map, exageration);

      // Contour de la commune principale, en surimpression discrète.
      try {
        const res = await fetch("/api/territoire");
        const data = await res.json();
        if (data.commune?.geometry) {
          map.addSource("relief-commune-src", {
            type: "geojson",
            data: { type: "Feature", geometry: data.commune.geometry, properties: {} },
          });
          map.addLayer({
            id: "relief-commune-line",
            type: "line",
            source: "relief-commune-src",
            paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.7 },
          });
        }
      } catch (err) {
        console.error("territoire indisponible", err);
      }
    });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<div class="explorateur">
  <div class="carte" bind:this={mapContainer}></div>

  <header class="entete">
    <div class="entete-texte">
      <h1>Relief 3D</h1>
      <p class="sous-titre">{TERRITOIRE.commune.nom} — du fond de vallée au mont Aigoual ({TERRITOIRE.montAigoual.altitudeM} m)</p>
    </div>
  </header>

  <button
    class="bouton-theme"
    title="Changer de thème"
    on:click={() => appliquerTheme(theme === "dark" ? "light" : theme === "light" ? "auto" : "dark")}
  >
    {#if theme === "dark"}
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 11.5A6 6 0 1 1 8.5 5a5 5 0 0 0 6.5 6.5Z" fill="currentColor" /></svg>
    {:else if theme === "light"}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.4" fill="currentColor" />
        <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <line x1="10" y1="1.6" x2="10" y2="3.6" />
          <line x1="10" y1="16.4" x2="10" y2="18.4" />
          <line x1="1.6" y1="10" x2="3.6" y2="10" />
          <line x1="16.4" y1="10" x2="18.4" y2="10" />
          <line x1="4.3" y1="4.3" x2="5.7" y2="5.7" />
          <line x1="14.3" y1="14.3" x2="15.7" y2="15.7" />
          <line x1="4.3" y1="15.7" x2="5.7" y2="14.3" />
          <line x1="14.3" y1="5.7" x2="15.7" y2="4.3" />
        </g>
      </svg>
    {:else}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.3" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path d="M10 2.7a7.3 7.3 0 0 1 0 14.6Z" fill="currentColor" />
      </svg>
    {/if}
    <span class="sr-only">Thème : {theme}</span>
  </button>

  <button class="bouton-panneau" on:click={() => (panneauOuvert = !panneauOuvert)}>
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 2l7 4-7 4-7-4 7-4Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      <path d="M2 10l7 4 7-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
    </svg>
    {panneauOuvert ? "Masquer" : "Réglages"}
  </button>

  <aside class="panneau" class:ouvert={panneauOuvert}>
    <h2>Rendu du relief</h2>

    <div class="bloc">
      <span class="etiquette">Fond drapé</span>
      <div class="groupe-fonds" role="radiogroup" aria-label="Fond drapé">
        {#each FONDS as f}
          <button
            type="button"
            role="radio"
            aria-checked={fondActif === f.id}
            class:actif={fondActif === f.id}
            on:click={() => changerFond(f.id)}
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="bloc">
      <span class="etiquette">Ombrage</span>
      <div class="groupe-fonds" role="radiogroup" aria-label="Méthode d'ombrage">
        {#each METHODES as m}
          <button
            type="button"
            role="radio"
            aria-checked={methode === m.id}
            class:actif={methode === m.id}
            on:click={() => changerMethode(m.id)}
          >
            {m.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="controle">
      <label for="relief-exageration">Exagération du relief <span class="valeur">×{exageration.toFixed(1)}</span></label>
      <input
        id="relief-exageration"
        type="range"
        min="0.5"
        max="3"
        step="0.1"
        value={exageration}
        on:input={(e) => changerExageration(Number(e.currentTarget.value))}
      />
    </div>

    <div class="controle">
      <label for="relief-intensite">Intensité de l'ombrage <span class="valeur">{Math.round(intensiteOmbrage * 100)}%</span></label>
      <input
        id="relief-intensite"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={intensiteOmbrage}
        on:input={(e) => changerIntensite(Number(e.currentTarget.value))}
      />
    </div>

    <div class="controle">
      <label for="relief-opacite">Opacité de la teinte <span class="valeur">{Math.round(opaciteTeinte * 100)}%</span></label>
      <input
        id="relief-opacite"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={opaciteTeinte}
        on:input={(e) => changerOpaciteTeinte(Number(e.currentTarget.value))}
      />
    </div>

    <div class="legende">
      <span class="etiquette">Altitude</span>
      <div class="legende-corps">
        <div class="barre" style={`background:${degradeLegende}`}></div>
        <ul class="graduations">
          {#each graduations as alt}
            <li>{alt.toLocaleString("fr-FR")} m</li>
          {/each}
        </ul>
      </div>
    </div>

    <p class="note-panneau">
      Teinte hypsométrique et ombrage calculés à la volée depuis le modèle numérique de terrain
      (Copernicus GLO-30, puis LiDAR HD IGN en zoom rapproché). Inclinez et faites pivoter la carte
      pour explorer le relief.
    </p>
  </aside>
</div>

<style>
  .explorateur {
    position: relative;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    font-family: var(--font-body);
  }

  .carte {
    position: absolute;
    inset: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .entete {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    /* padding-left élargi pour dégager le chevron « retour accueil » flottant. */
    padding: 0.6rem 1rem 0.9rem 3.4rem;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), transparent);
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    background-image: var(--contour-rule);
    background-repeat: repeat-x;
    background-position: bottom;
    background-size: 64px 12px;
  }

  .entete-texte {
    min-width: 0;
  }

  .entete h1 {
    font-family: var(--font-display);
    font-size: 1.4rem;
    margin: 0;
    letter-spacing: 0.02em;
  }

  .sous-titre {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    opacity: 0.9;
  }

  .bouton-theme {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--panel-bg);
    color: var(--fg);
    box-shadow: var(--shadow);
    cursor: pointer;
  }

  .bouton-theme svg {
    width: 1.1rem;
    height: 1.1rem;
  }

  .bouton-theme:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .bouton-panneau {
    display: none;
  }

  .panneau {
    position: absolute;
    top: 3.6rem;
    left: 1rem;
    bottom: 1rem;
    width: 17rem;
    z-index: 4;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.9rem;
    overflow-y: auto;
    backdrop-filter: blur(2px);
    box-shadow: var(--shadow);
  }

  .panneau h2 {
    font-family: var(--font-display);
    font-size: 1rem;
    margin: 0 0 0.8rem;
  }

  .bloc {
    margin-bottom: 0.9rem;
  }

  .etiquette {
    display: block;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--border);
    margin-bottom: 0.35rem;
  }

  .groupe-fonds {
    display: flex;
    flex-wrap: wrap;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .groupe-fonds button {
    flex: 1 1 33%;
    padding: 0.45rem 0.3rem;
    border: none;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
    font-family: var(--font-body);
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .groupe-fonds button.actif {
    background: var(--fg);
    color: var(--bg);
  }

  .groupe-fonds button:not(.actif):hover {
    background: rgba(154, 155, 147, 0.18);
  }

  .groupe-fonds button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .controle {
    margin-bottom: 0.9rem;
    font-size: 0.78rem;
  }

  .controle label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
    color: var(--fg);
  }

  .controle .valeur {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--border);
  }

  .controle input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }

  .legende {
    margin: 1.1rem 0 0.4rem;
  }

  .legende-corps {
    display: flex;
    gap: 0.6rem;
    height: 8rem;
  }

  .barre {
    width: 1.1rem;
    flex-shrink: 0;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .graduations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--border);
  }

  .note-panneau {
    margin-top: 1rem;
    font-size: 0.72rem;
    color: var(--border);
    line-height: 1.45;
  }

  @media (max-width: 720px) {
    .entete {
      padding-right: 3rem;
    }

    .bouton-panneau {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      position: absolute;
      left: 1rem;
      bottom: 1rem;
      z-index: 5;
      border: 1px solid var(--border);
      background: var(--panel-bg);
      color: var(--fg);
      border-radius: var(--radius);
      padding: 0.5rem 0.9rem;
      font-size: 0.85rem;
      box-shadow: var(--shadow);
    }

    .bouton-panneau svg {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
    }

    .panneau {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 55vh;
      border-radius: var(--radius) var(--radius) 0 0;
      transform: translateY(100%);
      transition: transform 200ms ease;
    }

    .panneau.ouvert {
      transform: translateY(0);
    }
  }
</style>
