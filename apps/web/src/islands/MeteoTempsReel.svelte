<script>
  import { onMount } from "svelte";
  import GrapheLignes from "../components/graphes/GrapheLignes.svelte";
  import GrapheBarres from "../components/graphes/GrapheBarres.svelte";

  const STATION_DEFAUT = "30339001";

  let etat = "chargement"; // chargement | ok | vide | erreur
  let stations = [];
  let stationChoisie = STATION_DEFAUT;
  let station = null;
  let derniere = null;
  let historique = [];

  function directionCardinale(deg) {
    if (deg === null || deg === undefined) return "–";
    const points = [
      "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
      "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
    ];
    return points[Math.round(deg / 22.5) % 16];
  }

  function formatHeure(iso) {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  async function chargerStation(id) {
    etat = "chargement";
    try {
      const res = await fetch(`/api/meteo/temps-reel?station=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      station = data.station;
      derniere = data.derniere;
      historique = data.historique ?? [];
      etat = derniere ? "ok" : "vide";
    } catch (err) {
      console.error("temps-reel indisponible", err);
      etat = "erreur";
    }
  }

  onMount(async () => {
    try {
      const res = await fetch("/api/meteo/stations");
      if (res.ok) {
        const data = await res.json();
        stations = data.stations ?? [];
      }
    } catch (err) {
      console.error("liste des stations indisponible", err);
    }
    await chargerStation(stationChoisie);
  });

  function surChangementStation(e) {
    stationChoisie = e.target.value;
    chargerStation(stationChoisie);
  }

  $: stationsMeteoFrance = stations.filter((s) => s.reseau === "meteofrance");
  $: stationsInfoclimat = stations.filter((s) => s.reseau === "infoclimat");

  $: seriesTemperature = [
    {
      nom: "Température",
      couleur: "var(--alerte)",
      points: historique.map((h) => ({
        x: new Date(h.heure_utc).getTime(),
        y: h.t === null || h.t === undefined ? null : Number(h.t),
      })),
    },
  ];
  $: barresPluie = historique.map((h) => ({
    x: new Date(h.heure_utc).getTime(),
    valeur: h.pluie_1h_mm === null || h.pluie_1h_mm === undefined ? null : Number(h.pluie_1h_mm),
  }));
</script>

<div class="meteo-temps-reel">
  {#if stations.length > 1}
    <label class="selecteur-station">
      Station
      <select value={stationChoisie} on:change={surChangementStation}>
        {#if stationsMeteoFrance.length}
          <optgroup label="Météo-France">
            {#each stationsMeteoFrance as s}
              <option value={s.id}>{s.nom} ({s.altitudeM} m)</option>
            {/each}
          </optgroup>
        {/if}
        {#if stationsInfoclimat.length}
          <optgroup label="Infoclimat (stations amateurs)">
            {#each stationsInfoclimat as s}
              <option value={s.id}>{s.nom} ({s.altitudeM} m)</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </label>
  {/if}

  {#if etat === "chargement"}
    <p class="etat">Chargement des observations…</p>
  {:else if etat === "erreur"}
    <p class="etat">Observations temporairement indisponibles.</p>
  {:else if etat === "vide"}
    <p class="etat">Aucune observation disponible pour le moment.</p>
  {:else}
    <dl class="tuiles">
      <div class="tuile">
        <dt>Température</dt>
        <dd>{derniere.t !== null ? `${Number(derniere.t).toFixed(1)} °C` : "–"}</dd>
      </div>
      <div class="tuile">
        <dt>Vent moyen</dt>
        <dd>
          {derniere.vent_kmh !== null
            ? `${Math.round(derniere.vent_kmh)} km/h ${directionCardinale(derniere.vent_dir)}`
            : "–"}
        </dd>
      </div>
      <div class="tuile">
        <dt>Rafale</dt>
        <dd>{derniere.rafale_kmh !== null ? `${Math.round(derniere.rafale_kmh)} km/h` : "–"}</dd>
      </div>
      <div class="tuile">
        <dt>Humidité</dt>
        <dd>{derniere.humidite !== null ? `${derniere.humidite} %` : "–"}</dd>
      </div>
      <div class="tuile">
        <dt>Pression</dt>
        <dd>{derniere.pression_hpa !== null ? `${Math.round(derniere.pression_hpa)} hPa` : "–"}</dd>
      </div>
      <div class="tuile">
        <dt>Pluie (1 h)</dt>
        <dd>{derniere.pluie_1h_mm !== null ? `${Number(derniere.pluie_1h_mm).toFixed(1)} mm` : "–"}</dd>
      </div>
      {#if derniere.neige_cm}
        <div class="tuile">
          <dt>Neige au sol</dt>
          <dd>{Number(derniere.neige_cm).toFixed(0)} cm</dd>
        </div>
      {/if}
    </dl>
    <p class="horodatage">
      Relevé à {formatHeure(derniere.heure_utc)} — station {station.nom} ({station.altitudeM} m)
      {#if station.reseau === "infoclimat"}
        <span class="licence"> — Données Infoclimat, {station.licence}</span>
      {/if}
    </p>

    {#if historique.length >= 3}
      <div class="graphes">
        <div class="bloc-graphe">
          <h3>Température (48 h)</h3>
          <GrapheLignes
            series={seriesTemperature}
            formatX={(v) => new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
            formatY={(v) => `${v}°`}
            hauteur={200}
          />
        </div>
        <div class="bloc-graphe">
          <h3>Précipitations horaires (48 h)</h3>
          <GrapheBarres
            barres={barresPluie}
            couleur="var(--torrent)"
            formatX={(v) => new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
            formatY={(v) => `${v} mm`}
            hauteur={140}
          />
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .meteo-temps-reel {
    margin-top: 1rem;
  }
  .selecteur-station {
    display: block;
    font-size: 0.78rem;
    color: var(--texte-tertiaire);
    margin-bottom: 0.8rem;
  }
  .selecteur-station select {
    display: block;
    margin-top: 0.2rem;
    font-family: var(--font-body);
    font-size: 0.9rem;
    padding: 0.3rem 0.5rem;
    border-radius: var(--rayon);
    border: 1px solid var(--bordure);
    background: var(--surface-fond);
    color: inherit;
  }
  .etat {
    color: var(--texte-tertiaire);
    font-size: 0.9rem;
  }
  .tuiles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0;
    margin: 0 0 0.6rem;
  }
  .tuile {
    padding: 0 1.2rem;
    border-left: 1px solid var(--bordure);
  }
  .tuile:first-child {
    padding-left: 0;
    border-left: none;
  }
  .tuile dt {
    margin: 0 0 0.2rem;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--texte-tertiaire);
  }
  .tuile dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
  }
  .horodatage {
    margin: 0 0 1.2rem;
    font-size: 0.78rem;
    color: var(--texte-tertiaire);
  }
  .licence {
    font-style: italic;
  }
  .graphes {
    display: grid;
    gap: 1.4rem;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
  .bloc-graphe h3 {
    font-family: var(--font-display);
    font-size: 0.95rem;
    margin: 0 0 0.4rem;
  }
</style>
