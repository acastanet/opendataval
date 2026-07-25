<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { POINT_METEO_PAR_DEFAUT } from "@opendata-vda/shared/localisations-meteo";
  import { urlStyle, ajouterControleFondIgn } from "../lib/carte";
  import {
    COULEUR_PASTILLE_NIVEAU,
    COULEUR_CARTE_NIVEAU,
    OPACITE_CARTE_NIVEAU,
    CONTOUR_CARTE_NIVEAU,
    LARGEUR_CONTOUR_NIVEAU,
    LIBELLES_NIVEAU,
    LIBELLES_ACCES_NIVEAU,
    type NiveauVigilance,
  } from "../lib/vigilanceCouleurs";

  interface GeoJsonFeature {
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }
  interface GeoJsonCollection { type: "FeatureCollection"; features: GeoJsonFeature[] }
  interface RiskZone { zone_officielle: string; niveau: string }
  interface RiskSummary { etat: "ok" | "ancienne" | "indisponible"; date_validite: string; zones: RiskZone[] }
  interface SituationResponse { risque_gard: { aujourd_hui: RiskSummary } }

  interface Lieu { lon: number; lat: number; libelle: string; source: "defaut" | "gps" }
  interface Massif { nom: string; niveau: NiveauVigilance }

  const LIBELLE_SATELLITE: Record<string, string> = { N: "Suomi NPP", N20: "NOAA-20", N21: "NOAA-21" };
  const LIBELLE_CONFIANCE: Record<string, string> = { l: "faible", n: "nominale", h: "haute" };
  const NIVEAUX_LEGENDE = ["blanc", "jaune", "orange", "rouge"] as const;
  const FENETRE_RECHERCHE_HEURES = 72; // borne max acceptée par /api/incendies/detections
  const SEUIL_RECENT_MS = 24 * 60 * 60 * 1000;

  function estRecent(observeeA: string): boolean {
    return Date.now() - new Date(observeeA).getTime() <= SEUIL_RECENT_MS;
  }

  let etat: "chargement" | "ok" | "erreur" = "chargement";
  let erreurLocalisation: string | null = null;
  let localisationEnCours = false;
  const LIEU_MAIRIE: Lieu = { lon: POINT_METEO_PAR_DEFAUT.lon, lat: POINT_METEO_PAR_DEFAUT.lat, libelle: POINT_METEO_PAR_DEFAUT.label, source: "defaut" };
  let lieu: Lieu = LIEU_MAIRIE;
  let massifDetecte: Massif | null = null;
  let horsMassif = false;
  let risqueDuJour: RiskSummary | null = null;
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let massifsGeojson: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let detectionsGeojson: GeoJsonCollection = { type: "FeatureCollection", features: [] };
  let requeteLocalisationCourante = 0;

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  // Point-in-polygon par ray casting (règle pair/impair), sans dépendance externe.
  function pointDansAnneau(lon: number, lat: number, anneau: number[][]): boolean {
    let dedans = false;
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi, yi] = anneau[i]!;
      const [xj, yj] = anneau[j]!;
      const intersecte = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersecte) dedans = !dedans;
    }
    return dedans;
  }

  function pointDansPolygone(lon: number, lat: number, coordinates: number[][][]): boolean {
    if (!pointDansAnneau(lon, lat, coordinates[0] ?? [])) return false;
    for (let k = 1; k < coordinates.length; k += 1) {
      if (pointDansAnneau(lon, lat, coordinates[k]!)) return false;
    }
    return true;
  }

  function pointDansMassif(lon: number, lat: number, geometry: { type: string; coordinates: unknown }): boolean {
    if (geometry.type === "Polygon") return pointDansPolygone(lon, lat, geometry.coordinates as number[][][]);
    if (geometry.type === "MultiPolygon") {
      return (geometry.coordinates as number[][][][]).some((polygone) => pointDansPolygone(lon, lat, polygone));
    }
    return false;
  }

  function detecterMassif(lon: number, lat: number): void {
    const feature = massifsGeojson.features.find((f) => pointDansMassif(lon, lat, f.geometry));
    if (!feature) {
      massifDetecte = null;
      horsMassif = true;
      return;
    }
    horsMassif = false;
    massifDetecte = {
      nom: String(feature.properties.NOM_MASSIF ?? ""),
      niveau: (feature.properties.niveau as NiveauVigilance) ?? "inconnu",
    };
  }

  function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  $: pointChaudProche = (() => {
    if (detectionsGeojson.features.length === 0) return null;
    let meilleur: { feature: GeoJsonFeature; distance: number } | null = null;
    for (const feature of detectionsGeojson.features) {
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const distance = distanceKm(lieu.lon, lieu.lat, lon, lat);
      if (!meilleur || distance < meilleur.distance) meilleur = { feature, distance };
    }
    return meilleur;
  })();
  $: pointChaudRecent = pointChaudProche !== null && estRecent(String(pointChaudProche.feature.properties.observee_a));

  function ilYA(dateIso: string): string {
    const diffMin = Math.round((Date.now() - new Date(dateIso).getTime()) / 60_000);
    if (diffMin < 1) return "à l’instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH} h`;
    return `il y a ${Math.round(diffH / 24)} j`;
  }

  function formaterDate(dateIso: string): string {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(dateIso));
  }

  function placerPosition(lon: number, lat: number, instant: boolean): void {
    if (!map) return;
    const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } } as GeoJSON.Feature<GeoJSON.Point>;
    const source = map.getSource("position-utilisateur") as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(point);
    else {
      map.addSource("position-utilisateur", { type: "geojson", data: point });
      map.addLayer({ id: "position-utilisateur", type: "circle", source: "position-utilisateur", paint: { "circle-radius": 8, "circle-color": "#0047ab", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
    }
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({ center: [lon, lat], zoom: 11, duration: instant || reduit ? 0 : 800 });
  }

  function meLocaliser(silencieux = false): void {
    if (!silencieux) {
      if (!window.isSecureContext) {
        erreurLocalisation = "La localisation GPS est bloquée sur une page non sécurisée. Ouvrez ce site en HTTPS puis réessayez.";
        return;
      }
      if (!navigator.geolocation) {
        erreurLocalisation = "La géolocalisation n’est pas disponible sur cet appareil.";
        return;
      }
    } else if (!navigator.geolocation) return;
    const requete = ++requeteLocalisationCourante;
    if (!silencieux) { localisationEnCours = true; erreurLocalisation = null; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (requete !== requeteLocalisationCourante) return;
        localisationEnCours = false;
        lieu = { lon: coords.longitude, lat: coords.latitude, libelle: "Ma position", source: "gps" };
        detecterMassif(coords.longitude, coords.latitude);
        placerPosition(coords.longitude, coords.latitude, silencieux);
      },
      (cause) => {
        if (requete !== requeteLocalisationCourante) return;
        localisationEnCours = false;
        if (silencieux) return; // échec silencieux : on garde le lieu par défaut sans alarmer
        if (cause.code === cause.PERMISSION_DENIED) erreurLocalisation = "La localisation est refusée pour ce site. Autorisez-la dans les réglages du navigateur puis réessayez.";
        else if (cause.code === cause.TIMEOUT) erreurLocalisation = "Votre position n’a pas pu être obtenue à temps. Réessayez.";
        else erreurLocalisation = "Votre position n’a pas pu être déterminée. Vérifiez que la localisation est activée.";
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 120_000 },
    );
  }

  function revenirMairie(): void {
    requeteLocalisationCourante += 1; // ignore une réponse GPS en vol
    localisationEnCours = false;
    erreurLocalisation = null;
    lieu = LIEU_MAIRIE;
    detecterMassif(lieu.lon, lieu.lat);
    placerPosition(lieu.lon, lieu.lat, false);
  }

  async function localiserSiDejaAutorise(): Promise<void> {
    const permissions = (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
    if (!permissions?.query) return;
    try {
      const statut = await permissions.query({ name: "geolocation" });
      if (statut.state === "granted") meLocaliser(true);
    } catch {
      // API Permissions absente sur ce navigateur : le bouton « Ma position » reste la voie d’entrée.
    }
  }

  function calculerEmprise(geometry: { coordinates: unknown }): [[number, number], [number, number]] | null {
    let ouest = Infinity, sud = Infinity, est = -Infinity, nord = -Infinity;
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

  function recentrerSurPointChaud(): void {
    if (!map || !pointChaudProche) return;
    const [lon, lat] = pointChaudProche.feature.geometry.coordinates as [number, number];
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({ center: [lon, lat], zoom: 12, duration: reduit ? 0 : 800 });
  }

  async function initialiserCarte(departementContour: GeoJsonFeature | null): Promise<void> {
    const maplibre = (await import("maplibre-gl")).default;
    map = new maplibre.Map({
      container: mapContainer,
      style: urlStyle("territoire", { fond: "plan" }),
      center: [4.05, 44.0],
      zoom: 8,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibre.NavigationControl(), "bottom-right");
    map.on("load", () => {
      if (!map) return;
      ajouterControleFondIgn(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo" });

      if (departementContour) {
        map.addSource("departement", { type: "geojson", data: departementContour as GeoJSON.Feature });
        map.addLayer({ id: "departement-line", type: "line", source: "departement", paint: { "line-color": "#1463a4", "line-width": 2, "line-dasharray": [2, 1.4] } });
        const emprise = calculerEmprise(departementContour.geometry as { coordinates: unknown });
        if (emprise) map.fitBounds(emprise, { padding: 24, duration: 0 });
      }

      map.addSource("massifs", { type: "geojson", data: massifsGeojson as unknown as GeoJSON.FeatureCollection });
      map.addLayer({
        id: "massifs-fill",
        type: "fill",
        source: "massifs",
        paint: {
          "fill-color": ["match", ["get", "niveau"], "jaune", COULEUR_CARTE_NIVEAU.jaune, "orange", COULEUR_CARTE_NIVEAU.orange, "rouge", COULEUR_CARTE_NIVEAU.rouge, "blanc", COULEUR_CARTE_NIVEAU.blanc, COULEUR_CARTE_NIVEAU.inconnu],
          "fill-opacity": ["match", ["get", "niveau"], "jaune", OPACITE_CARTE_NIVEAU.jaune, "orange", OPACITE_CARTE_NIVEAU.orange, "rouge", OPACITE_CARTE_NIVEAU.rouge, "blanc", OPACITE_CARTE_NIVEAU.blanc, OPACITE_CARTE_NIVEAU.inconnu],
        },
      });
      map.addLayer({
        id: "massifs-line",
        type: "line",
        source: "massifs",
        paint: {
          "line-color": CONTOUR_CARTE_NIVEAU,
          "line-width": ["match", ["get", "niveau"], "blanc", LARGEUR_CONTOUR_NIVEAU.blanc, LARGEUR_CONTOUR_NIVEAU.inconnu],
        },
      });

      const detectionsRecentes: GeoJsonCollection = {
        type: "FeatureCollection",
        features: detectionsGeojson.features.filter((feature) => estRecent(String(feature.properties.observee_a))),
      };
      map.addSource("detections", { type: "geojson", data: detectionsRecentes as unknown as GeoJSON.FeatureCollection });
      map.addLayer({ id: "detections-points", type: "circle", source: "detections", paint: { "circle-radius": 4, "circle-color": "#c62828", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });

      placerPosition(lieu.lon, lieu.lat, true);
    });
  }

  async function charger(): Promise<void> {
    try {
      const [massifs, situation, zones, detections] = await Promise.all([
        fetchJson<GeoJsonCollection>("/api/incendies/massifs-officiels?perimetre=departement"),
        fetchJson<SituationResponse>("/api/incendies/situation?perimetre=departement"),
        fetchJson<GeoJsonCollection>("/api/incendies/zones"),
        fetchJson<GeoJsonCollection>(`/api/incendies/detections?hours=${FENETRE_RECHERCHE_HEURES}&perimetre=departement`),
      ]);
      risqueDuJour = situation.risque_gard.aujourd_hui;
      const niveaux = new Map(risqueDuJour.zones.map((zone) => [zone.zone_officielle, zone.niveau]));
      massifsGeojson = {
        type: "FeatureCollection",
        features: massifs.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, niveau: niveaux.get(String(feature.properties.NOM_MASSIF)) ?? "inconnu" },
        })),
      };
      detectionsGeojson = detections;
      detecterMassif(lieu.lon, lieu.lat);
      const departementContour = zones.features.find((feature) => feature.properties.type_zone === "departement") ?? null;
      etat = "ok";
      await tick();
      await initialiserCarte(departementContour);
      void localiserSiDejaAutorise();
    } catch (error) {
      console.error("vigilance-feu : chargement impossible", error);
      etat = "erreur";
    }
  }

  onMount(() => { void charger(); });
  onDestroy(() => { map?.remove(); });
</script>

<div class="vigilance-feu">
  {#if etat === "chargement"}
    <p role="status" aria-live="polite">Chargement…</p>
  {:else if etat === "erreur"}
    <p role="alert">Les données incendie sont temporairement indisponibles.</p>
  {:else}
    <div class="entete">
      <time datetime={new Date().toISOString()}>{new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date()).toUpperCase()}</time>
      <div class="actions-entete">
        <button
          type="button"
          class="action-carree"
          class:actif={lieu.source === "defaut"}
          on:click={revenirMairie}
          aria-label="Revenir à la mairie de Val-d’Aigoual"
          title="Mairie de Val-d’Aigoual"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10 L12 4 L21 10"></path>
            <path d="M3 10h18"></path>
            <path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9"></path>
            <path d="M3 19h18"></path>
          </svg>
          <span class="infobulle" aria-hidden="true">Mairie de Val-d’Aigoual</span>
        </button>
        <button
          type="button"
          class="action-carree"
          class:actif={lieu.source === "gps"}
          disabled={localisationEnCours}
          aria-busy={localisationEnCours}
          on:click={() => meLocaliser(false)}
          aria-label="Utiliser ma position"
          title="Ma position"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
            <circle cx="12" cy="12" r="8"></circle>
          </svg>
          <span class="infobulle" aria-hidden="true">{localisationEnCours ? "Localisation…" : "Ma position"}</span>
        </button>
      </div>
    </div>

    <div class="repere-lieu" aria-live="polite">
      <span class="point-lieu" aria-hidden="true"></span>
      <div>
        <p class="lieu-nom">{lieu.libelle}</p>
        {#if massifDetecte}
          <p class="massif-nom">Massif {massifDetecte.nom}</p>
        {:else if horsMassif}
          <p class="massif-nom">Hors massif suivi</p>
        {/if}
      </div>
    </div>

    {#if erreurLocalisation}<p class="message-erreur" role="alert">{erreurLocalisation}</p>{/if}

    <section class="bloc-niveau" class:rempli={!!massifDetecte} style={massifDetecte ? `--couleur-niveau:${COULEUR_PASTILLE_NIVEAU[massifDetecte.niveau]}` : ""} aria-live="polite">
      <p class="eyebrow">Risque incendie aujourd’hui</p>
      {#if massifDetecte}
        <strong class="valeur-geante">{LIBELLES_NIVEAU[massifDetecte.niveau]}</strong>
        <p class="acces-niveau">{LIBELLES_ACCES_NIVEAU[massifDetecte.niveau]}</p>
        {#if risqueDuJour?.etat === "ancienne"}
          <p class="meta-niveau avertissement">Dernière publication valide : {risqueDuJour.date_validite}. La publication du jour n’est pas disponible.</p>
        {:else}
          <p class="meta-niveau">Massif {massifDetecte.nom} · Préfecture du Gard</p>
        {/if}
      {:else}
        <strong class="valeur-geante inconnu">Pas de niveau ici</strong>
        <p class="meta-niveau">Ce point ne se trouve dans aucun des 8 massifs forestiers surveillés du Gard.</p>
      {/if}
    </section>

    <div class="carte" bind:this={mapContainer} role="region" aria-label="Carte des massifs et des anomalies thermiques du département du Gard"></div>

    <ul class="legende-niveaux">
      {#each NIVEAUX_LEGENDE as niveau}
        <li><span class="pastille" style={`background:${COULEUR_PASTILLE_NIVEAU[niveau]}`}></span>{LIBELLES_NIVEAU[niveau]} — {LIBELLES_ACCES_NIVEAU[niveau]}</li>
      {/each}
    </ul>

    <section class="point-chaud">
      <p class="eyebrow">Point chaud le plus proche</p>
      {#if pointChaudProche}
        {#if !pointChaudRecent}
          <p class="note-ancienne">Pas de détection dans les dernières 24 h — dernière détection connue :</p>
        {/if}
        <div class="distance-ligne">
          <strong class="valeur-geante bleu">{pointChaudProche.distance.toFixed(1)}<span>km</span></strong>
          <dl>
            <div><dt>Détecté</dt><dd>{ilYA(String(pointChaudProche.feature.properties.observee_a))}</dd></div>
            <div><dt>Date</dt><dd>{formaterDate(String(pointChaudProche.feature.properties.observee_a))}</dd></div>
            <div><dt>Satellite</dt><dd>{LIBELLE_SATELLITE[String(pointChaudProche.feature.properties.satellite)] ?? pointChaudProche.feature.properties.satellite}</dd></div>
            <div><dt>Puissance radiative</dt><dd>{pointChaudProche.feature.properties.frp ?? "—"} MW</dd></div>
            <div><dt>Confiance</dt><dd>{LIBELLE_CONFIANCE[String(pointChaudProche.feature.properties.confiance)] ?? "—"}</dd></div>
          </dl>
        </div>
        <button type="button" class="lien-carte" on:click={recentrerSurPointChaud}>Voir sur la carte</button>
      {:else}
        <p>Aucun point chaud détecté dans les dernières {FENETRE_RECHERCHE_HEURES} h dans le Gard.</p>
      {/if}
      <p class="avertissement">Une détection satellite n’est pas un incendie confirmé. L’absence de point ne garantit pas l’absence de feu.</p>
    </section>

    <aside class="urgence"><strong>Vous voyez un feu ou de la fumée ?</strong> Appelez le <a href="tel:112">112</a> ou le <a href="tel:18">18</a>.</aside>
    <p class="source">Source : Prévention incendie Gard · NASA FIRMS · <a href="https://www.risque-prevention-incendie.fr/gard/" target="_blank" rel="noreferrer">carte officielle du Gard</a></p>
  {/if}
</div>

<style>
  .vigilance-feu {
    --bleu: #0047ab;
    --noir: #1a1a1a;
    --gris: #686868;
    --papier: #fcfcfa;
    --filet: rgba(26, 26, 26, 0.16);
    box-sizing: border-box;
    width: min(100%, 45rem);
    margin: 0 auto;
    padding: 0 clamp(1.15rem, 6vw, 4.5rem) 3rem;
    color: var(--noir);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }
  * { box-sizing: border-box; }

  .entete { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--filet); }
  .entete time { color: var(--gris); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; }

  .actions-entete { display: flex; gap: 0.5rem; }

  .action-carree {
    position: relative;
    display: inline-flex;
    width: 2.75rem;
    height: 2.75rem;
    flex: 0 0 2.75rem;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--bleu);
    border-radius: 0;
    color: var(--bleu);
    background: var(--papier);
    cursor: pointer;
  }
  .action-carree:hover,
  .action-carree:focus-visible,
  .action-carree.actif { color: #fff; background: var(--bleu); outline: 0; }
  .action-carree:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--bleu); }
  .action-carree:disabled { opacity: 0.65; cursor: wait; }
  .action-carree svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-width: 1.8; }

  .infobulle {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 5;
    width: max-content;
    max-width: 11rem;
    padding: 0.4rem 0.55rem;
    color: #fff;
    background: var(--noir);
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    text-transform: none;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.2rem);
    transition: opacity 0.15s ease, transform 0.15s ease;
    visibility: hidden;
  }
  .action-carree:hover .infobulle,
  .action-carree:focus-visible .infobulle,
  .action-carree:active .infobulle { opacity: 1; transform: translateY(0); visibility: visible; }

  .repere-lieu { display: flex; align-items: center; gap: 0.6rem; padding: 0.85rem 0; }
  .point-lieu { width: 0.55rem; height: 0.55rem; flex: 0 0 auto; background: var(--bleu); }
  .lieu-nom { margin: 0; font-size: 0.92rem; font-weight: 700; }
  .massif-nom { margin: 0.15rem 0 0; color: var(--gris); font-size: 0.8rem; font-weight: 600; }

  .message-erreur { margin: 0 0 0.75rem; padding: 0.65rem 0.8rem; border-left: 4px solid #e63946; background: #fff1f1; color: #7f1d1d; font-size: 0.8rem; font-weight: 600; }

  .eyebrow { margin: 0; color: var(--gris); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }

  .bloc-niveau { --couleur-niveau: #808285; padding: 1.4rem 0 1.6rem 1.2rem; border-left: 7px solid var(--filet); }
  .bloc-niveau.rempli { padding: 1.3rem 1.3rem 1.5rem; border: 2px solid #000; border-left: 7px solid #000; background: var(--couleur-niveau); }
  .valeur-geante { display: block; margin: 0.35rem 0 0; color: var(--noir); font-size: clamp(2.6rem, 10vw, 4.6rem); font-weight: 800; letter-spacing: -0.03em; line-height: 0.95; }
  .valeur-geante.inconnu { color: var(--gris); }
  .valeur-geante.bleu { color: var(--bleu); font-size: clamp(2.4rem, 9vw, 3.8rem); }
  .valeur-geante span { margin-left: 0.15em; font-size: 0.4em; font-weight: 700; }
  .acces-niveau { margin: 0.3rem 0 0; color: var(--noir); font-size: 1.05rem; font-weight: 800; }
  .meta-niveau { margin: 0.6rem 0 0; color: var(--gris); font-size: 0.85rem; font-weight: 600; }
  .meta-niveau.avertissement { color: #7f1d1d; }
  .bloc-niveau.rempli .eyebrow,
  .bloc-niveau.rempli .meta-niveau { color: rgba(26, 26, 26, 0.72); }
  .bloc-niveau.rempli .meta-niveau.avertissement { color: #1a1a1a; font-style: italic; }

  .carte { height: 55vh; margin: 1.4rem 0; border: 1px solid var(--filet); }

  .legende-niveaux { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin: 0 0 1.8rem; padding: 0; list-style: none; color: var(--gris); font-size: 0.76rem; font-weight: 700; }
  .legende-niveaux li { display: flex; align-items: center; gap: 0.4rem; }
  .pastille { width: 0.7rem; height: 0.7rem; flex: 0 0 auto; border: 1px solid #000; }

  .point-chaud { padding: 1.2rem 0; border-top: 1px solid var(--filet); }
  .note-ancienne { margin: 0.35rem 0 0; color: var(--gris); font-size: 0.8rem; font-weight: 700; font-style: italic; }
  .distance-ligne { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap; margin-top: 0.35rem; }
  .distance-ligne dl { display: grid; gap: 0.45rem; margin: 0; }
  .distance-ligne dl div { display: flex; align-items: baseline; gap: 0.5rem; }
  .distance-ligne dt { min-width: 9rem; color: var(--gris); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
  .distance-ligne dd { margin: 0; font-size: 0.85rem; font-weight: 700; }

  .lien-carte { margin-top: 1rem; padding: 0.5rem 0.9rem; border: 2px solid var(--bleu); border-radius: 0; color: var(--bleu); background: var(--papier); font: inherit; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; cursor: pointer; }
  .lien-carte:hover, .lien-carte:focus-visible { color: #fff; background: var(--bleu); outline: 0; }

  .avertissement { margin: 1rem 0 0; color: var(--gris); font-size: 0.78rem; font-weight: 600; line-height: 1.5; }

  .urgence { display: flex; flex-wrap: wrap; gap: 0.4rem 0.6rem; align-items: baseline; margin-top: 1.5rem; padding: 0.9rem 1rem; background: var(--noir); color: #fff; font-size: 0.9rem; }
  .urgence a { color: #fff; font-weight: 800; }

  .source { margin: 1rem 0 0; color: var(--gris); font-size: 0.72rem; }
  .source a { color: var(--bleu); font-weight: 700; }

  @media (max-width: 480px) {
    .distance-ligne dt { min-width: 7rem; }
  }
</style>
