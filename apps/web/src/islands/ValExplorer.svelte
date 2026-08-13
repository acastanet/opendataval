<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import { urlCarte } from "../lib/carte";
  import { urlGeologieProches, urlGeologieSynthese } from "../lib/geologie";

  const EXAGERATION = 1;
  const BSS_SOURCE_ID = "bss-geologie-src";
  const BSS_LAYER_ID = "bss-geologie-points";
  const BSS_LABEL_LAYER_ID = "bss-geologie-numeros";
  const METHODE_SYNTHESE = {
    llm_vision: "Synthèse IA à partir du log et de la coupe scannée",
    llm_texte: "Synthèse IA à partir du log seul (aucune image exploitable)",
    structure_seule: "Résumé déterministe du log (sans appel IA)",
  };

  // IGN et Photos aériennes sont deux fonds raster mutuellement exclusifs côté map-service
  // (un seul paramètre `fond`) : activer l'un désactive l'autre. Géologie, elle, est une
  // couche indépendante qui se superpose en transparence à l'un ou l'autre. Le terrain 3D
  // et l'ombrage sculpté restent en permanence actifs, hors de ce menu.
  let ignActif = true;
  let photosActif = false;
  let geologieActif = false;

  function basculerIgn() {
    ignActif = !ignActif;
    if (ignActif) photosActif = false;
    map?.setStyle(urlCarte(optionsCarte()));
  }

  function basculerPhotos() {
    photosActif = !photosActif;
    if (photosActif) ignActif = false;
    map?.setStyle(urlCarte(optionsCarte()));
  }

  function basculerGeologieFond() {
    geologieActif = !geologieActif;
    map?.setStyle(urlCarte(optionsCarte()));
  }

  let mapContainer;
  let map;
  let panneauOuvert = true;
  let ongletActif = "carte";
  /** Cap de la caméra, pour orienter l'indicateur de nord (lecture seule, non interactif). */
  let bearing = 0;

  // --- Recherche géologique (BSS BRGM), voir apps/web/src/lib/geologie.ts ---
  let rayonGeologie = 2000;
  let trierGeologie = false;
  let chargementGeologie = false;
  let erreurGeologie = null;
  let resultatsGeologie = [];

  // --- Analyse IA d'une fiche, en fenêtre pop-up (voir /bss/synthese) ---
  let syntheseOuverte = false;
  let syntheseOuvrage = null;
  let syntheseChargement = false;
  let syntheseErreur = null;
  let syntheseDonnees = null;

  function optionsCarte() {
    return {
      fond: photosActif ? "photo" : ignActif ? "plan" : "nu",
      terrain: true,
      exageration: EXAGERATION,
      ombrage: "sculpte",
      geologie: geologieActif,
    };
  }

  function noeudTexte(tag, texte) {
    const el = document.createElement(tag);
    el.textContent = texte;
    return el;
  }

  function popupPourOuvrage(ouvrage) {
    const conteneur = document.createElement("div");
    conteneur.appendChild(noeudTexte("strong", ouvrage.designation || ouvrage.bss_id));
    conteneur.appendChild(document.createElement("br"));
    conteneur.appendChild(document.createTextNode(`${ouvrage.nature_brgm || "—"} · ${Math.round(ouvrage.distance_m)} m`));
    if (ouvrage.fiche_infoterre) {
      conteneur.appendChild(document.createElement("br"));
      const lien = document.createElement("a");
      lien.href = ouvrage.fiche_infoterre;
      lien.target = "_blank";
      lien.rel = "noreferrer";
      lien.textContent = "Fiche InfoTerre ↗";
      conteneur.appendChild(lien);
    }
    return conteneur;
  }

  /** (Ré)applique les marqueurs BSS numérotés sur la carte : nécessaire après chaque map.setStyle(). */
  function appliquerMarqueursGeologie() {
    if (!map) return;
    const donnees = {
      type: "FeatureCollection",
      features: resultatsGeologie
        .filter((o) => typeof o.latitude === "number" && typeof o.longitude === "number")
        .map((o) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [o.longitude, o.latitude] },
          properties: { bss_id: o.bss_id, numero: o.rank },
        })),
    };
    const source = map.getSource(BSS_SOURCE_ID);
    if (source) {
      source.setData(donnees);
      return;
    }
    map.addSource(BSS_SOURCE_ID, { type: "geojson", data: donnees });
    map.addLayer({
      id: BSS_LAYER_ID,
      type: "circle",
      source: BSS_SOURCE_ID,
      paint: {
        "circle-radius": 9,
        "circle-color": "#002fa7",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fbfcfa",
        "circle-opacity": 0.92,
      },
    });
    map.addLayer({
      id: BSS_LABEL_LAYER_ID,
      type: "symbol",
      source: BSS_SOURCE_ID,
      layout: {
        "text-field": ["get", "numero"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#fbfcfa",
      },
    });
  }

  async function rechercherGeologie() {
    if (!map) return;
    chargementGeologie = true;
    erreurGeologie = null;
    const centre = map.getCenter();
    try {
      const url = urlGeologieProches({ lat: centre.lat, lon: centre.lng, rayon: rayonGeologie, trier: trierGeologie });
      const reponse = await fetch(url, { headers: { accept: "application/json" } });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees?.error?.message || `HTTP ${reponse.status}`);
      resultatsGeologie = Array.isArray(donnees.results) ? donnees.results : [];
      appliquerMarqueursGeologie();
    } catch (err) {
      erreurGeologie = err instanceof Error ? err.message : "Recherche indisponible.";
      resultatsGeologie = [];
    } finally {
      chargementGeologie = false;
    }
  }

  function centrerSur(ouvrage) {
    if (!map || typeof ouvrage.latitude !== "number" || typeof ouvrage.longitude !== "number") return;
    map.flyTo({ center: [ouvrage.longitude, ouvrage.latitude], zoom: Math.max(map.getZoom(), 14) });
    new maplibregl.Popup({ closeButton: true })
      .setLngLat([ouvrage.longitude, ouvrage.latitude])
      .setDOMContent(popupPourOuvrage(ouvrage))
      .addTo(map);
  }

  /** Analyse IA à la demande (log + coupe géologique) : coûteuse, jamais déclenchée automatiquement. */
  async function analyserOuvrage(ouvrage) {
    if (!ouvrage.ancien_code_bss) return;
    syntheseOuvrage = ouvrage;
    syntheseOuverte = true;
    syntheseChargement = true;
    syntheseErreur = null;
    syntheseDonnees = null;
    try {
      const reponse = await fetch(urlGeologieSynthese(ouvrage.ancien_code_bss), { headers: { accept: "application/json" } });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees?.error?.message || `HTTP ${reponse.status}`);
      syntheseDonnees = donnees;
    } catch (err) {
      syntheseErreur = err instanceof Error ? err.message : "Analyse indisponible.";
    } finally {
      syntheseChargement = false;
    }
  }

  function fermerSynthese() {
    syntheseOuverte = false;
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: urlCarte(optionsCarte()),
      center: [TERRITOIRE.commune.centre.lon, TERRITOIRE.commune.centre.lat],
      zoom: 11,
      pitch: 55,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    // Ni boussole ni zoom cliquables : la rotation reste lisible à l'écran (voir .boussole
    // plus bas), le zoom se fait au geste (molette, pincement, double-clic).
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("rotate", () => (bearing = map.getBearing()));
    // Un map.setStyle() (bascule fond/géologie) recharge tout le style : les marqueurs BSS,
    // ajoutés côté client, doivent être réappliqués une fois le nouveau style chargé.
    map.on("style.load", () => { if (resultatsGeologie.length > 0) appliquerMarqueursGeologie(); });
    const onClicMarqueur = (e) => {
      const feature = e.features?.[0];
      const bssId = feature?.properties?.bss_id;
      const ouvrage = resultatsGeologie.find((o) => o.bss_id === bssId);
      if (ouvrage) new maplibregl.Popup({ closeButton: true }).setLngLat(e.lngLat).setDOMContent(popupPourOuvrage(ouvrage)).addTo(map);
    };
    for (const layerId of [BSS_LAYER_ID, BSS_LABEL_LAYER_ID]) {
      map.on("click", layerId, onClicMarqueur);
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    }
    map.fitBounds(TERRITOIRE.bbox, { padding: 40, pitch: 55, duration: 0 });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<svelte:window on:keydown={(e) => { if (e.key === "Escape" && syntheseOuverte) fermerSynthese(); }} />

<div class="explorateur">
  <div class="carte" bind:this={mapContainer}></div>

  <a class="accueil" href="/" aria-label="Retour à l'accueil">
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 9.5 10 3.5l7 6M5 8.5V16h10V8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span>Accueil</span>
  </a>

  <button
    class="hamburger"
    aria-label={panneauOuvert ? "Masquer le menu" : "Afficher le menu"}
    aria-expanded={panneauOuvert}
    aria-controls="val-panneau"
    on:click={() => (panneauOuvert = !panneauOuvert)}
  >
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  </button>

  <div class="boussole" aria-hidden="true">
    <svg viewBox="0 0 32 40" style={`transform: rotate(${-bearing}deg)`}>
      <path d="M16 12 L24 39 L16 31 L8 39 Z" fill="var(--papier)" stroke="var(--alerte)" stroke-width="1.5" stroke-linejoin="round" />
      <text x="16" y="8" text-anchor="middle" font-family="var(--font-mono)" font-size="10" font-weight="700" fill="var(--encre)">N</text>
    </svg>
  </div>

  <aside id="val-panneau" class="panneau" class:ouvert={panneauOuvert}>
    <h2>VAL Géologie</h2>

    <div class="onglets" role="tablist" aria-label="Sections du menu">
      <button
        type="button"
        role="tab"
        id="tab-carte"
        aria-selected={ongletActif === "carte"}
        aria-controls="panel-carte"
        tabindex={ongletActif === "carte" ? 0 : -1}
        class:actif={ongletActif === "carte"}
        on:click={() => (ongletActif = "carte")}
      >
        Carte
      </button>
      <button
        type="button"
        role="tab"
        id="tab-geologie"
        aria-selected={ongletActif === "geologie"}
        aria-controls="panel-geologie"
        tabindex={ongletActif === "geologie" ? 0 : -1}
        class:actif={ongletActif === "geologie"}
        on:click={() => (ongletActif = "geologie")}
      >
        Géologie
      </button>
      <button
        type="button"
        role="tab"
        id="tab-aide"
        aria-selected={ongletActif === "aide"}
        aria-controls="panel-aide"
        tabindex={ongletActif === "aide" ? 0 : -1}
        class:actif={ongletActif === "aide"}
        on:click={() => (ongletActif = "aide")}
      >
        Aide
      </button>
    </div>

    <div id="panel-carte" role="tabpanel" aria-labelledby="tab-carte" hidden={ongletActif !== "carte"}>
      <div class="couches-fond">
        <button type="button" class="bouton-couche" class:actif={geologieActif} aria-pressed={geologieActif} on:click={basculerGeologieFond}>
          Géologie
          <span class="pastille" aria-hidden="true"></span>
        </button>
        <button type="button" class="bouton-couche" class:actif={ignActif} aria-pressed={ignActif} on:click={basculerIgn}>
          IGN
          <span class="pastille" aria-hidden="true"></span>
        </button>
        <button type="button" class="bouton-couche" class:actif={photosActif} aria-pressed={photosActif} on:click={basculerPhotos}>
          Photos aériennes
          <span class="pastille" aria-hidden="true"></span>
        </button>
      </div>
      <p class="note-geologie">IGN et Photos aériennes sont deux fonds exclusifs : activer l'un désactive l'autre. Géologie se superpose en transparence, sur l'un ou l'autre.</p>
    </div>

    <div id="panel-aide" role="tabpanel" aria-labelledby="tab-aide" hidden={ongletActif !== "aide"}>
      <h4>Se déplacer</h4>
      <p class="note-geologie">
        Glisser pour déplacer la vue, molette ou pincement pour zoomer, glisser avec le bouton
        droit (ou à deux doigts) pour incliner et pivoter. La boussole en bas à gauche indique
        le nord et suit la rotation de la carte, mais n'est pas cliquable.
      </p>
      <h4>Fond de carte</h4>
      <p class="note-geologie">
        Dans l'onglet Carte : IGN (plan topographique) et Photos aériennes sont deux fonds
        exclusifs, activer l'un désactive l'autre. Géologie superpose la carte géologique du
        BRGM en transparence, sur l'un ou l'autre.
      </p>
      <h4>Ouvrages géologiques</h4>
      <p class="note-geologie">
        Dans l'onglet Géologie, « Rechercher autour du centre » interroge la banque du sous-sol
        du BRGM dans le rayon choisi, centré sur le centre actuel de la carte. Les ouvrages
        trouvés s'affichent numérotés en bleu sur la carte ; cliquer sur un résultat de la liste
        y recentre la vue. Le bouton « Analyse IA », quand il est proposé, ouvre une synthèse du
        log géologique et des coupes scannées de la fiche InfoTerre correspondante.
      </p>
      <h4>Accueil et menu</h4>
      <p class="note-geologie">
        Le bouton « Accueil » en haut à gauche ramène au portail. Le bouton hamburger en haut à
        droite replie ou déplie ce panneau.
      </p>
    </div>

    <div id="panel-geologie" role="tabpanel" aria-labelledby="tab-geologie" hidden={ongletActif !== "geologie"}>
      <p class="note-geologie">Ouvrages géologiques (BSS BRGM) autour du centre de la carte.</p>

      <div class="controle">
        <label for="geo-rayon">Rayon de recherche <span class="valeur">{rayonGeologie.toLocaleString("fr-FR")} m</span></label>
        <input id="geo-rayon" type="range" min="200" max="5000" step="100" bind:value={rayonGeologie} />
      </div>

      <label class="case">
        <input type="checkbox" bind:checked={trierGeologie} />
        Trier par pertinence
      </label>
      <p class="note-geologie">
        {#if trierGeologie}
          Classement affiné (distance, richesse géologique, diversité), plafonné à 10 ouvrages.
        {:else}
          Non coché : tous les ouvrages du rayon sont affichés, sans filtrage — ici, tout est pertinent.
        {/if}
      </p>

      <button type="button" class="bouton-recherche" on:click={rechercherGeologie} disabled={chargementGeologie}>
        {chargementGeologie ? "Recherche…" : "Rechercher autour du centre"}
      </button>

      {#if erreurGeologie}
        <p class="erreur-geologie">{erreurGeologie}</p>
      {/if}

      {#if resultatsGeologie.length > 0}
        <p class="resume-geologie">
          {resultatsGeologie.length} ouvrage{resultatsGeologie.length > 1 ? "s" : ""}
          {trierGeologie ? "les plus pertinents" : "dans le rayon"}.
        </p>
        <ul class="liste-geologie">
          {#each resultatsGeologie as ouvrage}
            <li class="ligne-geologie">
              <button type="button" class="item-geologie" on:click={() => centrerSur(ouvrage)}>
                <strong>#{ouvrage.rank} — {ouvrage.designation || ouvrage.bss_id}</strong>
                <span>{ouvrage.nature_brgm || "—"} · {Math.round(ouvrage.distance_m)} m</span>
              </button>
              {#if ouvrage.ancien_code_bss}
                <button type="button" class="bouton-analyse" on:click={() => analyserOuvrage(ouvrage)}>Analyse IA</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>

  {#if syntheseOuverte}
    <div class="voile" role="presentation" on:click={fermerSynthese}>
      <div class="modale" role="dialog" aria-modal="true" aria-labelledby="synthese-titre" on:click|stopPropagation>
        <div class="modale-entete">
          <h3 id="synthese-titre">{syntheseOuvrage?.designation || syntheseOuvrage?.bss_id}</h3>
          <button type="button" class="modale-fermer" aria-label="Fermer" on:click={fermerSynthese}>✕</button>
        </div>
        <div class="modale-corps">
          {#if syntheseChargement}
            <p class="note-geologie">Analyse en cours… (scraping InfoTerre puis lecture IA du log et des coupes)</p>
          {:else if syntheseErreur}
            <p class="erreur-geologie">{syntheseErreur}</p>
          {:else if syntheseDonnees}
            <p class="note-geologie">{METHODE_SYNTHESE[syntheseDonnees.methode_synthese] || syntheseDonnees.methode_synthese}</p>
            <p>{syntheseDonnees.synthese || "Synthèse indisponible."}</p>
            {#if syntheseDonnees.log_geologique?.length > 0}
              <h4>Log géologique</h4>
              <ul class="log-geologique">
                {#each syntheseDonnees.log_geologique as niveau}
                  <li>
                    <strong>{niveau.profondeur_min_m ?? "—"}–{niveau.profondeur_max_m ?? "—"} m</strong>
                    {niveau.lithologie || "—"}{niveau.stratigraphie ? ` (${niveau.stratigraphie})` : ""}
                  </li>
                {/each}
              </ul>
            {/if}
            {#each syntheseDonnees.images_analysees || [] as image}
              {#if image.apercu_data_url}
                <img class="scan-geologie" src={image.apercu_data_url} alt={`Aperçu du scan ${image.nom || ""}`} />
              {/if}
            {/each}
            {#each syntheseDonnees.avertissements || [] as avertissement}
              <p class="note-geologie">{avertissement}</p>
            {/each}
            {#if syntheseDonnees.documents?.length > 0}
              <h4>Documents de la fiche</h4>
              <ul class="documents-geologie">
                {#each syntheseDonnees.documents as document}
                  <li>
                    <a href={document.url_scan} target="_blank" rel="noreferrer">{document.nom || "Document"} ↗</a>
                    {#if document.types?.length > 0}<span>{document.types.join(", ")}</span>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
            {#if syntheseDonnees.fiche_infoterre}
              <a href={syntheseDonnees.fiche_infoterre} target="_blank" rel="noreferrer">Fiche InfoTerre ↗</a>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .explorateur {
    /* Jetons du référentiel visuel VAL (doc/style_VAL.html), scopés à cette app. */
    --encre: #14251d;
    --encre-douce: #52645b;
    --vert: #24543d;
    --vert-profond: #173e2b;
    --vert-clair: #dce9e1;
    --brume: #eef3ef;
    --papier: #fbfcfa;
    --torrent: #3d6f7d;
    --chataigne: #795039;
    --lichen: #718260;
    --granite: #89958e;
    --alerte: #a94332;
    --ligne: rgb(20 37 29 / 16%);
    --ligne-forte: rgb(20 37 29 / 31%);
    --verre: rgb(255 255 255 / 72%);
    --verre-fort: rgb(255 255 255 / 88%);
    --ombre: 0 14px 38px rgb(20 37 29 / 9%);
    --rayon: 2px;
    --font-display: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --font-body: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;

    position: relative;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    font-family: var(--font-body);
    color: var(--encre);
  }

  .carte {
    position: absolute;
    inset: 0;
  }

  /* Trait d'échelle sobre : pas de pavé blanc, juste un trait fin avec amorces verticales
     et la légende centrée au-dessus — voir doc/style_VAL.html. */
  :global(.explorateur .maplibregl-ctrl-scale) {
    position: relative;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--encre);
    border-radius: 0;
    color: var(--encre);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
    padding: 0 0 0.4rem;
    box-shadow: none;
  }

  :global(.explorateur .maplibregl-ctrl-scale::before),
  :global(.explorateur .maplibregl-ctrl-scale::after) {
    content: "";
    position: absolute;
    bottom: -0.3rem;
    width: 2px;
    height: 0.6rem;
    background: var(--encre);
  }

  :global(.explorateur .maplibregl-ctrl-scale::before) {
    left: 0;
  }

  :global(.explorateur .maplibregl-ctrl-scale::after) {
    right: 0;
  }

  .accueil {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 6;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.5rem;
    padding: 0.5rem 0.85rem;
    background: var(--verre-fort);
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    color: var(--encre);
    font-family: var(--font-body);
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;
    box-shadow: var(--ombre);
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .accueil svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .accueil:hover {
    background: var(--vert);
    border-color: var(--vert);
    color: #fff;
  }

  .accueil:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 3px;
  }

  .hamburger {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    background: var(--verre-fort);
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    color: var(--encre);
    box-shadow: var(--ombre);
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .hamburger svg {
    width: 1.1rem;
    height: 1.1rem;
  }

  .hamburger:hover {
    background: var(--vert);
    border-color: var(--vert);
    color: #fff;
  }

  .hamburger:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 3px;
  }

  /* Indicateur de nord : lecture seule, jamais cliquable ni déplaçable. Aiguille pleine
     posée directement sur la carte, sans médaillon ni fond — voir doc/style_VAL.html. */
  .boussole {
    position: absolute;
    left: 1.1rem;
    bottom: 4.4rem;
    z-index: 4;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgb(20 37 29 / 35%));
  }

  .boussole svg {
    width: 2.25rem;
    height: 2.4rem;
    display: block;
    transition: transform 120ms linear;
  }

  .panneau {
    position: absolute;
    top: 4.3rem;
    right: 1rem;
    bottom: 1rem;
    width: 16rem;
    z-index: 5;
    background: var(--verre);
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    padding: 0.9rem;
    overflow-y: auto;
    backdrop-filter: blur(12px);
    box-shadow: var(--ombre);
    transform: translateX(calc(100% + 1rem));
    opacity: 0;
    pointer-events: none;
    transition: transform 200ms ease, opacity 200ms ease;
  }

  .panneau.ouvert {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }

  .panneau h2 {
    font-family: var(--font-display);
    font-weight: 500;
    letter-spacing: -0.02em;
    font-size: 1.2rem;
    margin: 0 0 0.8rem;
    color: var(--encre);
  }

  .onglets {
    display: flex;
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    overflow: hidden;
    margin-bottom: 0.9rem;
  }

  .onglets button {
    flex: 1;
    padding: 0.5rem 0.4rem;
    border: none;
    border-right: 1px solid var(--ligne-forte);
    background: var(--verre-fort);
    color: var(--encre-douce);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .onglets button:last-child {
    border-right: none;
  }

  .onglets button.actif {
    background: var(--vert);
    color: #fff;
  }

  .onglets button:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: -2px;
  }

  .couches-fond {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .bouton-couche {
    width: 100%;
    min-height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    background: var(--verre-fort);
    color: var(--encre);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .bouton-couche:hover {
    border-color: var(--vert);
  }

  .bouton-couche.actif {
    background: var(--vert-clair);
    border-color: var(--vert);
  }

  .bouton-couche:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 2px;
  }

  /* Commutateur visuel angulaire (pas de pilule, cf. doc/style_VAL.html) : pastille grise
     éteinte, verte et décalée à droite une fois active. */
  .pastille {
    flex-shrink: 0;
    width: 2rem;
    height: 1.1rem;
    position: relative;
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    background: var(--granite);
    transition: background 150ms ease, border-color 150ms ease;
  }

  .pastille::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 1px;
    width: 0.9rem;
    height: 0.9rem;
    background: var(--papier);
    border-radius: 1px;
    transition: transform 150ms ease;
  }

  .bouton-couche.actif .pastille {
    background: var(--vert);
    border-color: var(--vert);
  }

  .bouton-couche.actif .pastille::after {
    transform: translateX(0.9rem);
  }

  #panel-aide h4 {
    margin: 0.9rem 0 0.4rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--encre-douce);
  }

  #panel-aide h4:first-child {
    margin-top: 0;
  }

  .note-geologie {
    margin: 0 0 0.8rem;
    font-size: 0.72rem;
    color: var(--encre-douce);
    line-height: 1.4;
  }

  .controle {
    margin-bottom: 0.8rem;
    font-size: 0.78rem;
  }

  .controle label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
    color: var(--encre);
  }

  .controle .valeur {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--encre-douce);
  }

  .controle input[type="range"] {
    width: 100%;
    accent-color: var(--vert);
  }

  .case {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.4rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--encre);
  }

  .case input {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--vert);
  }

  .bouton-recherche {
    width: 100%;
    min-height: 2.5rem;
    padding: 0.5rem 0.75rem;
    margin-top: 0.3rem;
    border: 1px solid var(--vert);
    border-radius: var(--rayon);
    background: var(--vert);
    color: #fff;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .bouton-recherche:hover:not(:disabled) {
    background: var(--vert-profond);
    border-color: var(--vert-profond);
  }

  .bouton-recherche:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .bouton-recherche:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 3px;
  }

  .erreur-geologie {
    margin: 0.6rem 0 0;
    padding: 0.5rem 0.6rem;
    border: 1px solid rgb(169 67 50 / 24%);
    border-radius: var(--rayon);
    background: rgb(169 67 50 / 10%);
    color: var(--alerte);
    font-size: 0.76rem;
  }

  .resume-geologie {
    margin: 0.8rem 0 0.5rem;
    font-size: 0.74rem;
    color: var(--encre-douce);
  }

  .liste-geologie {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .ligne-geologie {
    display: grid;
    gap: 0.3rem;
  }

  .item-geologie {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--ligne);
    border-radius: var(--rayon);
    background: var(--verre-fort);
    color: var(--encre);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item-geologie strong {
    font-size: 0.78rem;
  }

  .item-geologie span {
    font-size: 0.7rem;
    color: var(--encre-douce);
  }

  .item-geologie:hover {
    border-color: var(--vert);
  }

  .item-geologie:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 2px;
  }

  .bouton-analyse {
    justify-self: start;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--vert);
    border-radius: var(--rayon);
    background: rgb(255 255 255 / 54%);
    color: var(--vert);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }

  .bouton-analyse:hover {
    background: var(--vert-clair);
  }

  .bouton-analyse:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 2px;
  }

  /* Fenêtre pop-up de l'analyse IA d'une fiche : superposée à toute l'app, pas seulement au panneau. */
  .voile {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(20 37 29 / 45%);
  }

  .modale {
    width: min(100%, 32rem);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    background: var(--papier);
    color: var(--encre);
    box-shadow: var(--ombre);
  }

  .modale-entete {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--ligne);
  }

  .modale-entete h3 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.05rem;
  }

  .modale-fermer {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--ligne-forte);
    border-radius: var(--rayon);
    background: var(--verre-fort);
    color: var(--encre);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
  }

  .modale-fermer:hover {
    background: var(--vert);
    border-color: var(--vert);
    color: #fff;
  }

  .modale-fermer:focus-visible {
    outline: 2px solid var(--vert);
    outline-offset: 2px;
  }

  .modale-corps {
    padding: 1rem;
    overflow-y: auto;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .modale-corps h4 {
    margin: 0.9rem 0 0.4rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--encre-douce);
  }

  .log-geologique {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
    font-size: 0.8rem;
  }

  .log-geologique li {
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--ligne);
    border-radius: var(--rayon);
    background: var(--verre);
  }

  .scan-geologie {
    display: block;
    width: 100%;
    margin-top: 0.6rem;
    border: 1px solid var(--ligne);
    border-radius: var(--rayon);
  }

  .documents-geologie {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
    font-size: 0.8rem;
  }

  .documents-geologie li {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--ligne);
    border-radius: var(--rayon);
    background: var(--verre);
  }

  .documents-geologie a {
    color: var(--vert);
    font-weight: 600;
  }

  .documents-geologie span {
    font-size: 0.7rem;
    color: var(--encre-douce);
  }

  @media (max-width: 720px) {
    .panneau {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 55vh;
      border-radius: var(--rayon) var(--rayon) 0 0;
      transform: translateY(100%);
    }

    .panneau.ouvert {
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panneau,
    .boussole svg {
      transition: none;
    }
  }
</style>
