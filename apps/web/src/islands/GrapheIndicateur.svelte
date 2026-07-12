<script>
  import { onMount } from "svelte";
  import { INDICATEURS_PAR_SLUG } from "@opendata-vda/shared/indicateurs";
  import GrapheLignes from "../components/graphes/GrapheLignes.svelte";
  import GrapheBarres from "../components/graphes/GrapheBarres.svelte";

  /** Slug d'un indicateur du registre (packages/shared/src/indicateurs.ts). */
  export let indicateur;
  /** Code territoire (INSEE commune ou code EPCI) ; omis = tous les territoires. */
  export let territoire = null;
  export let hauteur = 240;
  export let titre = null;

  const PALETTE = ["#3e6e82", "#6b4226", "#5c7a44", "#c99a3e", "#b5533c"];
  const def = INDICATEURS_PAR_SLUG.get(indicateur);

  let etat = "chargement"; // chargement | ok | vide | erreur
  let series = [];
  let barres = [];

  const formatY = (v) =>
    Number(v).toLocaleString("fr-FR", { maximumFractionDigits: def?.decimales ?? 0 });
  const formatX = (v) => String(v);

  onMount(async () => {
    if (!def) {
      etat = "erreur";
      return;
    }
    try {
      const params = new URLSearchParams();
      if (territoire) params.set("territoire", territoire);
      const res = await fetch(`/api/indicateurs/${indicateur}?${params}`);
      if (!res.ok) throw new Error("HTTP");
      const data = await res.json();
      const points = data.points ?? [];
      if (points.length === 0) {
        etat = "vide";
        return;
      }
      if (def.representation === "barres") {
        barres = points.map((p) => ({ x: p.periode, valeur: p.valeur === null ? null : Number(p.valeur) }));
      } else {
        // Une série par territoire (utile si `territoire` est omis).
        const parTerr = new Map();
        for (const p of points) {
          if (!parTerr.has(p.territoire)) parTerr.set(p.territoire, []);
          parTerr.get(p.territoire).push(p);
        }
        series = [...parTerr.entries()].map(([terr, pts], i) => ({
          nom: parTerr.size > 1 ? terr : def.libelle,
          couleur: PALETTE[i % PALETTE.length],
          points: pts.map((p) => ({ x: Number(p.periode), y: p.valeur === null ? null : Number(p.valeur) })),
        }));
      }
      etat = "ok";
    } catch (err) {
      console.error(`indicateur ${indicateur} indisponible`, err);
      etat = "erreur";
    }
  });
</script>

<figure class="graphe-indicateur">
  {#if titre || def}
    <figcaption>
      {titre ?? def?.libelle}
      {#if def?.unite}<span class="unite">({def.unite})</span>{/if}
    </figcaption>
  {/if}

  {#if etat === "chargement"}
    <p class="etat">Chargement…</p>
  {:else if etat === "erreur"}
    <p class="etat">Donnée temporairement indisponible.</p>
  {:else if etat === "vide"}
    <p class="etat">Aucune donnée disponible pour le moment.</p>
  {:else if def.representation === "barres"}
    <GrapheBarres {barres} couleur={PALETTE[0]} {formatX} {formatY} {hauteur} />
  {:else}
    <GrapheLignes {series} {formatX} {formatY} {hauteur} />
  {/if}
</figure>

<style>
  .graphe-indicateur {
    margin: 1rem 0 0;
  }

  figcaption {
    font-family: var(--font-display);
    font-size: 0.95rem;
    margin-bottom: 0.4rem;
  }

  .unite {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--border);
  }

  .etat {
    font-size: 0.85rem;
    color: var(--border);
    padding: 1.5rem 0;
    text-align: center;
  }
</style>
