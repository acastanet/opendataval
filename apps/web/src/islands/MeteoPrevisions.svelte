<script>
  import { onMount } from "svelte";
  import GrapheLignes from "../components/graphes/GrapheLignes.svelte";
  import GrapheBarres from "../components/graphes/GrapheBarres.svelte";

  const CODES_WMO = {
    0: "Ciel clair",
    1: "Peu nuageux",
    2: "Partiellement nuageux",
    3: "Couvert",
    45: "Brouillard",
    48: "Brouillard givrant",
    51: "Bruine légère",
    53: "Bruine",
    55: "Bruine forte",
    61: "Pluie faible",
    63: "Pluie",
    65: "Pluie forte",
    66: "Pluie verglaçante",
    67: "Pluie verglaçante forte",
    71: "Neige faible",
    73: "Neige",
    75: "Neige forte",
    77: "Grains de neige",
    80: "Averses faibles",
    81: "Averses",
    82: "Averses violentes",
    85: "Averses de neige",
    86: "Averses de neige fortes",
    95: "Orage",
    96: "Orage avec grêle",
    99: "Orage violent avec grêle",
  };

  let etat = "chargement"; // chargement | ok | vide | erreur
  let jours = [];
  let heures = [];
  let perime = false;

  function libelleJour(iso) {
    const s = new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const arrondi = (v) => (v === null || v === undefined ? null : Math.round(v));

  onMount(async () => {
    try {
      const res = await fetch("/api/meteo/previsions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      perime = Boolean(data.perime);

      const d = data.daily ?? {};
      jours = (d.time ?? []).map((date, i) => ({
        date,
        code: d.weather_code?.[i],
        tMax: d.temperature_2m_max?.[i],
        tMin: d.temperature_2m_min?.[i],
        pluie: d.precipitation_sum?.[i],
        neige: d.snowfall_sum?.[i],
        rafale: d.wind_gusts_10m_max?.[i],
      }));

      const h = data.hourly ?? {};
      heures = (h.time ?? []).slice(0, 48).map((t, i) => ({
        t,
        temperature: h.temperature_2m?.[i],
        precipitation: h.precipitation?.[i],
      }));

      etat = jours.length ? "ok" : "vide";
    } catch (err) {
      console.error("prévisions indisponibles", err);
      etat = "erreur";
    }
  });

  $: seriesTemperature = [
    {
      nom: "Température",
      couleur: "var(--color-alerte)",
      points: heures.map((h) => ({ x: new Date(h.t).getTime(), y: h.temperature ?? null })),
    },
  ];
  $: barresPrecipitation = heures.map((h) => ({ x: new Date(h.t).getTime(), valeur: h.precipitation ?? null }));
</script>

<div class="meteo-previsions">
  {#if etat === "chargement"}
    <p class="etat">Chargement des prévisions…</p>
  {:else if etat === "erreur"}
    <p class="etat">Prévisions temporairement indisponibles.</p>
  {:else}
    {#if perime}
      <p class="avertissement">Dernières prévisions connues (service momentanément indisponible).</p>
    {/if}
    <div class="jours">
      {#each jours as j}
        <div class="jour">
          <p class="jour-date">{libelleJour(j.date)}</p>
          {#if j.tMax === null || j.tMax === undefined}
            <p class="jour-code">Prévision non disponible à cette échéance</p>
          {:else}
            <p class="jour-code">{CODES_WMO[j.code] ?? "–"}</p>
            <p class="jour-temp">{arrondi(j.tMax)}° / {arrondi(j.tMin)}°</p>
            {#if j.pluie}<p class="jour-detail">{j.pluie.toFixed(1)} mm</p>{/if}
            {#if j.neige}<p class="jour-detail">{j.neige.toFixed(0)} cm neige</p>{/if}
            {#if j.rafale}<p class="jour-detail">rafales {arrondi(j.rafale)} km/h</p>{/if}
          {/if}
        </div>
      {/each}
    </div>

    <div class="graphes">
      <div class="bloc-graphe">
        <h3>Température horaire (48 h)</h3>
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
          barres={barresPrecipitation}
          couleur="var(--color-torrent)"
          formatX={(v) => new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
          formatY={(v) => `${v} mm`}
          hauteur={140}
        />
      </div>
    </div>

    <p class="attribution">
      Prévisions Open-Meteo — modèles Météo-France, point du sommet (44,12° N / 3,58° E, 1 567 m).
    </p>
  {/if}
</div>

<style>
  .meteo-previsions {
    margin-top: 1rem;
  }
  .etat {
    color: var(--border);
    font-size: 0.9rem;
  }
  .avertissement {
    color: var(--color-alerte);
    font-size: 0.82rem;
    margin: 0 0 0.8rem;
  }
  .jours {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.6rem;
    margin: 0 0 1.4rem;
  }
  .jour {
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .jour-date {
    margin: 0 0 0.3rem;
    font-family: var(--font-display);
    font-size: 0.9rem;
  }
  .jour-code {
    margin: 0 0 0.4rem;
    font-size: 0.76rem;
    color: var(--border);
  }
  .jour-temp {
    margin: 0;
    font-size: 1rem;
  }
  .jour-detail {
    margin: 0.15rem 0 0;
    font-size: 0.72rem;
    color: var(--border);
  }
  .graphes {
    display: grid;
    gap: 1.4rem;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    margin-bottom: 0.6rem;
  }
  .bloc-graphe h3 {
    font-family: var(--font-display);
    font-size: 0.95rem;
    margin: 0 0 0.4rem;
  }
  .attribution {
    font-size: 0.72rem;
    color: var(--border);
  }
</style>
