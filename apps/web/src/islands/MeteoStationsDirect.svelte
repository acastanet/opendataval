<script>
  import { onMount } from "svelte";
  import GrapheLignes from "../components/graphes/GrapheLignes.svelte";

  // Trio à gradient d'altitude : sommet / crête intermédiaire / vallée, pour visualiser l'effet d'altitude.
  const TRIO_COMPARAISON = [
    { id: "30339001", nom: "Mont Aigoual (1 567 m)", couleur: "var(--color-alerte)" },
    { id: "30297001", nom: "Saint-Sauveur-Camprieu (1 107 m)", couleur: "var(--color-lichen)" },
    { id: "000UB", nom: "Valleraugue (400 m)", couleur: "var(--color-torrent)" },
  ];

  let etat = "chargement"; // chargement | ok | vide | erreur
  let stations = [];
  let seriesComparaison = [];

  function directionCardinale(deg) {
    if (deg === null || deg === undefined) return "–";
    const points = [
      "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
      "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
    ];
    return points[Math.round(deg / 22.5) % 16];
  }

  function formatHeure(iso) {
    if (!iso) return "–";
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  async function chargerComparaison() {
    const resultats = await Promise.allSettled(
      TRIO_COMPARAISON.map((s) => fetch(`/api/meteo/temps-reel?station=${s.id}`).then((r) => r.json())),
    );
    seriesComparaison = TRIO_COMPARAISON.map((s, i) => {
      const r = resultats[i];
      const historique = r.status === "fulfilled" ? (r.value.historique ?? []) : [];
      return {
        nom: s.nom,
        couleur: s.couleur,
        points: historique.map((h) => ({
          x: new Date(h.heure_utc).getTime(),
          y: h.t === null || h.t === undefined ? null : Number(h.t),
        })),
      };
    });
  }

  onMount(async () => {
    try {
      const res = await fetch("/api/meteo/stations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      stations = data.stations ?? [];
      etat = stations.length ? "ok" : "vide";
    } catch (err) {
      console.error("réseau de stations indisponible", err);
      etat = "erreur";
    }
    await chargerComparaison();
  });
</script>

<div class="stations-direct">
  {#if etat === "chargement"}
    <p class="etat">Chargement du réseau de stations…</p>
  {:else if etat === "erreur"}
    <p class="etat">Réseau de stations temporairement indisponible.</p>
  {:else if etat === "vide"}
    <p class="etat">Aucune station disponible pour le moment.</p>
  {:else}
    <div class="tableau-scroll">
      <table>
        <thead>
          <tr>
            <th>Station</th>
            <th>Altitude</th>
            <th>T</th>
            <th>Vent</th>
            <th>Rafale</th>
            <th>Pluie 1 h</th>
            <th>Relevé</th>
          </tr>
        </thead>
        <tbody>
          {#each stations as s}
            <tr>
              <td>
                {s.nom}
                <span class="badge" class:badge-infoclimat={s.reseau === "infoclimat"}>
                  {s.reseau === "meteofrance" ? "Météo-France" : "Infoclimat"}
                </span>
              </td>
              <td>{s.altitudeM} m</td>
              <td>{s.derniere?.t !== null && s.derniere?.t !== undefined ? `${Number(s.derniere.t).toFixed(1)} °C` : "–"}</td>
              <td>
                {s.derniere?.vent_kmh !== null && s.derniere?.vent_kmh !== undefined
                  ? `${Math.round(s.derniere.vent_kmh)} km/h ${directionCardinale(s.derniere.vent_dir)}`
                  : "–"}
              </td>
              <td>{s.derniere?.rafale_kmh !== null && s.derniere?.rafale_kmh !== undefined ? `${Math.round(s.derniere.rafale_kmh)} km/h` : "–"}</td>
              <td>{s.derniere?.pluie_1h_mm !== null && s.derniere?.pluie_1h_mm !== undefined ? `${Number(s.derniere.pluie_1h_mm).toFixed(1)} mm` : "–"}</td>
              <td>{formatHeure(s.derniere?.heure_utc)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note-licences">
      Sources : Météo-France (Licence Ouverte 2.0) et Infoclimat, réseau amateur StatIC (CC BY-NC 4.0,
      CC BY pour certaines stations).
    </p>

    {#if seriesComparaison.some((s) => s.points.length >= 3)}
      <div class="bloc-graphe">
        <h3>Effet d'altitude — température (48 h)</h3>
        <GrapheLignes
          series={seriesComparaison}
          formatX={(v) => new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
          formatY={(v) => `${v}°`}
          hauteur={220}
        />
      </div>
    {/if}
  {/if}
</div>

<style>
  .stations-direct {
    margin-top: 1rem;
  }
  .etat {
    color: var(--border);
    font-size: 0.9rem;
  }
  .tableau-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    min-width: 640px;
  }
  th,
  td {
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  th {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--border);
  }
  .badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.62rem;
    letter-spacing: 0.03em;
    color: var(--border);
    border: 1px solid var(--border);
  }
  .badge-infoclimat {
    color: var(--color-torrent);
    border-color: var(--color-torrent);
  }
  .note-licences {
    margin: 0.6rem 0 1.4rem;
    font-size: 0.74rem;
    color: var(--border);
  }
  .bloc-graphe h3 {
    font-family: var(--font-display);
    font-size: 0.95rem;
    margin: 0 0 0.4rem;
  }
</style>
