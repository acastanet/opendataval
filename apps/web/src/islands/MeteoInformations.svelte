<script>
  import { onDestroy, onMount } from "svelte";
  import EnteteMeteo from "./EnteteMeteo.svelte";

  let onglet = "usage";
  let horloge = Date.now();
  let minuteur;

  function gererToucheOnglets(evenement) {
    const onglets = ["usage", "sources"];
    const index = onglets.indexOf(onglet);
    let suivant = null;
    if (evenement.key === "ArrowRight") suivant = onglets[(index + 1) % onglets.length];
    if (evenement.key === "ArrowLeft") suivant = onglets[(index - 1 + onglets.length) % onglets.length];
    if (evenement.key === "Home") suivant = onglets[0];
    if (evenement.key === "End") suivant = onglets.at(-1);
    if (!suivant) return;
    evenement.preventDefault();
    onglet = suivant;
    requestAnimationFrame(() => document.getElementById(`onglet-${suivant}`)?.focus());
  }

  onMount(() => {
    minuteur = window.setInterval(() => { horloge = Date.now(); }, 30_000);
  });

  onDestroy(() => clearInterval(minuteur));

  $: lieu = new URL(window.location.href).searchParams.get("lieu") ?? "val-aigoual";
  $: lienMeteo = `/meteo/essentiel/?lieu=${encodeURIComponent(lieu)}`;
  $: lienComparaison = `/meteo/comparaison/?lieu=${encodeURIComponent(lieu)}`;
  $: lienBilan = `/meteo/bilan-thermique/?lieu=${encodeURIComponent(lieu)}`;
  $: lienInformations = `/meteo/informations/?lieu=${encodeURIComponent(lieu)}`;
</script>

<main class="informations-page" data-testid="meteo-informations">
  <EnteteMeteo page="informations" horodatage={horloge} lienEssentiel={lienMeteo} {lienComparaison} {lienBilan} {lienInformations} />

  <header class="page-entete">
    <p class="surtitre">Météo locale</p>
    <h1>Comprendre cette météo</h1>
    <p>Repères d’usage, limites et sources des données affichées sur la page météo essentielle.</p>
  </header>

  <div class="onglets" role="tablist" aria-label="Informations météo">
    <button type="button" role="tab" id="onglet-usage" aria-selected={onglet === "usage"} aria-controls="panneau-usage" tabindex={onglet === "usage" ? 0 : -1} class:actif={onglet === "usage"} on:click={() => (onglet = "usage")} on:keydown={gererToucheOnglets}>Ce que fait la page</button>
    <button type="button" role="tab" id="onglet-sources" aria-selected={onglet === "sources"} aria-controls="panneau-sources" tabindex={onglet === "sources" ? 0 : -1} class:actif={onglet === "sources"} on:click={() => (onglet = "sources")} on:keydown={gererToucheOnglets}>Sources des données</button>
  </div>

  {#if onglet === "usage"}
    <div id="panneau-usage" role="tabpanel" aria-labelledby="onglet-usage" class="panneau">
      <p>Cette page donne, en un coup d’œil, la météo du moment pour un lieu préconfiguré ou une position précise, sans avoir à lire un bulletin complet.</p>
      <h2>Où est mesurée cette météo ?</h2>
      <p>Par défaut, la page affiche la météo à la <strong>mairie de Val-d’Aigoual</strong> (Valleraugue). Les boutons <strong>Val-d’Aigoual, Paris et Marseille</strong> donnent accès à trois points fixes. Avec <strong>« Me localiser »</strong>, votre navigateur demande l’autorisation d’utiliser votre position GPS et la page recalcule les données pour l’endroit où vous vous trouvez.</p>
      <h2>Que veut dire chaque bloc ?</h2>
      <ul>
        <li><strong>Bandeau de vigilance</strong> — le niveau d’alerte officiel du département pour aujourd’hui et demain.</li>
        <li><strong>Grand chiffre au centre</strong> — la température estimée maintenant, avec le minimum et le maximum attendus.</li>
        <li><strong>Prochaines 3 heures</strong> — l’évolution attendue et les quatre valeurs horaires prévues.</li>
        <li><strong>Les 3 jours à venir</strong> — les températures minimales et maximales prévues pour les jours suivants.</li>
        <li><strong>Contexte climatique</strong> — la comparaison avec la médiane ERA5-Land 1991–2020, lorsqu’elle est disponible.</li>
      </ul>
      <h2>Comment lire le bilan thermique ?</h2>
      <p>Le bilan thermique décrit le <strong>dernier mois complet</strong> disponible pour le lieu choisi. Il utilise l’indice <strong>UTCI</strong>, qui estime le stress ressenti par le corps en tenant compte de la température, du vent, de l’humidité et du rayonnement. Il indique le pic UTCI du mois, le nombre de jours de stress fort, très fort ou extrême, ainsi que les nuits tropicales.</p>
      <p>Ce bilan est une lecture climatique mensuelle issue de Copernicus ERA5-HEAT. Il ne doit pas être confondu avec le <strong>ressenti estimé</strong> affiché sur la météo du jour : les deux indicateurs n’ont ni la même période ni le même usage. Les données étant maillées, elles représentent une estimation et non une mesure prise précisément sur place.</p>
      <h2>Que mesure la comparaison J−1 / J ?</h2>
      <p>Elle montre comment une même prévision a été révisée entre la veille et le jour concerné. Elle renseigne sur la <strong>stabilité du modèle</strong>, mais pas sur sa justesse : sans observation indépendante, un scénario stable peut malgré tout être éloigné du temps réellement constaté.</p>
      <h2>À quel point peut-on s’y fier ?</h2>
      <p>Les chiffres proviennent de modèles météorologiques officiels et restent des <strong>estimations</strong>, pas une mesure prise exactement à l’endroit affiché. L’écart avec la réalité peut être plus grand en zone de relief. En cas de vigilance orange ou rouge, consultez toujours le bulletin officiel de Météo-France.</p>
    </div>
  {:else}
    <div id="panneau-sources" role="tabpanel" aria-labelledby="onglet-sources" class="panneau">
      <p class="introduction">Détail des sources utilisées, pour une lecture transparente et un usage professionnel.</p>
      <dl>
        <div><dt>Prévisions : température, tendance, 3 jours</dt><dd>Modèles officiels <strong>Météo-France AROME HD / AROME</strong>, puis <strong>ARPEGE</strong>, diffusés par <strong>Open-Meteo</strong>. <a href="https://open-meteo.com" target="_blank" rel="noopener">open-meteo.com</a> · <a href="https://meteofrance.com" target="_blank" rel="noopener">meteofrance.com</a></dd></div>
        <div><dt>Révisions J−1 / J</dt><dd><strong>Open-Meteo Previous Runs API</strong>, modèle Météo-France seamless. Les séries comparent les valeurs prévues 24 heures avant avec leur version actualisée à J. <a href="https://open-meteo.com/en/docs/previous-runs-api" target="_blank" rel="noopener">Documentation des runs précédents</a></dd></div>
        <div><dt>Vigilance météo</dt><dd><strong>Météo-France</strong> — API DPVigilance, vigilance officielle par département. <a href="https://vigilance.meteofrance.fr" target="_blank" rel="noopener">vigilance.meteofrance.fr</a></dd></div>
        <div><dt>Contexte climatique 1991–2020</dt><dd>Réanalyse <strong>Copernicus ERA5-Land</strong> à 0,1°, agrégée côté serveur. Médiane et percentiles sur 1991–2020, dans une fenêtre mobile J−7/J+7. <a href="https://climate.copernicus.eu" target="_blank" rel="noopener">climate.copernicus.eu</a></dd></div>
        <div><dt>Bilan thermique mensuel</dt><dd><strong>ERA5-HEAT / UTCI Copernicus</strong>, calculé côté serveur pour le dernier mois complet. Le ressenti affiché sur la météo essentielle n’est pas une mesure UTCI.</dd></div>
        <div><dt>Localisation / adresse</dt><dd>Géocodage inverse <strong>Géoplateforme IGN</strong> / <strong>Base Adresse Nationale</strong>. <a href="https://geoservices.ign.fr" target="_blank" rel="noopener">geoservices.ign.fr</a> · <a href="https://adresse.data.gouv.fr" target="_blank" rel="noopener">adresse.data.gouv.fr</a></dd></div>
      </dl>
    </div>
  {/if}
</main>

<style>
  .informations-page { --bleu: #0047ab; --noir: #1a1a1a; --gris: #686868; --papier: #fcfcfa; --filet: rgba(26, 26, 26, 0.16); box-sizing: border-box; width: min(100%, 45rem); margin: 0 auto; padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1.15rem, 6vw, 4.5rem) 4rem; color: var(--noir); background: var(--papier); font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
  .page-entete { display: grid; gap: 0.8rem; padding: clamp(2.2rem, 6vw, 4rem) 0 2rem; border-bottom: 1px solid var(--filet); }
  .surtitre { margin: 0; color: var(--bleu); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  h1 { max-width: 12ch; margin: 0; font-size: clamp(2.5rem, 8vw, 5.5rem); letter-spacing: -0.06em; line-height: 0.9; }
  .page-entete > p:last-child { max-width: 44rem; margin: 0; color: var(--gris); line-height: 1.5; }
  .onglets { display: flex; flex-wrap: wrap; gap: 0.6rem 1.4rem; padding: 1.2rem 0 0; border-bottom: 2px solid var(--noir); }
  .onglets button { padding: 0 0 0.75rem; border: 0; border-bottom: 3px solid transparent; color: var(--gris); background: none; font: inherit; font-size: 0.85rem; font-weight: 800; cursor: pointer; }
  .onglets button.actif { border-color: var(--bleu); color: var(--noir); }
  .onglets button:focus-visible { outline: 3px solid var(--bleu); outline-offset: 3px; }
  .panneau { display: grid; gap: 1.15rem; padding-top: 2rem; }
  .panneau h2 { margin: 0.8rem 0 0; font-size: 1.15rem; letter-spacing: -0.02em; }
  .panneau p { margin: 0; font-size: 0.95rem; line-height: 1.65; }
  .panneau ul { display: grid; gap: 0.7rem; margin: 0; padding-left: 1.2rem; line-height: 1.55; }
  .introduction { color: var(--gris); }
  dl { display: grid; gap: 1.25rem; margin: 0; }
  dl > div { padding-top: 1.25rem; border-top: 1px solid var(--filet); }
  dl > div:first-child { padding-top: 0; border-top: 0; }
  dt { margin-bottom: 0.35rem; color: var(--bleu); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  dd { margin: 0; line-height: 1.6; }
  dd a { color: var(--bleu); font-weight: 700; }
  @media (max-width: 620px) {
    .informations-page { padding-left: 1rem; padding-right: 1rem; }
  }
</style>
