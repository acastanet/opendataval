<script>
  import { onDestroy, onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import { BASEMAPS, ajouterControleFondIgn } from "../lib/carte";

  export let mode = "complet";

  const POINT_INITIAL = { lat: 44.064579, lon: 3.683019 };
  const CLE_FAVORI = "opendata-vda-meteo-favori-v1";
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
  let lieuSelectionne = {
    label: "Point sélectionné",
    nom: "Point sélectionné",
    type: "coordonnees",
    lat: POINT_INITIAL.lat,
    lon: POINT_INITIAL.lon,
    distanceM: null,
    score: null,
  };
  let favori = null;
  let latitudeSaisie = String(POINT_INITIAL.lat);
  let longitudeSaisie = String(POINT_INITIAL.lon);
  let recherche = "";
  let resultatsRecherche = [];
  let etatRecherche = "";
  let timerRecherche;
  let timerHorloge;
  let horloge = Date.now();
  let requeteCourante = 0;

  const nombre = (valeur) => {
    const resultat = Number(valeur);
    return Number.isFinite(resultat) ? resultat : null;
  };

  const valeur = (objet, cle) => nombre(objet?.[cle]);

  const arrondi = (valeurBrute, decimales = 0) => {
    const n = nombre(valeurBrute);
    if (n === null) return "–";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  };

  function dateCourte(iso) {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  }

  function dateLongue(iso = new Date().toISOString()) {
    return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }

  function heureCourte(iso) {
    if (!iso) return "–";
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function actualiseDepuis(iso) {
    if (!iso) return "heure inconnue";
    const minutes = Math.max(0, Math.floor((horloge - new Date(iso).getTime()) / 60_000));
    return minutes < 1 ? "il y a moins d’une minute" : `il y a ${minutes} min`;
  }

  function dateHeure(iso) {
    if (!iso) return "–";
    return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function tableau(bloc, cle) {
    return Array.isArray(bloc?.[cle]) ? bloc[cle] : [];
  }

  function construireHeures(bloc) {
    const temps = tableau(bloc, "time");
    return temps.map((time, index) => ({
      time,
      temperature: tableau(bloc, "temperature_2m")[index],
      ressenti: tableau(bloc, "apparent_temperature")[index],
      humidite: tableau(bloc, "relative_humidity_2m")[index],
      pression: tableau(bloc, "surface_pressure")[index],
      pluie: tableau(bloc, "precipitation")[index],
      neige: tableau(bloc, "snowfall")[index],
      vent: tableau(bloc, "wind_speed_10m")[index],
      direction: tableau(bloc, "wind_direction_10m")[index],
      rafale: tableau(bloc, "wind_gusts_10m")[index],
      code: tableau(bloc, "weather_code")[index],
    }));
  }

  function heuresAVenir(bloc, limite = 24) {
    const heures = construireHeures(bloc);
    const debutTrouve = heures.findIndex((heure) => new Date(heure.time).getTime() >= Date.now() - 45 * 60 * 1000);
    return heures.slice(debutTrouve < 0 ? 0 : debutTrouve, (debutTrouve < 0 ? 0 : debutTrouve) + limite);
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

  function construireJoursEcmwf(bloc, ensemble) {
    const deterministes = construireJours(bloc);
    const ensembleParDate = new Map((ensemble ?? []).map((jour) => [jour.date, jour]));
    return deterministes.slice(2).map((jour) => ({ ...jour, ensemble: ensembleParDate.get(jour.date) ?? null }));
  }

  function symboleMeteo(code) {
    const n = nombre(code);
    if (n === 0) return "☀";
    if (n !== null && n <= 2) return "☼";
    if (n === 3) return "☁";
    if (n !== null && n >= 95) return "ϟ";
    if (n !== null && n >= 71 && n <= 86) return "❄";
    if (n !== null && n >= 51 && n <= 67) return "☂";
    if (n === 45 || n === 48) return "≋";
    return "◌";
  }

  function directionVent(degres) {
    const n = nombre(degres);
    if (n === null) return "–";
    return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(n / 45) % 8];
  }

  function libelleIncertitude(valeurBrute) {
    return valeurBrute === "faible" ? "faible dispersion" : valeurBrute === "forte" ? "forte dispersion" : "dispersion moyenne";
  }

  function signalAProximite(heures) {
    const fenetre = heures.slice(0, 12);
    const pluie = fenetre.reduce((somme, heure) => somme + (nombre(heure.pluie) ?? 0), 0);
    const rafale = Math.max(0, ...fenetre.map((heure) => nombre(heure.rafale) ?? 0));
    const max = Math.max(-Infinity, ...fenetre.map((heure) => nombre(heure.temperature)).filter((n) => n !== null));
    const min = Math.min(Infinity, ...fenetre.map((heure) => nombre(heure.temperature)).filter((n) => n !== null));
    const orage = fenetre.find((heure) => nombre(heure.code) >= 95);
    if (orage) return { niveau: "alerte", titre: `Orage possible vers ${heureCourte(orage.time)}`, detail: "Surveillez la Vigilance et l’évolution locale." };
    if (rafale >= 70) return { niveau: "alerte", titre: `Rafales jusqu’à ${arrondi(rafale)} km/h`, detail: "Vent fort possible dans les 12 prochaines heures." };
    if (pluie >= 10) return { niveau: "attention", titre: `${arrondi(pluie, 1)} mm de pluie attendus`, detail: "Cumul estimé sur les 12 prochaines heures." };
    if (max >= 35) return { niveau: "attention", titre: `Chaleur jusqu’à ${arrondi(max)} °C`, detail: "Évitez les efforts aux heures les plus chaudes." };
    if (min <= 0) return { niveau: "attention", titre: `Risque de gel jusqu’à ${arrondi(min)} °C`, detail: "Température estimée dans les 12 prochaines heures." };
    if (pluie >= 0.2) return { niveau: "information", titre: `Pluie possible : ${arrondi(pluie, 1)} mm`, detail: "Cumul estimé sur les 12 prochaines heures." };
    return { niveau: "calme", titre: "Pas de phénomène marqué à court terme", detail: "Prévision à surveiller si vous vous déplacez en altitude." };
  }

  function libelleAQI(aqi) {
    const n = nombre(aqi);
    if (n === null) return { texte: "Indisponible", niveau: "inconnu" };
    if (n <= 20) return { texte: "Bon", niveau: "bon" };
    if (n <= 40) return { texte: "Assez bon", niveau: "moyen" };
    if (n <= 60) return { texte: "Moyen", niveau: "moyen" };
    if (n <= 80) return { texte: "Médiocre", niveau: "mauvais" };
    if (n <= 100) return { texte: "Mauvais", niveau: "mauvais" };
    return { texte: "Très mauvais", niveau: "mauvais" };
  }

  function placerMarqueur(lat, lon) {
    if (!map) return;
    if (!marqueur) marqueur = new maplibregl.Marker({ color: "#f2b45e" });
    marqueur.setLngLat([lon, lat]).addTo(map);
  }

  async function identifierLieu(lat, lon) {
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      const res = await fetch(`/api/meteo/localisation?${params}`);
      if (!res.ok) return null;
      return (await res.json()).lieu ?? null;
    } catch {
      return null;
    }
  }

  async function chargerPoint(lat, lon, options = {}) {
    const numeroRequete = ++requeteCourante;
    etat = "chargement";
    erreur = "";
    latitudeSaisie = lat.toFixed(6);
    longitudeSaisie = lon.toFixed(6);
    placerMarqueur(lat, lon);
    if (options.deplacerCarte) map?.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 13) });

    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      const [meteoRes, lieuTrouve] = await Promise.all([
        fetch(`/api/meteo/point?${params}`),
        options.lieu ? Promise.resolve(options.lieu) : identifierLieu(lat, lon),
      ]);
      if (!meteoRes.ok) throw new Error(`HTTP ${meteoRes.status}`);
      const resultat = await meteoRes.json();
      if (numeroRequete !== requeteCourante) return;
      donnees = resultat;
      lieuSelectionne = lieuTrouve ?? {
        label: `Point ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        nom: "Point sélectionné",
        type: options.type ?? "coordonnees",
        lat,
        lon,
        distanceM: options.accuracy ?? null,
        score: null,
      };
      if (options.type === "gps") lieuSelectionne = { ...lieuSelectionne, type: "gps", distanceM: options.accuracy ?? lieuSelectionne.distanceM };
      etat = "ok";
    } catch (cause) {
      console.error("météo localisée indisponible", cause);
      if (numeroRequete !== requeteCourante) return;
      etat = "erreur";
      erreur = "Les données météo sont momentanément indisponibles. La Vigilance officielle reste accessible dans les détails.";
    }
  }

  function programmerRecherche() {
    clearTimeout(timerRecherche);
    const q = recherche.trim();
    if (q.length < 2) {
      resultatsRecherche = [];
      etatRecherche = "";
      return;
    }
    etatRecherche = "recherche";
    timerRecherche = setTimeout(async () => {
      try {
        const res = await fetch(`/api/meteo/lieux?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        resultatsRecherche = Array.isArray(data.lieux) ? data.lieux : [];
        etatRecherche = resultatsRecherche.length ? "resultats" : "vide";
      } catch {
        resultatsRecherche = [];
        etatRecherche = "erreur";
      }
    }, 280);
  }

  function selectionnerLieu(lieu) {
    recherche = "";
    resultatsRecherche = [];
    etatRecherche = "";
    chargerPoint(lieu.lat, lieu.lon, { lieu, deplacerCarte: true, type: "adresse" });
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
    chargerPoint(lat, lon, { deplacerCarte: true, type: "coordonnees" });
  }

  function meLocaliser() {
    if (!navigator.geolocation) {
      etat = "erreur";
      erreur = "La géolocalisation n’est pas disponible dans ce navigateur.";
      return;
    }
    etat = "localisation";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => chargerPoint(coords.latitude, coords.longitude, { deplacerCarte: true, type: "gps", accuracy: coords.accuracy }),
      () => {
        etat = "erreur";
        erreur = modeEssentiel
          ? "Votre position n’a pas pu être obtenue. Choisissez un point sur la carte."
          : "Votre position n’a pas pu être obtenue. Recherchez une adresse ou choisissez un point sur la carte.";
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  }

  function basculerFavori() {
    if (favoriActuel) {
      localStorage.removeItem(CLE_FAVORI);
      favori = null;
      return;
    }
    favori = { ...lieuSelectionne, lat: Number(latitudeSaisie), lon: Number(longitudeSaisie) };
    localStorage.setItem(CLE_FAVORI, JSON.stringify(favori));
  }

  function utiliserFavori() {
    if (favori) chargerPoint(favori.lat, favori.lon, { lieu: favori, deplacerCarte: true, type: "favori" });
  }

  function initialiserCarte() {
    if (map || !conteneurCarte) return;
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
      minZoom: 9,
      maxZoom: 17,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      ajouterControleFondIgn(map, { planLayerId: "ign-plan-layer", photoLayerId: "ign-photo-layer" });
      placerMarqueur(Number(latitudeSaisie), Number(longitudeSaisie));
    });
    map.on("click", (event) => chargerPoint(event.lngLat.lat, event.lngLat.lng, { type: "carte" }));
  }

  function redimensionnerCarte(event) {
    if (event.currentTarget.open) {
      setTimeout(() => {
        initialiserCarte();
        map?.resize();
      }, 0);
    }
  }

  onMount(() => {
    timerHorloge = window.setInterval(() => { horloge = Date.now(); }, 60_000);
    try {
      const stocke = JSON.parse(localStorage.getItem(CLE_FAVORI) ?? "null");
      if (stocke && Number.isFinite(Number(stocke.lat)) && Number.isFinite(Number(stocke.lon))) favori = stocke;
    } catch {
      favori = null;
    }

    const initial = favori ?? POINT_INITIAL;
    chargerPoint(Number(initial.lat), Number(initial.lon), { lieu: favori, type: favori ? "favori" : "coordonnees" });
  });

  onDestroy(() => {
    clearTimeout(timerRecherche);
    clearInterval(timerHorloge);
    map?.remove();
  });

  $: observation = donnees?.observation ?? null;
  $: mesure = observation?.mesure ?? null;
  $: heures = heuresAVenir(donnees?.courtTerme?.hourly, 24);
  $: maintenantModele = donnees?.courtTerme?.current ?? heures[0] ?? null;
  $: temperatureActuelle = valeur(maintenantModele, "temperature_2m") ?? nombre(heures[0]?.temperature) ?? nombre(mesure?.t);
  $: ressentiActuel = valeur(maintenantModele, "apparent_temperature") ?? nombre(heures[0]?.ressenti) ?? temperatureActuelle;
  $: codeActuel = valeur(maintenantModele, "weather_code") ?? nombre(heures[0]?.code);
  $: humiditeActuelle = valeur(maintenantModele, "relative_humidity_2m") ?? nombre(heures[0]?.humidite) ?? nombre(mesure?.humidite);
  $: ventActuel = valeur(maintenantModele, "wind_speed_10m") ?? nombre(heures[0]?.vent) ?? nombre(mesure?.vent_kmh);
  $: directionActuelle = valeur(maintenantModele, "wind_direction_10m") ?? nombre(heures[0]?.direction) ?? nombre(mesure?.vent_dir);
  $: rafaleActuelle = valeur(maintenantModele, "wind_gusts_10m") ?? nombre(heures[0]?.rafale) ?? nombre(mesure?.rafale_kmh);
  $: pressionActuelle = valeur(maintenantModele, "surface_pressure") ?? nombre(heures[0]?.pression) ?? nombre(mesure?.pression_hpa);
  $: joursCourts = construireJours(donnees?.courtTerme?.daily);
  $: joursEcmwf = construireJoursEcmwf(donnees?.moyenTerme?.daily, donnees?.moyenTerme?.ensemble);
  $: signal = signalAProximite(heures);
  $: pluie12h = heures.slice(0, 12).reduce((somme, heure) => somme + (nombre(heure.pluie) ?? 0), 0);
  $: qualiteAir = donnees?.qualiteAir?.current ?? null;
  $: indiceAir = libelleAQI(valeur(qualiteAir, "european_aqi"));
  $: modeEssentiel = mode === "essentiel";
  $: favoriActuel = Boolean(favori && Math.abs(Number(favori.lat) - Number(latitudeSaisie)) < 0.00001 && Math.abs(Number(favori.lon) - Number(longitudeSaisie)) < 0.00001);
  $: precisionPosition = lieuSelectionne?.type === "gps"
    ? `GPS ± ${arrondi(lieuSelectionne.distanceM)} m`
    : lieuSelectionne?.type === "housenumber"
      ? "Adresse BAN sélectionnée"
      : lieuSelectionne?.type === "locality"
        ? `Lieu-dit BAN${lieuSelectionne.distanceM !== null ? ` · à ${arrondi(lieuSelectionne.distanceM)} m` : ""}`
        : lieuSelectionne?.type === "carte"
          ? "Point choisi sur la carte"
          : "Coordonnées sélectionnées";
</script>

<section class="meteo-app" data-testid="meteo-point" aria-labelledby="titre-meteo-point">
  <div class="meteo-hero">
    <div class="hero-top">
      <div class="lieu-courant">
        <p class="sur-titre">Prévision météo locale</p>
        <h1 id="titre-meteo-point">{lieuSelectionne?.nom ?? "Val-d’Aigoual"}</h1>
        <p class="adresse-complete">{lieuSelectionne?.label}</p>
      </div>
      <div class="actions-lieu">
        {#if !modeEssentiel}<button type="button" class="bouton-icone" class:actif={favoriActuel} on:click={basculerFavori} aria-label={favoriActuel ? "Retirer des favoris" : "Enregistrer comme Maison"} title={favoriActuel ? "Retirer des favoris" : "Enregistrer comme Maison"}>★</button>{/if}
        <button type="button" class="bouton-gps" on:click={meLocaliser} aria-label="Utiliser ma position">⌖ <span>Ma position</span></button>
      </div>
    </div>

    {#if !modeEssentiel}<div class="precision" data-testid="precision-localisation">
        <span class="point-precision"></span>
        <span><strong>{precisionPosition}</strong> · prévision AROME sur une maille de 1,5 à 2,5 km</span>
      </div>{/if}

    {#if !modeEssentiel}<div class="recherche-wrap">
      <label class="sr-only" for="recherche-lieu">Rechercher une adresse ou un lieu-dit</label>
      <span aria-hidden="true">⌕</span>
      <input id="recherche-lieu" bind:value={recherche} on:input={programmerRecherche} autocomplete="off" placeholder="Adresse ou lieu-dit" />
      {#if etatRecherche === "recherche"}<span class="recherche-statut">Recherche…</span>{/if}
      {#if resultatsRecherche.length}
        <ul class="suggestions" role="listbox" aria-label="Résultats de recherche">
          {#each resultatsRecherche as lieu}
            <li><button type="button" on:click={() => selectionnerLieu(lieu)}><strong>{lieu.nom}</strong><span>{lieu.label}</span></button></li>
          {/each}
        </ul>
      {:else if etatRecherche === "vide"}
        <p class="suggestions vide">Aucun lieu trouvé.</p>
      {/if}
      </div>{/if}

    {#if !modeEssentiel && favori && !favoriActuel}
      <button type="button" class="raccourci-favori" on:click={utiliserFavori}>⌂ Maison · {favori.nom}</button>
    {/if}

    {#if etat === "chargement" || etat === "localisation"}
      <div class="etat-hero" role="status">{etat === "localisation" ? "Localisation GPS en cours…" : "Actualisation de la prévision…"}</div>
    {:else if etat === "erreur"}
      <div class="etat-hero erreur" role="alert">{erreur}</div>
    {/if}

    {#if donnees}
      <div class="maintenant">
        <div class="temperature">
          <strong>{arrondi(temperatureActuelle)}<sup>°</sup></strong>
          <div><span class="symbole-grand" aria-hidden="true">{symboleMeteo(codeActuel)}</span><p>{CODES_WMO[codeActuel] ?? "Conditions locales"}</p></div>
        </div>
        <p class="ressenti">Ressenti {arrondi(ressentiActuel)} °C · actualisé {actualiseDepuis(maintenantModele?.time ?? donnees.genereLe)}</p>
      </div>

      <div class="essentiels" class:essentiels-restreints={modeEssentiel} aria-label="Conditions essentielles">
        {#if !modeEssentiel}<div><span>Pluie 12 h</span><strong>{arrondi(pluie12h, 1)} mm</strong></div>{/if}
        <div><span>Vent</span><strong>{arrondi(ventActuel)} km/h {directionVent(directionActuelle)}</strong></div>
        <div><span>Rafales</span><strong>{arrondi(rafaleActuelle)} km/h</strong></div>
        <div><span>Humidité</span><strong>{arrondi(humiditeActuelle)} %</strong></div>
      </div>

      <div class={`signal signal-${signal.niveau}`}>
        <span class="signal-icone" aria-hidden="true">{signal.niveau === "calme" ? "✓" : "!"}</span>
        <div><strong>{signal.titre}</strong><p>{signal.detail}</p></div>
        {#if donnees.vigilance}<a href="#vigilance">Vigilance</a>{/if}
      </div>

      <div class="mini-heures" aria-label="Résumé des prochaines heures">
        {#each heures.slice(0, 4) as heure, index}
          <div><span>{index === 0 ? "Maintenant" : heureCourte(heure.time)}</span><b aria-hidden="true">{symboleMeteo(heure.code)}</b><strong>{arrondi(heure.temperature)}°</strong><small>{arrondi(heure.pluie, 1)} mm</small></div>
        {/each}
      </div>
    {/if}
  </div>

  {#if donnees}
    {#if !modeEssentiel}<nav class="navigation-details" aria-label="Détails météo">
      <a href="#heure-par-heure"><span>◷</span>Heures</a>
      <a href="#jours"><span>▦</span>Jours</a>
      <a href="#pluie-vent"><span>☂</span>Pluie & vent</a>
      <a href="#vigilance"><span>!</span>Alertes</a>
      <a href="#precision-sources"><span>◎</span>Précision</a>
      </nav>{/if}

    {#if donnees.perime}<p class="alerte-partielle">Dernières données connues : l’actualisation a échoué.</p>{/if}
    {#if donnees.sourcesIndisponibles?.length}<p class="alerte-partielle">Réponse partielle — indisponible : {donnees.sourcesIndisponibles.join(", ")}.</p>{/if}

    <div class="contenu-details">
      <section id="heure-par-heure" class="section-detail">
        <header><div><p class="section-label">Aujourd’hui · {dateLongue()}</p><h2>Heure par heure</h2></div><span>AROME</span></header>
        <div class="heures-scroll">
          {#each heures.slice(0, modeEssentiel ? 8 : 16) as heure, index}
            <article class:maintenant-carte={index === 0}>
              <time>{index === 0 ? "Maint." : heureCourte(heure.time)}</time>
              <b aria-hidden="true">{symboleMeteo(heure.code)}</b>
              <strong>{arrondi(heure.temperature)}°</strong>
              <span>ress. {arrondi(heure.ressenti ?? heure.temperature)}°</span>
              <small>{arrondi(heure.pluie, 1)} mm</small>
              <small>raf. {arrondi(heure.rafale)}</small>
            </article>
          {/each}
        </div>
      </section>

      <section id="jours" class="section-detail">
        <header><div><p class="section-label">Court terme</p><h2>Les 4 prochains jours</h2></div><span>AROME → ARPEGE</span></header>
        <div class="jours-liste">
          {#each joursCourts.slice(0, 4) as jour, index}
            <article class:transition-modele={index >= 2}>
              <div><strong>{dateCourte(jour.date)}</strong>{#if index === 2}<small>Relais progressif ARPEGE</small>{/if}</div>
              <span class="symbole-jour" aria-hidden="true">{symboleMeteo(jour.code)}</span>
              <div class="condition-jour"><span>{CODES_WMO[jour.code] ?? "Prévision"}</span><small>{arrondi(jour.pluie, 1)} mm · raf. {arrondi(jour.rafale)} km/h</small></div>
              <div class="temperatures-jour"><strong>{arrondi(jour.tMax)}°</strong><span>{arrondi(jour.tMin)}°</span></div>
            </article>
          {/each}
        </div>
      </section>

      {#if !modeEssentiel}<section id="pluie-vent" class="section-detail">
        <header><div><p class="section-label">À votre point</p><h2>Pluie, vent et atmosphère</h2></div></header>
        <div class="grille-indicateurs">
          <article><span>Pluie prévue · 12 h</span><strong>{arrondi(pluie12h, 1)} mm</strong><small>Cumul du modèle au point choisi</small></article>
          <article><span>Vent actuel estimé</span><strong>{arrondi(ventActuel)} km/h</strong><small>{directionVent(directionActuelle)} · rafales {arrondi(rafaleActuelle)} km/h</small></article>
          <article><span>Humidité</span><strong>{arrondi(humiditeActuelle)} %</strong><small>Estimation AROME</small></article>
          <article><span>Pression</span><strong>{arrondi(pressionActuelle)} hPa</strong><small>Pression à l’altitude du point modèle</small></article>
        </div>
        </section>{/if}

      <section id="vigilance" class="section-detail vigilance-section">
        <header><div><p class="section-label danger">Sécurité · source officielle</p><h2>Vigilance et alertes</h2></div><span class="badge-officiel">Météo-France</span></header>
        {#if donnees.vigilance}
          <div class="vigilance-officielle">
            <strong>Vigilance officielle pour le Gard</strong>
            <p>Consultez la carte actualisée, le bulletin détaillé et les consignes directement auprès de Météo-France.</p>
            <a class="lien-action" href={donnees.vigilance.url} target="_blank" rel="noopener">Ouvrir le bulletin officiel et les consignes →</a>
          </div>
        {:else}
          <p>Ce point se trouve hors du territoire couvert par cette intégration de la Vigilance.</p>
        {/if}
      </section>

      <section id="qualite-air" class="section-detail">
        <header><div><p class="section-label">Estimation régionale · maille 11 km</p><h2>Qualité de l’air</h2></div><span class={`badge-air ${indiceAir.niveau}`}>{indiceAir.texte}</span></header>
        {#if qualiteAir}
          <div class="air-contenu">
            <div class="aqi"><span>Indice européen</span><strong>{arrondi(qualiteAir.european_aqi)}</strong></div>
            <dl><div><dt>PM2,5</dt><dd>{arrondi(qualiteAir.pm2_5, 1)} µg/m³</dd></div><div><dt>PM10</dt><dd>{arrondi(qualiteAir.pm10, 1)} µg/m³</dd></div><div><dt>Ozone</dt><dd>{arrondi(qualiteAir.ozone, 1)} µg/m³</dd></div><div><dt>NO₂</dt><dd>{arrondi(qualiteAir.nitrogen_dioxide, 1)} µg/m³</dd></div></dl>
          </div>
          <p class="note-source">Prévision Copernicus CAMS European Ensemble diffusée par Open-Meteo. Ce n’est pas une mesure à l’adresse.</p>
        {:else}<p>Données de qualité de l’air indisponibles.</p>{/if}
      </section>

      {#if !modeEssentiel}<section id="precision-sources" class="section-detail precision-section">
        <header><div><p class="section-label">Transparence</p><h2>Précision réelle et sources</h2></div></header>
        <div class="precision-cards">
          <article><span class="numero">1</span><div><strong>Position demandée</strong><p>{precisionPosition} · {latitudeSaisie}, {longitudeSaisie}. Adresse et lieux-dits : Géoplateforme IGN / BAN.</p></div></article>
          <article><span class="numero">2</span><div><strong>Prévision au point</strong><p>{donnees.courtTerme?.modele ?? "Météo-France AROME / ARPEGE"} · {donnees.courtTerme?.resolution}. Altitude de calcul {arrondi(donnees.courtTerme?.pointModele?.altitudeM)} m.</p></div></article>
          <article><span class="numero">3</span><div><strong>Mesure de comparaison</strong>{#if observation}<p>Station Météo-France {observation.station.nom}, à {arrondi(observation.station.distanceKm, 1)} km et {observation.station.altitudeM} m · relevé du {dateHeure(mesure?.heure_utc)}{observation.perime ? " · mesure ancienne" : ""}.</p>{:else}<p>Aucune station récente disponible à proximité.</p>{/if}</div></article>
        </div>
        <div class="avertissement-relief"><strong>Pourquoi ce n’est pas une météo “à la porte près”</strong><p>Dans les Cévennes, l’altitude, l’exposition et les vallées peuvent modifier rapidement pluie, vent et température. La position peut être précise, mais AROME représente une maille de 1,5 à 2,5 km et une station décrit d’abord son propre emplacement.</p></div>
        <p class="note-source">Modèles Météo-France diffusés et adaptés par Open-Meteo. Pour une décision de sécurité, la Vigilance et les consignes officielles priment.</p>
        </section>{/if}

      {#if !modeEssentiel}<details class="section-detail tendance-ecmwf">
        <summary><span><small>J+3 à J+10 · 51 scénarios</small><strong>Tendance probabiliste ECMWF</strong></span><b>Voir les détails</b></summary>
        <div class="ecmwf-contenu">
          {#if donnees.moyenTerme && joursEcmwf.length}
            {#each joursEcmwf as jour}
              <article class="jour-ecmwf">
                <div><strong>{dateCourte(jour.date)}</strong><span>{CODES_WMO[jour.code] ?? "Tendance"}</span></div>
                {#if jour.ensemble}<span class={`dispersion ${jour.ensemble.incertitude}`}>{libelleIncertitude(jour.ensemble.incertitude)}</span>{/if}
                <dl><div><dt>Température médiane</dt><dd>{arrondi(jour.ensemble?.temperatureMinC?.p50 ?? jour.tMin)}° / {arrondi(jour.ensemble?.temperatureMaxC?.p50 ?? jour.tMax)}°</dd></div><div><dt>Probabilité de pluie</dt><dd>{arrondi(jour.ensemble?.probabilitePluiePct)} %</dd></div><div><dt>Pluie médiane · P90</dt><dd>{arrondi(jour.ensemble?.precipitationMm?.p50, 1)} · {arrondi(jour.ensemble?.precipitationMm?.p90, 1)} mm</dd></div></dl>
                {#if jour.ensemble?.probabilitePluieFortePct > 0 || jour.ensemble?.probabiliteRafaleFortePct > 0}<p class="signaux">≥ 20 mm : {jour.ensemble.probabilitePluieFortePct}% · rafale ≥ 70 km/h : {jour.ensemble.probabiliteRafaleFortePct}%</p>{/if}
              </article>
            {/each}
            <p class="note-source">La dispersion P10–P90 est une lecture simplifiée, pas un indice officiel. Les horaires précis deviennent moins fiables avec l’échéance.</p>
            <a class="lien-action" href={donnees.liens.ecmwf} target="_blank" rel="noopener">Vérifier le météogramme officiel ECMWF →</a>
          {:else}<p>La tendance ECMWF est indisponible.</p>{/if}
        </div>
        </details>{/if}

      <details class="section-detail choisir-lieu" on:toggle={redimensionnerCarte}>
        <summary><span><small>Réglage fin</small><strong>Choisir le point sur la carte</strong></span><b>Ouvrir</b></summary>
        <div class="carte-contenu">
          <form class="coordonnees" on:submit={soumettreCoordonnees}>
            <label>Latitude <input bind:value={latitudeSaisie} inputmode="decimal" /></label>
            <label>Longitude <input bind:value={longitudeSaisie} inputmode="decimal" /></label>
            <button type="submit">Afficher ce point</button>
          </form>
          <div class="carte-point" bind:this={conteneurCarte} aria-label="Carte de sélection du point météo"></div>
          <p>Cliquez sur la carte. Le repère indique le point exact demandé ; la prévision reste celle d’une maille de modèle.</p>
        </div>
      </details>
    </div>
  {/if}
</section>

<style>
  .meteo-app { width: 100%; min-width: 0; max-width: 72rem; margin: 0 auto 4rem; overflow-x: clip; }
  .meteo-hero { min-height: min(47rem, calc(100svh - 5rem)); padding: clamp(1.2rem, 4vw, 2.5rem); color: var(--meteo-hero-text); background: var(--meteo-background); border-radius: 1.2rem; box-shadow: 0 1.2rem 3rem rgba(15, 30, 35, 0.2); }
  .hero-top { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
  .sur-titre, .section-label { margin: 0 0 0.35rem; color: #d49b69; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.11em; text-transform: uppercase; }
  .lieu-courant h1 { margin: 0; color: #fff; font-family: var(--font-body); font-size: clamp(1.55rem, 5vw, 2.5rem); line-height: 1.05; }
  .adresse-complete { margin: 0.4rem 0 0; max-width: 44rem; color: var(--meteo-hero-muted); font-size: 0.85rem; }
  .actions-lieu { display: flex; gap: 0.45rem; }
  .bouton-icone, .bouton-gps { min-height: 2.75rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; color: #fff; background: rgba(255,255,255,0.08); cursor: pointer; }
  .bouton-icone { width: 2.75rem; color: #839196; font-size: 1.1rem; }
  .bouton-icone.actif { color: #f2b45e; }
  .bouton-gps { padding: 0 1rem; font-weight: 700; }
  .precision { display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 0.9rem; padding: 0.4rem 0.65rem; border: 1px solid rgba(116, 209, 164, 0.24); border-radius: 999px; color: #c2d2d3; background: rgba(13, 69, 47, 0.28); font-size: 0.7rem; }
  .point-precision { width: 0.48rem; height: 0.48rem; border-radius: 50%; background: #74d1a4; box-shadow: 0 0 0 0.2rem rgba(116,209,164,0.12); }
  .recherche-wrap { position: relative; display: flex; align-items: center; gap: 0.6rem; margin-top: 1rem; padding: 0 0.85rem; border: 1px solid rgba(255,255,255,0.18); border-radius: 0.75rem; background: rgba(255,255,255,0.08); }
  .recherche-wrap > span:first-child { font-size: 1.3rem; }
  .recherche-wrap input { width: 100%; min-width: 0; height: 3rem; border: 0; outline: 0; color: #fff; background: transparent; font: inherit; }
  .recherche-wrap input::placeholder { color: #9fadaf; }
  .recherche-statut { color: var(--meteo-hero-muted); font-size: 0.72rem; white-space: nowrap; }
  .suggestions { position: absolute; z-index: 20; top: calc(100% + 0.35rem); right: 0; left: 0; margin: 0; padding: 0.35rem; border: 1px solid #405158; border-radius: 0.75rem; color: #fff; background: #17272c; box-shadow: 0 1rem 2rem rgba(0,0,0,.35); list-style: none; }
  .suggestions button { display: grid; gap: 0.15rem; width: 100%; padding: 0.7rem; border: 0; border-radius: 0.5rem; color: #fff; background: transparent; text-align: left; cursor: pointer; }
  .suggestions button:hover, .suggestions button:focus-visible { background: rgba(255,255,255,.09); }
  .suggestions button span { color: var(--meteo-hero-muted); font-size: 0.72rem; }
  .suggestions.vide { padding: 0.8rem; font-size: 0.8rem; }
  .raccourci-favori { margin-top: 0.65rem; border: 0; color: #f2d5b6; background: transparent; cursor: pointer; }
  .etat-hero { margin-top: 1rem; padding: 0.7rem; border: 1px solid rgba(255,255,255,.18); border-radius: .6rem; color: var(--meteo-hero-muted); }
  .etat-hero.erreur { border-color: #d97561; color: #ffd2c8; }
  .maintenant { margin-top: clamp(1.4rem, 5vw, 3rem); }
  .temperature { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .temperature > strong { font-size: clamp(4.8rem, 18vw, 8.5rem); font-weight: 300; letter-spacing: -0.08em; line-height: 0.85; }
  .temperature sup { font-size: 0.42em; vertical-align: top; }
  .temperature > div { display: grid; justify-items: end; gap: 0.2rem; }
  .symbole-grand { color: #fff; font-family: "Segoe UI Symbol", sans-serif; font-size: clamp(3.5rem, 10vw, 6rem); font-weight: 300; line-height: 1; }
  .temperature p { margin: 0; color: #d8e1e1; font-size: 1rem; }
  .ressenti { margin: 0.8rem 0 0; color: var(--meteo-hero-muted); }
  .essentiels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.65rem; margin-top: 1.4rem; }
  .essentiels.essentiels-restreints { grid-template-columns: repeat(3, 1fr); }
  .essentiels div { display: grid; gap: 0.2rem; padding: 0.75rem 0; border-top: 1px solid rgba(255,255,255,.14); }
  .essentiels span { color: var(--meteo-hero-muted); font-size: 0.67rem; }
  .essentiels strong { font-size: 0.9rem; }
  .signal { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.75rem; margin-top: 1rem; padding: 0.8rem; border: 1px solid rgba(255,255,255,.15); border-radius: 0.75rem; background: rgba(255,255,255,.06); }
  .signal-attention, .signal-information { border-color: rgba(242,180,94,.45); background: rgba(111,70,29,.22); }
  .signal-alerte { border-color: rgba(238,108,82,.55); background: rgba(112,37,26,.3); }
  .signal-icone { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border: 1px solid currentColor; border-radius: 50%; }
  .signal p { margin: 0.12rem 0 0; color: var(--meteo-hero-muted); font-size: 0.72rem; }
  .signal a { color: #f4d1ad; font-size: 0.75rem; }
  .mini-heures { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 1rem; border-top: 1px solid rgba(255,255,255,.14); }
  .mini-heures div { display: grid; justify-items: center; gap: 0.15rem; padding: 0.8rem 0.25rem 0; border-left: 1px solid rgba(255,255,255,.1); }
  .mini-heures div:first-child { border-left: 0; }
  .mini-heures span, .mini-heures small { color: var(--meteo-hero-muted); font-size: 0.65rem; }
  .mini-heures b { font-family: "Segoe UI Symbol", sans-serif; font-size: 1.4rem; font-weight: 400; }
  .navigation-details { position: sticky; z-index: 10; top: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.35rem; margin: 1rem 0; padding: 0.5rem; border: 1px solid var(--border); border-radius: 1rem; background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: var(--shadow); backdrop-filter: blur(12px); }
  .navigation-details a { display: grid; justify-items: center; gap: 0.2rem; padding: 0.5rem 0.25rem; border-radius: 0.65rem; color: var(--text); font-size: 0.66rem; text-decoration: none; }
  .navigation-details a:hover { background: var(--surface-muted); }
  .navigation-details span { font-size: 1.1rem; }
  .alerte-partielle { padding: 0.8rem; border: 1px solid var(--color-alerte); color: var(--color-alerte); background: var(--surface); }
  .contenu-details { display: grid; width: 100%; min-width: 0; max-width: 100%; gap: 1rem; }
  .section-detail { width: 100%; min-width: 0; max-width: 100%; scroll-margin-top: 5rem; padding: clamp(1rem, 3vw, 1.5rem); overflow: hidden; border: 1px solid var(--border); border-radius: 1rem; background: var(--surface); }
  .section-detail > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
  .section-detail h2 { margin: 0; font-family: var(--font-display); font-size: clamp(1.25rem, 3vw, 1.65rem); }
  .section-detail > header > span { padding: 0.3rem 0.55rem; border-radius: 999px; color: var(--muted); background: var(--surface-muted); font-size: 0.65rem; font-weight: 700; }
  .heures-scroll { display: grid; width: 100%; min-width: 0; max-width: 100%; grid-template-columns: repeat(auto-fit, minmax(5.4rem, 1fr)); gap: 0.5rem; }
  .heures-scroll article { display: grid; min-width: 0; justify-items: center; gap: 0.3rem; padding: 0.75rem 0.45rem; border: 1px solid var(--border); border-radius: 0.75rem; }
  .heures-scroll article.maintenant-carte { color: #fff; background: var(--navy); }
  .heures-scroll time, .heures-scroll span, .heures-scroll small { font-size: 0.67rem; }
  .heures-scroll b { font-family: "Segoe UI Symbol", sans-serif; font-size: 1.7rem; font-weight: 400; }
  .jours-liste { display: grid; gap: 0.5rem; }
  .jours-liste article { display: grid; min-width: 0; grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1.5fr) auto; align-items: center; gap: 1rem; padding: 0.85rem; border: 1px solid var(--border); border-radius: 0.75rem; }
  .jours-liste article.transition-modele { border-style: dashed; }
  .jours-liste article > div:first-child { display: grid; gap: 0.2rem; text-transform: capitalize; }
  .jours-liste small { color: var(--muted); font-size: 0.67rem; }
  .jours-liste article > div:first-child small { color: var(--accent); }
  .symbole-jour { font-family: "Segoe UI Symbol", sans-serif; font-size: 2rem; }
  .condition-jour { display: grid; gap: 0.2rem; }
  .temperatures-jour { display: flex; gap: 0.55rem; font-size: 1.1rem; }
  .temperatures-jour span { color: var(--muted); }
  .grille-indicateurs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; }
  .grille-indicateurs article { display: grid; gap: 0.35rem; padding: 1rem; border-radius: 0.8rem; background: var(--surface-muted); }
  .grille-indicateurs span, .grille-indicateurs small { color: var(--muted); font-size: 0.7rem; }
  .grille-indicateurs strong { font-size: 1.35rem; }
  .danger { color: var(--color-alerte); }
  .badge-officiel { color: #812e1f !important; background: #f5d8d1 !important; }
  .vigilance-officielle { max-width: 42rem; padding: 1rem; border: 1px solid var(--border); border-radius: 0.75rem; background: var(--surface-muted); }
  .vigilance-officielle p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.8rem; line-height: 1.5; }
  .lien-action { display: inline-block; margin-top: 0.75rem; font-size: 0.82rem; }
  .badge-air.bon { color: #285d45 !important; background: #dff1e7 !important; }
  .badge-air.moyen { color: #71591d !important; background: #f3e8bd !important; }
  .badge-air.mauvais { color: #812e1f !important; background: #f5d8d1 !important; }
  .air-contenu { display: grid; min-width: 0; grid-template-columns: auto minmax(0, 1fr); gap: 1.5rem; align-items: center; }
  .aqi { display: grid; justify-items: center; min-width: 8rem; padding: 1rem; border-radius: 0.8rem; background: var(--surface-muted); }
  .aqi span { color: var(--muted); font-size: 0.7rem; }
  .aqi strong { font-size: 2.8rem; }
  .air-contenu dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin: 0; }
  .air-contenu dl div { padding: 0.75rem; border-left: 1px solid var(--border); }
  .air-contenu dt { color: var(--muted); font-size: 0.68rem; }
  .air-contenu dd { margin: 0.2rem 0 0; font-weight: 700; }
  .note-source { margin: 0.8rem 0 0; color: var(--muted); font-size: 0.72rem; line-height: 1.45; }
  .precision-cards { display: grid; gap: 0.6rem; }
  .precision-cards article { display: grid; grid-template-columns: auto 1fr; gap: 0.75rem; padding: 0.8rem; border: 1px solid var(--border); border-radius: 0.75rem; }
  .precision-cards p { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.78rem; line-height: 1.45; }
  .numero { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; color: #fff; background: var(--navy); font-size: 0.72rem; }
  .avertissement-relief { margin-top: 0.8rem; padding: 0.9rem; border-left: 4px solid #d49b69; background: var(--surface-muted); }
  .avertissement-relief p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.78rem; line-height: 1.5; }
  details.section-detail { padding: 0; }
  details.section-detail > summary { display: flex; min-width: 0; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem 1.25rem; cursor: pointer; list-style: none; }
  details.section-detail > summary::-webkit-details-marker { display: none; }
  details.section-detail > summary span { display: grid; gap: 0.2rem; }
  details.section-detail > summary small { color: var(--accent); font-size: 0.68rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  details.section-detail > summary strong { font-family: var(--font-display); font-size: 1.2rem; }
  details.section-detail > summary b { color: var(--muted); font-size: 0.75rem; }
  .ecmwf-contenu, .carte-contenu { padding: 0 1.25rem 1.25rem; border-top: 1px solid var(--border); }
  .jour-ecmwf { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; padding: 0.85rem 0; border-bottom: 1px solid var(--border); }
  .jour-ecmwf > div:first-child { display: grid; gap: 0.2rem; }
  .jour-ecmwf > div:first-child span { color: var(--muted); font-size: 0.7rem; }
  .dispersion { align-self: start; padding: 0.2rem 0.45rem; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 0.62rem; }
  .dispersion.forte { border-color: var(--color-alerte); color: var(--color-alerte); }
  .jour-ecmwf dl { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin: 0; }
  .jour-ecmwf dl div { display: grid; gap: 0.2rem; }
  .jour-ecmwf dt { color: var(--muted); font-size: 0.67rem; }
  .jour-ecmwf dd { margin: 0; font-weight: 700; }
  .signaux { grid-column: 1 / -1; margin: 0; color: var(--color-alerte); font-size: 0.7rem; }
  .coordonnees { display: flex; align-items: end; gap: 0.6rem; margin: 1rem 0; }
  .coordonnees label { display: grid; flex: 1; gap: 0.25rem; color: var(--muted); font-size: 0.7rem; }
  .coordonnees input { width: 100%; padding: 0.65rem; border: 1px solid var(--border); border-radius: 0.55rem; background: var(--surface); color: var(--text); }
  .coordonnees button { padding: 0.7rem 0.9rem; border: 0; border-radius: 0.55rem; color: #fff; background: var(--navy); cursor: pointer; }
  .carte-point { height: 24rem; min-height: 18rem; border: 1px solid var(--border); border-radius: 0.75rem; overflow: hidden; }
  .carte-contenu > p { color: var(--muted); font-size: 0.72rem; }

  @media (max-width: 760px) {
    .meteo-app { margin-right: 0; margin-left: 0; }
    .meteo-hero { min-height: calc(100svh - 3.5rem); padding: 1.1rem; border-radius: 0; box-shadow: none; }
    .hero-top { align-items: center; }
    .bouton-gps span { display: none; }
    .bouton-gps { width: 2.75rem; padding: 0; }
    .precision { align-items: flex-start; border-radius: 0.65rem; }
    .temperature > strong { font-size: clamp(5.5rem, 26vw, 7rem); }
    .symbole-grand { font-size: 4rem; }
    .essentiels, .essentiels.essentiels-restreints { grid-template-columns: repeat(2, 1fr); gap: 0 0.8rem; }
    .signal { grid-template-columns: auto 1fr; }
    .signal a { grid-column: 2; }
    .navigation-details { top: 0; margin: 0; border-right: 0; border-left: 0; border-radius: 0; }
    .navigation-details a { font-size: 0.58rem; }
    .contenu-details { padding: 0.8rem; }
    .section-detail { border-radius: 0.85rem; }
    .heures-scroll { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .jours-liste article { grid-template-columns: 1fr auto auto; gap: 0.65rem; }
    .condition-jour { grid-row: 2; grid-column: 1 / -1; }
    .symbole-jour { font-size: 1.6rem; }
    .grille-indicateurs { grid-template-columns: repeat(2, 1fr); }
    .air-contenu { grid-template-columns: 1fr; }
    .air-contenu dl { grid-template-columns: repeat(2, 1fr); }
    .jour-ecmwf dl { grid-template-columns: 1fr; }
    .coordonnees { flex-wrap: wrap; }
    .coordonnees label { min-width: 8rem; }
    .coordonnees button { width: 100%; }
  }

  @media (max-width: 390px) {
    .meteo-hero { padding: 0.9rem; }
    .lieu-courant h1 { font-size: 1.4rem; }
    .adresse-complete { font-size: 0.72rem; }
    .maintenant { margin-top: 1.2rem; }
    .mini-heures div { padding-top: 0.65rem; }
    .navigation-details a:nth-child(3) { line-height: 1.05; text-align: center; }
  }
</style>
