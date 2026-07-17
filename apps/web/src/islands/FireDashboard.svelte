<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import Fa from "svelte-fa";
  import { faCampground, faCircleInfo, faFireFlameCurved, faHammer, faRoad } from "@fortawesome/free-solid-svg-icons";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { IGN_WMTS, ajouterControleFondIgn } from "../lib/carte";

  const GARD_REFERENCE_URL = "https://www.risque-prevention-incendie.fr/gard/";
  const GARD_MASSIFS_URL = "https://www.risque-prevention-incendie.fr/static/30/js/zones.js";
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
  interface GeoJsonFeature {
    type: "Feature";
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
  let erreurLocalisation: string | null = null;
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let risqueActif: RiskSummary | null = null;
  $: risqueActif = situation?.risque_gard[jour] ?? null;
  $: niveauActif = risqueActif?.niveau_max ?? "inconnu";
  $: consignesActives = consignes[niveauActif] ?? consignes.inconnu;

  function formaterJour(value: string): string {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date(`${value}T12:00:00Z`));
  }

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  function chargerScriptGard(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as Window & { zones?: unknown }).zones) return resolve();
      const script = document.createElement("script");
      script.src = GARD_MASSIFS_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Contours des massifs gardois indisponibles"));
      document.head.appendChild(script);
    });
  }

  async function chargerMassifsGard(risques: RiskZone[]): Promise<GeoJsonCollection> {
    try {
      await chargerScriptGard();
      const source = (window as Window & { zones?: GeoJsonFeature[] }).zones ?? [];
      const niveaux = new Map(risques.map((risque) => [risque.zone_officielle, risque.niveau]));
      return {
        type: "FeatureCollection",
        features: source.filter((feature) => NOMS_MASSIFS[Number(feature.properties.ID)]).map((feature) => {
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
      ajouterControleFondIgn(map, { planLayerId: "plan-ign", photoLayerId: "orthophoto-ign", actif: "plan" });
      map.addSource("massifs-gard", { type: "geojson", data: massifs as GeoJSON.FeatureCollection });
      map.addLayer({ id: "massifs-gard-line", type: "line", source: "massifs-gard", paint: { "line-color": ["match", ["get", "niveau"], "jaune", "#d69d00", "orange", "#d75a16", "rouge", "#bb2435", "vert", "#298c5a", "#687076"], "line-width": 6, "line-opacity": 0.5 } });
      map.addLayer({ id: "massifs-gard-label", type: "symbol", source: "massifs-gard", layout: { "text-field": ["get", "NOM_MASSIF"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-max-width": 9 }, paint: { "text-color": "#182126", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
      map.on("click", "massifs-gard-line", (event) => {
        massifSelectionne = String(event.features?.[0]?.properties?.NOM_MASSIF ?? "");
      });
      map.on("mouseenter", "massifs-gard-line", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "massifs-gard-line", () => { if (map) map.getCanvas().style.cursor = ""; });
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
    if (!situation) return;
    const massifs = await chargerMassifsGard(situation.risque_gard[prochainJour].zones);
    const source = map?.getSource("massifs-gard") as maplibregl.GeoJSONSource | undefined;
    source?.setData(massifs as GeoJSON.FeatureCollection);
  }

  async function charger(): Promise<void> {
    try {
      situation = await fetchJson<FireSituation>("/api/incendies/situation");
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
      <div><p class="eyebrow">Se repérer</p><h2 id="titre-orientation">Où allez-vous ?</h2></div>
      <button class="localiser" type="button" on:click={meLocaliser}>⌖ Me localiser</button>
    </div>
    <p class="aide">Touchez un massif pour voir son niveau. Cette carte présente les trois massifs du Gard ; les informations concernent le département du Gard.</p>
    {#if massifSelectionne}
      {@const risqueMassif = risqueActif.zones.find((risque) => risque.zone_officielle === massifSelectionne)}
      <p class="selection"><strong>{massifSelectionne}</strong> : <span style={`color:${couleursNiveaux[risqueMassif?.niveau ?? "inconnu"]}`}>{(risqueMassif?.niveau ?? "inconnu").toUpperCase()}</span></p>
    {/if}
    {#if erreurLocalisation}<p class="erreur-localisation">{erreurLocalisation}</p>{/if}
    <div class="carte" bind:this={mapContainer}></div>
    <p class="legende"><span></span> Le contour transparent indique le niveau de danger officiel sur chaque massif · Plan IGN par défaut, fond © IGN</p>
  </section>

  <aside class="urgence" aria-label="En cas de feu">
    <strong>Vous voyez un feu ou de la fumée ?</strong><span>Appelez le <a href="tel:112">112</a> ou le <a href="tel:18">18</a>, sans vous approcher.</span>
  </aside>
{/if}

<style>
  .etat { padding: 2rem 0; color: var(--muted); font-weight: 600; } .erreur, .erreur a { color: #9f2637; }
  .situation, .orientation { border: 1px solid var(--line-strong); border-radius: 8px; padding: clamp(1.15rem, 3.4vw, 2rem); background: var(--surface); box-shadow: 0 2px 8px rgba(23, 56, 75, 0.08); }
  .choix-jour { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface-muted); } .choix-jour button, .localiser { min-height: 42px; border: 1px solid transparent; border-radius: 4px; font: inherit; font-weight: 800; cursor: pointer; } .choix-jour button { padding: 0.45rem 0.9rem; color: var(--fg); background: transparent; } .choix-jour button.actif { color: #ffffff; border-color: var(--navy); background: var(--navy); } .choix-jour button:focus-visible, .localiser:focus-visible { outline: 3px solid #2472a4; outline-offset: 2px; }
  .date, .eyebrow, .source, .aide, .legende { margin: 0; color: var(--muted); } .date { margin-top: 1rem; color: var(--fg); font-size: 0.95rem; font-weight: 700; text-transform: capitalize; } .eyebrow { color: var(--navy); font-size: 0.74rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
  .niveau { margin-top: 0.75rem; padding: 0.15rem 0 0.15rem 1.15rem; border-left: 0.55rem solid var(--couleur-niveau); } .niveau h2 { margin: 0.3rem 0 0; color: var(--fg); font-family: var(--font-display); font-size: clamp(2rem, 6vw, 3.6rem); line-height: 0.98; } .niveau h2 span { color: var(--fg); font-size: 0.5em; } .indisponible { border-left-color: #687076; } .indisponible h2 { color: var(--fg); font-size: clamp(1.7rem, 5vw, 2.7rem); }
  .precision { max-width: 65ch; margin: 1.15rem 0 0; color: var(--fg); font-weight: 600; line-height: 1.55; } .consignes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1.3rem; } .consignes article { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: 0.8rem; align-items: start; min-height: 100px; padding: 1rem; border: 1px solid var(--line-strong); border-left: 5px solid var(--navy); border-radius: 5px; background: var(--surface); } .pictogramme { display: grid; width: 2.3rem; height: 2.3rem; place-items: center; border-radius: 50%; color: #ffffff; background: var(--navy); } .pictogramme :global(svg) { width: 1.2rem; height: 1.2rem; } .consignes h3 { margin: 0.1rem 0 0; color: var(--fg); font-size: 0.96rem; } .consignes p { margin: 0.4rem 0 0; color: var(--muted); font-size: 0.92rem; font-weight: 600; line-height: 1.45; }
  .source { margin-top: 1.3rem; font-size: 0.88rem; font-weight: 600; line-height: 1.45; } .source a { color: var(--navy); font-weight: 900; }
  .orientation { margin-top: 1.25rem; } .titre-carte { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } .titre-carte h2 { margin: 0.35rem 0 0; color: var(--fg); font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.25rem); } .localiser { padding: 0.65rem 1rem; color: #ffffff; background: var(--navy); white-space: nowrap; } .localiser:hover { background: var(--navy-hover); } .aide { margin-top: 0.85rem; max-width: 68ch; font-size: 0.94rem; font-weight: 600; line-height: 1.5; } .selection { margin: 0.85rem 0 0; padding: 0.75rem 0.9rem; border-left: 5px solid var(--navy); border-radius: 4px; background: var(--surface-muted); color: var(--fg); } .selection span { font-weight: 900; } .erreur-localisation { margin: 0.75rem 0 0; color: #9f2637; font-size: 0.92rem; font-weight: 700; }
  .carte { height: clamp(330px, 58vw, 560px); margin-top: 1rem; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 5px; } .legende { margin-top: 0.75rem; font-size: 0.84rem; font-weight: 600; line-height: 1.4; } .legende span { display: inline-block; width: 0.8rem; height: 0.8rem; margin-right: 0.25rem; vertical-align: -0.1rem; border: 1px solid #17242c; border-radius: 2px; background: #f2c84b; }
  .urgence { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; padding: 1.1rem 1.2rem; border-left: 6px solid #d2483b; border-radius: 5px; background: var(--navy); color: #ffffff; } .urgence strong { font-size: 1.05rem; } .urgence span { font-size: 0.98rem; font-weight: 600; } .urgence a { color: #ffffff; font-size: 1.12rem; font-weight: 900; }
  @media (max-width: 760px) { .urgence { display: grid; gap: 0.35rem; } } @media (max-width: 430px) { .situation, .orientation { padding: 1rem; } .titre-carte { align-items: flex-start; flex-direction: column; } .localiser { width: 100%; } .consignes { grid-template-columns: 1fr; } .carte { height: 390px; } }
</style>
