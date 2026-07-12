<script>
  import { onMount } from "svelte";
  import DiagrammeClimatique from "../components/graphes/DiagrammeClimatique.svelte";
  import GrapheLignes from "../components/graphes/GrapheLignes.svelte";
  import GrapheBarres from "../components/graphes/GrapheBarres.svelte";

  let etat = "chargement"; // chargement | ok | vide | erreur
  let normales = [];
  let periode = null;
  let annees = [];
  let records = null;

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  onMount(async () => {
    try {
      const [rN, rA, rR] = await Promise.all([
        fetch("/api/meteo/climat/normales"),
        fetch("/api/meteo/climat/annuel"),
        fetch("/api/meteo/climat/records"),
      ]);
      if (!rN.ok || !rA.ok || !rR.ok) throw new Error("HTTP");
      const dN = await rN.json();
      const dA = await rA.json();
      const dR = await rR.json();
      normales = dN.mois ?? [];
      periode = dN.periode;
      annees = dA.annees ?? [];
      records = dR;
      etat = annees.length ? "ok" : "vide";
    } catch (err) {
      console.error("climat indisponible", err);
      etat = "erreur";
    }
  });

  $: moyenneReference = normales.length
    ? normales.reduce((s, m) => s + Number(m.tm), 0) / normales.length
    : null;

  $: seriesTm = [
    {
      nom: "Température moyenne annuelle",
      couleur: "var(--color-alerte)",
      points: annees.map((a) => ({ x: a.annee, y: a.tm === null || a.tm === undefined ? null : Number(a.tm) })),
    },
  ];
  $: barresRr = annees.map((a) => ({
    x: a.annee,
    valeur: a.rr === null || a.rr === undefined ? null : Number(a.rr),
  }));
</script>

<div class="meteo-climat">
  {#if etat === "chargement"}
    <p class="etat">Chargement des séries climatiques…</p>
  {:else if etat === "erreur"}
    <p class="etat">Données climatiques temporairement indisponibles.</p>
  {:else if etat === "vide"}
    <p class="etat">Aucune série climatique disponible pour le moment.</p>
  {:else}
    {#if periode}
      <h3>Diagramme climatique {periode.debut}–{periode.fin}</h3>
      <DiagrammeClimatique mois={normales} />
    {/if}

    <h3>Température moyenne annuelle depuis {annees[0]?.annee}</h3>
    <GrapheLignes
      series={seriesTm}
      formatX={(v) => String(v)}
      formatY={(v) => `${v}°`}
      ligneReference={moyenneReference !== null ? { valeur: moyenneReference, label: "Moyenne 1991-2020" } : null}
      hauteur={220}
    />

    <h3>Cumul de précipitations annuel</h3>
    <GrapheBarres
      barres={barresRr}
      couleur="var(--color-torrent)"
      formatX={(v) => String(v)}
      formatY={(v) => `${v} mm`}
      hauteur={180}
    />

    {#if records}
      <h3>Records observés (depuis 1950)</h3>
      <dl class="records">
        {#if records.tx_max}
          <div class="record">
            <dt>Température la plus élevée</dt>
            <dd>{Number(records.tx_max.valeur).toFixed(1)} °C<span>{formatDate(records.tx_max.date)}</span></dd>
          </div>
        {/if}
        {#if records.tn_min}
          <div class="record">
            <dt>Température la plus basse</dt>
            <dd>{Number(records.tn_min.valeur).toFixed(1)} °C<span>{formatDate(records.tn_min.date)}</span></dd>
          </div>
        {/if}
        {#if records.rr_max_1j}
          <div class="record">
            <dt>Précipitations en 24 h</dt>
            <dd>{Number(records.rr_max_1j.valeur).toFixed(0)} mm<span>{formatDate(records.rr_max_1j.date)}</span></dd>
          </div>
        {/if}
        {#if records.annee_plus_chaude}
          <div class="record">
            <dt>Année la plus chaude</dt>
            <dd>
              {records.annee_plus_chaude.annee}<span
                >{Number(records.annee_plus_chaude.tm).toFixed(1)} °C de moyenne</span
              >
            </dd>
          </div>
        {/if}
        {#if records.annee_plus_arrosee}
          <div class="record">
            <dt>Année la plus arrosée</dt>
            <dd>
              {records.annee_plus_arrosee.annee}<span
                >{Number(records.annee_plus_arrosee.rr).toFixed(0)} mm cumulés</span
              >
            </dd>
          </div>
        {/if}
      </dl>
    {/if}
  {/if}
</div>

<style>
  .meteo-climat {
    margin-top: 1rem;
  }
  .etat {
    color: var(--border);
    font-size: 0.9rem;
  }
  h3 {
    font-family: var(--font-display);
    font-size: 1rem;
    margin: 1.6rem 0 0.5rem;
  }
  h3:first-child {
    margin-top: 0;
  }
  .records {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.8rem;
    margin: 0;
  }
  .record {
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .record dt {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--border);
    margin: 0 0 0.3rem;
  }
  .record dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.15rem;
  }
  .record dd span {
    display: block;
    font-family: var(--font-body);
    font-size: 0.72rem;
    color: var(--border);
    margin-top: 0.15rem;
  }
</style>
