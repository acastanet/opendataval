<script>
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import { BASEMAPS, ajouterControleFondIgn } from "../lib/carte";

  const POINT_INITIAL = { lat: 44.064579, lon: 3.683019 };
  const CODES_WMO = {
    0: "Ciel clair", 1: "Peu nuageux", 2: "Éclaircies", 3: "Couvert",
    45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine",
    55: "Bruine forte", 61: "Pluie faible", 63: "Pluie", 65: "Pluie forte",
    66: "Pluie verglaçante", 67: "Forte pluie verglaçante", 71: "Neige faible",
    73: "Neige", 75: "Neige forte", 77: "Grains de neige", 80: "Averses faibles",
    81: "Averses", 82: "Averses violentes", 85: "Averses de neige", 86: "Fortes averses de neige",
    95: "Orage", 96: "Orage avec grêle", 99: "Orage violent avec grêle",
  };

  let conteneurCarte;
  let map;
  let marqueur;
  let etat = "chargement";
  let erreur = "";
  let donnees = null;
  let latitudeSaisie = String(POINT_INITIAL.lat);
  let longitudeSaisie = String(POINT_INITIAL.lon);
  let requeteCourante = 0;

  const nombre = (valeur) => {
    const resultat = Number(valeur);
    return Number.isFinite(resultat) ? resultat : null;
  };

  const arrondi = (valeur, decimales = 0) => {
    const n = nombre(valeur);
    if (n === null) return "–";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  };

  function dateCourte(iso) {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  }

  function dateHeure(iso) {
    if (!iso) return "–";
    return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function dansTerritoire(lat, lon) {
    const [ouest, sud, est, nord] = TERRITOIRE.bbox;
    return lon >= ouest && lon <= est && lat >= sud && lat <= nord;
  }

  function tableau(bloc, cle) {
    return Array.isArray(bloc?.[cle]) ? bloc[cle] : [];
  }

  function construireJours(bloc) {
    return tableau(bloc, "time").map((date, index) => ({
      date,
      code: tableau(bloc, "weather_code")[index],
      tMin: tableau(bloc, "temperature_2m_min")[index],
      tMax: tableau(bloc, "temperature_2m_max")[index],
      pluie: tableau(bloc, "precipitation_sum")[index],
      neige: tableau(bloc, "snowfall_sum")[index],
      rafale: tableau(bloc, "wind_gusts_10m_max")[index],
    }));
  }

  function resumerHeures(bloc, nbHeures = 12) {
    const temps = tableau(bloc, "time");
    const debut = Math.max(0, temps.findIndex((tempsIso) => new Date(tempsIso).getTime() >= Date.now() - 60 * 60 * 1000));
    const indices = Array.from({ length: nbHeures }, (_, offset) => debut + offset).filter((index) => index < temps.length);
    const temperatures = indices.map((index) => nombre(tableau(bloc, "temperature_2m")[index])).filter((v) => v !== null);
    const precipitations = indices.map((index) => nombre(tableau(bloc, "precipitation")[index]) ?? 0);
    const rafales = indices.map((index) => nombre(tableau(bloc, "wind_gusts_10m")[index])).filter((v) => v !== null);
    return {
      heures: indices.length,
      temperatureMin: temperatures.length ? Math.min(...temperatures) : null,
      temperatureMax: temperatures.length ? Math.max(...temperatures) : null,
      pluie: precipitations.reduce((somme, valeur) => somme + valeur, 0),
      rafale: rafales.length ? Math.max(...rafales) : null,
    };
  }

  function construireJoursEcmwf(bloc, ensemble) {
    const deterministes = construireJours(bloc);
    const ensembleParDate = new Map((ensemble ?? []).map((jour) => [jour.date, jour]));
    return deterministes.slice(2).map((jour) => ({ ...jour, ensemble: ensembleParDate.get(jour.date) ?? null }));
  }

  function libelleIncertitude(valeur) {
    return valeur === "faible" ? "faible dispersion" : valeur === "forte" ? "forte dispersion" : "dispersion moyenne";
  }

  function placerMarqueur(lat, lon) {
    if (!map) return;
    if (!marqueur) marqueur = new maplibregl.Marker({ color: "#b5533c" });
    marqueur.setLngLat([lon, lat]).addTo(map);
  }

  async function chargerPoint(lat, lon, deplacerCarte = false) {
    if (!dansTerritoire(lat, lon)) {
      etat = "erreur";
      erreur = "Choisissez un point dans la commune de Val-d’Aigoual.";
      return;
    }

    const numeroRequete = ++requeteCourante;
    etat = "chargement";
    erreur = "";
    latitudeSaisie = lat.toFixed(6);
    longitudeSaisie = lon.toFixed(6);
    placerMarqueur(lat, lon);
    if (deplacerCarte) map?.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12) });

    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      const res = await fetch(`/api/meteo/point?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resultat = await res.json();
      if (numeroRequete !== requeteCourante) return;
      donnees = resultat;
      etat = "ok";
    } catch (cause) {
      console.error("météo localisée indisponible", cause);
      if (numeroRequete !== requeteCourante) return;
      etat = "erreur";
      erreur = "Les données météo sont momentanément indisponibles. La Vigilance officielle reste accessible ci-dessous.";
    }
  }

  function soumettreCoordonnees(event) {
    event.preventDefault();
    const lat = Number(latitudeSaisie.replace(",", "."));
    const lon = Number(longitudeSaisie.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      etat = "erreur";
      erreur = "Saisissez une latitude et une longitude valides.";
      return;
    }
    chargerPoint(lat, lon, true);
  }

  function meLocaliser() {
    if (!navigator.geolocation) {
      etat = "erreur";
      erreur = "La géolocalisation n’est pas disponible dans ce navigateur.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => chargerPoint(coords.latitude, coords.longitude, true),
      () => {
        etat = "erreur";
        erreur = "Votre position n’a pas pu être obtenue. Vous pouvez cliquer sur la carte.";
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  onMount(() => {
    const style = {
      version: 8,
      sources: {
        "ign-plan": { type: "raster", tiles: [BASEMAPS[0].tiles], tileSize: 256, attribution: BASEMAPS[0].attribution },
        "ign-photo": { type: "raster", tiles: [BASEMAPS[1].tiles], tileSize: 256, attribution: BASEMAPS[1].attribution },
      },
      layers: [
        { id: "ign-plan-layer", type: "raster", source: "ign-plan" },
        { id: "ign-photo-layer", type: "raster", source: "ign-photo", layout: { visibility: "none" } },
      ],
    };
    map = new maplibregl.Map({
      container: conteneurCarte,
      style,
      bounds: TERRITOIRE.bbox,
      fitBoundsOptions: { padding: 24 },
      maxBounds: [
        [TERRITOIRE.bbox[0] - 0.04, TERRITOIRE.bbox[1] - 0.03],
        [TERRITOIRE.bbox[2] + 0.04, TERRITOIRE.bbox[3] + 0.03],
      ],
      minZoom: 9,
      maxZoom: 17,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      ajouterControleFondIgn(map, { planLayerId: "ign-plan-layer", photoLayerId: "ign-photo-layer" });
      placerMarqueur(POINT_INITIAL.lat, POINT_INITIAL.lon);
    });
    map.on("click", (event) => chargerPoint(event.lngLat.lat, event.lngLat.lng));
    chargerPoint(POINT_INITIAL.lat, POINT_INITIAL.lon);
  });

  onDestroy(() => map?.remove());

  $: observation = donnees?.observation ?? null;
  $: mesure = observation?.mesure ?? null;
  $: resume12h = resumerHeures(donnees?.courtTerme?.hourly, 12);
  $: joursCourts = construireJours(donnees?.courtTerme?.daily);
  $: joursEcmwf = construireJoursEcmwf(donnees?.moyenTerme?.daily, donnees?.moyenTerme?.ensemble);
</script>

<section class="meteo-point" data-testid="meteo-point" aria-labelledby="titre-meteo-point">
  <div class="intro-point">
    <div>
      <p class="eyebrow">MVP · météo localisée</p>
      <h2 id="titre-meteo-point">Cliquez sur la carte, puis lisez du plus important au plus incertain</h2>
      <p>La Vigilance et les mesures officielles passent avant les modèles. AROME détaille les prochaines 48 heures ; ECMWF ENS exprime la tendance et sa dispersion jusqu’à J+10.</p>
    </div>
    <button type="button" class="bouton-localiser" on:click={meLocaliser}>◎ Me localiser</button>
  </div>

  <form class="coordonnees" on:submit={soumettreCoordonnees}>
    <label>Latitude <input bind:value={latitudeSaisie} inputmode="decimal" aria-label="Latitude du point météo" /></label>
    <label>Longitude <input bind:value={longitudeSaisie} inputmode="decimal" aria-label="Longitude du point météo" /></label>
    <button type="submit">Afficher ce point</button>
  </form>

  <div class="carte-point" bind:this={conteneurCarte} aria-label="Carte de sélection du point météo"></div>
  <p class="aide-carte">Cliquez dans la commune de Val-d’Aigoual. Le repère rouge indique le point analysé.</p>

  {#if etat === "chargement"}
    <div class="etat" role="status">Actualisation des mesures et des prévisions…</div>
  {:else if etat === "erreur"}
    <div class="etat erreur" role="alert">{erreur}</div>
  {/if}

  {#if donnees}
    {#if donnees.perime}
      <p class="alerte-partielle">Dernières données connues : l’actualisation a échoué.</p>
    {/if}
    {#if donnees.sourcesIndisponibles?.length}
      <p class="alerte-partielle">Réponse partielle — indisponible : {donnees.sourcesIndisponibles.join(", ")}.</p>
    {/if}

    <div class="hierarchie" aria-live="polite">
      <article class="bloc priorite-1">
        <header>
          <span class="rang">1</span>
          <div><p class="niveau">Danger officiel · à vérifier en premier</p><h3>Vigilance Météo-France — Gard</h3></div>
          <span class="fiabilite officiel">Officiel expertisé</span>
        </header>
        {#if donnees.vigilance}
          <iframe
            class="widget-vigilance"
            src={donnees.vigilance.widgetUrl}
            title="Vigilance Météo-France pour le Gard"
            loading="lazy"
          ></iframe>
          <p class="source-action"><a href={donnees.vigilance.url} target="_blank" rel="noopener">Ouvrir le bulletin officiel et les consignes →</a></p>
        {:else}
          <p>Ce point se trouve hors du territoire couvert par ce MVP.</p>
        {/if}
      </article>

      <article class="bloc priorite-2">
        <header>
          <span class="rang">2</span>
          <div><p class="niveau">Maintenant · ce qui a été mesuré</p><h3>Station Météo-France la plus proche</h3></div>
          <span class="fiabilite mesure-officielle">Mesure officielle</span>
        </header>
        {#if observation && mesure}
          <div class="metriques">
            <div><span>Température</span><strong>{arrondi(mesure.t, 1)} °C</strong></div>
            <div><span>Humidité</span><strong>{arrondi(mesure.humidite)} %</strong></div>
            <div><span>Vent</span><strong>{arrondi(mesure.vent_kmh)} km/h</strong></div>
            <div><span>Rafale</span><strong>{arrondi(mesure.rafale_kmh)} km/h</strong></div>
            <div><span>Pluie 1 h</span><strong>{arrondi(mesure.pluie_1h_mm, 1)} mm</strong></div>
          </div>
          <p class="provenance" class:perime={observation.perime}>
            {observation.station.nom}, à {arrondi(observation.station.distanceKm, 1)} km et {observation.station.altitudeM} m · mesure du {dateHeure(mesure.heure_utc)}{observation.perime ? " · mesure ancienne" : ""}.
          </p>
        {:else}
          <p class="indisponible">Aucune mesure récente n’est disponible. Une mesure de station décrit son emplacement, pas exactement le point cliqué.</p>
        {/if}
      </article>

      <article class="bloc priorite-3">
        <header>
          <span class="rang">3</span>
          <div><p class="niveau">0–48 h · relief et phénomènes locaux</p><h3>Prévision Météo-France AROME</h3></div>
          <span class="fiabilite modele-local">Modèle local</span>
        </header>
        {#if donnees.courtTerme}
          <div class="resume-12h">
            <p>Prochaines {resume12h.heures || 12} h</p>
            <strong>{arrondi(resume12h.temperatureMin)} à {arrondi(resume12h.temperatureMax)} °C</strong>
            <span>{arrondi(resume12h.pluie, 1)} mm · rafales max. {arrondi(resume12h.rafale)} km/h</span>
          </div>
          <div class="jours-courts">
            {#each joursCourts as jour, index}
              <div class="carte-jour" class:transition-modele={index >= 2}>
                <p class="date">{dateCourte(jour.date)}</p>
                <p class="temps">{CODES_WMO[jour.code] ?? "Prévision"}</p>
                <strong>{arrondi(jour.tMin)}° / {arrondi(jour.tMax)}°</strong>
                <span>{arrondi(jour.pluie, 1)} mm · raf. {arrondi(jour.rafale)} km/h</span>
                {#if index === 2}<small>Relais progressif ARPEGE</small>{/if}
              </div>
            {/each}
          </div>
          <p class="provenance">{donnees.courtTerme.modele} · altitude utilisée {arrondi(donnees.courtTerme.pointModele.altitudeM)} m. Données de modèles Météo-France diffusées et adaptées par Open-Meteo.</p>
        {:else}
          <p class="indisponible">Le modèle à courte échéance est indisponible.</p>
        {/if}
      </article>

      <article class="bloc priorite-4">
        <header>
          <span class="rang">4</span>
          <div><p class="niveau">J+3 à J+10 · tendance probabiliste</p><h3>ECMWF IFS et ensemble de 51 scénarios</h3></div>
          <span class="fiabilite modele-europeen">Modèle européen</span>
        </header>
        {#if donnees.moyenTerme && joursEcmwf.length}
          <div class="jours-ecmwf">
            {#each joursEcmwf as jour}
              <div class="jour-ecmwf">
                <div class="jour-entete">
                  <div><p class="date">{dateCourte(jour.date)}</p><p class="temps">{CODES_WMO[jour.code] ?? "Tendance"}</p></div>
                  {#if jour.ensemble}<span class={`dispersion ${jour.ensemble.incertitude}`}>{libelleIncertitude(jour.ensemble.incertitude)}</span>{/if}
                </div>
                <div class="jour-valeurs">
                  <p><span>Température médiane</span><strong>{arrondi(jour.ensemble?.temperatureMinC?.p50 ?? jour.tMin)}° / {arrondi(jour.ensemble?.temperatureMaxC?.p50 ?? jour.tMax)}°</strong></p>
                  <p><span>Probabilité de pluie ≥ 0,2 mm</span><strong>{arrondi(jour.ensemble?.probabilitePluiePct)} %</strong></p>
                  <p><span>Pluie médiane · scénario humide P90</span><strong>{arrondi(jour.ensemble?.precipitationMm?.p50, 1)} · {arrondi(jour.ensemble?.precipitationMm?.p90, 1)} mm</strong></p>
                </div>
                {#if jour.ensemble?.probabilitePluieFortePct > 0 || jour.ensemble?.probabiliteRafaleFortePct > 0}
                  <p class="signaux">≥ 20 mm : {jour.ensemble.probabilitePluieFortePct}% · rafale ≥ 70 km/h : {jour.ensemble.probabiliteRafaleFortePct}%</p>
                {/if}
              </div>
            {/each}
          </div>
          <p class="provenance">La dispersion est une lecture simplifiée des intervalles P10–P90, pas un indice officiel. Les cumuls et horaires précis deviennent moins fiables avec l’échéance.</p>
          <p class="source-action"><a href={donnees.liens.ecmwf} target="_blank" rel="noopener">Vérifier le météogramme probabiliste sur le site officiel ECMWF →</a></p>
        {:else}
          <p class="indisponible">La tendance ECMWF est indisponible.</p>
        {/if}
      </article>
    </div>

    <aside class="limites" aria-label="Limites d’interprétation">
      <strong>À retenir</strong>
      <p>Une coordonnée n’est jamais une station météo. Le relief cévenol peut créer de forts écarts à quelques kilomètres. Pour une décision de sécurité, la Vigilance et les consignes officielles priment toujours.</p>
      {#if donnees.liens.meteoFrance}<a href={donnees.liens.meteoFrance} target="_blank" rel="noopener">Prévision expertisée Météo-France pour Val-d’Aigoual →</a>{/if}
    </aside>
  {/if}
</section>

<style>
  .meteo-point { margin: 1.2rem 0 3rem; }
  .intro-point { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.2rem; margin-bottom: 1rem; }
  .intro-point h2 { margin: 0.15rem 0 0.5rem; max-width: 28ch; font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 2rem); }
  .intro-point p:last-child { margin: 0; max-width: 70ch; line-height: 1.55; color: var(--muted); }
  .eyebrow, .niveau { margin: 0; color: var(--accent); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; }
  .bouton-localiser, .coordonnees button { border: 1px solid var(--fg); border-radius: var(--radius); background: var(--fg); color: var(--bg); padding: 0.65rem 0.9rem; cursor: pointer; white-space: nowrap; }
  .bouton-localiser:focus-visible, .coordonnees button:focus-visible, .coordonnees input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .coordonnees { display: flex; align-items: end; gap: 0.6rem; padding: 0.7rem; border: 1px solid var(--border); border-bottom: 0; background: var(--surface-muted); }
  .coordonnees label { display: grid; gap: 0.25rem; font-size: 0.7rem; color: var(--muted); }
  .coordonnees input { width: 9rem; border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.55rem 0.6rem; background: var(--surface); color: var(--text); font-family: var(--font-mono); }
  .carte-point { height: min(52vh, 32rem); min-height: 20rem; border: 1px solid var(--border); }
  .aide-carte { margin: 0.4rem 0 1rem; font-size: 0.74rem; color: var(--muted); }
  .etat { padding: 0.9rem; border: 1px solid var(--border); background: var(--surface-muted); }
  .etat.erreur, .alerte-partielle { border-color: var(--color-alerte); color: var(--color-alerte); }
  .alerte-partielle { padding: 0.65rem 0.8rem; border: 1px solid; font-size: 0.8rem; }
  .hierarchie { display: grid; gap: 0.85rem; margin-top: 1rem; }
  .bloc { border: 1px solid var(--border); border-left: 5px solid var(--color-granite); border-radius: var(--radius); padding: clamp(0.9rem, 2vw, 1.25rem); background: var(--surface); }
  .priorite-1 { border-left-color: var(--color-alerte); }
  .priorite-2 { border-left-color: var(--color-lichen); }
  .priorite-3 { border-left-color: var(--color-torrent); }
  .priorite-4 { border-left-color: var(--color-chataigne); }
  .bloc > header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.8rem; margin-bottom: 1rem; }
  .bloc h3 { margin: 0.12rem 0 0; font-family: var(--font-display); font-size: 1.15rem; }
  .rang { display: grid; place-items: center; width: 2rem; height: 2rem; border: 1px solid currentColor; border-radius: 50%; font-family: var(--font-display); font-size: 1rem; }
  .fiabilite { border-radius: 999px; padding: 0.25rem 0.55rem; font-size: 0.65rem; font-weight: 700; white-space: nowrap; }
  .officiel { color: #812e1f; background: #f5d8d1; }
  .mesure-officielle { color: #385020; background: #e5eddc; }
  .modele-local { color: #214f62; background: #dceaf0; }
  .modele-europeen { color: #5a321d; background: #eee1d8; }
  .widget-vigilance { display: block; width: 100%; max-width: 42rem; height: 11rem; border: 0; background: #fff; }
  .source-action { margin: 0.7rem 0 0; font-size: 0.78rem; }
  .metriques { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.5rem; }
  .metriques div { display: grid; gap: 0.2rem; padding: 0.65rem; border: 1px solid var(--border); background: var(--surface-muted); }
  .metriques span, .jour-valeurs span { color: var(--muted); font-size: 0.68rem; }
  .metriques strong { font-size: 1rem; }
  .provenance { margin: 0.8rem 0 0; color: var(--muted); font-size: 0.72rem; line-height: 1.45; }
  .provenance.perime { color: var(--color-alerte); }
  .resume-12h { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: 0.8rem; padding: 0.8rem; background: var(--navy); color: #fff; }
  .resume-12h p { margin: 0; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .resume-12h strong { font-size: 1.2rem; }
  .resume-12h span { justify-self: end; font-size: 0.78rem; }
  .jours-courts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; margin-top: 0.5rem; }
  .carte-jour { display: grid; gap: 0.2rem; padding: 0.65rem; border: 1px solid var(--border); }
  .carte-jour.transition-modele { border-style: dashed; }
  .date, .temps { margin: 0; }
  .date { font-family: var(--font-display); font-weight: 700; text-transform: capitalize; }
  .temps { min-height: 1.1rem; color: var(--muted); font-size: 0.72rem; }
  .carte-jour span, .carte-jour small { color: var(--muted); font-size: 0.68rem; }
  .jours-ecmwf { display: grid; gap: 0.55rem; }
  .jour-ecmwf { padding: 0.75rem; border: 1px solid var(--border); }
  .jour-entete { display: flex; justify-content: space-between; align-items: start; gap: 0.7rem; }
  .dispersion { border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.5rem; color: var(--muted); font-size: 0.64rem; }
  .dispersion.forte { border-color: var(--color-alerte); color: var(--color-alerte); }
  .dispersion.faible { border-color: var(--color-lichen); color: var(--color-lichen); }
  .jour-valeurs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin-top: 0.65rem; }
  .jour-valeurs p { display: grid; gap: 0.2rem; margin: 0; }
  .signaux { margin: 0.6rem 0 0; color: var(--color-alerte); font-size: 0.7rem; }
  .indisponible { color: var(--muted); }
  .limites { margin-top: 0.85rem; padding: 1rem; border: 1px dashed var(--border); font-size: 0.8rem; line-height: 1.5; }
  .limites p { margin: 0.25rem 0 0.5rem; }

  @media (max-width: 760px) {
    .intro-point { align-items: stretch; flex-direction: column; }
    .bouton-localiser { align-self: flex-start; }
    .coordonnees { flex-wrap: wrap; }
    .coordonnees label { flex: 1; min-width: 8rem; }
    .coordonnees input { width: 100%; }
    .coordonnees button { width: 100%; }
    .carte-point { min-height: 17rem; height: 42vh; }
    .bloc > header { grid-template-columns: auto 1fr; }
    .fiabilite { grid-column: 2; justify-self: start; }
    .metriques { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .resume-12h { grid-template-columns: 1fr 1fr; }
    .resume-12h span { grid-column: 1 / -1; justify-self: start; }
    .jours-courts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .jour-valeurs { grid-template-columns: 1fr; }
  }
</style>
