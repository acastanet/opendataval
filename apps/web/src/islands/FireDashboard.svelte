<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import Fa from "svelte-fa";
  import { faCampground, faCircleInfo, faFireFlameCurved, faHammer, faRoad } from "@fortawesome/free-solid-svg-icons";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { IGN_WMTS, ajouterControleIncendies } from "../lib/carte";

  const GARD_REFERENCE_URL = "https://www.risque-prevention-incendie.fr/gard/";
  const GARD_ARRETES_URL = "https://www.gard.gouv.fr/Actions-de-l-Etat/Securite-et-protection-de-la-population/Risques/Gestion-du-risque-feu-de-foret/Carte-de-vigilance";
  const NOMS_MASSIFS: Record<number, string> = { 301: "CAUSSE AIGOUAL", 302: "SUD CEVENNES", 303: "NORD CEVENNES" };

  interface RiskZone {
    date_validite: string;
    collectee_a: string;
    zone_officielle: string;
    niveau: string;
    restrictions: string | null;
    source_url: string;
  }
  interface RiskSummary { etat: "ok" | "indisponible"; date_validite: string; niveau_max: string; zones: RiskZone[]; }
  interface FireSituation {
    risque_gard: { aujourd_hui: RiskSummary; demain: RiskSummary };
  }
  interface TerritoireResponse {
    commune: { nom: string; geometry: { type: string; coordinates: unknown } } | null;
  }
  interface GeoJsonFeature {
    type: "Feature";
    id?: number;
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }
  interface GeoJsonCollection { type: "FeatureCollection"; features: GeoJsonFeature[]; }

  const libellesNiveaux: Record<string, string> = {
    vert: "Vigilance normale", jaune: "Vigilance renforcée", orange: "Danger élevé", rouge: "Danger très élevé", inconnu: "Information en attente",
  };
  const couleursNiveaux: Record<string, string> = {
    vert: "#18794e", jaune: "#a56700", orange: "#bd4d11", rouge: "#ad2434", inconnu: "#687076",
  };
  const couleursCarte: Record<string, string> = {
    vert: "#d7dcdf", jaune: "#f2c84b", orange: "#ee7b32", rouge: "#d83b4b", inconnu: "#b8bec2",
  };
  const niveauxLegende = [
    { niveau: "vert", titre: "Vigilance habituelle", resume: "Accès autorisé · travaux autorisés", classe: "trait" },
    { niveau: "jaune", titre: "Vigilance renforcée", resume: "Précautions renforcées", classe: "jaune" },
    { niveau: "orange", titre: "Danger élevé", resume: "Accès déconseillé · horaires limités", classe: "orange" },
    { niveau: "rouge", titre: "Danger très élevé", resume: "Accès et travaux interdits", classe: "rouge" },
  ];
  const reglesCompletes: Record<string, string[]> = {
    vert: [
      "Toute utilisation de feu interdite (*)",
      "Travaux autorisés",
      "Camping et bivouac possibles en fonction des réglementations locales",
      "Accès autorisé",
      "Circulation motorisée réglementée en forêt",
    ],
    jaune: [
      "Toute utilisation de feu interdite (*)",
      "Travaux autorisés avec un dispositif d’extinction approprié (*)",
      "Camping et bivouac possibles en fonction des réglementations locales",
      "Accès autorisé",
      "Circulation motorisée réglementée en forêt",
    ],
    orange: [
      "Toute utilisation de feu interdite (*)",
      "Travaux autorisés de 5 h à 13 h avec un dispositif d’extinction approprié (*)",
      "Camping et bivouac interdits (*)",
      "Accès déconseillé",
      "Circulation motorisée réglementée en forêt",
    ],
    rouge: [
      "Toute utilisation de feu interdite (*)",
      "Travaux interdits (*)",
      "Camping et bivouac interdits (*)",
      "Accès interdit",
      "Circulation motorisée interdite en forêt",
    ],
    inconnu: ["Données indisponibles : consultez la carte officielle du Gard avant tout déplacement."],
  };
  const iconesConsignes = { feu: faFireFlameCurved, acces: faRoad, travaux: faHammer, bivouac: faCampground, information: faCircleInfo };
  const consignes: Record<string, Array<{ titre: string; texte: string; icone: "feu" | "acces" | "travaux" | "bivouac" | "information" }>> = {
    vert: [
      { titre: "Feu et barbecue", texte: "Interdits hors équipements autorisés.", icone: "feu" },
      { titre: "Accès", texte: "Autorisé : restez attentif aux consignes locales.", icone: "acces" },
      { titre: "Travaux", texte: "Autorisé avec les précautions nécessaires.", icone: "travaux" },
      { titre: "Bivouac", texte: "Selon les règles locales en vigueur.", icone: "bivouac" },
    ],
    jaune: [
      { titre: "Feu et barbecue", texte: "Interdits dans et à proximité des massifs.", icone: "feu" },
      { titre: "Accès", texte: "Autorisé. Respectez les consignes affichées.", icone: "acces" },
      { titre: "Travaux", texte: "Autorisé avec un moyen d’extinction adapté.", icone: "travaux" },
      { titre: "Bivouac", texte: "Selon les règles locales en vigueur.", icone: "bivouac" },
    ],
    orange: [
      { titre: "Feu et barbecue", texte: "Interdits dans et à proximité des massifs.", icone: "feu" },
      { titre: "Accès", texte: "Déconseillé : reportez votre sortie si possible.", icone: "acces" },
      { titre: "Travaux", texte: "Autorisé de 5 h à 13 h avec un moyen d’extinction.", icone: "travaux" },
      { titre: "Bivouac", texte: "Interdit.", icone: "bivouac" },
    ],
    rouge: [
      { titre: "Feu et barbecue", texte: "Interdits.", icone: "feu" },
      { titre: "Accès", texte: "Interdit dans les massifs concernés.", icone: "acces" },
      { titre: "Travaux", texte: "Interdits.", icone: "travaux" },
      { titre: "Bivouac", texte: "Interdit.", icone: "bivouac" },
    ],
    inconnu: [
      { titre: "Consignes", texte: "Consultez la carte officielle avant de partir.", icone: "information" },
    ],
  };

  let etat: "chargement" | "ok" | "erreur" = "chargement";
  let situation: FireSituation | null = null;
  let jour: "aujourd_hui" | "demain" = "aujourd_hui";
  let massifSelectionne: string | null = null;
  let detailOuvert = false;
  let boutonFermer: HTMLButtonElement;
  let erreurLocalisation: string | null = null;
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let limitesCommune: GeoJsonFeature | null = null;
  let empriseCommune: [[number, number], [number, number]] | null = null;
  let featureSurvolee: string | number | null = null;
  let risqueActif: RiskSummary | null = null;
  $: risqueActif = situation?.risque_gard[jour] ?? null;
  $: niveauActif = risqueActif?.niveau_max ?? "inconnu";
  $: consignesActives = consignes[niveauActif] ?? consignes.inconnu;
  $: risqueMassifSelectionne = massifSelectionne
    ? risqueActif?.zones.find((risque) => risque.zone_officielle === massifSelectionne) ?? null
    : null;
  $: niveauMassifSelectionne = risqueMassifSelectionne?.niveau ?? "inconnu";

  function formaterJour(value: string): string {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date(`${value}T12:00:00Z`));
  }

  function formaterCollecte(value: string): string {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
  }

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  async function chargerMassifsGard(risques: RiskZone[]): Promise<GeoJsonCollection> {
    try {
      const collection = await fetchJson<GeoJsonCollection>("/api/incendies/massifs-officiels");
      const niveaux = new Map(risques.map((risque) => [risque.zone_officielle, risque.niveau]));
      return {
        type: "FeatureCollection",
        features: collection.features.filter((feature) => NOMS_MASSIFS[Number(feature.properties.ID)]).map((feature) => {
          const id = Number(feature.properties.ID);
          const nom = NOMS_MASSIFS[id];
          return { ...feature, properties: { ...feature.properties, ID: id, NOM_MASSIF: nom, niveau: niveaux.get(nom) ?? "inconnu" } };
        }),
      };
    } catch (error) {
      console.warn("Contours des massifs gardois indisponibles", error);
      return { type: "FeatureCollection", features: [] };
    }
  }

  function calculerEmprise(geometry: { coordinates: unknown }): [[number, number], [number, number]] | null {
    let ouest = Infinity;
    let sud = Infinity;
    let est = -Infinity;
    let nord = -Infinity;
    function parcourir(value: unknown): void {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        ouest = Math.min(ouest, value[0]); sud = Math.min(sud, value[1]);
        est = Math.max(est, value[0]); nord = Math.max(nord, value[1]);
        return;
      }
      value.forEach(parcourir);
    }
    parcourir(geometry.coordinates);
    return Number.isFinite(ouest) ? [[ouest, sud], [est, nord]] : null;
  }

  function recentrerCommune(): void {
    if (!map || !empriseCommune) return;
    map.fitBounds(empriseCommune, { padding: 48, duration: 800, essential: true });
  }

  async function ouvrirDetailMassif(nom: string): Promise<void> {
    massifSelectionne = nom;
    detailOuvert = true;
    await tick();
    boutonFermer?.focus();
  }

  function fermerDetailMassif(): void {
    detailOuvert = false;
    mapContainer?.focus();
  }

  function initialiserCarte(massifs: GeoJsonCollection): void {
    map = new maplibregl.Map({
      container: mapContainer,
      style: { version: 8, sources: {}, layers: [], glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf" },
      center: [3.66, 44.12], zoom: 9.05, attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.on("load", () => {
      if (!map) return;
      map.addSource("plan-ign", { type: "raster", tiles: [IGN_WMTS("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")], tileSize: 256, attribution: "© IGN" });
      map.addLayer({ id: "plan-ign", type: "raster", source: "plan-ign" });
      map.addSource("orthophoto-ign", { type: "raster", tiles: [IGN_WMTS("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")], tileSize: 256, attribution: "© IGN" });
      map.addLayer({ id: "orthophoto-ign", type: "raster", source: "orthophoto-ign", layout: { visibility: "none" } });
      ajouterControleIncendies(map, { planLayerId: "plan-ign", photoLayerId: "orthophoto-ign", onRecentrer: recentrerCommune, onLocaliser: meLocaliser });
      if (limitesCommune) {
        map.addSource("val-aigoual", { type: "geojson", data: limitesCommune as GeoJSON.Feature });
      }
      map.addSource("massifs-gard", { type: "geojson", data: massifs as GeoJSON.FeatureCollection, generateId: true });
      map.addLayer({
        id: "massifs-gard-fill",
        type: "fill",
        source: "massifs-gard",
        paint: {
          "fill-color": ["match", ["get", "niveau"], "jaune", couleursCarte.jaune, "orange", couleursCarte.orange, "rouge", couleursCarte.rouge, "vert", couleursCarte.vert, couleursCarte.inconnu],
          "fill-opacity": ["case", ["boolean", ["feature-state", "survol"], false], 0.66, 0.38],
        },
      });
      map.addLayer({
        id: "massifs-gard-line",
        type: "line",
        source: "massifs-gard",
        paint: {
          "line-color": ["match", ["get", "niveau"], "jaune", "#8a6500", "orange", "#a93f08", "rouge", "#8f1627", "vert", "#596168", "#596168"],
          "line-width": ["case", ["boolean", ["feature-state", "survol"], false], 5, 2.5],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({ id: "massifs-gard-label", type: "symbol", source: "massifs-gard", layout: { "text-field": ["get", "NOM_MASSIF"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-max-width": 9 }, paint: { "text-color": "#182126", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
      if (limitesCommune) {
        map.addLayer({ id: "val-aigoual-halo", type: "line", source: "val-aigoual", paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 } });
        map.addLayer({ id: "val-aigoual-line", type: "line", source: "val-aigoual", paint: { "line-color": "#1463a4", "line-width": 3.5, "line-dasharray": [2, 1.4] } });
      }
      map.on("click", "massifs-gard-fill", (event) => {
        const nom = String(event.features?.[0]?.properties?.NOM_MASSIF ?? "");
        if (nom) void ouvrirDetailMassif(nom);
      });
      map.on("mousemove", "massifs-gard-fill", (event) => {
        if (!map) return;
        map.getCanvas().style.cursor = "pointer";
        if (featureSurvolee !== null) map.setFeatureState({ source: "massifs-gard", id: featureSurvolee }, { survol: false });
        featureSurvolee = event.features?.[0]?.id ?? null;
        if (featureSurvolee !== null) map.setFeatureState({ source: "massifs-gard", id: featureSurvolee }, { survol: true });
      });
      map.on("mouseleave", "massifs-gard-fill", () => {
        if (!map) return;
        map.getCanvas().style.cursor = "";
        if (featureSurvolee !== null) map.setFeatureState({ source: "massifs-gard", id: featureSurvolee }, { survol: false });
        featureSurvolee = null;
      });
    });
  }

  function meLocaliser(): void {
    erreurLocalisation = null;
    if (!navigator.geolocation) { erreurLocalisation = "La géolocalisation n’est pas disponible sur cet appareil."; return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!map) return;
        const position: [number, number] = [coords.longitude, coords.latitude];
        const source = map.getSource("position-utilisateur") as maplibregl.GeoJSONSource | undefined;
        const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: position } } as GeoJSON.Feature<GeoJSON.Point>;
        if (source) source.setData(point);
        else {
          map.addSource("position-utilisateur", { type: "geojson", data: point });
          map.addLayer({ id: "position-utilisateur", type: "circle", source: "position-utilisateur", paint: { "circle-radius": 8, "circle-color": "#1463a4", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
        }
        map.flyTo({ center: position, zoom: 12, essential: true });
      },
      () => { erreurLocalisation = "Votre position n’a pas pu être obtenue. Vérifiez l’autorisation de localisation."; },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function changerJour(prochainJour: "aujourd_hui" | "demain"): Promise<void> {
    jour = prochainJour;
    massifSelectionne = null;
    detailOuvert = false;
    featureSurvolee = null;
    if (!situation) return;
    const massifs = await chargerMassifsGard(situation.risque_gard[prochainJour].zones);
    const source = map?.getSource("massifs-gard") as maplibregl.GeoJSONSource | undefined;
    source?.setData(massifs as GeoJSON.FeatureCollection);
  }

  async function charger(): Promise<void> {
    try {
      const [situationRecue, territoire] = await Promise.all([
        fetchJson<FireSituation>("/api/incendies/situation"),
        fetchJson<TerritoireResponse>("/api/territoire"),
      ]);
      situation = situationRecue;
      if (territoire.commune?.geometry) {
        limitesCommune = { type: "Feature", geometry: territoire.commune.geometry, properties: { nom: territoire.commune.nom } };
        empriseCommune = calculerEmprise(territoire.commune.geometry);
      }
      const massifs = await chargerMassifsGard(situation.risque_gard.aujourd_hui.zones);
      etat = "ok";
      await tick();
      initialiserCarte(massifs);
    } catch (error) {
      console.error("conseils incendies indisponibles", error);
      etat = "erreur";
    }
  }

  onMount(() => { void charger(); });
  onDestroy(() => map?.remove());
</script>

{#if etat === "chargement"}
  <p class="etat">Chargement des recommandations officielles…</p>
{:else if etat === "erreur"}
  <p class="etat erreur">Les recommandations officielles sont temporairement indisponibles. Consultez la <a href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">carte du Gard</a>.</p>
{:else if risqueActif}
  <section class="situation" aria-labelledby="titre-situation">
    <div class="choix-jour" aria-label="Jour des recommandations">
      <button class:actif={jour === "aujourd_hui"} type="button" on:click={() => changerJour("aujourd_hui")}>Aujourd’hui</button>
      <button class:actif={jour === "demain"} type="button" on:click={() => changerJour("demain")}>Demain</button>
    </div>
    <p class="date">{formaterJour(risqueActif.date_validite)}</p>
    {#if risqueActif.etat === "ok"}
      <div class="niveau" style={`--couleur-niveau:${couleursNiveaux[niveauActif]}`}>
        <p class="eyebrow">Risque le plus élevé sur les trois massifs</p>
        <h2 id="titre-situation">{niveauActif.toUpperCase()} <span>— {libellesNiveaux[niveauActif]}</span></h2>
      </div>
      <p class="precision">Les règles peuvent différer selon le massif : sélectionnez-en un sur la carte pour lire son niveau.</p>
      <div class="consignes" aria-label="Consignes principales">
        {#each consignesActives as consigne}
          <article>
            <span class="pictogramme" aria-hidden="true"><Fa icon={iconesConsignes[consigne.icone]} /></span>
            <div><h3>{consigne.titre}</h3><p>{consigne.texte}</p></div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="niveau indisponible"><p class="eyebrow">Danger officiel — Gard</p><h2 id="titre-situation">Publication en attente</h2></div>
      <p class="precision">Avant tout déplacement, consultez la carte officielle.</p>
    {/if}
    <p class="source">Source : Prévention incendie Gard · <a href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">carte et recommandations officielles</a></p>
  </section>

  <section class="orientation" aria-labelledby="titre-orientation">
    <div class="titre-carte">
      <div><p class="eyebrow">Commune de Val-d’Aigoual</p><h2 id="titre-orientation">Dans quel massif allez-vous ?</h2></div>
    </div>
    <p class="aide">Le trait bleu pointillé délimite précisément la commune de Val-d’Aigoual. Touchez l’un des massifs forestiers officiels qui la recouvrent pour afficher les recommandations applicables.</p>
    {#if massifSelectionne}
      <div class="selection">
        <p><strong>{massifSelectionne}</strong> : <span style={`color:${couleursNiveaux[niveauMassifSelectionne]}`}>{niveauMassifSelectionne.toUpperCase()}</span></p>
        <button type="button" on:click={() => ouvrirDetailMassif(massifSelectionne ?? "")}>Voir les règles complètes</button>
      </div>
    {/if}
    {#if erreurLocalisation}<p class="erreur-localisation">{erreurLocalisation}</p>{/if}
    <div class="carte" bind:this={mapContainer} tabindex="-1" aria-label="Carte des trois principaux massifs gardois autour de l’Aigoual"></div>

    <section class="bloc-legende" aria-labelledby="titre-legende">
      <div class="entete-legende">
        <div>
          <p class="eyebrow">Réglementation officielle</p>
          <h3 id="titre-legende">Légende de la carte</h3>
        </div>
      </div>
      <p class="repere-commune"><span aria-hidden="true"></span> Limite administrative de la commune de Val-d’Aigoual</p>
      <ul class="echelle-risque">
        {#each niveauxLegende as item}
          <li>
            <span class={`pastille-niveau ${item.classe}`} aria-hidden="true"></span>
            <span><strong>{item.titre}</strong><small>{item.resume}</small></span>
          </li>
        {/each}
      </ul>
      <details class="regles-legende">
        <summary>Consulter toutes les règles par niveau</summary>
        <div class="grille-regles">
          {#each niveauxLegende as item}
            <article style={`--couleur-regle:${couleursCarte[item.niveau]}`}>
              <h4>{item.titre}</h4>
              <ul>{#each reglesCompletes[item.niveau] as regle}<li>{regle}</li>{/each}</ul>
            </article>
          {/each}
        </div>
      </details>
      <p class="note-reglementaire">(*) Ces interdictions s’appliquent aussi jusqu’à 200 mètres des massifs boisés.</p>
      <p class="source-carte">Contours et niveaux : <a href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">Prévention incendie Gard</a> · <a href={GARD_ARRETES_URL} target="_blank" rel="noreferrer">Détail des arrêtés préfectoraux</a> · Fond © IGN</p>
    </section>
  </section>

  {#if detailOuvert && massifSelectionne}
    <dialog class="fenetre-detail" open aria-labelledby="titre-detail" on:click={(event) => event.target === event.currentTarget && fermerDetailMassif()} on:keydown={(event) => event.key === "Escape" && fermerDetailMassif()}>
      <article class="contenu-detail" style={`--couleur-detail:${couleursCarte[niveauMassifSelectionne]}`}>
        <header>
          <div>
            <p class="eyebrow">Principal massif remarquable</p>
            <h2 id="titre-detail">{massifSelectionne}</h2>
          </div>
          <button class="fermer-detail" bind:this={boutonFermer} type="button" aria-label="Fermer le détail" on:click={fermerDetailMassif}>×</button>
        </header>
        <div class="niveau-detail">
          <span class={`pastille-niveau ${niveauxLegende.find((item) => item.niveau === niveauMassifSelectionne)?.classe ?? "trait"}`} aria-hidden="true"></span>
          <p><strong>{niveauMassifSelectionne.toUpperCase()}</strong><span>{libellesNiveaux[niveauMassifSelectionne] ?? "Information en attente"}</span></p>
        </div>
        <p class="date-detail">Prévision pour le {formaterJour(risqueActif.date_validite)} · information collectée le {risqueMassifSelectionne ? formaterCollecte(risqueMassifSelectionne.collectee_a) : "—"}</p>
        <h3>Règles applicables</h3>
        <ul class="liste-detail">
          {#each reglesCompletes[niveauMassifSelectionne] ?? reglesCompletes.inconnu as regle}<li>{regle}</li>{/each}
        </ul>
        <p class="portee-detail">(*) Ces interdictions s’appliquent aussi jusqu’à 200 mètres des massifs boisés.</p>
        <footer>
          <a class="bouton-source" href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">Voir la carte officielle</a>
          <a href={GARD_ARRETES_URL} target="_blank" rel="noreferrer">Consulter les arrêtés préfectoraux</a>
        </footer>
      </article>
    </dialog>
  {/if}

  <aside class="urgence" aria-label="En cas de feu">
    <strong>Vous voyez un feu ou de la fumée ?</strong><span>Appelez le <a href="tel:112">112</a> ou le <a href="tel:18">18</a>, sans vous approcher.</span>
  </aside>
{/if}

<style>
  .etat { padding: 2rem 0; color: var(--muted); font-weight: 600; } .erreur, .erreur a { color: #9f2637; }
  .situation, .orientation { border: 1px solid var(--line-strong); border-radius: 8px; padding: clamp(1.15rem, 3.4vw, 2rem); background: var(--surface); box-shadow: 0 2px 8px rgba(23, 56, 75, 0.08); }
  .choix-jour { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface-muted); } .choix-jour button, .localiser { min-height: 42px; border: 1px solid transparent; border-radius: 4px; font: inherit; font-weight: 800; cursor: pointer; } .choix-jour button { padding: 0.45rem 0.9rem; color: var(--fg); background: transparent; } .choix-jour button:hover { color: #ffffff; border-color: var(--navy); background: var(--navy-hover); } .choix-jour button.actif { color: #ffffff; border-color: var(--navy); background: var(--navy); } .choix-jour button.actif:hover { color: #ffffff; background: var(--navy-hover); } .choix-jour button:focus-visible, .localiser:focus-visible { outline: 3px solid #2472a4; outline-offset: 2px; }
  .date, .eyebrow, .source, .aide, .legende { margin: 0; color: var(--muted); } .date { margin-top: 1rem; color: var(--fg); font-size: 0.95rem; font-weight: 700; text-transform: capitalize; } .eyebrow { color: var(--navy); font-size: 0.74rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
  .niveau { margin-top: 0.75rem; padding: 0.15rem 0 0.15rem 1.15rem; border-left: 0.55rem solid var(--couleur-niveau); } .niveau h2 { margin: 0.3rem 0 0; color: var(--fg); font-family: var(--font-display); font-size: clamp(2rem, 6vw, 3.6rem); line-height: 0.98; } .niveau h2 span { color: var(--fg); font-size: 0.5em; } .indisponible { border-left-color: #687076; } .indisponible h2 { color: var(--fg); font-size: clamp(1.7rem, 5vw, 2.7rem); }
  .precision { max-width: 65ch; margin: 1.15rem 0 0; color: var(--fg); font-weight: 600; line-height: 1.55; } .consignes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1.3rem; } .consignes article { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: 0.8rem; align-items: start; min-height: 100px; padding: 1rem; border: 1px solid var(--line-strong); border-left: 5px solid var(--navy); border-radius: 5px; background: var(--surface); } .pictogramme { display: grid; width: 2.3rem; height: 2.3rem; place-items: center; border-radius: 50%; color: #ffffff; background: var(--navy); } .pictogramme :global(svg) { width: 1.2rem; height: 1.2rem; } .consignes h3 { margin: 0.1rem 0 0; color: var(--fg); font-size: 0.96rem; } .consignes p { margin: 0.4rem 0 0; color: var(--muted); font-size: 0.92rem; font-weight: 600; line-height: 1.45; }
  .source { margin-top: 1.3rem; font-size: 0.88rem; font-weight: 600; line-height: 1.45; } .source a { color: var(--navy); font-weight: 900; }
  .orientation { margin-top: 1.25rem; } .titre-carte { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } .titre-carte h2 { margin: 0.35rem 0 0; color: var(--fg); font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.25rem); } .aide { margin-top: 0.85rem; max-width: 76ch; font-size: 0.94rem; font-weight: 600; line-height: 1.5; } .selection { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0.85rem 0 0; padding: 0.75rem 0.9rem; border-left: 5px solid var(--navy); border-radius: 4px; background: var(--surface-muted); color: var(--fg); } .selection p { margin: 0; } .selection span { font-weight: 900; } .selection button { min-height: 38px; padding: 0.45rem 0.75rem; border: 1px solid var(--navy); border-radius: 4px; color: #ffffff; background: var(--navy); font-weight: 800; cursor: pointer; } .selection button:hover { color: #ffffff; background: var(--navy-hover); } .erreur-localisation { margin: 0.75rem 0 0; color: #9f2637; font-size: 0.92rem; font-weight: 700; }
  .carte { height: clamp(330px, 58vw, 560px); margin-top: 1rem; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 5px; }
  .bloc-legende { margin-top: 1rem; padding: 1rem; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface-muted); } .entete-legende h3 { margin: 0.25rem 0 0; color: var(--fg); font-family: var(--font-display); font-size: 1.35rem; } .repere-commune { display: flex; align-items: center; gap: 0.5rem; margin: 0.9rem 0 0; color: var(--fg); font-size: 0.82rem; font-weight: 800; } .repere-commune span { display: inline-block; width: 2rem; border-top: 4px dashed #1463a4; box-shadow: 0 -1px 0 #ffffff, 0 1px 0 #ffffff; }
  .echelle-risque { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.55rem; margin: 1rem 0 0; padding: 0; list-style: none; } .echelle-risque li { display: grid; grid-template-columns: 1.15rem minmax(0, 1fr); gap: 0.55rem; align-items: start; padding: 0.7rem; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--surface); } .echelle-risque strong, .echelle-risque small { display: block; } .echelle-risque strong { color: var(--fg); font-size: 0.85rem; line-height: 1.25; } .echelle-risque small { margin-top: 0.25rem; color: var(--muted); font-size: 0.75rem; font-weight: 650; line-height: 1.3; }
  .pastille-niveau { display: block; width: 1rem; height: 1rem; margin-top: 0.08rem; border: 2px solid #596168; border-radius: 3px; background: #d7dcdf; } .pastille-niveau.jaune { border-color: #8a6500; background: #f2c84b; } .pastille-niveau.orange { border-color: #a93f08; background: #ee7b32; } .pastille-niveau.rouge { border-color: #8f1627; background: #d83b4b; }
  .regles-legende { margin-top: 0.9rem; border-top: 1px solid var(--line-strong); } .regles-legende summary { padding: 0.85rem 0 0.1rem; color: var(--navy); font-weight: 900; cursor: pointer; } .grille-regles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; margin-top: 0.85rem; } .grille-regles article { padding: 0.9rem; border: 1px solid var(--line-strong); border-top: 6px solid var(--couleur-regle); border-radius: 4px; background: var(--surface); } .grille-regles h4 { margin: 0; color: var(--fg); } .grille-regles ul { margin: 0.65rem 0 0; padding-left: 1.15rem; color: var(--muted); font-size: 0.82rem; font-weight: 600; line-height: 1.45; } .grille-regles li + li { margin-top: 0.25rem; } .note-reglementaire { margin: 0.85rem 0 0; color: var(--fg); font-size: 0.82rem; font-weight: 800; } .source-carte { margin: 0.55rem 0 0; color: var(--muted); font-size: 0.78rem; line-height: 1.4; } .source-carte a { color: var(--navy); font-weight: 850; }
  .fenetre-detail { position: fixed; inset: 0; z-index: 1000; width: 100%; max-width: none; height: 100%; max-height: none; margin: 0; padding: clamp(0.75rem, 4vw, 2rem); border: 0; background: rgba(7, 21, 29, 0.72); overflow-y: auto; } .contenu-detail { width: min(620px, 100%); margin: min(8vh, 4rem) auto; padding: clamp(1.1rem, 4vw, 1.7rem); border: 1px solid var(--line-strong); border-top: 10px solid var(--couleur-detail); border-radius: 8px; background: var(--surface); color: var(--fg); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.32); } .contenu-detail header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; } .contenu-detail h2 { margin: 0.25rem 0 0; color: var(--fg); font-family: var(--font-display); font-size: clamp(1.7rem, 6vw, 2.6rem); line-height: 1; } .fermer-detail { display: grid; flex: 0 0 auto; width: 42px; height: 42px; place-items: center; border: 1px solid var(--navy); border-radius: 50%; color: #ffffff; background: var(--navy); font-size: 1.65rem; line-height: 1; cursor: pointer; } .fermer-detail:hover { color: #ffffff; background: var(--navy-hover); } .fermer-detail:focus-visible { outline: 3px solid #2472a4; outline-offset: 2px; } .niveau-detail { display: flex; align-items: center; gap: 0.7rem; margin-top: 1.2rem; padding: 0.8rem; border-radius: 5px; background: var(--surface-muted); } .niveau-detail .pastille-niveau { width: 1.35rem; height: 1.35rem; margin: 0; } .niveau-detail p { margin: 0; } .niveau-detail strong, .niveau-detail span { display: block; } .niveau-detail strong { color: var(--fg); font-size: 1rem; } .niveau-detail span { margin-top: 0.1rem; color: var(--muted); font-size: 0.86rem; font-weight: 650; } .date-detail { margin: 0.65rem 0 0; color: var(--muted); font-size: 0.88rem; font-weight: 700; text-transform: capitalize; } .contenu-detail > h3 { margin: 1.25rem 0 0; color: var(--fg); font-size: 1rem; } .liste-detail { margin: 0.65rem 0 0; padding-left: 1.25rem; color: var(--fg); font-weight: 650; line-height: 1.5; } .liste-detail li + li { margin-top: 0.35rem; } .portee-detail { margin: 1rem 0 0; padding: 0.7rem; border-left: 4px solid #d75a16; background: var(--surface-muted); color: var(--fg); font-size: 0.84rem; font-weight: 750; line-height: 1.4; } .contenu-detail footer { display: flex; align-items: center; gap: 1rem; margin-top: 1.25rem; } .contenu-detail footer a { color: var(--navy); font-size: 0.86rem; font-weight: 850; } .contenu-detail footer .bouton-source { padding: 0.65rem 0.85rem; border-radius: 4px; color: #ffffff; background: var(--navy); text-decoration: none; } .contenu-detail footer .bouton-source:hover { color: #ffffff; background: var(--navy-hover); }
  .urgence { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; padding: 1.1rem 1.2rem; border-left: 6px solid #d2483b; border-radius: 5px; background: var(--navy); color: #ffffff; } .urgence strong { font-size: 1.05rem; } .urgence span { font-size: 0.98rem; font-weight: 600; } .urgence a { color: #ffffff; font-size: 1.12rem; font-weight: 900; }
  @media (max-width: 760px) { .urgence { display: grid; gap: 0.35rem; } .titre-carte { align-items: flex-start; flex-direction: column; } .echelle-risque { grid-template-columns: repeat(2, minmax(0, 1fr)); } .entete-legende { align-items: flex-start; flex-direction: column; gap: 0.7rem; } } @media (max-width: 520px) { .selection, .contenu-detail footer { align-items: stretch; flex-direction: column; } .grille-regles { grid-template-columns: 1fr; } .contenu-detail footer .bouton-source { text-align: center; } } @media (max-width: 430px) { .situation, .orientation { padding: 1rem; } .consignes { grid-template-columns: 1fr; } .carte { height: 390px; } .echelle-risque { grid-template-columns: 1fr; } }
</style>
