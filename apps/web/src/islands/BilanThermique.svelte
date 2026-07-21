<script>
  import { POINTS_METEO_PRECONFIGURES, POINT_METEO_PAR_DEFAUT } from "@opendata-vda/shared/localisations-meteo";
  import { onMount } from "svelte";

  let pointActif = POINT_METEO_PAR_DEFAUT;
  let bilan = null;
  let etat = "chargement";
  let erreur = "";
  let requeteCourante = 0;
  let horloge = Date.now();
  let timerInfobulle;
  let infobulleTactile = null;

  const nombre = (valeur) => {
    const resultat = Number(valeur);
    return Number.isFinite(resultat) ? resultat : null;
  };

  const formatNombre = (valeur, decimales = 0) => {
    const resultat = nombre(valeur);
    return resultat === null ? "–" : resultat.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
  };

  function libelleMois(annee, mois) {
    return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(annee, mois - 1, 1)));
  }

  function formatDate(iso) {
    if (!iso) return "–";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(date);
  }

  function descriptionDates(dates, libelle) {
    const valeurs = Array.isArray(dates) ? dates : [];
    if (!valeurs.length) return `Aucune date de ${libelle.toLowerCase()} pendant ce mois.`;
    return `${libelle} : ${valeurs.map(formatDate).join(", ")}.`;
  }

  function dateHeureCondensee(timestamp) {
    const parties = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
    return `${parties.weekday.toUpperCase()} ${parties.day} ${parties.month.toUpperCase()} · ${parties.hour}:${parties.minute}`;
  }

  function afficherInfobulleTactile(evenement, action) {
    if (!window.matchMedia("(hover: none)").matches || infobulleTactile === action) return false;
    evenement.preventDefault();
    infobulleTactile = action;
    clearTimeout(timerInfobulle);
    timerInfobulle = window.setTimeout(() => { infobulleTactile = null; }, 3_000);
    return true;
  }

  async function charger(point) {
    const numero = ++requeteCourante;
    pointActif = point;
    etat = "chargement";
    erreur = "";
    try {
      const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) });
      // Versionner le contrat évite de réutiliser une ancienne réponse navigateur ne
      // contenant pas encore les tableaux de dates. Le bilan reste une simple lecture DB.
      params.set("v", "2");
      const reponse = await fetch(`/api/meteo/bilan-thermique?${params}`, { cache: "no-store" });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const resultat = await reponse.json();
      if (numero !== requeteCourante) return;
      bilan = resultat;
      etat = "ok";
      const url = new URL(window.location.href);
      url.searchParams.set("lieu", point.slug);
      window.history.replaceState(null, "", url);
    } catch {
      if (numero !== requeteCourante) return;
      bilan = null;
      etat = "erreur";
      erreur = "Le bilan thermique est momentanément indisponible.";
    }
  }

  onMount(() => {
    const slug = new URL(window.location.href).searchParams.get("lieu");
    const initial = POINTS_METEO_PRECONFIGURES.find((point) => point.slug === slug) ?? POINT_METEO_PAR_DEFAUT;
    charger(initial);
    const minuteur = window.setInterval(() => { horloge = Date.now(); }, 30_000);
    return () => {
      clearInterval(minuteur);
      clearTimeout(timerInfobulle);
    };
  });

  $: anomalie = nombre(bilan?.reference?.anomalieJoursStress);
  $: lienMeteo = `/meteo/essentiel/?lieu=${encodeURIComponent(pointActif.slug)}`;
  $: lienBilan = `/meteo/bilan-thermique/?lieu=${encodeURIComponent(pointActif.slug)}`;
  $: lienInformations = `/meteo/informations/?lieu=${encodeURIComponent(pointActif.slug)}`;
</script>

<main class="bilan-page" data-testid="bilan-thermique">
  <header class="barre-meteo">
    <time datetime={new Date(horloge).toISOString()}>{dateHeureCondensee(horloge)}</time>
    <nav aria-label="Navigation météo">
      <a
        href={lienMeteo}
        aria-label="Retour à la météo essentielle"
        title="Météo essentielle"
        class:infobulle-visible={infobulleTactile === "meteo"}
        on:click={(evenement) => afficherInfobulleTactile(evenement, "meteo")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17.5h12.5a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.5 1.2A3 3 0 0 0 5 17.5Z"></path></svg>
        <span class="infobulle" aria-hidden="true">Météo essentielle</span>
      </a>
      <a
        href={lienBilan}
        aria-label="Bilan thermique"
        aria-current="page"
        title="Bilan thermique"
        class:infobulle-visible={infobulleTactile === "bilan"}
        on:click={(evenement) => afficherInfobulleTactile(evenement, "bilan")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5h16"></path><path d="M7 16v-4M12 16V7M17 16v-7"></path></svg>
        <span class="infobulle" aria-hidden="true">Bilan thermique</span>
      </a>
      <a
        href={lienInformations}
        aria-label="À propos de cette météo et sources des données"
        title="Informations"
        class:infobulle-visible={infobulleTactile === "informations"}
        on:click={(evenement) => afficherInfobulleTactile(evenement, "informations")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5"></path><circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none"></circle></svg>
        <span class="infobulle" aria-hidden="true">Informations</span>
      </a>
    </nav>
  </header>

  <header class="bilan-entete">
    <p class="surtitre">Copernicus · ERA5-HEAT</p>
    <h1>Bilan thermique du mois dernier</h1>
    <p>Stress thermique UTCI et nuits tropicales pour le dernier mois complet disponible.</p>
  </header>

  <nav class="choix-points" aria-label="Choisir un lieu">
    {#each POINTS_METEO_PRECONFIGURES as point}
      <button
        type="button"
        class:actif={point.slug === pointActif.slug}
        aria-pressed={point.slug === pointActif.slug}
        disabled={etat === "chargement"}
        on:click={() => charger(point)}
      >{point.nom}</button>
    {/each}
  </nav>

  {#if erreur}
    <p class="erreur" role="alert">{erreur}</p>
  {:else if etat === "chargement"}
    <p class="chargement" role="status">Chargement du bilan…</p>
  {:else if !bilan?.disponible}
    <section class="indisponible" aria-labelledby="titre-indisponible">
      <p class="surtitre">{pointActif.label}</p>
      <h2 id="titre-indisponible">Aucun mois complet publié</h2>
      <p>Le traitement Copernicus n’a pas encore enregistré de bilan complet pour ce point.</p>
      <p class="limite">{bilan?.limite}</p>
    </section>
  {:else}
    <article class="bilan-contenu">
      <header class="periode">
        <p class="surtitre">{pointActif.label}</p>
        <h2>{libelleMois(bilan.periode.annee, bilan.periode.mois)}</h2>
        <p>Du {formatDate(bilan.periode.debut)} au {formatDate(bilan.periode.fin)}</p>
      </header>

      <p class="aide-dates">Survolez ou sélectionnez les valeurs de stress pour afficher les dates exactes.</p>

      <dl class="indicateurs">
        <div class="indicateur-principal">
          <dt>Pic UTCI</dt>
          <dd>{formatNombre(bilan.utci.maximumC, 1)} <span>°C</span></dd>
          <p>{bilan.utci.categorie}</p>
        </div>
        <div>
          <dt>Jours de stress fort ou plus</dt>
          <dd class="valeur-avec-dates">
            <button type="button" aria-describedby="dates-stress-fort">
              {formatNombre(bilan.jours.stressFort)}
              <span class="sr-only"> — afficher les dates exactes</span>
            </button>
            <span class="info-dates" id="dates-stress-fort" role="tooltip">
              {descriptionDates(bilan.dates?.stressFort, "Stress fort ou plus")}
            </span>
          </dd>
        </div>
        <div>
          <dt>Stress très fort</dt>
          <dd class="valeur-avec-dates">
            <button type="button" aria-describedby="dates-stress-tres-fort">
              {formatNombre(bilan.jours.stressTresFort)}
              <span class="sr-only"> — afficher les dates exactes</span>
            </button>
            <span class="info-dates" id="dates-stress-tres-fort" role="tooltip">
              {descriptionDates(bilan.dates?.stressTresFort, "Stress très fort")}
            </span>
          </dd>
        </div>
        <div>
          <dt>Stress extrême</dt>
          <dd class="valeur-avec-dates">
            <button type="button" aria-describedby="dates-stress-extreme">
              {formatNombre(bilan.jours.stressExtreme)}
              <span class="sr-only"> — afficher les dates exactes</span>
            </button>
            <span class="info-dates" id="dates-stress-extreme" role="tooltip">
              {descriptionDates(bilan.dates?.stressExtreme, "Stress extrême")}
            </span>
          </dd>
        </div>
        <div>
          <dt>Nuits tropicales</dt>
          <dd>{formatNombre(bilan.jours.nuitsTropicales)}</dd>
        </div>
      </dl>

      <section class="reference" aria-labelledby="titre-reference">
        <p class="surtitre">Référence 1991–2020</p>
        <h2 id="titre-reference">
          {#if anomalie === null}
            Comparaison encore indisponible
          {:else if anomalie === 0}
            Autant de jours de stress fort que la médiane
          {:else}
            {formatNombre(Math.abs(anomalie), 1)} jour{Math.abs(anomalie) > 1 ? "s" : ""}
            {anomalie > 0 ? " de plus" : " de moins"}
          {/if}
        </h2>
        {#if nombre(bilan.reference.joursStressFort) !== null}
          <p>Médiane de référence : {formatNombre(bilan.reference.joursStressFort, 1)} jours pour ce mois calendaire.</p>
        {/if}
      </section>

      <footer class="tracabilite">
        <p><strong>Source :</strong> {bilan.source.produit} · {bilan.source.version}</p>
        <p><strong>Complétude :</strong> {formatNombre(bilan.source.completudePct, 1)} % · calculé le {formatDate(bilan.source.calculeLe)}</p>
        <p>{bilan.limite}</p>
        <p>Le ressenti météo courant et l’UTCI sont deux indicateurs distincts.</p>
      </footer>
    </article>
  {/if}
</main>

<style>
  .bilan-page {
    --bleu: #0047ab;
    --rouge: #d7261e;
    --noir: #1a1a1a;
    --gris: #686868;
    --papier: #fcfcfa;
    --filet: rgba(26, 26, 26, 0.18);
    width: min(100% - 2rem, 45rem);
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3.5rem) 0 4rem;
    color: var(--noir);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }
  .barre-meteo { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-bottom: 0.9rem; border-bottom: 2px solid var(--noir); }
  .barre-meteo time { font-size: clamp(1.05rem, 3vw, 1.55rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1; white-space: nowrap; }
  .barre-meteo nav { display: flex; gap: 0.45rem; }
  .barre-meteo a { position: relative; display: inline-flex; width: 2.75rem; height: 2.75rem; min-width: 2.75rem; min-height: 2.75rem; flex: 0 0 2.75rem; align-items: center; justify-content: center; padding: 0; border: 2px solid var(--noir); color: var(--noir); text-decoration: none; }
  .barre-meteo a:hover, .barre-meteo a:focus-visible { color: #fff; background: var(--noir); outline: 0; }
  .barre-meteo a:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--noir); }
  .barre-meteo a[aria-current="page"] { color: #fff; background: var(--noir); }
  .barre-meteo svg { width: 1.2rem; height: 1.2rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
  .infobulle { position: absolute; top: calc(100% + 0.55rem); right: 0; z-index: 5; width: max-content; max-width: 10rem; padding: 0.4rem 0.55rem; color: #fff; background: var(--noir); font-size: 0.68rem; font-weight: 700; line-height: 1.2; text-align: center; opacity: 0; pointer-events: none; transform: translateY(-0.2rem); transition: opacity 0.15s ease, transform 0.15s ease; visibility: hidden; }
  .barre-meteo a:hover .infobulle,
  .barre-meteo a:focus-visible .infobulle,
  .barre-meteo a:active .infobulle,
  .barre-meteo a.infobulle-visible .infobulle { opacity: 1; transform: translateY(0); visibility: visible; }
  .bilan-entete { margin-top: clamp(2.2rem, 6vw, 4rem); }
  .surtitre { margin: 0; color: var(--bleu); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .bilan-entete { display: grid; gap: 0.8rem; padding-bottom: 2rem; border-bottom: 2px solid var(--noir); }
  .bilan-entete h1 { max-width: 12ch; margin: 0; font-size: clamp(2.5rem, 8vw, 5.5rem); letter-spacing: -0.06em; line-height: 0.9; }
  .bilan-entete > p:last-child { max-width: 44rem; margin: 0; color: var(--gris); font-size: 1rem; line-height: 1.5; }
  .choix-points { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1.25rem 0; border-bottom: 1px solid var(--filet); }
  .choix-points button { min-height: 2.75rem; padding: 0.55rem 0.9rem; border: 1px solid var(--filet); background: var(--papier); color: var(--noir); font: inherit; font-weight: 750; cursor: pointer; }
  .choix-points button.actif { border-color: var(--bleu); background: var(--bleu); color: white; }
  .choix-points button:focus-visible { outline: 3px solid var(--rouge); outline-offset: 2px; }
  .choix-points button:disabled { opacity: 0.65; }
  .chargement,
  .erreur,
  .indisponible { margin: 2rem 0; padding: 1.5rem; border-left: 5px solid var(--bleu); background: white; }
  .erreur { border-left-color: var(--rouge); }
  .indisponible { display: grid; gap: 0.75rem; }
  .indisponible h2,
  .indisponible p { margin: 0; }
  .limite { color: var(--gris); font-size: 0.8rem; }
  .bilan-contenu { display: grid; gap: clamp(2rem, 6vw, 4rem); padding-top: 2rem; }
  .periode { display: grid; gap: 0.4rem; }
  .periode h2 { margin: 0; font-size: clamp(2rem, 7vw, 4rem); letter-spacing: -0.05em; text-transform: capitalize; }
  .periode > p:last-child { margin: 0; color: var(--gris); }
  .aide-dates { margin: -2.5rem 0 0; color: var(--gris); font-size: 0.78rem; line-height: 1.45; }
  .indicateurs { display: grid; grid-template-columns: repeat(4, 1fr); margin: 0; border-top: 1px solid var(--filet); border-bottom: 1px solid var(--filet); }
  .indicateurs > div { min-width: 0; padding: 1.5rem 1rem; border-left: 1px solid var(--filet); }
  .indicateurs > div:first-child { border-left: 0; }
  .indicateurs .indicateur-principal { grid-row: span 2; }
  .indicateurs dt { min-height: 2.8em; color: var(--gris); font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  .indicateurs dd { margin: 0.5rem 0 0; color: var(--bleu); font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 850; line-height: 1; }
  .indicateurs dd span { font-size: 0.35em; }
  .indicateurs .valeur-avec-dates { position: relative; }
  .valeur-avec-dates button {
    padding: 0 0 0.08em;
    border: 0;
    border-bottom: 2px dotted currentColor;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: inherit;
    line-height: inherit;
    cursor: help;
  }
  .valeur-avec-dates button:hover,
  .valeur-avec-dates button:focus-visible { color: var(--rouge); outline: 0; }
  .valeur-avec-dates button:focus-visible { box-shadow: 0 3px 0 var(--rouge); }
  .info-dates {
    position: absolute;
    bottom: calc(100% + 0.65rem);
    left: 0;
    z-index: 10;
    display: block;
    width: min(19rem, 75vw);
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--noir);
    color: white;
    background: var(--noir);
    font-size: 0.72rem !important;
    font-weight: 650;
    line-height: 1.5;
    opacity: 0;
    pointer-events: none;
    transform: translateY(0.3rem);
    transition: opacity 0.12s ease, transform 0.12s ease;
  }
  .valeur-avec-dates button:hover + .info-dates,
  .valeur-avec-dates button:focus-visible + .info-dates {
    opacity: 1;
    transform: translateY(0);
  }
  .indicateurs > div:nth-child(4) .info-dates { right: 0; left: auto; }
  .indicateurs p { margin: 0.55rem 0 0; color: var(--rouge); font-size: 0.78rem; font-weight: 750; }
  .reference { padding: 1.5rem; border: 2px solid var(--noir); }
  .reference h2 { margin: 0.45rem 0 0; font-size: clamp(1.5rem, 4vw, 2.4rem); letter-spacing: -0.035em; }
  .reference > p:last-child { margin: 0.7rem 0 0; color: var(--gris); }
  .tracabilite { display: grid; gap: 0.35rem; padding-top: 1.25rem; border-top: 1px solid var(--filet); color: var(--gris); font-size: 0.76rem; line-height: 1.5; }
  .tracabilite p { margin: 0; }
  @media (max-width: 700px) {
    .bilan-page { width: min(100% - 1.5rem, 64rem); }
    .indicateurs { grid-template-columns: repeat(2, 1fr); }
    .indicateurs .indicateur-principal { grid-column: 1 / -1; grid-row: auto; }
    .indicateurs > div:nth-child(2n) { border-left: 0; }
    .indicateurs > div:nth-child(3) .info-dates { right: 0; left: auto; }
    .indicateurs > div:nth-child(4) .info-dates { right: auto; left: 0; }
  }
  @media (max-width: 500px) {
    .barre-meteo time { min-width: 0; font-size: 0.92rem; line-height: 1.15; white-space: normal; }
  }
  @media (max-width: 360px) {
    .choix-points button { flex: 1 1 auto; padding-inline: 0.55rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto !important; }
    .info-dates { transition: none; }
  }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
