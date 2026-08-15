<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type maplibregl from "maplibre-gl";
  import Fa from "svelte-fa";
  import { faCampground, faCircleInfo, faFireFlameCurved, faHammer, faRoad } from "@fortawesome/free-solid-svg-icons";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { urlStyle, ajouterControleIncendies } from "../lib/carte";
  import {
    LIBELLES_NIVEAU,
    LIBELLES_ACCES_NIVEAU,
    COULEUR_PASTILLE_NIVEAU,
    CONTOUR_CARTE_NIVEAU,
    OPACITE_CARTE_NIVEAU,
    LARGEUR_CONTOUR_NIVEAU,
    type NiveauVigilance,
  } from "../lib/vigilanceCouleurs";

  const GARD_REFERENCE_URL = "https://www.risque-prevention-incendie.fr/gard/";
  const GARD_ARRETES_URL = "https://www.gard.gouv.fr/Actions-de-l-Etat/Securite-et-protection-de-la-population/Risques/Gestion-du-risque-feu-de-foret/Carte-de-vigilance";
  const REGLES_VERIFIEES_LE = "18 juillet 2026";
  const NOMS_MASSIFS: Record<number, string> = { 301: "CAUSSE AIGOUAL", 302: "SUD CEVENNES", 303: "NORD CEVENNES" };

  interface RiskZone {
    date_validite: string;
    collectee_a: string;
    zone_officielle: string;
    niveau: string;
    restrictions: string | null;
    source_url: string;
  }
  interface RiskSummary {
    etat: "ok" | "ancienne" | "indisponible";
    date_demandee: string;
    date_validite: string;
    niveau_max: string;
    derniere_collecte: string | null;
    mode_collecte?: "automatique" | "manuel";
    zones: RiskZone[];
  }
  interface FireSituation {
    detections_24h: { coeur: number; proche: number; veille: number };
    firms: {
      etat: string;
      fraicheur: "fraiche" | "ancienne" | "indisponible";
      age_minutes: number | null;
      derniere_collecte: string | null;
      derniere_tentative: string | null;
      message?: string;
    };
    risque_gard: {
      aujourd_hui: RiskSummary;
      demain: RiskSummary;
      source: { etat: string; derniere_tentative: string | null; derniere_reussite: string | null; message?: string };
    };
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

  // Couleur d'accent (bordures, texte de synthèse) : le blanc n'a pas de teinte propre
  // sur la carte officielle (styleMassifs, aucun remplissage) — on reprend son contour noir.
  const COULEUR_ACCENT_NIVEAU: Record<NiveauVigilance, string> = {
    blanc: CONTOUR_CARTE_NIVEAU,
    jaune: COULEUR_PASTILLE_NIVEAU.jaune,
    orange: COULEUR_PASTILLE_NIVEAU.orange,
    rouge: COULEUR_PASTILLE_NIVEAU.rouge,
    inconnu: COULEUR_PASTILLE_NIVEAU.inconnu,
  };
  const niveauxLegende: Array<{ niveau: NiveauVigilance; titre: string; resume: string; classe: string }> = [
    { niveau: "blanc", titre: LIBELLES_NIVEAU.blanc, resume: LIBELLES_ACCES_NIVEAU.blanc, classe: "trait" },
    { niveau: "jaune", titre: LIBELLES_NIVEAU.jaune, resume: LIBELLES_ACCES_NIVEAU.jaune, classe: "jaune" },
    { niveau: "orange", titre: LIBELLES_NIVEAU.orange, resume: `${LIBELLES_ACCES_NIVEAU.orange} · horaires limités`, classe: "orange" },
    { niveau: "rouge", titre: LIBELLES_NIVEAU.rouge, resume: LIBELLES_ACCES_NIVEAU.rouge, classe: "rouge" },
  ];
  const reglesCompletes: Record<string, string[]> = {
    blanc: [
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
    blanc: [
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
  let avertissementCarte: string | null = null;
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let observationCarte: IntersectionObserver | undefined;
  let limitesCommune: GeoJsonFeature | null = null;
  let empriseCommune: [[number, number], [number, number]] | null = null;
  let featureSurvolee: string | number | null = null;
  let risqueActif: RiskSummary | null = null;
  $: risqueActif = situation?.risque_gard[jour] ?? null;
  $: niveauActif = (risqueActif?.niveau_max ?? "inconnu") as NiveauVigilance;
  $: consignesActives = consignes[niveauActif] ?? consignes.inconnu;
  $: risqueMassifSelectionne = massifSelectionne
    ? risqueActif?.zones.find((risque) => risque.zone_officielle === massifSelectionne) ?? null
    : null;
  $: niveauMassifSelectionne = (risqueMassifSelectionne?.niveau ?? "inconnu") as NiveauVigilance;
  $: totalDetections = situation
    ? situation.detections_24h.coeur + situation.detections_24h.proche + situation.detections_24h.veille
    : 0;

  // Svelte n'accepte pas les casts TypeScript (`as`) dans les expressions de template,
  // d'où ces deux accesseurs pour les niveaux dont le type reste `string` côté API.
  function accentNiveau(niveau: string): string {
    return COULEUR_ACCENT_NIVEAU[niveau as NiveauVigilance] ?? COULEUR_ACCENT_NIVEAU.inconnu;
  }
  function accesNiveau(niveau: string): string {
    return LIBELLES_ACCES_NIVEAU[niveau as NiveauVigilance] ?? LIBELLES_ACCES_NIVEAU.inconnu;
  }

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
    const mouvementReduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(empriseCommune, { padding: 48, duration: mouvementReduit ? 0 : 800, essential: false });
  }

  function ouvrirDetailMassif(nom: string): void {
    massifSelectionne = nom;
  }

  async function attendreCarteVisible(): Promise<void> {
    if (!("IntersectionObserver" in window) || mapContainer.getBoundingClientRect().top <= window.innerHeight + 400) return;
    await new Promise<void>((resolve) => {
      observationCarte = new IntersectionObserver((entrees) => {
        if (!entrees.some((entree) => entree.isIntersecting)) return;
        observationCarte?.disconnect();
        observationCarte = undefined;
        resolve();
      }, { rootMargin: "400px" });
      observationCarte.observe(mapContainer);
    });
  }

  async function initialiserCarte(massifs: GeoJsonCollection): Promise<void> {
    const maplibre = (await import("maplibre-gl")).default;
    map = new maplibre.Map({
      container: mapContainer,
      style: urlStyle("territoire", { fond: "plan" }),
      center: [3.66, 44.12], zoom: 9.05, attributionControl: { compact: true },
    });
    map.addControl(new maplibre.NavigationControl(), "bottom-right");
    map.on("load", () => {
      if (!map) return;
      ajouterControleIncendies(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo", onRecentrer: recentrerCommune, onLocaliser: meLocaliser });
      if (limitesCommune) {
        map.addSource("val-aigoual", { type: "geojson", data: limitesCommune as GeoJSON.Feature });
      }
      map.addSource("massifs-gard", { type: "geojson", data: massifs as GeoJSON.FeatureCollection, generateId: true });
      map.addLayer({
        id: "massifs-gard-fill",
        type: "fill",
        source: "massifs-gard",
        paint: {
          "fill-color": ["match", ["get", "niveau"], "jaune", COULEUR_PASTILLE_NIVEAU.jaune, "orange", COULEUR_PASTILLE_NIVEAU.orange, "rouge", COULEUR_PASTILLE_NIVEAU.rouge, "blanc", COULEUR_PASTILLE_NIVEAU.blanc, COULEUR_PASTILLE_NIVEAU.inconnu],
          "fill-opacity": [
            "+",
            ["match", ["get", "niveau"], "jaune", OPACITE_CARTE_NIVEAU.jaune, "orange", OPACITE_CARTE_NIVEAU.orange, "rouge", OPACITE_CARTE_NIVEAU.rouge, "blanc", OPACITE_CARTE_NIVEAU.blanc, OPACITE_CARTE_NIVEAU.inconnu],
            ["case", ["boolean", ["feature-state", "survol"], false], 0.28, 0],
          ],
        },
      });
      map.addLayer({
        id: "massifs-gard-line",
        type: "line",
        source: "massifs-gard",
        paint: {
          "line-color": CONTOUR_CARTE_NIVEAU,
          "line-width": ["case", ["boolean", ["feature-state", "survol"], false], 5, ["match", ["get", "niveau"], "blanc", LARGEUR_CONTOUR_NIVEAU.blanc, LARGEUR_CONTOUR_NIVEAU.inconnu]],
          "line-opacity": 0.95,
        },
      });
      if (limitesCommune) {
        map.addLayer({ id: "val-aigoual-halo", type: "line", source: "val-aigoual", paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 } });
        map.addLayer({ id: "val-aigoual-line", type: "line", source: "val-aigoual", paint: { "line-color": "#1463a4", "line-width": 3.5, "line-dasharray": [2, 1.4] } });
      }
      map.on("click", "massifs-gard-fill", (event) => {
        const nom = String(event.features?.[0]?.properties?.NOM_MASSIF ?? "");
        if (nom) ouvrirDetailMassif(nom);
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
    map.on("error", () => {
      avertissementCarte = "Une partie du fond cartographique n’a pas pu être chargée. Les niveaux restent disponibles dans la liste.";
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
        map.flyTo({ center: position, zoom: 12, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800, essential: false });
      },
      () => { erreurLocalisation = "Votre position n’a pas pu être obtenue. Vérifiez l’autorisation de localisation."; },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function changerJour(prochainJour: "aujourd_hui" | "demain"): Promise<void> {
    jour = prochainJour;
    massifSelectionne = null;
    featureSurvolee = null;
    if (!situation) return;
    const massifs = await chargerMassifsGard(situation.risque_gard[prochainJour].zones);
    const source = map?.getSource("massifs-gard") as maplibregl.GeoJSONSource | undefined;
    source?.setData(massifs as GeoJSON.FeatureCollection);
  }

  async function charger(): Promise<void> {
    const [resultatSituation, resultatTerritoire] = await Promise.allSettled([
      fetchJson<FireSituation>("/api/incendies/situation"),
      fetchJson<TerritoireResponse>("/api/territoire"),
    ]);
    if (resultatSituation.status === "rejected") {
      console.error("conseils incendies indisponibles", resultatSituation.reason);
      etat = "erreur";
      return;
    }
    situation = resultatSituation.value;
    if (resultatTerritoire.status === "fulfilled" && resultatTerritoire.value.commune?.geometry) {
      const commune = resultatTerritoire.value.commune;
      limitesCommune = { type: "Feature", geometry: commune.geometry, properties: { nom: commune.nom } };
      empriseCommune = calculerEmprise(commune.geometry);
    } else {
      avertissementCarte = "La limite communale est indisponible ; les niveaux officiels par massif restent valides.";
    }
    const massifs = await chargerMassifsGard(situation.risque_gard.aujourd_hui.zones);
    if (massifs.features.length === 0) {
      avertissementCarte = "Les contours officiels sont indisponibles ; utilisez la liste des massifs ci-dessous.";
    }
    etat = "ok";
    await tick();
    try {
      await attendreCarteVisible();
      await initialiserCarte(massifs);
    } catch (error) {
      console.error("carte des massifs indisponible", error);
      avertissementCarte = "La carte interactive est indisponible ; les niveaux et règles restent accessibles ci-dessous.";
    }
  }

  onMount(() => { void charger(); });
  onDestroy(() => { observationCarte?.disconnect(); map?.remove(); });
</script>

{#if etat === "chargement"}
  <p class="etat" role="status" aria-live="polite">Chargement des recommandations officielles…</p>
{:else if etat === "erreur"}
  <p class="etat erreur" role="alert">Les recommandations officielles sont temporairement indisponibles. Consultez la <a href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">carte du Gard</a>.</p>
{:else if risqueActif}
  <section class="situation" aria-labelledby="titre-situation">
    <div class="choix-jour" aria-label="Jour des recommandations">
      <button class:actif={jour === "aujourd_hui"} aria-pressed={jour === "aujourd_hui"} type="button" on:click={() => changerJour("aujourd_hui")}>Aujourd’hui</button>
      <button class:actif={jour === "demain"} aria-pressed={jour === "demain"} type="button" on:click={() => changerJour("demain")}>Demain</button>
    </div>
    <p class="date">Donnée demandée pour le {formaterJour(risqueActif.date_demandee)}</p>
    {#if risqueActif.etat === "ancienne"}
      <p class="alerte-donnee" role="alert">La publication du jour est indisponible. La dernière publication valide, datée du {formaterJour(risqueActif.date_validite)}, est affichée à titre de repère et n’est plus applicable aujourd’hui.</p>
    {/if}
    {#if situation?.risque_gard.source.message}
      <p class="alerte-donnee secondaire" role="status">{situation.risque_gard.source.message}</p>
    {/if}
    {#if risqueActif.mode_collecte === "manuel"}
      <p class="alerte-donnee secondaire" role="status">Cette publication provient d’un fichier de secours vérifié manuellement, utilisé en remplacement du flux automatique.</p>
    {/if}
    {#if risqueActif.etat !== "indisponible"}
      <div class="niveau" style={`--couleur-niveau:${COULEUR_ACCENT_NIVEAU[niveauActif]};--fond-niveau:${COULEUR_PASTILLE_NIVEAU[niveauActif]}`}>
        <p class="eyebrow">Risque le plus élevé sur les trois massifs</p>
        <h2 id="titre-situation">{niveauActif.toUpperCase()} <span>— {LIBELLES_ACCES_NIVEAU[niveauActif]}</span></h2>
      </div>
      <p class="precision">Ce maximum est un repère prudent. Consultez ci-dessous le niveau propre au massif où vous vous rendez.</p>
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
    <div class="massifs-accessibles" aria-labelledby="titre-massifs">
      <h3 id="titre-massifs">Niveaux par massif gardois</h3>
      {#if risqueActif.zones.length > 0}
        <ul>
          {#each risqueActif.zones as risque}
            <li>
              <button
                type="button"
                aria-pressed={massifSelectionne === risque.zone_officielle}
                on:click={() => ouvrirDetailMassif(risque.zone_officielle)}
              >
                <span>{risque.zone_officielle}</span>
                <strong style={`--couleur-massif:${accentNiveau(risque.niveau)}`}>{risque.niveau.toUpperCase()} · {accesNiveau(risque.niveau)}</strong>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p>Aucun niveau par massif n’est actuellement disponible.</p>
      {/if}
    </div>
    {#if massifSelectionne}
      <section class="detail-inline" aria-labelledby="titre-detail" aria-live="polite" style={`--couleur-detail:${COULEUR_ACCENT_NIVEAU[niveauMassifSelectionne]}`}>
        <p class="eyebrow">Règles du massif sélectionné</p>
        <h3 id="titre-detail">{massifSelectionne} — {niveauMassifSelectionne.toUpperCase()}</h3>
        <p>{LIBELLES_ACCES_NIVEAU[niveauMassifSelectionne] ?? "Information en attente"}</p>
        <ul>
          {#each reglesCompletes[niveauMassifSelectionne] ?? reglesCompletes.inconnu as regle}<li>{regle}</li>{/each}
        </ul>
        <p class="date-detail">Valable pour le {formaterJour(risqueActif.date_validite)} · collectée le {risqueMassifSelectionne ? formaterCollecte(risqueMassifSelectionne.collectee_a) : "—"}</p>
        <p class="portee-detail">(*) Ces interdictions s’appliquent aussi jusqu’à 200 mètres des massifs boisés.</p>
      </section>
    {/if}
    {#if risqueActif.derniere_collecte}
      <p class="source">Dernière collecte valide : {formaterCollecte(risqueActif.derniere_collecte)}.</p>
    {/if}
    <p class="source">Source : Prévention incendie Gard · <a href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">carte et recommandations officielles</a></p>
  </section>

  <section class="resume-detections" aria-labelledby="titre-detections">
    <div>
      <p class="eyebrow">Détections satellitaires — dernières 24 h</p>
      <h2 id="titre-detections">{totalDetections} anomalie{totalDetections > 1 ? "s" : ""} thermique{totalDetections > 1 ? "s" : ""} reçue{totalDetections > 1 ? "s" : ""}</h2>
      <p>Une anomalie thermique n’est pas un incendie confirmé. L’absence de point ne signifie pas qu’aucun feu n’est en cours.</p>
    </div>
    <span class={`badge-fraicheur ${situation?.firms.fraicheur ?? "indisponible"}`}>
      {situation?.firms.fraicheur === "fraiche" ? "Données fraîches" : situation?.firms.fraicheur === "ancienne" ? "Données anciennes" : "Source indisponible"}
    </span>
    <dl>
      <div><dt>Cœur</dt><dd>{situation?.detections_24h.coeur ?? 0}</dd></div>
      <div><dt>À moins de 5 km</dt><dd>{situation?.detections_24h.proche ?? 0}</dd></div>
      <div><dt>Veille à 15 km</dt><dd>{situation?.detections_24h.veille ?? 0}</dd></div>
    </dl>
    {#if situation?.firms.derniere_collecte}
      <p class="meta-detection">Dernière collecte valide : {formaterCollecte(situation.firms.derniere_collecte)}{situation.firms.age_minutes !== null ? ` · il y a ${situation.firms.age_minutes} min` : ""}.</p>
    {/if}
    {#if situation?.firms.message}<p class="alerte-donnee secondaire" role="status">{situation.firms.message}</p>{/if}
    <a class="lien-donnees" href="./temps-reel/">Explorer les détections et leur méthodologie</a>
  </section>

  <section class="orientation" aria-labelledby="titre-orientation">
    <div class="titre-carte">
      <div><p class="eyebrow">Commune de Val-d’Aigoual</p><h2 id="titre-orientation">Dans quel massif allez-vous ?</h2></div>
    </div>
    <p class="aide">Le trait bleu pointillé délimite la commune de Val-d’Aigoual. La liste ci-dessus reste la référence accessible si la carte ne se charge pas.</p>
    {#if avertissementCarte}<p class="alerte-carte" role="status">{avertissementCarte}</p>{/if}
    {#if erreurLocalisation}<p class="erreur-localisation">{erreurLocalisation}</p>{/if}
    <div class="carte" bind:this={mapContainer} role="region" aria-label="Carte complémentaire des trois principaux massifs gardois autour de l’Aigoual"></div>

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
            <article style={`--couleur-regle:${COULEUR_ACCENT_NIVEAU[item.niveau]}`}>
              <h4>{item.titre}</h4>
              <ul>{#each reglesCompletes[item.niveau] as regle}<li>{regle}</li>{/each}</ul>
            </article>
          {/each}
        </div>
      </details>
      <p class="note-reglementaire">(*) Ces interdictions s’appliquent aussi jusqu’à 200 mètres des massifs boisés.</p>
      <p class="source-carte">Contours et niveaux : <a href={GARD_REFERENCE_URL} target="_blank" rel="noreferrer">Prévention incendie Gard</a> · <a href={GARD_ARRETES_URL} target="_blank" rel="noreferrer">Détail des arrêtés préfectoraux</a> · règles recoupées le {REGLES_VERIFIEES_LE} · Fond © IGN</p>
    </section>
  </section>
{/if}

<aside class="urgence" aria-label="En cas de feu">
  <strong>Vous voyez un feu ou de la fumée ?</strong><span>Appelez le <a href="tel:112">112</a> ou le <a href="tel:18">18</a>, sans vous approcher.</span>
</aside>

<style>
  .etat { padding: 2rem 0; color: var(--texte-secondaire); font-weight: 600; } .erreur, .erreur a { color: #9f2637; }
  .situation, .orientation, .resume-detections { border: 1px solid var(--bordure-forte); border-radius: 8px; padding: clamp(1.15rem, 3.4vw, 2rem); background: var(--surface-plate); box-shadow: 0 2px 8px rgba(23, 56, 75, 0.08); }
  .choix-jour { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--bordure-forte); border-radius: 6px; background: var(--surface-fond); } .choix-jour button, .localiser { min-height: 42px; border: 1px solid transparent; border-radius: 4px; font: inherit; font-weight: 800; cursor: pointer; } .choix-jour button { padding: 0.45rem 0.9rem; color: var(--texte-principal); background: transparent; } .choix-jour button:hover { color: #ffffff; border-color: var(--surface-sombre); background: var(--couleur-action-active); } .choix-jour button.actif { color: #ffffff; border-color: var(--surface-sombre); background: var(--surface-sombre); } .choix-jour button.actif:hover { color: #ffffff; background: var(--couleur-action-active); } .choix-jour button:focus-visible, .localiser:focus-visible { outline: 3px solid #2472a4; outline-offset: 2px; }
  .date, .eyebrow, .source, .aide, .legende { margin: 0; color: var(--texte-secondaire); } .date { margin-top: 1rem; color: var(--texte-principal); font-size: 0.95rem; font-weight: 700; text-transform: capitalize; } .eyebrow { color: var(--surface-sombre); font-size: 0.74rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
  .niveau { margin-top: 0.75rem; padding: 0.9rem 1.15rem 1rem; border-left: 0.55rem solid var(--couleur-niveau); border-radius: 0 5px 5px 0; background: var(--fond-niveau); } .niveau .eyebrow, .niveau h2, .niveau h2 span { color: #17242c; } .niveau h2 { margin: 0.3rem 0 0; font-family: var(--font-display); font-size: clamp(2rem, 6vw, 3.6rem); line-height: 0.98; } .niveau h2 span { font-size: 0.5em; } .indisponible { border-left-color: #687076; background: var(--surface-fond); } .indisponible .eyebrow, .indisponible h2 { color: var(--texte-principal); } .indisponible h2 { font-size: clamp(1.7rem, 5vw, 2.7rem); }
  .precision { max-width: 65ch; margin: 1.15rem 0 0; color: var(--texte-principal); font-weight: 600; line-height: 1.55; } .consignes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1.3rem; } .consignes article { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: 0.8rem; align-items: start; min-height: 100px; padding: 1rem; border: 1px solid var(--bordure-forte); border-left: 5px solid var(--surface-sombre); border-radius: 5px; background: var(--surface-plate); } .pictogramme { display: grid; width: 2.3rem; height: 2.3rem; place-items: center; border-radius: 50%; color: #ffffff; background: var(--surface-sombre); } .pictogramme :global(svg) { width: 1.2rem; height: 1.2rem; } .consignes h3 { margin: 0.1rem 0 0; color: var(--texte-principal); font-size: 0.96rem; } .consignes p { margin: 0.4rem 0 0; color: var(--texte-secondaire); font-size: 0.92rem; font-weight: 600; line-height: 1.45; }
  .source { margin-top: 1.3rem; font-size: 0.88rem; font-weight: 600; line-height: 1.45; } .source a { color: var(--surface-sombre); font-weight: 900; }
  .alerte-donnee, .alerte-carte { margin: 1rem 0 0; padding: 0.8rem 0.9rem; border-left: 5px solid #ad2434; border-radius: 4px; color: var(--texte-principal); background: #fff2f1; font-weight: 750; line-height: 1.5; } .alerte-donnee.secondaire, .alerte-carte { border-left-color: #a56700; background: #fff8e6; }
  .massifs-accessibles { margin-top: 1.4rem; } .massifs-accessibles h3 { margin: 0; color: var(--texte-principal); font-size: 1.05rem; } .massifs-accessibles > p { color: var(--texte-secondaire); font-weight: 650; } .massifs-accessibles ul { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem; margin: 0.75rem 0 0; padding: 0; list-style: none; } .massifs-accessibles button { width: 100%; min-height: 86px; padding: 0.8rem; border: 1px solid var(--bordure-forte); border-left: 5px solid var(--surface-sombre); border-radius: 5px; color: var(--texte-principal); background: var(--surface-fond); text-align: left; cursor: pointer; } .massifs-accessibles button:hover, .massifs-accessibles button[aria-pressed="true"] { border-color: var(--surface-sombre); background: #eaf1f4; } .massifs-accessibles button:focus-visible { outline: 3px solid #2472a4; outline-offset: 2px; } .massifs-accessibles button span, .massifs-accessibles button strong { display: block; } .massifs-accessibles button span { font-weight: 850; } .massifs-accessibles button strong { margin-top: 0.45rem; color: var(--couleur-massif); font-size: 0.83rem; }
  .detail-inline { margin-top: 1rem; padding: 1rem; border: 1px solid var(--bordure-forte); border-top: 7px solid var(--couleur-detail); border-radius: 5px; background: var(--surface-fond); } .detail-inline h3 { margin: 0.3rem 0 0; color: var(--texte-principal); font-family: var(--font-display); font-size: 1.45rem; } .detail-inline > p { color: var(--texte-secondaire); font-weight: 650; } .detail-inline ul { padding-left: 1.25rem; color: var(--texte-principal); font-weight: 650; line-height: 1.5; } .detail-inline li + li { margin-top: 0.3rem; }
  .resume-detections { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; margin-top: 1.25rem; } .resume-detections h2 { margin: 0.35rem 0 0; color: var(--texte-principal); font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.35rem); } .resume-detections > div > p:last-child { max-width: 70ch; margin: 0.7rem 0 0; color: var(--texte-secondaire); font-weight: 650; line-height: 1.5; } .badge-fraicheur { align-self: start; padding: 0.45rem 0.65rem; border: 1px solid currentColor; border-radius: 999px; font-size: 0.78rem; font-weight: 900; white-space: nowrap; } .badge-fraicheur.fraiche { color: #18794e; background: #e9f7ef; } .badge-fraicheur.ancienne { color: #8a5a00; background: #fff6d8; } .badge-fraicheur.indisponible { color: #9f2637; background: #fff0f2; } .resume-detections dl { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem; margin: 0; } .resume-detections dl div { padding: 0.75rem; border: 1px solid var(--bordure-forte); border-radius: 4px; background: var(--surface-fond); } .resume-detections dt { color: var(--texte-secondaire); font-size: 0.8rem; font-weight: 800; } .resume-detections dd { margin: 0.25rem 0 0; color: var(--texte-principal); font-family: var(--font-display); font-size: 1.8rem; font-weight: 800; } .meta-detection, .resume-detections .alerte-donnee, .lien-donnees { grid-column: 1 / -1; margin: 0; } .meta-detection { color: var(--texte-secondaire); font-size: 0.88rem; font-weight: 700; } .lien-donnees { width: fit-content; color: var(--surface-sombre); font-weight: 900; }
  .orientation { margin-top: 1.25rem; } .titre-carte { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } .titre-carte h2 { margin: 0.35rem 0 0; color: var(--texte-principal); font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.25rem); } .aide { margin-top: 0.85rem; max-width: 76ch; font-size: 0.94rem; font-weight: 600; line-height: 1.5; } .erreur-localisation { margin: 0.75rem 0 0; color: #9f2637; font-size: 0.92rem; font-weight: 700; }
  .carte { height: clamp(330px, 58vw, 560px); margin-top: 1rem; overflow: hidden; border: 1px solid var(--bordure-forte); border-radius: 5px; }
  .bloc-legende { margin-top: 1rem; padding: 1rem; border: 1px solid var(--bordure-forte); border-radius: 6px; background: var(--surface-fond); } .entete-legende h3 { margin: 0.25rem 0 0; color: var(--texte-principal); font-family: var(--font-display); font-size: 1.35rem; } .repere-commune { display: flex; align-items: center; gap: 0.5rem; margin: 0.9rem 0 0; color: var(--texte-principal); font-size: 0.82rem; font-weight: 800; } .repere-commune span { display: inline-block; width: 2rem; border-top: 4px dashed #1463a4; box-shadow: 0 -1px 0 #ffffff, 0 1px 0 #ffffff; }
  .echelle-risque { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.55rem; margin: 1rem 0 0; padding: 0; list-style: none; } .echelle-risque li { display: grid; grid-template-columns: 1.35rem minmax(0, 1fr); gap: 0.55rem; align-items: start; padding: 0.7rem; border: 2px solid var(--couleur-legende, #596168); border-radius: 4px; background: var(--fond-legende, var(--surface-plate)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45); } .echelle-risque li:nth-child(1) { --couleur-legende: #596168; --fond-legende: #edf0f1; } .echelle-risque li:nth-child(2) { --couleur-legende: #8a6500; --fond-legende: #fff2bb; } .echelle-risque li:nth-child(3) { --couleur-legende: #a93f08; --fond-legende: #ffe0b2; } .echelle-risque li:nth-child(4) { --couleur-legende: #8f1627; --fond-legende: #ffd3d6; } .echelle-risque strong, .echelle-risque small { display: block; } .echelle-risque strong { color: #17242c; font-size: 0.9rem; line-height: 1.25; } .echelle-risque small { margin-top: 0.25rem; color: #263841; font-size: 0.78rem; font-weight: 750; line-height: 1.35; }
  .pastille-niveau { display: block; width: 1.15rem; height: 1.15rem; margin-top: 0.08rem; border: 2px solid #000000; border-radius: 3px; background: #ffffff; } .pastille-niveau.jaune { background: #ffff80; } .pastille-niveau.orange { background: #ff854a; } .pastille-niveau.rouge { background: #ff3e3e; }
  .regles-legende { margin-top: 0.9rem; border-top: 1px solid var(--bordure-forte); } .regles-legende summary { padding: 0.85rem 0 0.1rem; color: var(--surface-sombre); font-weight: 900; cursor: pointer; } .grille-regles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; margin-top: 0.85rem; } .grille-regles article { padding: 0.9rem; border: 1px solid var(--bordure-forte); border-top: 6px solid var(--couleur-regle); border-radius: 4px; background: var(--surface-plate); } .grille-regles h4 { margin: 0; color: var(--texte-principal); } .grille-regles ul { margin: 0.65rem 0 0; padding-left: 1.15rem; color: var(--texte-secondaire); font-size: 0.82rem; font-weight: 600; line-height: 1.45; } .grille-regles li + li { margin-top: 0.25rem; } .note-reglementaire { margin: 0.85rem 0 0; color: var(--texte-principal); font-size: 0.82rem; font-weight: 800; } .source-carte { margin: 0.55rem 0 0; color: var(--texte-secondaire); font-size: 0.78rem; line-height: 1.4; } .source-carte a { color: var(--surface-sombre); font-weight: 850; }
  .urgence { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; padding: 1.1rem 1.2rem; border-left: 6px solid #d2483b; border-radius: 5px; background: var(--surface-sombre); color: #ffffff; } .urgence strong { font-size: 1.05rem; } .urgence span { font-size: 0.98rem; font-weight: 600; } .urgence a { color: #ffffff; font-size: 1.12rem; font-weight: 900; }
  @media (max-width: 760px) { .urgence { display: grid; gap: 0.35rem; } .titre-carte { align-items: flex-start; flex-direction: column; } .echelle-risque { grid-template-columns: repeat(2, minmax(0, 1fr)); } .entete-legende { align-items: flex-start; flex-direction: column; gap: 0.7rem; } .massifs-accessibles ul { grid-template-columns: 1fr; } } @media (max-width: 520px) { .grille-regles { grid-template-columns: 1fr; } .resume-detections { grid-template-columns: 1fr; } .resume-detections dl { grid-template-columns: 1fr; } } @media (max-width: 430px) { .situation, .orientation, .resume-detections { padding: 1rem; } .consignes { grid-template-columns: 1fr; } .carte { height: 390px; } .echelle-risque { grid-template-columns: 1fr; } }
</style>
