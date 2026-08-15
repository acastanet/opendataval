<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import { urlCarte } from "../lib/carte";
  import { urlGeologieProches, urlGeologieSynthese } from "../lib/geologie";

  const EXAGERATION = 1;
  // Les expressions `paint` de MapLibre n'interprètent pas var(--jeton) : les deux teintes
  // des repères sont donc écrites en dur, reprises du socle (--papier pour le halo) et
  // partagées par tous les repères de l'app — un seul bleu, sinon la carte se contredit.
  const REPERE = "#002fa7";
  const REPERE_HALO = "#fbfcfa";
  const BSS_SOURCE_ID = "bss-geologie-src";
  const BSS_LAYER_ID = "bss-geologie-points";
  const BSS_LABEL_LAYER_ID = "bss-geologie-numeros";
  const METHODE_SYNTHESE = {
    llm_vision: "Synthèse IA à partir du log et de la coupe scannée",
    llm_document_texte: "Synthèse IA à partir du log et du texte extrait d'un document PDF",
    llm_texte: "Synthèse IA à partir du log seul (aucun document exploitable)",
    structure_seule: "Résumé déterministe du log (sans appel IA)",
  };

  // Carte IGN et Photos aériennes sont deux fonds raster mutuellement exclusifs côté
  // map-service (un seul paramètre `fond`) : activer l'un désactive l'autre. La carte
  // géologique, elle, est une couche indépendante qui se superpose en transparence à l'un
  // ou l'autre. Terrain 3D et ombrage sont activés par défaut, mais restent basculables.
  let ignActif = true;
  let photosActif = false;
  let geologieActif = false;
  let terrainActif = true;
  let ombrageActif = true;

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

  function basculerTerrain() {
    terrainActif = !terrainActif;
    map?.setStyle(urlCarte(optionsCarte()));
  }

  function basculerOmbrage() {
    ombrageActif = !ombrageActif;
    map?.setStyle(urlCarte(optionsCarte()));
  }

  const POSITION_SOURCE_ID = "position-utilisateur";
  let positionUtilisateur = null;
  let erreurLocalisation = null;

  /** (Ré)applique le marqueur de position sur la carte : nécessaire après chaque map.setStyle(). */
  function appliquerMarqueurPosition() {
    if (!map || !positionUtilisateur) return;
    if (!map.isStyleLoaded()) {
      // Style initial pas encore chargé (ex. clic sur « Me localiser » très rapide après
      // l'ouverture) : map.getSource()/addSource() lèveraient sinon une exception MapLibre.
      map.once("load", appliquerMarqueurPosition);
      return;
    }
    const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: positionUtilisateur } };
    const source = map.getSource(POSITION_SOURCE_ID);
    if (source) {
      source.setData(point);
      return;
    }
    map.addSource(POSITION_SOURCE_ID, { type: "geojson", data: point });
    map.addLayer({
      id: POSITION_SOURCE_ID,
      type: "circle",
      source: POSITION_SOURCE_ID,
      paint: { "circle-radius": 8, "circle-color": REPERE, "circle-stroke-color": REPERE_HALO, "circle-stroke-width": 3 },
    });
  }

  function meLocaliser() {
    erreurLocalisation = null;
    if (!navigator.geolocation) {
      erreurLocalisation = "La géolocalisation n'est pas disponible sur cet appareil.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        positionUtilisateur = [coords.longitude, coords.latitude];
        appliquerMarqueurPosition();
        map?.flyTo({
          center: positionUtilisateur,
          zoom: 14,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800,
          essential: false,
        });
      },
      () => { erreurLocalisation = "Votre position n'a pas pu être obtenue. Vérifiez l'autorisation de localisation."; },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
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
      terrain: terrainActif,
      exageration: EXAGERATION,
      ombrage: ombrageActif ? "sculpte" : "aucun",
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
        "circle-color": REPERE,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": REPERE_HALO,
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
        "text-color": REPERE_HALO,
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
    map.on("style.load", () => {
      if (resultatsGeologie.length > 0) appliquerMarqueursGeologie();
      appliquerMarqueurPosition();
    });
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

  <!-- Le retour à l'accueil vient de la languette partagée du Layout (chrome="minimal") :
       un second bouton local ferait doublon et divergerait du reste du portail. -->

  <button
    class="hamburger"
    aria-label={panneauOuvert ? "Masquer le menu" : "Afficher le menu"}
    aria-expanded={panneauOuvert}
    aria-controls="lavgeol-panneau"
    on:click={() => (panneauOuvert = !panneauOuvert)}
  >
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  </button>

  <div class="boussole" aria-hidden="true">
    <svg viewBox="0 0 32 40" style={`transform: rotate(${-bearing}deg)`}>
      <path d="M16 12 L24 39 L16 31 L8 39 Z" fill="var(--papier)" stroke="var(--alerte)" stroke-width="1.5" stroke-linejoin="round" />
      <text x="16" y="8" text-anchor="middle" font-family="var(--font-mono)" font-size="10" font-weight="700" fill="var(--texte-principal)">N</text>
    </svg>
  </div>

  <aside id="lavgeol-panneau" class="panneau" class:ouvert={panneauOuvert}>
    <h2>Lavgeol</h2>

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
      <h4>Fond de carte</h4>
      <div class="couches-fond">
        <button type="button" class="bouton-couche" class:actif={geologieActif} aria-pressed={geologieActif} on:click={basculerGeologieFond}>
          Carte géologique
          <span class="pastille" aria-hidden="true"></span>
        </button>
        <button type="button" class="bouton-couche" class:actif={ignActif} aria-pressed={ignActif} on:click={basculerIgn}>
          Carte IGN
          <span class="pastille" aria-hidden="true"></span>
        </button>
        <button type="button" class="bouton-couche" class:actif={photosActif} aria-pressed={photosActif} on:click={basculerPhotos}>
          Photos aériennes
          <span class="pastille" aria-hidden="true"></span>
        </button>
      </div>
      <p class="note-geologie">Carte IGN et Photos aériennes sont deux fonds exclusifs : activer l'un désactive l'autre. Carte géologique se superpose en transparence, sur l'un ou l'autre.</p>

      <h4>Relief</h4>
      <div class="couches-fond">
        <button type="button" class="bouton-couche" class:actif={terrainActif} aria-pressed={terrainActif} on:click={basculerTerrain}>
          Relief 3D
          <span class="pastille" aria-hidden="true"></span>
        </button>
        <button type="button" class="bouton-couche" class:actif={ombrageActif} aria-pressed={ombrageActif} on:click={basculerOmbrage}>
          Ombrage
          <span class="pastille" aria-hidden="true"></span>
        </button>
      </div>
      <p class="note-geologie">Relief 3D applique un relief en volume à la carte. Ombrage ajoute un estompage du relief (hillshade) pour en accentuer la lecture.</p>

      <h4>Position</h4>
      <button type="button" class="bouton-recherche" on:click={meLocaliser}>Me localiser</button>
      {#if erreurLocalisation}
        <p class="erreur-geologie">{erreurLocalisation}</p>
      {/if}
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
        Dans l'onglet Carte : Carte IGN (plan topographique) et Photos aériennes sont deux
        fonds exclusifs, activer l'un désactive l'autre. Carte géologique superpose la carte
        géologique du BRGM en transparence, sur l'un ou l'autre. Relief 3D et Ombrage
        activent ou désactivent respectivement le relief en volume et son estompage.
      </p>
      <h4>Ouvrages géologiques</h4>
      <p class="note-geologie">
        Dans l'onglet Géologie, « Rechercher autour du centre » interroge la banque du sous-sol
        du BRGM dans le rayon choisi, centré sur le centre actuel de la carte. Les ouvrages
        trouvés s'affichent numérotés en bleu sur la carte ; cliquer sur un résultat de la liste
        y recentre la vue. Le bouton « Analyse IA », quand il est proposé, interroge la fiche
        InfoTerre de l'ouvrage en deux étapes : elle sélectionne d'abord, parmi les documents
        numérisés de la fiche (scans TIFF ou PDF), celui le plus susceptible de contenir une
        coupe géologique exploitable, puis en tire un résumé combiné au log géologique. Le
        document retenu et, s'il est fourni par l'IA, le motif de son choix sont affichés en
        tête de la fenêtre d'analyse.
      </p>
      <h4>Position</h4>
      <p class="note-geologie">
        Dans l'onglet Carte, « Me localiser » utilise la géolocalisation du navigateur pour
        centrer la carte sur votre position actuelle et y placer un repère bleu ; il faut
        autoriser l'accès à la position quand le navigateur le demande.
      </p>
      <h4>Accueil et menu</h4>
      <p class="note-geologie">
        La languette « Accueil », au bord haut de l'écran au centre, ramène au portail : elle se
        déplie au survol ou au passage clavier. Le bouton hamburger en haut à droite replie ou
        déplie ce panneau.
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
            {#if syntheseDonnees.document_selectionne}
              <p class="note-geologie">
                Document sélectionné : <strong>{syntheseDonnees.document_selectionne.nom}</strong>
                {#if syntheseDonnees.document_selectionne.raison} — {syntheseDonnees.document_selectionne.raison}{/if}
              </p>
            {/if}
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
            {#if syntheseDonnees.document_texte_analyse}
              <p class="note-geologie">Extrait du texte analysé ({syntheseDonnees.document_texte_analyse.nom}) : « {syntheseDonnees.document_texte_analyse.extrait}… »</p>
            {/if}
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
  /* Aucun jeton n'est redéfini ici : couleurs, typographie, espacements et durées
     viennent de packages/shared/styles/design-system.css, importé par le Layout.
     Seul le fond d'alerte, absent du socle, est dérivé de --alerte par color-mix. */
  .explorateur {
    position: relative;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    font-family: var(--font-body);
    color: var(--texte-principal);
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
    border-bottom: 2px solid var(--texte-principal);
    border-radius: 0;
    color: var(--texte-principal);
    font-family: var(--font-mono);
    font-size: var(--txt-micro);
    font-weight: var(--poids-fort);
    text-align: center;
    padding: 0 0 var(--esp-2xs);
    box-shadow: none;
  }

  :global(.explorateur .maplibregl-ctrl-scale::before),
  :global(.explorateur .maplibregl-ctrl-scale::after) {
    content: "";
    position: absolute;
    bottom: -0.3rem;
    width: 2px;
    height: var(--esp-s);
    background: var(--texte-principal);
  }

  :global(.explorateur .maplibregl-ctrl-scale::before) {
    left: 0;
  }

  :global(.explorateur .maplibregl-ctrl-scale::after) {
    right: 0;
  }

  /* Cible tactile de 40 px (--cible) : plancher opposable du référentiel. */
  .hamburger {
    position: absolute;
    top: var(--esp-l);
    right: var(--esp-l);
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--cible);
    height: var(--cible);
    padding: 0;
    background: var(--surface-elevee);
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    color: var(--texte-principal);
    box-shadow: var(--ombre);
    cursor: pointer;
    transition:
      background var(--duree-courte) var(--courbe),
      color var(--duree-courte) var(--courbe),
      border-color var(--duree-courte) var(--courbe);
  }

  .hamburger svg {
    width: var(--txt-xl);
    height: var(--txt-xl);
  }

  .hamburger:hover {
    background: var(--couleur-action);
    border-color: var(--couleur-action);
    color: var(--blanc);
  }

  /* Indicateur de nord : lecture seule, jamais cliquable ni déplaçable. Aiguille pleine
     posée directement sur la carte, sans médaillon ni fond — voir doc/style_VAL.html. */
  .boussole {
    position: absolute;
    left: var(--esp-l);
    bottom: 4.4rem;
    z-index: 4;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--encre) 35%, transparent));
  }

  .boussole svg {
    width: 2.25rem;
    height: 2.4rem;
    display: block;
    /* Suit la rotation de la carte au doigt : linéaire et plus court que --duree-courte,
       sinon l'aiguille traîne derrière le geste. */
    transition: transform 120ms linear;
  }

  /* Panneau opaque : sur fond cartographique, le contraste d'un texte posé sur une tuile
     raster n'est pas prévisible et l'imagerie change à chaque zoom (référentiel §02).
     Calé sous le hamburger, dont il reprend la gouttière. */
  .panneau {
    position: absolute;
    top: calc(var(--esp-l) + var(--cible) + var(--esp-m));
    right: var(--esp-l);
    bottom: var(--esp-l);
    width: 16rem;
    z-index: 5;
    background: var(--surface-plate);
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    padding: var(--esp-l);
    overflow-y: auto;
    box-shadow: var(--ombre);
    transform: translateX(calc(100% + var(--esp-l)));
    opacity: 0;
    pointer-events: none;
    transition:
      transform var(--duree-courte) var(--courbe),
      opacity var(--duree-courte) var(--courbe);
  }

  .panneau.ouvert {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }

  .panneau h2 {
    font-family: var(--font-display);
    font-weight: var(--poids-appui);
    letter-spacing: var(--ls-titre);
    font-size: var(--txt-xl);
    margin: 0 0 var(--esp-m);
    color: var(--texte-principal);
  }

  .onglets {
    display: flex;
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    overflow: hidden;
    margin-bottom: var(--esp-l);
  }

  .onglets button {
    flex: 1;
    min-height: var(--cible);
    padding: var(--esp-xs) var(--esp-2xs);
    border: none;
    border-right: var(--rayon-fin) solid var(--bordure-forte);
    background: var(--surface-elevee);
    color: var(--texte-secondaire);
    font: inherit;
    font-size: var(--txt-s);
    font-weight: var(--poids-fort);
    cursor: pointer;
  }

  .onglets button:last-child {
    border-right: none;
  }

  .onglets button.actif {
    background: var(--couleur-action);
    color: var(--blanc);
  }

  /* Seule exception à l'anneau de focus du socle : posé à l'intérieur, sinon il déborde
     du groupe d'onglets qui est en overflow: hidden. */
  .onglets button:focus-visible {
    outline-offset: -3px;
  }

  .couches-fond {
    display: grid;
    gap: var(--esp-2xs);
    margin-bottom: var(--esp-xs);
  }

  .bouton-couche {
    width: 100%;
    min-height: var(--cible);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--esp-s);
    padding: var(--esp-xs) var(--esp-m);
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    background: var(--surface-elevee);
    color: var(--texte-principal);
    font: inherit;
    font-size: var(--txt-s);
    font-weight: var(--poids-appui);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duree-courte) var(--courbe),
      border-color var(--duree-courte) var(--courbe);
  }

  .bouton-couche:hover {
    border-color: var(--couleur-action);
  }

  .bouton-couche.actif {
    background: var(--couleur-action-douce);
    border-color: var(--couleur-action);
  }

  /* Commutateur visuel angulaire (pas de pilule, cf. doc/style_VAL.html) : pastille grise
     éteinte, verte et décalée à droite une fois active. */
  .pastille {
    flex-shrink: 0;
    width: 2rem;
    height: 1.1rem;
    position: relative;
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    background: var(--decor);
    transition:
      background var(--duree-courte) var(--courbe),
      border-color var(--duree-courte) var(--courbe);
  }

  .pastille::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 1px;
    width: 0.9rem;
    height: 0.9rem;
    background: var(--papier);
    border-radius: var(--rayon-fin);
    transition: transform var(--duree-courte) var(--courbe);
  }

  .bouton-couche.actif .pastille {
    background: var(--couleur-action);
    border-color: var(--couleur-action);
  }

  .bouton-couche.actif .pastille::after {
    transform: translateX(0.9rem);
  }

  .panneau h4 {
    margin: var(--esp-l) 0 var(--esp-2xs);
    font-size: var(--txt-xs);
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
    color: var(--texte-secondaire);
  }

  .panneau h4:first-child {
    margin-top: 0;
  }

  .note-geologie {
    margin: 0 0 var(--esp-m);
    font-size: var(--txt-xs);
    color: var(--texte-secondaire);
    line-height: 1.4;
  }

  .controle {
    margin-bottom: var(--esp-m);
    font-size: var(--txt-s);
  }

  .controle label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--esp-3xs);
    color: var(--texte-principal);
  }

  .controle .valeur {
    font-family: var(--font-mono);
    font-size: var(--txt-xs);
    color: var(--texte-secondaire);
  }

  .controle input[type="range"] {
    width: 100%;
    accent-color: var(--couleur-action);
  }

  .case {
    display: flex;
    align-items: center;
    gap: var(--esp-2xs);
    margin-bottom: var(--esp-2xs);
    font-size: var(--txt-s);
    font-weight: var(--poids-appui);
    color: var(--texte-principal);
  }

  .case input {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--couleur-action);
  }

  .bouton-recherche {
    width: 100%;
    min-height: var(--cible);
    padding: var(--esp-xs) var(--esp-m);
    margin-top: var(--esp-3xs);
    border: var(--rayon-fin) solid var(--couleur-action);
    border-radius: var(--rayon);
    background: var(--couleur-action);
    color: var(--blanc);
    font: inherit;
    font-size: var(--txt-s);
    font-weight: var(--poids-fort);
    cursor: pointer;
  }

  .bouton-recherche:hover:not(:disabled) {
    background: var(--couleur-action-active);
    border-color: var(--couleur-action-active);
  }

  .bouton-recherche:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  /* Vigilance non chromatique : le texte porte l'information, le fond n'est qu'un rappel
     dérivé de --alerte — le socle ne définit pas de jeton de fond d'alerte. */
  .erreur-geologie {
    margin: var(--esp-s) 0 0;
    padding: var(--esp-xs) var(--esp-s);
    border: var(--rayon-fin) solid color-mix(in srgb, var(--alerte) 24%, transparent);
    border-radius: var(--rayon);
    background: color-mix(in srgb, var(--alerte) 10%, transparent);
    color: var(--alerte);
    font-size: var(--txt-xs);
  }

  .resume-geologie {
    margin: var(--esp-m) 0 var(--esp-xs);
    font-size: var(--txt-xs);
    color: var(--texte-secondaire);
  }

  .liste-geologie {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--esp-xs);
  }

  .ligne-geologie {
    display: grid;
    gap: var(--esp-3xs);
  }

  .item-geologie {
    width: 100%;
    min-height: var(--cible);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--esp-3xs);
    padding: var(--esp-xs) var(--esp-s);
    border: var(--rayon-fin) solid var(--bordure);
    border-radius: var(--rayon);
    background: var(--surface-elevee);
    color: var(--texte-principal);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item-geologie strong {
    font-size: var(--txt-s);
  }

  .item-geologie span {
    font-size: var(--txt-micro);
    color: var(--texte-secondaire);
  }

  .item-geologie:hover {
    border-color: var(--couleur-action);
  }

  .bouton-analyse {
    justify-self: start;
    min-height: var(--cible);
    padding: var(--esp-3xs) var(--esp-s);
    border: var(--rayon-fin) solid var(--couleur-action);
    border-radius: var(--rayon);
    background: var(--surface-elevee);
    color: var(--couleur-action);
    font: inherit;
    font-size: var(--txt-xs);
    font-weight: var(--poids-fort);
    cursor: pointer;
  }

  .bouton-analyse:hover {
    background: var(--couleur-action-douce);
  }

  /* Fenêtre pop-up de l'analyse IA d'une fiche : superposée à toute l'app, pas seulement au panneau. */
  .voile {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--esp-l);
    /* Le socle ne définit pas de rôle « voile » : dérivé de l'encre plutôt qu'écrit en dur. */
    background: color-mix(in srgb, var(--encre) 45%, transparent);
  }

  .modale {
    width: min(100%, 32rem);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    background: var(--surface-plate);
    color: var(--texte-principal);
    box-shadow: var(--ombre);
  }

  .modale-entete {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--esp-s);
    padding: var(--esp-m) var(--esp-l);
    border-bottom: var(--rayon-fin) solid var(--bordure);
  }

  .modale-entete h3 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: var(--poids-appui);
    letter-spacing: var(--ls-titre);
    font-size: var(--txt-xl);
  }

  .modale-fermer {
    flex-shrink: 0;
    width: var(--cible);
    height: var(--cible);
    border: var(--rayon-fin) solid var(--bordure-forte);
    border-radius: var(--rayon);
    background: var(--surface-elevee);
    color: var(--texte-principal);
    font-size: var(--txt-m);
    line-height: 1;
    cursor: pointer;
  }

  .modale-fermer:hover {
    background: var(--couleur-action);
    border-color: var(--couleur-action);
    color: var(--blanc);
  }

  .modale-corps {
    padding: var(--esp-l);
    overflow-y: auto;
    font-size: var(--txt-m);
    line-height: 1.5;
  }

  .modale-corps h4 {
    margin: var(--esp-l) 0 var(--esp-2xs);
    font-size: var(--txt-xs);
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
    color: var(--texte-secondaire);
  }

  .log-geologique {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--esp-3xs);
    font-size: var(--txt-s);
  }

  .log-geologique li {
    padding: var(--esp-2xs) var(--esp-xs);
    border: var(--rayon-fin) solid var(--bordure);
    border-radius: var(--rayon);
    background: var(--surface-fond);
  }

  .scan-geologie {
    display: block;
    width: 100%;
    margin-top: var(--esp-s);
    border: var(--rayon-fin) solid var(--bordure);
    border-radius: var(--rayon);
  }

  .documents-geologie {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--esp-3xs);
    font-size: var(--txt-s);
  }

  .documents-geologie li {
    display: flex;
    align-items: baseline;
    gap: var(--esp-2xs);
    padding: var(--esp-2xs) var(--esp-xs);
    border: var(--rayon-fin) solid var(--bordure);
    border-radius: var(--rayon);
    background: var(--surface-fond);
  }

  .documents-geologie a {
    color: var(--couleur-action);
    font-weight: var(--poids-appui);
  }

  .documents-geologie span {
    font-size: var(--txt-micro);
    color: var(--texte-secondaire);
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

  /* Pas de bloc prefers-reduced-motion local : le socle neutralise déjà toutes les
     transitions et animations de la page (design-system.css). */
</style>
