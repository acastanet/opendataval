<script>
  import { POINTS_METEO_PRECONFIGURES, POINT_METEO_PAR_DEFAUT } from "@opendata-vda/shared/localisations-meteo";
  import { onDestroy, onMount } from "svelte";
  import EnteteMeteo from "./EnteteMeteo.svelte";

  const PERIODES = [7, 14, 30];
  let pointActif = POINT_METEO_PAR_DEFAUT;
  let coordonneesPrecises = null;
  let periode = 30;
  let donnees = null;
  let etat = "chargement";
  let erreur = "";
  let horloge = Date.now();
  let minuteur;
  let requeteCourante = 0;

  const nombre = (valeur) => {
    const resultat = Number(valeur);
    return Number.isFinite(resultat) ? resultat : null;
  };

  function formaterValeur(valeur, unite, decimales = 1) {
    const n = nombre(valeur);
    return n === null ? "–" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: decimales })}${unite}`;
  }

  function formaterEcart(valeur, unite, decimales = 1) {
    const n = nombre(valeur);
    if (n === null) return "–";
    const absolue = Math.abs(n).toLocaleString("fr-FR", { maximumFractionDigits: decimales });
    if (n === 0) return `0${unite}`;
    return `${n > 0 ? "+" : "−"}${absolue}${unite}`;
  }

  function dateLongue(dateIso) {
    const date = new Date(`${dateIso}T12:00:00Z`);
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function libelleNiveau(niveau) {
    return niveau === "marquee" ? "Révision marquée" : niveau === "moderee" ? "Révision modérée" : "Révision faible";
  }

  function libellePoint() {
    if (coordonneesPrecises) return `Position précise · ${coordonneesPrecises.lat.toFixed(4)}, ${coordonneesPrecises.lon.toFixed(4)}`;
    return pointActif.label;
  }

  async function charger(point = pointActif, jours = periode, coordonnees = coordonneesPrecises) {
    const numero = ++requeteCourante;
    pointActif = point;
    coordonneesPrecises = coordonnees;
    periode = jours;
    etat = "chargement";
    erreur = "";

    const lat = coordonnees?.lat ?? point.lat;
    const lon = coordonnees?.lon ?? point.lon;
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon), jours: String(jours) });
      const reponse = await fetch(`/api/meteo/revisions?${params}`);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const resultat = await reponse.json();
      if (numero !== requeteCourante) return;
      donnees = resultat;
      etat = "ok";
    } catch (cause) {
      console.error("révisions météo indisponibles", cause);
      if (numero !== requeteCourante) return;
      etat = "erreur";
      erreur = "L’historique des versions du modèle est momentanément indisponible.";
    }
  }

  function choisirPoint(point) {
    if (etat === "chargement") return;
    charger(point, periode, null);
  }

  function choisirPeriode(jours) {
    if (jours === periode || etat === "chargement") return;
    charger(pointActif, jours, coordonneesPrecises);
  }

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    const slug = params.get("lieu");
    const point = POINTS_METEO_PRECONFIGURES.find((item) => item.slug === slug) ?? POINT_METEO_PAR_DEFAUT;
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    const precises = Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
      ? { lat, lon }
      : null;
    charger(point, periode, precises);
    minuteur = window.setInterval(() => { horloge = Date.now(); }, 30_000);
  });

  onDestroy(() => clearInterval(minuteur));

  $: resume = donnees?.resume ?? null;
  $: derniere = donnees?.derniere ?? null;
  $: historique = Array.isArray(donnees?.historique) ? donnees.historique : [];
  $: slugNavigation = pointActif?.slug ?? POINT_METEO_PAR_DEFAUT.slug;
  $: suffixeComparaison = coordonneesPrecises
    ? `lat=${encodeURIComponent(coordonneesPrecises.lat)}&lon=${encodeURIComponent(coordonneesPrecises.lon)}`
    : `lieu=${encodeURIComponent(slugNavigation)}`;
  $: lienEssentiel = `/meteo/essentiel/?lieu=${encodeURIComponent(slugNavigation)}`;
  $: lienComparaison = `/meteo/comparaison/?${suffixeComparaison}`;
  $: lienBilan = `/meteo/bilan-thermique/?lieu=${encodeURIComponent(slugNavigation)}`;
  $: lienInformations = `/meteo/informations/?lieu=${encodeURIComponent(slugNavigation)}`;
</script>

<main class="comparaison-page" data-testid="meteo-comparaison">
  <EnteteMeteo page="comparaison" horodatage={horloge} {lienEssentiel} {lienComparaison} {lienBilan} {lienInformations} />

  <header class="page-entete">
    <p class="surtitre">Stabilité des prévisions</p>
    <h1>Ce qui a changé depuis la veille</h1>
    <p>Pour une même journée, comparaison entre l’estimation disponible 24 heures avant (J−1) et sa version actualisée le jour même (J).</p>
  </header>

  <nav class="choix-points" aria-label="Choisir un lieu">
    {#each POINTS_METEO_PRECONFIGURES as point}
      <button
        type="button"
        class:actif={!coordonneesPrecises && point.slug === pointActif.slug}
        aria-pressed={!coordonneesPrecises && point.slug === pointActif.slug}
        disabled={etat === "chargement"}
        on:click={() => choisirPoint(point)}
      >{point.nom}</button>
    {/each}
  </nav>

  <section class="avertissement" aria-labelledby="titre-avertissement">
    <p class="surtitre">À lire correctement</p>
    <h2 id="titre-avertissement">Une révision n’est pas une erreur de prévision</h2>
    <p>Cette page mesure la <strong>stabilité du modèle</strong>. Sans mesure indépendante du temps réellement observé, elle ne permet pas de conclure que la prévision était juste ou fausse.</p>
  </section>

  <div class="barre-filtres">
    <div>
      <span class="surtitre">Lieu analysé</span>
      <strong>{libellePoint()}</strong>
    </div>
    <div class="periodes" aria-label="Période analysée">
      {#each PERIODES as jours}
        <button
          type="button"
          class:actif={periode === jours}
          aria-pressed={periode === jours}
          disabled={etat === "chargement"}
          on:click={() => choisirPeriode(jours)}
        >{jours} j</button>
      {/each}
    </div>
  </div>

  {#if etat === "chargement"}
    <p class="etat" role="status">Lecture des anciens runs du modèle… Cette première consultation peut prendre quelques secondes.</p>
  {:else if etat === "erreur"}
    <p class="etat erreur" role="alert">{erreur}</p>
  {:else if !donnees?.disponible || !derniere}
    <p class="etat">Aucune journée comparable n’est disponible pour cette période.</p>
  {:else}
    <section class="resume" aria-labelledby="titre-resume">
      <div class="section-titre">
        <p class="surtitre">Vue d’ensemble</p>
        <h2 id="titre-resume">{resume.joursComparables} journées comparées</h2>
      </div>
      <dl class="indicateurs">
        <div>
          <dt>Écart moyen des maximales</dt>
          <dd>{formaterValeur(resume.ecartMoyenTemperatureMaxC, " °C")}</dd>
        </div>
        <div>
          <dt>Écart moyen des minimales</dt>
          <dd>{formaterValeur(resume.ecartMoyenTemperatureMinC, " °C")}</dd>
        </div>
        <div>
          <dt>Écart moyen de pluie</dt>
          <dd>{formaterValeur(resume.ecartMoyenPrecipitationMm, " mm")}</dd>
        </div>
        <div>
          <dt>Jours avec scénario révisé</dt>
          <dd>{resume.joursScenarioRevise}<span> / {resume.joursComparables}</span></dd>
        </div>
      </dl>
      <div class="repartition" aria-label="Répartition de l’ampleur des révisions">
        <span class="faible">{resume.repartition.faible} faibles</span>
        <span class="moderee">{resume.repartition.moderee} modérées</span>
        <span class="marquee">{resume.repartition.marquee} marquées</span>
      </div>
    </section>

    <section class="derniere" aria-labelledby="titre-derniere">
      <div class="section-titre">
        <p class="surtitre">Dernière journée complète</p>
        <h2 id="titre-derniere">{dateLongue(derniere.date)}</h2>
        <span class:niveau-faible={derniere.niveauRevision === "faible"} class:niveau-moderee={derniere.niveauRevision === "moderee"} class:niveau-marquee={derniere.niveauRevision === "marquee"} class="niveau">
          {libelleNiveau(derniere.niveauRevision)}
        </span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Indicateur</th><th scope="col">J−1</th><th scope="col">J</th><th scope="col">Révision</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Temp. minimale</th><td>{formaterValeur(derniere.jMoins1.temperatureMinC, " °C")}</td><td>{formaterValeur(derniere.j.temperatureMinC, " °C")}</td><td>{formaterEcart(derniere.ecarts.temperatureMinC, " °C")}</td></tr>
            <tr><th scope="row">Temp. maximale</th><td>{formaterValeur(derniere.jMoins1.temperatureMaxC, " °C")}</td><td>{formaterValeur(derniere.j.temperatureMaxC, " °C")}</td><td>{formaterEcart(derniere.ecarts.temperatureMaxC, " °C")}</td></tr>
            <tr><th scope="row">Cumul de pluie</th><td>{formaterValeur(derniere.jMoins1.precipitationMm, " mm")}</td><td>{formaterValeur(derniere.j.precipitationMm, " mm")}</td><td>{formaterEcart(derniere.ecarts.precipitationMm, " mm")}</td></tr>
            <tr><th scope="row">Scénario significatif</th><td>{derniere.jMoins1.condition ?? "–"}</td><td>{derniere.j.condition ?? "–"}</td><td>{derniere.ecarts.heuresScenarioModifiees} h / {derniere.ecarts.heuresScenarioComparees}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="historique-section" aria-labelledby="titre-historique">
      <div class="section-titre">
        <p class="surtitre">Jour par jour</p>
        <h2 id="titre-historique">Historique des révisions</h2>
      </div>
      <ol class="historique">
        {#each historique as jour}
          <li>
            <div>
              <time datetime={jour.date}>{dateLongue(jour.date)}</time>
              <span class:niveau-faible={jour.niveauRevision === "faible"} class:niveau-moderee={jour.niveauRevision === "moderee"} class:niveau-marquee={jour.niveauRevision === "marquee"} class="niveau compact">
                {libelleNiveau(jour.niveauRevision)}
              </span>
            </div>
            <dl>
              <div><dt>Max.</dt><dd>{formaterEcart(jour.ecarts.temperatureMaxC, " °C")}</dd></div>
              <div><dt>Min.</dt><dd>{formaterEcart(jour.ecarts.temperatureMinC, " °C")}</dd></div>
              <div><dt>Pluie</dt><dd>{formaterEcart(jour.ecarts.precipitationMm, " mm")}</dd></div>
              <div><dt>Scénario</dt><dd>{jour.ecarts.heuresScenarioModifiees} h</dd></div>
            </dl>
          </li>
        {/each}
      </ol>
    </section>

    <details class="methode">
      <summary>Comment l’ampleur des révisions est-elle classée ?</summary>
      <div>
        <p><strong>Faible</strong> : moins de 1,5 °C, moins de 3 mm et moins de 20 % des heures avec un scénario météo différent.</p>
        <p><strong>Modérée</strong> : au moins un de ces seuils est dépassé.</p>
        <p><strong>Marquée</strong> : au moins 3 °C, 10 mm ou 50 % des heures changées. Cette classe est un repère de lecture local, pas un indice officiel.</p>
      </div>
    </details>

    <footer class="source">
      <p><strong>Source :</strong> {donnees.source.modele}, via <a href={donnees.source.url} target="_blank" rel="noopener">{donnees.source.nom}</a>.</p>
      <p>Les températures mini/maxi et les cumuls sont agrégés à partir des valeurs horaires. Le scénario correspond au phénomène WMO le plus significatif de la journée.</p>
      <p><strong>Limite :</strong> {donnees.interpretation}</p>
    </footer>
  {/if}
</main>

<style>
  .comparaison-page {
    --bleu: #0047ab;
    --rouge: #d7261e;
    --noir: #1a1a1a;
    --gris: #686868;
    --papier: #fcfcfa;
    --filet: rgba(26, 26, 26, 0.16);
    box-sizing: border-box;
    width: min(100%, 45rem);
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1.15rem, 6vw, 4.5rem) 4rem;
    color: var(--noir);
    background: var(--papier);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }
  .page-entete { display: grid; gap: 0.8rem; padding: clamp(2.2rem, 6vw, 4rem) 0 2rem; border-bottom: 2px solid var(--noir); }
  .surtitre { margin: 0; color: var(--bleu); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .page-entete h1 { max-width: 12ch; margin: 0; font-size: clamp(2.5rem, 8vw, 5.5rem); letter-spacing: -0.06em; line-height: 0.9; }
  .page-entete > p:last-child { max-width: 42rem; margin: 0; color: var(--gris); line-height: 1.55; }
  .choix-points { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1.25rem 0; border-bottom: 1px solid var(--filet); }
  .choix-points button, .periodes button { min-height: 2.75rem; padding: 0.55rem 0.9rem; border: 1px solid var(--filet); color: var(--noir); background: var(--papier); font: inherit; font-weight: 750; cursor: pointer; }
  .choix-points button.actif, .periodes button.actif { border-color: var(--bleu); color: white; background: var(--bleu); }
  button:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid var(--rouge); outline-offset: 2px; }
  button:disabled { cursor: wait; opacity: 0.65; }
  .avertissement { margin-top: 1.5rem; padding: 1.25rem; border-left: 6px solid var(--rouge); background: white; }
  .avertissement h2 { margin: 0.45rem 0 0; font-size: 1.25rem; letter-spacing: -0.025em; }
  .avertissement > p:last-child { margin: 0.65rem 0 0; color: var(--gris); font-size: 0.9rem; line-height: 1.55; }
  .barre-filtres { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 1.5rem 0; border-bottom: 1px solid var(--filet); }
  .barre-filtres > div:first-child { display: grid; gap: 0.35rem; min-width: 0; }
  .barre-filtres strong { overflow-wrap: anywhere; font-size: 0.9rem; }
  .periodes { display: flex; flex: 0 0 auto; gap: 0.25rem; }
  .periodes button { min-height: 2.5rem; padding-inline: 0.65rem; }
  .etat { margin: 2rem 0; padding: 1.25rem; border-left: 5px solid var(--bleu); background: white; line-height: 1.5; }
  .etat.erreur { border-left-color: var(--rouge); }
  .resume, .derniere, .historique-section { padding-top: clamp(2.2rem, 7vw, 4rem); }
  .section-titre { display: grid; gap: 0.45rem; }
  .section-titre h2 { margin: 0; font-size: clamp(1.7rem, 5vw, 2.8rem); letter-spacing: -0.045em; line-height: 1.05; text-transform: capitalize; }
  .indicateurs { display: grid; grid-template-columns: repeat(2, 1fr); margin: 1.5rem 0 0; border-top: 1px solid var(--filet); border-bottom: 1px solid var(--filet); }
  .indicateurs > div { padding: 1.15rem; border-top: 1px solid var(--filet); border-left: 1px solid var(--filet); }
  .indicateurs > div:nth-child(-n + 2) { border-top: 0; }
  .indicateurs > div:nth-child(odd) { border-left: 0; }
  .indicateurs dt { min-height: 2.5em; color: var(--gris); font-size: 0.66rem; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; }
  .indicateurs dd { margin: 0.45rem 0 0; color: var(--bleu); font-size: clamp(1.8rem, 7vw, 3rem); font-weight: 850; line-height: 1; }
  .indicateurs dd span { color: var(--gris); font-size: 0.45em; }
  .repartition { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.8rem; }
  .repartition span, .niveau { padding: 0.35rem 0.55rem; border: 1px solid currentColor; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
  .faible, .niveau-faible { color: #14764d; background: #ecf8f1; }
  .moderee, .niveau-moderee { color: #8a5a00; background: #fff7dd; }
  .marquee, .niveau-marquee { color: #a5202d; background: #fff0f2; }
  .derniere .niveau { width: fit-content; margin-top: 0.35rem; }
  .table-wrap { max-width: 100%; margin-top: 1.25rem; border: 1px solid var(--noir); overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
  th, td { padding: 0.8rem 0.7rem; border-bottom: 1px solid var(--filet); text-align: right; white-space: nowrap; }
  tr:last-child th, tr:last-child td { border-bottom: 0; }
  th:first-child { text-align: left; }
  thead th { color: var(--gris); background: rgba(26, 26, 26, 0.04); font-size: 0.64rem; letter-spacing: 0.06em; text-transform: uppercase; }
  tbody th { font-size: 0.75rem; }
  tbody td:last-child { color: var(--bleu); font-weight: 850; }
  .historique { display: grid; gap: 0; margin: 1.25rem 0 0; padding: 0; border-top: 1px solid var(--noir); list-style: none; }
  .historique li { display: grid; gap: 0.8rem; padding: 1rem 0; border-bottom: 1px solid var(--filet); }
  .historique li > div { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; }
  .historique time { font-weight: 800; text-transform: capitalize; }
  .niveau.compact { flex: 0 0 auto; padding: 0.25rem 0.4rem; font-size: 0.58rem; }
  .historique dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; margin: 0; }
  .historique dl div { padding-left: 0.65rem; border-left: 2px solid var(--filet); }
  .historique dt { color: var(--gris); font-size: 0.62rem; font-weight: 800; text-transform: uppercase; }
  .historique dd { margin: 0.2rem 0 0; font-size: 0.9rem; font-weight: 800; }
  .methode { margin-top: 2rem; border-top: 2px solid var(--noir); border-bottom: 1px solid var(--noir); }
  .methode summary { padding: 1rem 0; color: var(--bleu); font-weight: 800; cursor: pointer; }
  .methode div { display: grid; gap: 0.65rem; padding: 0 0 1.15rem; }
  .methode p { margin: 0; color: var(--gris); font-size: 0.84rem; line-height: 1.5; }
  .source { display: grid; gap: 0.4rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--filet); color: var(--gris); font-size: 0.76rem; line-height: 1.5; }
  .source p { margin: 0; }
  .source a { color: var(--bleu); font-weight: 750; }
  @media (max-width: 620px) {
    .comparaison-page { padding-left: 1rem; padding-right: 1rem; }
    .barre-filtres { align-items: stretch; flex-direction: column; }
    .periodes { align-self: stretch; }
    .periodes button { flex: 1; }
  }
  @media (max-width: 420px) {
    .choix-points button { flex: 1 1 auto; padding-inline: 0.6rem; }
    .indicateurs { grid-template-columns: 1fr; }
    .indicateurs > div { border-top: 1px solid var(--filet) !important; border-left: 0; }
    .indicateurs > div:first-child { border-top: 0 !important; }
    .historique li > div { align-items: flex-start; flex-direction: column; }
    .historique dl { grid-template-columns: repeat(2, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto !important; }
  }
</style>
