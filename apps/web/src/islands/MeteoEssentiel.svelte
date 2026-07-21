<script>
  import { POINTS_METEO_PRECONFIGURES, POINT_METEO_PAR_DEFAUT } from "@opendata-vda/shared/localisations-meteo";
  import { onDestroy, onMount } from "svelte";

  const POINT_MAIRIE = POINT_METEO_PAR_DEFAUT;
  // Pendant la phase de test, les points simples et la position précise utilisent
  // volontairement la même chaîne météo complète.
  const POINTS_PRECONFIGURES = POINTS_METEO_PRECONFIGURES;
  const FUSEAU = "Europe/Paris";

  let donnees = null;
  let etat = "chargement";
  let erreur = "";
  let adresse = POINT_MAIRIE.label;
  let positionGps = false;
  let precisionGpsM = null;
  let consulteLe = null;
  let horloge = Date.now();
  let timerHorloge;
  let timerRefresh;
  let timerInfobulle;
  let infobulleTactile = null;
  let requeteCourante = 0;
  let latCourante = POINT_MAIRIE.lat;
  let lonCourante = POINT_MAIRIE.lon;
  let pointPreconfigureActif = POINT_MAIRIE.slug;
  let contexteClimatique = null;
  let bilanThermique = null;
  const nombre = (valeur) => {
    const resultat = Number(valeur);
    return Number.isFinite(resultat) ? resultat : null;
  };

  const arrondi = (valeur) => {
    const n = nombre(valeur);
    return n === null ? "–" : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  };

  function tableau(bloc, cle) {
    return Array.isArray(bloc?.[cle]) ? bloc[cle] : [];
  }

  function tableauPeriodes(periodes) {
    return (Array.isArray(periodes) ? periodes : []).map((periode) => ({
      echeance: periode?.echeance ?? null,
      couleurMax: periode?.couleurMax ?? "vert",
      phenomenes: Array.isArray(periode?.phenomenes) ? periode.phenomenes : [],
    }));
  }

  function partiesDate(timestamp = horloge) {
    const formateur = new Intl.DateTimeFormat("fr-FR", {
      timeZone: FUSEAU,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return Object.fromEntries(
      formateur.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]),
    );
  }

  function dateHeureCondensee(timestamp = horloge) {
    const p = partiesDate(timestamp);
    return `${p.weekday.toUpperCase()} ${p.day} ${p.month.toUpperCase()} · Consulté à ${p.hour}:${p.minute}`;
  }

  function dateLocaleIso(timestamp = horloge) {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone: FUSEAU,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  }

  function heureLocaleIso(timestamp = horloge) {
    const p = partiesDate(timestamp);
    return `${dateLocaleIso(timestamp)}T${p.hour}:00`;
  }

  function construireHeures(bloc, timestamp = horloge) {
    const temps = tableau(bloc, "time");
    const temperature = tableau(bloc, "temperature_2m");
    const heures = temps.map((time, index) => ({ time, temperature: temperature[index] }));
    const heureCourante = heureLocaleIso(timestamp);
    const debut = heures.findIndex((heure) => String(heure.time) >= heureCourante);
    return heures.slice(debut < 0 ? 0 : debut);
  }

  function construireJours(bloc) {
    return tableau(bloc, "time").map((date, index) => ({
      date,
      tMin: tableau(bloc, "temperature_2m_min")[index],
      tMax: tableau(bloc, "temperature_2m_max")[index],
    }));
  }

  function libelleHeure(iso) {
    const texte = String(iso ?? "");
    const heure = texte.match(/T(\d{2}):(\d{2})/)?.[0]?.slice(1);
    return heure ?? "–";
  }

  function construireBarresGraphique(points) {
    const valeurs = points.map((point) => nombre(point.temperature)).filter((valeur) => valeur !== null);
    if (!valeurs.length) return [];
    const minimum = Math.min(...valeurs);
    const maximum = Math.max(...valeurs);
    const amplitude = Math.max(1, maximum - minimum);
    return points.map((point, index) => {
      const temperature = nombre(point.temperature) ?? minimum;
      const hauteur = 12 + ((temperature - minimum) / amplitude) * 42;
      return {
        ...point,
        x: 4 + index * 88,
        y: 60 - hauteur,
        hauteur,
      };
    });
  }

  const NIVEAU_VIGILANCE = { vert: "Vert", jaune: "Jaune", orange: "Orange", rouge: "Rouge" };

  function libelleNiveau(couleur) {
    return NIVEAU_VIGILANCE[couleur] ?? "Vert";
  }

  function libelleEcheance(echeance) {
    return echeance === "J1" ? "Demain" : "Aujourd’hui";
  }

  function dateHeureMaj(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: FUSEAU,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function libelleJour(iso, index) {
    if (index === 0) return "Demain";
    const date = new Date(`${iso}T12:00:00Z`);
    const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU, weekday: "short" }).format(date);
    const numero = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU, day: "numeric" }).format(date);
    return `${jour} ${numero}`;
  }

  async function identifierLieu(lat, lon) {
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      const reponse = await fetch(`/api/meteo/localisation?${params}`);
      if (!reponse.ok) return null;
      return (await reponse.json()).lieu ?? null;
    } catch {
      return null;
    }
  }

  async function chargerPoint(lat, lon, avecAdresse = false, pointPreconfigure = null, precisionM = null) {
    const numeroRequete = ++requeteCourante;
    etat = avecAdresse ? "localisation" : "chargement";
    erreur = "";

    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      const [reponseMeteo, lieu] = await Promise.all([
        fetch(`/api/meteo/point?${params}`),
        avecAdresse ? identifierLieu(lat, lon) : Promise.resolve(null),
      ]);
      if (!reponseMeteo.ok) throw new Error(`HTTP ${reponseMeteo.status}`);
      const resultat = await reponseMeteo.json();
      if (numeroRequete !== requeteCourante) return;

      donnees = resultat;
      latCourante = lat;
      lonCourante = lon;
      consulteLe = Date.now();
      if (avecAdresse) {
        adresse = lieu?.label ?? `Position GPS · ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        positionGps = true;
        precisionGpsM = nombre(precisionM);
        pointPreconfigureActif = null;
      } else if (pointPreconfigure) {
        adresse = pointPreconfigure.label;
        positionGps = false;
        precisionGpsM = null;
        pointPreconfigureActif = pointPreconfigure.slug;
      }
      etat = "ok";
      chargerDonneesClimatiques(lat, lon);
    } catch (cause) {
      console.error("météo essentielle indisponible", cause);
      if (numeroRequete !== requeteCourante) return;
      etat = "erreur";
      erreur = donnees
        ? "La nouvelle position n’a pas pu être chargée. La dernière météo reste affichée."
        : "La météo est momentanément indisponible.";
    }
  }

  function choisirPointPreconfigure(point) {
    if (etat === "chargement" || etat === "localisation") return;
    chargerPoint(point.lat, point.lon, false, point);
  }

  function afficherInfobulleTactile(evenement, action) {
    if (!window.matchMedia("(hover: none)").matches || infobulleTactile === action) return false;
    evenement.preventDefault();
    infobulleTactile = action;
    clearTimeout(timerInfobulle);
    timerInfobulle = window.setTimeout(() => { infobulleTactile = null; }, 3_000);
    return true;
  }

  async function chargerDonneesClimatiques(lat, lon) {
    contexteClimatique = null;
    bilanThermique = null;
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    const [contexteResultat, bilanResultat] = await Promise.allSettled([
      fetch(`/api/meteo/contexte-climatique?${params}`).then((reponse) => reponse.ok ? reponse.json() : null),
      fetch(`/api/meteo/bilan-thermique?${params}`).then((reponse) => reponse.ok ? reponse.json() : null),
    ]);
    // Une relocalisation a pu intervenir pendant les deux lectures en base.
    if (lat !== latCourante || lon !== lonCourante) return;
    contexteClimatique = contexteResultat.status === "fulfilled" ? contexteResultat.value : null;
    bilanThermique = bilanResultat.status === "fulfilled" ? bilanResultat.value : null;
  }

  async function rafraichirEssentiel() {
    const numeroRequete = ++requeteCourante;
    try {
      const params = new URLSearchParams({ lat: String(latCourante), lon: String(lonCourante) });
      const reponse = await fetch(`/api/meteo/point?${params}`);
      if (!reponse.ok) return;
      const resultat = await reponse.json();
      if (numeroRequete !== requeteCourante) return;
      donnees = resultat;
      consulteLe = Date.now();
    } catch {
      // Rafraîchissement silencieux : on conserve la dernière météo affichée.
    }
  }

  function meLocaliser() {
    if (!navigator.geolocation) {
      erreur = "La géolocalisation n’est pas disponible. La météo du lieu choisi reste affichée.";
      return;
    }

    etat = "localisation";
    erreur = "";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => chargerPoint(coords.latitude, coords.longitude, true, null, coords.accuracy),
      () => {
        etat = donnees ? "ok" : "erreur";
        erreur = "Votre position n’a pas pu être obtenue. La météo du lieu choisi reste affichée.";
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  }

  onMount(() => {
    timerHorloge = window.setInterval(() => { horloge = Date.now(); }, 30_000);
    timerRefresh = window.setInterval(rafraichirEssentiel, 15 * 60 * 1000);
    const slug = new URL(window.location.href).searchParams.get("lieu");
    const pointInitial = POINTS_PRECONFIGURES.find((point) => point.slug === slug) ?? POINT_MAIRIE;
    chargerPoint(pointInitial.lat, pointInitial.lon, false, pointInitial);
  });

  onDestroy(() => {
    clearInterval(timerHorloge);
    clearInterval(timerRefresh);
    clearTimeout(timerInfobulle);
  });

  $: vigilance = donnees?.vigilance ?? null;
  $: periodesVigilance = vigilance && !vigilance.indisponible ? tableauPeriodes(vigilance.periodes) : [];
  $: etiquetteVigilance = vigilance
    ? (vigilance.departement && vigilance.departement !== vigilance.code
        ? `${vigilance.departement} · ${vigilance.code}`
        : (vigilance.code ?? vigilance.departement ?? ""))
    : "";
  $: maintenant = donnees?.courtTerme?.current ?? null;
  $: heures = construireHeures(donnees?.courtTerme?.hourly, horloge);
  $: temperatureActuelle = nombre(maintenant?.temperature_2m) ?? nombre(heures[0]?.temperature);
  $: ressentiEstime = nombre(maintenant?.apparent_temperature);
  $: altitudePointModele = nombre(donnees?.courtTerme?.pointModele?.altitudeM);
  $: jours = construireJours(donnees?.courtTerme?.daily);
  $: indexAujourdhui = Math.max(0, jours.findIndex((jour) => jour.date === dateLocaleIso(horloge)));
  $: aujourdhui = jours[indexAujourdhui] ?? null;
  $: prochainsJours = jours.slice(indexAujourdhui + 1, indexAujourdhui + 4);
  $: heurePlusTrois = heures[3] ?? heures.at(-1) ?? null;
  $: temperaturePlusTrois = nombre(heurePlusTrois?.temperature);
  $: ecartTroisHeures = temperaturePlusTrois === null || temperatureActuelle === null ? 0 : temperaturePlusTrois - temperatureActuelle;
  $: tendance = ecartTroisHeures > 0.5 ? "hausse" : ecartTroisHeures < -0.5 ? "baisse" : "stable";
  $: pointsHoraires = heures.slice(0, 4);
  $: barresGraphique = construireBarresGraphique(pointsHoraires);
  $: variationTroisHeures = Math.abs(ecartTroisHeures).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  $: syntheseTendance = tendance === "stable"
    ? "Température stable dans les trois prochaines heures."
    : `${tendance === "hausse" ? "Hausse" : "Baisse"} de ${variationTroisHeures} °C dans les trois prochaines heures.`;

  $: tMaxJour = nombre(aujourdhui?.tMax);
  $: referenceMax = nombre(contexteClimatique?.temperatureMax?.mediane);
  $: ecartReference = tMaxJour !== null && referenceMax !== null ? tMaxJour - referenceMax : null;
  $: afficherContexte = contexteClimatique?.disponible === true && ecartReference !== null;
  $: depasseP90 = tMaxJour !== null
    && nombre(contexteClimatique?.temperatureMax?.p90) !== null
    && tMaxJour > contexteClimatique.temperatureMax.p90;
  $: afficherBilan = bilanThermique?.disponible === true;
  $: lienBilan = bilanThermique?.point?.slug
    ? `/meteo/bilan-thermique/?lieu=${encodeURIComponent(bilanThermique.point.slug)}`
    : null;
  $: lienInformations = `/meteo/informations/?lieu=${encodeURIComponent(pointPreconfigureActif ?? POINT_MAIRIE.slug)}`;

  function formatEcartReference(valeur) {
    if (valeur === null) return "";
    const absolue = Math.abs(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    return `${valeur >= 0 ? "+" : "−"}${absolue} °C`;
  }

  function libelleMois(annee, mois) {
    return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(annee, mois - 1, 1)));
  }
</script>

<section class="meteo-essentiel" data-testid="meteo-point" aria-labelledby="titre-meteo-essentiel">
  <h1 id="titre-meteo-essentiel" class="sr-only">Météo essentielle</h1>

  <header class="entete-essentiel">
    <time class="date-heure" datetime={new Date(consulteLe ?? horloge).toISOString()}>{dateHeureCondensee(consulteLe ?? horloge)}</time>
    <div class="actions-entete">
      {#if lienBilan}
        <a
          class="action-entete bouton-bilan"
          href={lienBilan}
          aria-label="Consulter le bilan thermique"
          data-infobulle="Bilan thermique"
          title="Bilan thermique"
          class:infobulle-visible={infobulleTactile === "bilan"}
          on:click={(evenement) => afficherInfobulleTactile(evenement, "bilan")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19.5h16"></path>
            <path d="M7 16v-4M12 16V7M17 16v-7"></path>
          </svg>
          <span class="infobulle" aria-hidden="true">Bilan thermique</span>
        </a>
      {/if}
      <a
        class="action-entete bouton-info"
        aria-label="À propos de cette météo et sources des données"
        href={lienInformations}
        data-infobulle="Informations"
        title="Informations"
        class:infobulle-visible={infobulleTactile === "informations"}
        on:click={(evenement) => afficherInfobulleTactile(evenement, "informations")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 11v5.5"></path>
          <circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none"></circle>
        </svg>
        <span class="infobulle" aria-hidden="true">Informations</span>
      </a>
      <button
        type="button"
        class:active={positionGps}
        class="action-entete bouton-localisation"
        on:click={(evenement) => {
          if (!afficherInfobulleTactile(evenement, "localisation")) meLocaliser();
        }}
        disabled={etat === "localisation"}
        aria-label="Utiliser ma position"
        aria-busy={etat === "localisation"}
        data-infobulle="Me localiser"
        title="Me localiser"
        class:infobulle-visible={infobulleTactile === "localisation"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
          <circle cx="12" cy="12" r="8"></circle>
        </svg>
        <span class="infobulle" aria-hidden="true">{etat === "localisation" ? "Localisation…" : "Me localiser"}</span>
      </button>
    </div>
  </header>

  <div class="repere-lieu" aria-live="polite">
    <span class="point-lieu" aria-hidden="true"></span>
    <div>
      <p>{adresse}</p>
      {#if positionGps}
        <p class="precision-gps">
          Position GPS{precisionGpsM !== null ? ` · précision ± ${arrondi(precisionGpsM)} m` : ""}
        </p>
      {/if}
    </div>
  </div>

  <nav class="points-rapides" aria-label="Lieux préconfigurés">
    <span class="points-rapides-label">Lieux rapides</span>
    <div class="points-rapides-liste">
      {#each POINTS_PRECONFIGURES as point}
        <button
          type="button"
          class:actif={pointPreconfigureActif === point.slug}
          aria-pressed={pointPreconfigureActif === point.slug}
          aria-label={`Afficher la météo de ${point.nom}`}
          disabled={etat === "chargement" || etat === "localisation"}
          on:click={() => choisirPointPreconfigure(point)}
        >
          {point.nom}
        </button>
      {/each}
    </div>
  </nav>

  {#if donnees}
    <p class="fraicheur-prevision">
      Prévision mise à jour à <time datetime={donnees.genereLe}>{dateHeureMaj(donnees.genereLe)}</time>{donnees.perime ? " · dernière valeur connue" : ""}
    </p>
  {/if}

  {#if erreur}
    <p class="message-erreur" role="alert">{erreur}</p>
  {/if}

  {#if donnees}
    <div class="donnees-essentielles">
      {#if vigilance}
        <section
          class={`vigilance-essentiel ${vigilance.indisponible ? "vigilance-bord-indisponible" : `vigilance-bord-${vigilance.couleurMax}`}`}
          aria-labelledby="titre-vigilance"
        >
          <div class="vigilance-entete">
            <p class="etiquette" id="titre-vigilance">Vigilance {etiquetteVigilance}</p>
            {#if vigilance.indisponible}
              <span class="pastille-niveau niveau-indisponible">Niveau inconnu</span>
            {:else}
              <span class={`pastille-niveau niveau-${vigilance.couleurMax}`}>
                {#if vigilance.couleurMax === "vert"}Aucune vigilance{:else}Vigilance {libelleNiveau(vigilance.couleurMax)}{/if}
              </span>
            {/if}
          </div>

          {#if vigilance.indisponible}
            <p class="vigilance-indispo" role="alert">
              Vigilance momentanément indisponible : le niveau réel ne peut pas être confirmé.
              <a href={vigilance.url} target="_blank" rel="noopener">Vérifier le bulletin officiel Météo-France</a>
            </p>
          {:else}
            <div class="vigilance-periodes">
              {#each periodesVigilance as periode}
                <div class="vigilance-periode">
                  <p class="vigilance-echeance">{libelleEcheance(periode.echeance)}</p>
                  {#if periode.phenomenes.length === 0}
                    <p class="vigilance-aucun">Aucun phénomène</p>
                  {:else}
                    <ul class="vigilance-liste">
                      {#each periode.phenomenes as phenomene}
                        <li class="vigilance-item">
                          <span class="vigilance-nature">{phenomene.nom}</span>
                          <span class={`pastille-niveau niveau-${phenomene.couleur}`}>{libelleNiveau(phenomene.couleur)}</span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/each}
            </div>
            {#if vigilance.miseAJour}
              <p class="vigilance-maj">Vigilance mise à jour à {dateHeureMaj(vigilance.miseAJour)}{vigilance.perime ? " · dernière valeur connue" : ""}</p>
            {/if}
          {/if}
        </section>
      {/if}

      <section class="temperature-actuelle" aria-label="Température actuelle estimée">
        <p class="etiquette">Maintenant · estimation locale</p>
        <div class="temperature-ligne">
          <strong class="valeur-geante" data-testid="temperature-actuelle">{arrondi(temperatureActuelle)}<span>°C</span></strong>
          <dl class="extremes-jour" aria-label="Minimum et maximum aujourd’hui">
            <div><dt>MAX</dt><dd>{arrondi(aujourdhui?.tMax)}°</dd></div>
            <div><dt>MIN</dt><dd>{arrondi(aujourdhui?.tMin)}°</dd></div>
          </dl>
        </div>
        {#if ressentiEstime !== null}
          <p class="ressenti-estime">Ressenti estimé : <strong>{arrondi(ressentiEstime)} °C</strong></p>
        {/if}
        {#if altitudePointModele !== null}
          <p class="altitude-modele">Altitude du point modèle : {arrondi(altitudePointModele)} m</p>
        {/if}
      </section>

      <section class="tendance-trois-heures" aria-labelledby="titre-tendance">
        <div class="titre-section">
          <p class="etiquette">Prochaines 3 heures</p>
          <h2 id="titre-tendance">Tendance {tendance === "hausse" ? "à la hausse" : tendance === "baisse" ? "à la baisse" : "stable"}</h2>
        </div>
        <div class="graphique-heures">
          <svg viewBox="0 0 296 68" preserveAspectRatio="none" aria-hidden="true">
            <line class="graduation" x1="0" y1="18" x2="296" y2="18"></line>
            <line class="graduation" x1="0" y1="36" x2="296" y2="36"></line>
            <line class="graduation" x1="0" y1="54" x2="296" y2="54"></line>
            {#each barresGraphique as barre}
              <rect class="barre" x={barre.x} y={barre.y} width="24" height={barre.hauteur}></rect>
            {/each}
          </svg>
          <ol aria-label="Températures des quatre prochaines heures">
            {#each pointsHoraires as point, index}
              <li>
                <time datetime={point.time}>{index === 0 ? "Maintenant" : libelleHeure(point.time)}</time>
                <strong data-testid={index === 3 ? "temperature-plus-trois" : undefined}>{arrondi(point.temperature)}°C</strong>
              </li>
            {/each}
          </ol>
        </div>
        <p class="synthese-tendance">{syntheseTendance}</p>
      </section>

      <section class="previsions-jours" aria-labelledby="titre-jours">
        <div class="titre-section jours-titre">
          <p class="etiquette">Après aujourd’hui</p>
          <h2 id="titre-jours">Les 3 jours à venir</h2>
        </div>
        <div class="jours-grille">
          {#each prochainsJours as jour, index}
            <article>
              <h3>{libelleJour(jour.date, index)}</h3>
              <dl>
                <div><dt>MAX</dt><dd>{arrondi(jour.tMax)}°</dd></div>
                <div><dt>MIN</dt><dd>{arrondi(jour.tMin)}°</dd></div>
              </dl>
            </article>
          {/each}
        </div>
      </section>
    </div>
  {:else if etat === "chargement"}
    <div class="squelette" role="status" aria-label="Chargement de la météo de la mairie">
      <div class="sq sq-hero"></div>
      <div class="sq sq-bande"></div>
      <div class="sq sq-bande sq-bande-courte"></div>
      <p class="sr-only">Chargement de la météo de la mairie…</p>
    </div>
  {/if}

</section>

{#if afficherContexte}
  <section class="contexte-climatique" aria-labelledby="titre-contexte-climatique">
    <p class="etiquette">Aujourd’hui dans son contexte climatique</p>
    <h2 id="titre-contexte-climatique">{arrondi(tMaxJour)} °C prévus</h2>
    <p class="contexte-ecart">
      Environ <strong>{formatEcartReference(ecartReference)}</strong> par rapport à la référence
      {contexteClimatique.reference.debut}–{contexteClimatique.reference.fin}
    </p>
    {#if depasseP90}
      <p class="contexte-percentile">Plus chaud que 90 % des journées comparables de la période de référence.</p>
    {/if}
    <p class="contexte-limite">{contexteClimatique.limite}</p>
    <p class="contexte-source">
      {contexteClimatique.reference.produit} · fenêtre de {contexteClimatique.reference.fenetreJours} jours ·
      {contexteClimatique.reference.nbValeurs} observations comparables
    </p>
  </section>
{/if}

{#if afficherBilan}
  <section class="resume-thermique" aria-labelledby="titre-resume-thermique">
    <p class="etiquette">{libelleMois(bilanThermique.periode.annee, bilanThermique.periode.mois)} · bilan thermique</p>
    <h2 id="titre-resume-thermique">
      {bilanThermique.jours.stressFort} jour{bilanThermique.jours.stressFort > 1 ? "s" : ""} de fort stress thermique
    </h2>
    {#if nombre(bilanThermique.reference.anomalieJoursStress) !== null}
      <p>
        {Math.abs(bilanThermique.reference.anomalieJoursStress).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
        jour{Math.abs(bilanThermique.reference.anomalieJoursStress) > 1 ? "s" : ""}
        {bilanThermique.reference.anomalieJoursStress >= 0 ? " de plus" : " de moins"} que la référence 1991–2020
      </p>
    {/if}
    <a class="bouton-bilan-bas" href={lienBilan}>Voir le bilan thermique</a>
  </section>
{/if}

<style>
  .meteo-essentiel {
    --bleu: #0047ab;
    --noir: #1a1a1a;
    --gris: #686868;
    --papier: #fcfcfa;
    --filet: rgba(26, 26, 26, 0.16);
    position: relative;
    display: flex;
    box-sizing: border-box;
    width: min(100%, 45rem);
    min-height: 100svh;
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1.15rem, 6vw, 4.5rem) 2rem;
    flex-direction: column;
    overflow: hidden;
    color: var(--noir);
    background: var(--papier);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }

  /* En-tête : date/heure + localisation */
  .entete-essentiel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.9rem;
    border-bottom: 2px solid var(--noir);
  }

  .date-heure {
    font-size: clamp(1.05rem, 3vw, 1.55rem);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1;
    white-space: nowrap;
  }

  .actions-entete { display: flex; align-items: center; gap: 0.45rem; }

  .action-entete {
    position: relative;
    display: inline-flex;
    width: 2.75rem;
    height: 2.75rem;
    min-height: 2.75rem;
    flex: 0 0 2.75rem;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .infobulle {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 5;
    width: max-content;
    max-width: 10rem;
    padding: 0.4rem 0.55rem;
    color: #fff;
    background: var(--noir);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.2;
    text-align: center;
    text-transform: none;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.2rem);
    transition: opacity 0.15s ease, transform 0.15s ease;
    visibility: hidden;
  }

  .action-entete:hover .infobulle,
  .action-entete:focus-visible .infobulle,
  .action-entete:active .infobulle,
  .action-entete.infobulle-visible .infobulle {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
  }

  .bouton-info {
    border: 2px solid var(--filet);
    border-radius: 0;
    color: var(--gris);
    background: var(--papier);
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .bouton-bilan {
    border: 2px solid var(--noir);
    color: var(--noir);
    background: var(--papier);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-decoration: none;
    text-transform: uppercase;
  }
  .bouton-bilan:hover,
  .bouton-bilan:focus-visible { color: #fff; background: var(--noir); outline: 0; }
  .bouton-bilan:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--noir); }

  .bouton-info:hover,
  .bouton-info:focus-visible {
    color: var(--bleu);
    border-color: var(--bleu);
    outline: 0;
  }

  .bouton-info:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--bleu); }
  .bouton-info svg { width: 1.2rem; height: 1.2rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

  .bouton-localisation {
    border: 2px solid var(--bleu);
    border-radius: 0;
    color: var(--bleu);
    background: var(--papier);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .bouton-localisation:hover,
  .bouton-localisation:focus-visible,
  .bouton-localisation.active {
    color: #fff;
    background: var(--bleu);
    outline: 0;
  }

  .bouton-localisation:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--bleu); }
  .bouton-localisation:disabled { opacity: 0.65; cursor: wait; }
  .bouton-localisation svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .bouton-bilan svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

  /* Ligne de lieu */
  .repere-lieu {
    display: flex;
    min-height: 2.8rem;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0;
    color: var(--gris);
    font-size: clamp(0.72rem, 2vw, 0.86rem);
  }

  .repere-lieu > div { min-width: 0; }
  .repere-lieu p { margin: 0; line-height: 1.3; overflow-wrap: anywhere; }
  .repere-lieu .precision-gps { margin-top: 0.18rem; color: var(--bleu); font-size: 0.7rem; font-weight: 700; }
  .point-lieu { width: 0.55rem; height: 0.55rem; flex: 0 0 auto; background: var(--bleu); }

  .points-rapides {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 0 0.8rem;
  }

  .points-rapides-label {
    flex: 0 0 auto;
    color: var(--gris);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .points-rapides-liste { display: flex; flex-wrap: wrap; gap: 0.35rem; }

  .points-rapides button {
    min-height: 2rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--filet);
    color: var(--gris);
    background: var(--papier);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }

  .points-rapides button:hover,
  .points-rapides button:focus-visible,
  .points-rapides button.actif {
    border-color: var(--bleu);
    color: #fff;
    background: var(--bleu);
    outline: 0;
  }

  .points-rapides button:focus-visible { box-shadow: 0 0 0 2px var(--papier), 0 0 0 4px var(--bleu); }
  .points-rapides button:disabled { opacity: 0.6; cursor: wait; }

  .fraicheur-prevision {
    margin: -0.2rem 0 0.75rem;
    color: var(--gris);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .message-erreur {
    margin: 0 0 0.75rem;
    padding: 0.65rem 0.8rem;
    border-left: 4px solid #e63946;
    background: #fff1f1;
    color: #7f1d1d;
    font-size: 0.8rem;
    font-weight: 600;
  }

  /* Bandeau de vigilance météo (Gard) — placé avant la température */
  .vigilance-essentiel {
    --vig-couleur: var(--gris);
    margin: 0.35rem 0 0;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--filet);
    border-left: 5px solid var(--vig-couleur);
    background: #fff;
  }
  .vigilance-bord-vert { --vig-couleur: #2e8b57; }
  .vigilance-bord-jaune { --vig-couleur: #f2c200; }
  .vigilance-bord-orange { --vig-couleur: #ff8f00; }
  .vigilance-bord-rouge { --vig-couleur: #d7261e; }
  /* Jamais vert : le niveau réel est inconnu, il ne faut pas laisser croire à une situation sûre. */
  .vigilance-bord-indisponible { --vig-couleur: #4a4a4a; }

  .vigilance-entete { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }

  .pastille-niveau {
    display: inline-block;
    padding: 0.14rem 0.5rem;
    background: var(--noir);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .niveau-vert { background: #2e8b57; color: #fff; }
  .niveau-jaune { background: #f2c200; color: #1a1a1a; }
  .niveau-orange { background: #ff8f00; color: #1a1a1a; }
  .niveau-rouge { background: #d7261e; color: #fff; }
  .niveau-indisponible { background: #4a4a4a; color: #fff; }

  .vigilance-periodes { display: flex; flex-wrap: wrap; gap: 0.75rem 2.75rem; margin-top: 0.7rem; }
  .vigilance-periode { min-width: 0; }
  .vigilance-echeance { margin: 0 0 0.4rem; color: var(--gris); font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  .vigilance-aucun { margin: 0; color: var(--noir); font-size: 0.82rem; font-weight: 600; }
  .vigilance-liste { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
  .vigilance-item { display: flex; align-items: center; gap: 0.6rem; }
  .vigilance-nature { min-width: 0; font-size: 0.86rem; font-weight: 700; letter-spacing: -0.01em; }

  .vigilance-indispo { margin: 0.55rem 0 0; color: var(--noir); font-size: 0.8rem; font-weight: 700; }
  .vigilance-indispo a { color: var(--bleu); }
  .vigilance-maj { margin: 0.6rem 0 0; color: var(--gris); font-size: 0.66rem; font-weight: 600; letter-spacing: 0.02em; }

  /* Corps : le héros absorbe l'espace, les bandes restent au plus juste */
  .donnees-essentielles { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .etiquette { margin: 0; color: var(--bleu); font-size: 0.67rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }

  /* Bloc « maintenant » */
  .temperature-actuelle {
    display: grid;
    flex: 1;
    align-content: center;
    gap: clamp(0.6rem, 2vh, 1.1rem);
    padding: clamp(1rem, 3vh, 2rem) 0;
  }

  .temperature-ligne { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem; }
  .valeur-geante {
    font-size: clamp(7.2rem, 23vw, 13rem);
    font-weight: 800;
    letter-spacing: -0.06em;
    line-height: 0.8;
  }

  .valeur-geante span {
    display: inline-block;
    margin-left: 0.06em;
    font-size: 0.22em;
    font-weight: 700;
    letter-spacing: -0.03em;
    vertical-align: top;
  }

  dl { margin: 0; }
  dt { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.12em; }
  dd { margin: 0; }
  .extremes-jour { display: grid; gap: 0.7rem; padding-bottom: 0.4rem; }
  .extremes-jour div { display: grid; grid-template-columns: auto auto; align-items: baseline; gap: 0.65rem; }
  .extremes-jour dt { color: var(--gris); }
  .extremes-jour dd { min-width: 2.6ch; font-size: clamp(1.5rem, 5vw, 2.15rem); font-weight: 800; text-align: right; line-height: 1; }
  .extremes-jour div:first-child dd { color: var(--bleu); }
  .ressenti-estime { margin: 0; color: var(--noir); font-size: clamp(0.9rem, 2.5vw, 1.05rem); }
  .ressenti-estime strong { color: var(--bleu); }
  .altitude-modele { margin: -0.45rem 0 0; color: var(--gris); font-size: 0.7rem; font-weight: 600; }

  /* Bande « prochaines 3 heures » — vecteur de mesure */
  .tendance-trois-heures {
    display: grid;
    grid-template-columns: minmax(9rem, 0.62fr) minmax(0, 1.38fr);
    gap: clamp(1rem, 4vw, 3rem);
    padding: 1.3rem 0;
    border-top: 1px solid var(--filet);
    border-bottom: 1px solid var(--filet);
  }

  .titre-section { display: grid; align-content: center; gap: 0.35rem; }
  .titre-section h2 { margin: 0; font-size: clamp(1.05rem, 3vw, 1.45rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
  .graphique-heures { min-width: 0; }
  .graphique-heures svg { display: block; width: 100%; height: 4.25rem; overflow: visible; }
  .graphique-heures .graduation { stroke: rgba(26, 26, 26, 0.14); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .graphique-heures .barre { fill: #d7261e; }
  .graphique-heures ol { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.3rem; margin: 0; padding: 0; list-style: none; }
  .graphique-heures li { display: grid; min-width: 0; justify-items: center; gap: 0.12rem; text-align: center; }
  .graphique-heures time { color: var(--gris); font-size: clamp(0.56rem, 1.8vw, 0.66rem); font-weight: 700; white-space: nowrap; }
  .graphique-heures strong { color: var(--bleu); font-size: clamp(0.9rem, 3vw, 1.25rem); line-height: 1; }
  .synthese-tendance { grid-column: 2; margin: -0.25rem 0 0; color: var(--gris); font-size: 0.72rem; font-weight: 700; }

  /* Bande « après aujourd'hui » */
  .previsions-jours { display: grid; grid-template-columns: minmax(9rem, 0.62fr) minmax(0, 1.38fr); gap: clamp(1rem, 4vw, 3rem); padding: 1.4rem 0 1rem; }
  .jours-grille { display: grid; grid-template-columns: repeat(3, 1fr); }
  .jours-grille article { min-width: 0; padding: 0 1rem; border-left: 1px solid var(--filet); }
  .jours-grille article:first-child { padding-left: 0; border-left: 0; }
  .jours-grille article:last-child { padding-right: 0; }
  .jours-grille h3 { min-height: 2.2em; margin: 0 0 1rem; font-size: clamp(0.8rem, 2vw, 1rem); font-weight: 800; text-transform: uppercase; letter-spacing: 0.01em; }
  .jours-grille dl { display: grid; gap: 0.5rem; }
  .jours-grille dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 0.4rem; }
  .jours-grille dt { color: var(--gris); }
  .jours-grille dd { font-size: clamp(1.15rem, 3.5vw, 1.6rem); font-weight: 800; }
  .jours-grille div:first-child dd { color: var(--bleu); }

  /* Squelette de chargement à hauteur réservée */
  .squelette { display: flex; flex: 1; flex-direction: column; gap: 1.4rem; padding: clamp(1rem, 3vh, 2rem) 0 1rem; }
  .sq { background: #ececec; animation: pulsation 1.5s ease-in-out infinite; }
  .sq-hero { flex: 1; min-height: 11rem; }
  .sq-bande { height: 4.5rem; }
  .sq-bande-courte { width: 70%; }
  @keyframes pulsation { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  /* Contexte climatique et résumé mensuel, alimentés uniquement depuis PostgreSQL. */
  .contexte-climatique,
  .resume-thermique {
    --bleu: #0047ab;
    --noir: #1a1a1a;
    --gris: #686868;
    --papier: #fcfcfa;
    --filet: rgba(26, 26, 26, 0.16);
    box-sizing: border-box;
    width: min(100%, 45rem);
    margin: 0 auto;
    padding: clamp(1.75rem, 5vw, 3rem) clamp(1.15rem, 6vw, 4.5rem) clamp(2rem, 6vw, 3.5rem);
    color: var(--noir);
    background: var(--papier);
    border-top: 2px solid var(--noir);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }

  .contexte-climatique .etiquette,
  .resume-thermique .etiquette { margin: 0 0 0.45rem; color: var(--bleu); font-size: 0.67rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .contexte-climatique h2,
  .resume-thermique h2 { margin: 0; font-size: clamp(1.65rem, 5vw, 2.8rem); font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
  .contexte-ecart { margin: 1rem 0 0; font-size: clamp(1rem, 2.5vw, 1.2rem); line-height: 1.4; }
  .contexte-ecart strong { color: #d7261e; }
  .contexte-percentile { margin: 0.55rem 0 0; color: #9a1a16; font-size: 0.82rem; font-weight: 800; }
  .contexte-limite,
  .contexte-source { margin: 0.8rem 0 0; color: var(--gris); font-size: 0.7rem; line-height: 1.5; }
  .contexte-source { margin-top: 0.35rem; font-weight: 600; }

  .resume-thermique { border-top-width: 1px; }
  .resume-thermique h2 { font-size: clamp(1.35rem, 4vw, 2.1rem); }
  .resume-thermique > p:not(.etiquette) { margin: 0.65rem 0 0; color: var(--gris); font-size: 0.85rem; }
  .bouton-bilan-bas {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    margin-top: 1.2rem;
    padding: 0 1rem;
    border: 2px solid var(--bleu);
    color: #fff;
    background: var(--bleu);
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: none;
  }
  .bouton-bilan-bas:hover,
  .bouton-bilan-bas:focus-visible { color: var(--bleu); background: var(--papier); outline: 0; }
  .bouton-bilan-bas:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--bleu); }

  @media (max-width: 620px) {
    .meteo-essentiel { min-height: 100svh; padding: 1.1rem 1rem 0.85rem; }
    .date-heure { min-width: 0; font-size: 0.92rem; line-height: 1.15; white-space: normal; }
    .actions-entete { flex: 0 0 auto; gap: 0.4rem; }
    .points-rapides { align-items: flex-start; gap: 0.5rem; }
    .points-rapides-label { padding-top: 0.55rem; }
    .vigilance-periodes { flex-direction: column; gap: 0.55rem; }
    .temperature-actuelle { gap: 0.8rem; padding: 1rem 0 1.2rem; }
    .temperature-ligne { gap: 0.75rem; }
    .valeur-geante { font-size: clamp(6.7rem, 33vw, 8.3rem); }
    .extremes-jour { gap: 0.55rem; }
    .extremes-jour div { grid-template-columns: 1fr; gap: 0.1rem; }
    .extremes-jour dd { text-align: left; }
    .tendance-trois-heures,
    .previsions-jours { grid-template-columns: 1fr; gap: 0.8rem; }
    .tendance-trois-heures { padding: 1rem 0 0.9rem; }
    .titre-section { grid-template-columns: auto 1fr; align-items: baseline; gap: 0.65rem; }
    .titre-section h2 { font-size: 0.95rem; }
    .synthese-tendance { grid-column: 1; margin-top: 0; }
    .previsions-jours { padding: 1rem 0 0.5rem; }
    .jours-titre { display: flex; justify-content: space-between; align-items: baseline; }
    .jours-grille article { padding: 0 0.7rem; }
    .jours-grille h3 { margin-bottom: 0.65rem; font-size: 0.72rem; }
    .jours-grille dl div { display: grid; gap: 0.05rem; }
    .contexte-climatique,
    .resume-thermique { padding: 1.6rem 1rem 2rem; }

  }

  @media (max-width: 350px) {
    .date-heure { font-size: 0.95rem; }
    .valeur-geante { font-size: 6rem; }
    .jours-grille article { padding: 0 0.45rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sq { animation: none; }
    .bouton-localisation,
    .bouton-info,
    .bouton-bilan,
    .bouton-bilan-bas { transition: none; }
  }
</style>
