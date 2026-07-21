<script>
  import { onDestroy, onMount } from "svelte";

  const POINT_MAIRIE = {
    lat: 44.081192,
    lon: 3.641467,
    label: "Mairie de Val-d’Aigoual · Rue de la Mairie, Valleraugue",
  };
  const FUSEAU = "Europe/Paris";

  let donnees = null;
  let etat = "chargement";
  let erreur = "";
  let adresse = POINT_MAIRIE.label;
  let positionGps = false;
  let horloge = Date.now();
  let timerHorloge;
  let timerRefresh;
  let requeteCourante = 0;
  let latCourante = POINT_MAIRIE.lat;
  let lonCourante = POINT_MAIRIE.lon;

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
    return `${p.weekday.toUpperCase()} ${p.day} ${p.month.toUpperCase()} · ${p.hour}:${p.minute}`;
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

  async function chargerPoint(lat, lon, avecAdresse = false) {
    const numeroRequete = ++requeteCourante;
    etat = avecAdresse ? "localisation" : "chargement";
    erreur = "";
    latCourante = lat;
    lonCourante = lon;

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
      if (avecAdresse) {
        adresse = lieu?.label ?? `Position GPS · ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        positionGps = true;
      }
      etat = "ok";
    } catch (cause) {
      console.error("météo essentielle indisponible", cause);
      if (numeroRequete !== requeteCourante) return;
      etat = "erreur";
      erreur = donnees
        ? "La nouvelle position n’a pas pu être chargée. La dernière météo reste affichée."
        : "La météo est momentanément indisponible.";
    }
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
    } catch {
      // Rafraîchissement silencieux : on conserve la dernière météo affichée.
    }
  }

  function meLocaliser() {
    if (!navigator.geolocation) {
      erreur = "La géolocalisation n’est pas disponible. La météo de la mairie reste affichée.";
      return;
    }

    etat = "localisation";
    erreur = "";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => chargerPoint(coords.latitude, coords.longitude, true),
      () => {
        etat = donnees ? "ok" : "erreur";
        erreur = "Votre position n’a pas pu être obtenue. La météo de la mairie reste affichée.";
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  }

  onMount(() => {
    timerHorloge = window.setInterval(() => { horloge = Date.now(); }, 30_000);
    timerRefresh = window.setInterval(rafraichirEssentiel, 15 * 60 * 1000);
    chargerPoint(POINT_MAIRIE.lat, POINT_MAIRIE.lon);
  });

  onDestroy(() => {
    clearInterval(timerHorloge);
    clearInterval(timerRefresh);
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
  $: jours = construireJours(donnees?.courtTerme?.daily);
  $: indexAujourdhui = Math.max(0, jours.findIndex((jour) => jour.date === dateLocaleIso(horloge)));
  $: aujourdhui = jours[indexAujourdhui] ?? null;
  $: prochainsJours = jours.slice(indexAujourdhui + 1, indexAujourdhui + 4);
  $: heurePlusTrois = heures[3] ?? heures.at(-1) ?? null;
  $: temperaturePlusTrois = nombre(heurePlusTrois?.temperature);
  $: ecartTroisHeures = temperaturePlusTrois === null || temperatureActuelle === null ? 0 : temperaturePlusTrois - temperatureActuelle;
  $: tendance = ecartTroisHeures > 0.5 ? "hausse" : ecartTroisHeures < -0.5 ? "baisse" : "stable";
  $: cheminTendance = tendance === "hausse"
    ? "M8 56 C82 56 145 20 244 18"
    : tendance === "baisse"
      ? "M8 18 C82 18 145 54 244 56"
      : "M8 37 C92 37 159 37 244 37";
  $: pointDepart = tendance === "hausse" ? 56 : tendance === "baisse" ? 18 : 37;
  $: libelleDelta = tendance === "stable"
    ? "±0°"
    : tendance === "hausse"
      ? `+${Math.max(1, Math.round(Math.abs(ecartTroisHeures)))}°`
      : `−${Math.max(1, Math.round(Math.abs(ecartTroisHeures)))}°`;
</script>

<section class="meteo-essentiel" data-testid="meteo-point" aria-labelledby="titre-meteo-essentiel">
  <h1 id="titre-meteo-essentiel" class="sr-only">Météo essentielle</h1>

  <header class="entete-essentiel">
    <time class="date-heure" datetime={new Date(horloge).toISOString()}>{dateHeureCondensee(horloge)}</time>
    <button
      type="button"
      class:active={positionGps}
      class="bouton-localisation"
      on:click={meLocaliser}
      disabled={etat === "localisation"}
      aria-label="Utiliser ma position"
      aria-busy={etat === "localisation"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
        <circle cx="12" cy="12" r="8"></circle>
      </svg>
      <span>{etat === "localisation" ? "Localisation…" : "Me localiser"}</span>
    </button>
  </header>

  <div class="repere-lieu" aria-live="polite">
    <span class="point-lieu" aria-hidden="true"></span>
    <p>{adresse}</p>
  </div>

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
              <p class="vigilance-maj">Mise à jour {dateHeureMaj(vigilance.miseAJour)}{vigilance.perime ? " · dernière valeur connue" : ""}</p>
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
      </section>

      <section class="tendance-trois-heures" aria-labelledby="titre-tendance">
        <div class="titre-section">
          <p class="etiquette">Prochaines 3 heures</p>
          <h2 id="titre-tendance">Tendance {tendance === "hausse" ? "à la hausse" : tendance === "baisse" ? "à la baisse" : "stable"}</h2>
        </div>
        <div class="fleche-wrap">
          <svg class={`fleche fleche-${tendance}`} viewBox="0 0 260 74" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="pointe-tendance" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z"></path>
              </marker>
            </defs>
            <line class="ancre" x1="8" y1={pointDepart - 7} x2="8" y2={pointDepart + 7}></line>
            <path d={cheminTendance} marker-end="url(#pointe-tendance)"></path>
          </svg>
          <div class="temperature-prevue">
            <span class="pastille-delta" class:pastille-stable={tendance === "stable"} aria-hidden="true">{libelleDelta}</span>
            <span class="etiquette-plus">+3 H</span>
            <strong data-testid="temperature-plus-trois">{arrondi(temperaturePlusTrois)}°C</strong>
          </div>
        </div>
        <p class="sr-only">Température prévue dans trois heures : {arrondi(temperaturePlusTrois)} degrés Celsius, tendance {tendance === "hausse" ? "à la hausse" : tendance === "baisse" ? "à la baisse" : "stable"}.</p>
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

  <div class="contrepoints" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
</section>

<style>
  .meteo-essentiel {
    --bleu: #0047ab;
    --noir: #1a1a1a;
    --gris: #686868;
    --papier: #fcfcfa;
    --filet: rgba(26, 26, 26, 0.16);
    position: relative;
    display: flex;
    width: min(100%, 64rem);
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

  .bouton-localisation {
    display: inline-flex;
    min-height: 2.75rem;
    padding: 0 0.9rem;
    align-items: center;
    gap: 0.55rem;
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

  .repere-lieu p { margin: 0; line-height: 1.3; }
  .point-lieu { width: 0.55rem; height: 0.55rem; flex: 0 0 auto; background: var(--bleu); }

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
  .fleche-wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: clamp(0.8rem, 3vw, 1.6rem); }
  .fleche { width: 100%; height: 4.6rem; overflow: visible; }
  .fleche > path { fill: none; stroke: var(--bleu); stroke-width: 4; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .fleche .ancre { stroke: var(--bleu); stroke-width: 4; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .fleche marker path { fill: var(--bleu); }

  .temperature-prevue { display: grid; justify-items: end; min-width: 4.6rem; gap: 0.25rem; }
  .pastille-delta {
    display: inline-block;
    padding: 0.1rem 0.42rem;
    background: var(--bleu);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .pastille-delta.pastille-stable { background: var(--noir); }
  .etiquette-plus { color: var(--gris); font-size: 0.6rem; font-weight: 800; letter-spacing: 0.12em; }
  .temperature-prevue strong { color: var(--bleu); font-size: clamp(1.6rem, 5vw, 2.3rem); font-weight: 800; line-height: 1; }

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

  /* Quatre micro-marques de fin */
  .contrepoints { display: flex; gap: 0.3rem; margin-top: auto; padding-top: 1rem; justify-content: flex-end; }
  .contrepoints span { width: 0.42rem; height: 0.42rem; }
  .contrepoints span:nth-child(1) { background: #ffd600; }
  .contrepoints span:nth-child(2) { background: #e63946; }
  .contrepoints span:nth-child(3) { background: #f77f00; }
  .contrepoints span:nth-child(4) { background: #06a77d; }

  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  @media (max-width: 620px) {
    .meteo-essentiel { min-height: 100svh; padding: 1.1rem 1rem 0.85rem; }
    .bouton-localisation { width: 2.75rem; padding: 0; justify-content: center; }
    .bouton-localisation span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
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
    .fleche { height: 3.75rem; }
    .previsions-jours { padding: 1rem 0 0.5rem; }
    .jours-titre { display: flex; justify-content: space-between; align-items: baseline; }
    .jours-grille article { padding: 0 0.7rem; }
    .jours-grille h3 { margin-bottom: 0.65rem; font-size: 0.72rem; }
    .jours-grille dl div { display: grid; gap: 0.05rem; }
    .contrepoints { padding-top: 0.6rem; }
  }

  @media (max-width: 350px) {
    .date-heure { font-size: 0.95rem; }
    .valeur-geante { font-size: 6rem; }
    .jours-grille article { padding: 0 0.45rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sq { animation: none; }
    .bouton-localisation { transition: none; }
  }
</style>
