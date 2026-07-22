<script>
  const FUSEAU = "Europe/Paris";

  export let page;
  export let horodatage;
  export let lienEssentiel = null;
  export let lienComparaison = null;
  export let lienBilan = null;
  export let lienInformations = null;

  function partiesDate(timestamp) {
    const formateur = new Intl.DateTimeFormat("fr-FR", {
      timeZone: FUSEAU,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return Object.fromEntries(
      formateur.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]),
    );
  }

  $: parties = partiesDate(horodatage);
  $: dateCourte = `${(parties.weekday ?? "").toUpperCase()} ${parties.day ?? ""} ${(parties.month ?? "").toUpperCase()}`;
</script>

<header class="entete-essentiel">
  <time class="date-heure" datetime={new Date(horodatage).toISOString()}>
    {dateCourte}
    <span class="consulte-a">consulté à {parties.hour}:{parties.minute}</span>
  </time>
  <div class="zone-actions">
    <nav class="actions-entete" aria-label="Navigation météo">
    {#if lienEssentiel}
      <a
        class="action-entete bouton-essentiel"
        href={lienEssentiel}
        aria-label="Retour à la météo essentielle"
        aria-current={page === "essentiel" ? "page" : undefined}
        title="Météo essentielle"
        data-infobulle="Météo essentielle"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 17.5h12.5a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.5 1.2A3 3 0 0 0 5 17.5Z"></path>
        </svg>
        <span class="infobulle" aria-hidden="true">Météo essentielle</span>
      </a>
    {/if}
    {#if lienComparaison}
      <a
        class="action-entete bouton-comparaison"
        href={lienComparaison}
        aria-label="Comparer les prévisions J−1 et J"
        aria-current={page === "comparaison" ? "page" : undefined}
        title="Révisions J−1 / J"
        data-infobulle="Révisions J−1 / J"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h12l-3-3M19 17H7l3 3"></path>
        </svg>
        <span class="infobulle" aria-hidden="true">Révisions J−1 / J</span>
      </a>
    {/if}
    {#if lienBilan}
      <a
        class="action-entete bouton-bilan"
        href={lienBilan}
        aria-label="Bilan thermique"
        aria-current={page === "bilan" ? "page" : undefined}
        title="Bilan thermique"
        data-infobulle="Bilan thermique"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 19.5h16"></path>
          <path d="M7 16v-4M12 16V7M17 16v-7"></path>
        </svg>
        <span class="infobulle" aria-hidden="true">Bilan thermique</span>
      </a>
    {/if}
    {#if lienInformations}
      <a
        class="action-entete bouton-info"
        href={lienInformations}
        aria-label="À propos de cette météo et sources des données"
        aria-current={page === "informations" ? "page" : undefined}
        title="Informations"
        data-infobulle="Informations"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 11v5.5"></path>
          <circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none"></circle>
        </svg>
        <span class="infobulle" aria-hidden="true">Informations</span>
      </a>
    {/if}
    </nav>
    <slot name="extra" />
  </div>
</header>

<style>
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

  .consulte-a {
    margin-left: 0.4em;
    color: var(--gris);
    font-size: 0.55em;
    font-weight: 600;
    letter-spacing: 0;
  }

  .zone-actions,
  .actions-entete { display: flex; align-items: center; gap: 0.45rem; }

  .action-entete {
    position: relative;
    display: inline-flex;
    width: 2.75rem;
    height: 2.75rem;
    min-width: 2.75rem;
    min-height: 2.75rem;
    flex: 0 0 2.75rem;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 0;
    text-decoration: none;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .action-entete svg { width: 1.2rem; height: 1.2rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

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

  .bouton-essentiel,
  .bouton-comparaison,
  .bouton-bilan {
    border: 2px solid var(--noir);
    color: var(--noir);
    background: var(--papier);
  }
  .bouton-essentiel:hover, .bouton-essentiel:focus-visible,
  .bouton-comparaison:hover, .bouton-comparaison:focus-visible,
  .bouton-bilan:hover, .bouton-bilan:focus-visible { color: #fff; background: var(--noir); outline: 0; }
  .bouton-essentiel:focus-visible, .bouton-comparaison:focus-visible, .bouton-bilan:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--noir); }

  .bouton-info {
    border: 2px solid var(--filet);
    color: var(--gris);
    background: var(--papier);
  }
  .bouton-info:hover, .bouton-info:focus-visible { color: var(--bleu); border-color: var(--bleu); outline: 0; }
  .bouton-info:focus-visible { box-shadow: 0 0 0 3px var(--papier), 0 0 0 5px var(--bleu); }

  .action-entete[aria-current="page"] {
    color: #fff;
    background: var(--noir);
    border-color: var(--noir);
  }

  @media (max-width: 620px) {
    .date-heure { min-width: 0; font-size: 0.92rem; line-height: 1.15; white-space: normal; }
    .consulte-a { display: block; margin-left: 0; font-size: 0.72rem; }
    .zone-actions,
    .actions-entete { flex: 0 0 auto; gap: 0.25rem; }
    .action-entete { width: 2.35rem; height: 2.35rem; min-width: 2.35rem; min-height: 2.35rem; flex-basis: 2.35rem; }
  }

  @media (max-width: 360px) {
    .entete-essentiel { flex-wrap: wrap; }
    .zone-actions { width: 100%; justify-content: flex-end; }
  }

  @media (hover: none) {
    .entete-essentiel { padding-top: 1.7rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-entete { transition: none; }
  }
</style>
