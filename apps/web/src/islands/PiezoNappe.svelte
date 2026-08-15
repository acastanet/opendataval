<script>
  import { onMount } from "svelte";
  import GrapheLignes from "../components/graphes/GrapheLignes.svelte";
  import { decimerMinMax } from "../lib/graphe";

  let etat = "chargement"; // chargement | ok | vide | erreur
  let stations = [];
  let stationSelectionnee = null;
  let chronique = null; // { mesures, stats }
  let chargementChronique = false;

  const COULEUR_SITUATION = {
    tres_bas: "#b5533c",
    bas: "#c99a3e",
    modere: "var(--bordure)",
    haut: "#5c7a44",
    tres_haut: "#3e6e82",
  };

  function formaterDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  function formaterMois(iso) {
    return new Date(iso).toLocaleDateString("fr-FR", { month: "long" });
  }

  function formaterNiveau(v) {
    return v === null || v === undefined ? "—" : `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m NGF`;
  }

  // profondeur_nappe (Hub'Eau) peut être négative : la nappe est alors au-dessus du repère de
  // mesure (station en zone de source/artésienne), pas forcément « sous le sol ».
  function formaterProfondeur(v) {
    if (v === null || v === undefined) return "";
    const abs = Math.abs(Number(v)).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    return v < 0 ? `${abs} m au-dessus du repère` : `${abs} m sous le repère`;
  }

  async function chargerChronique(codeBss) {
    chargementChronique = true;
    try {
      const res = await fetch(`/api/piezo/chronique?code_bss=${encodeURIComponent(codeBss)}`);
      if (!res.ok) throw new Error("HTTP");
      chronique = await res.json();
    } catch (err) {
      console.error(`chronique piézo ${codeBss} indisponible`, err);
      chronique = null;
    } finally {
      chargementChronique = false;
    }
  }

  async function selectionnerStation(externalId) {
    stationSelectionnee = stations.find((s) => s.externalId === externalId) ?? null;
    if (stationSelectionnee) await chargerChronique(stationSelectionnee.externalId);
  }

  onMount(async () => {
    try {
      const res = await fetch("/api/couches/piezo/geojson");
      if (!res.ok) throw new Error("HTTP");
      const data = await res.json();
      stations = (data.features ?? []).map((f) => ({
        externalId: f.properties.external_id,
        nom: f.properties.nom,
        altitudeM: f.properties.altitude_m,
      }));
      if (stations.length === 0) {
        etat = "vide";
        return;
      }
      await selectionnerStation(stations[0].externalId);
      etat = "ok";
    } catch (err) {
      console.error("stations piézométriques indisponibles", err);
      etat = "erreur";
    }
  });

  $: mesuresValides = (chronique?.mesures ?? []).filter((m) => m.niveau_m_ngf !== null);

  $: medianeNiveau = (() => {
    if (mesuresValides.length === 0) return null;
    const tries = mesuresValides.map((m) => Number(m.niveau_m_ngf)).sort((a, b) => a - b);
    const milieu = Math.floor(tries.length / 2);
    return tries.length % 2 === 0 ? (tries[milieu - 1] + tries[milieu]) / 2 : tries[milieu];
  })();

  // x = année décimale (mois centré sur son 15e jour) pour projeter la chronique sur un axe temporel continu.
  $: pointsAnnuel = decimerMinMax(
    mesuresValides.map((m) => {
      const d = new Date(m.date);
      return { x: d.getFullYear() + (d.getMonth() + 0.5) / 12, y: Number(m.niveau_m_ngf) };
    }),
    700,
  );

  $: series = [{ nom: "Niveau de la nappe", couleur: "#3e6e82", points: pointsAnnuel }];

  $: ticksXAnnees = (() => {
    if (pointsAnnuel.length === 0) return null;
    const debut = Math.floor(pointsAnnuel[0].x);
    const fin = Math.ceil(pointsAnnuel[pointsAnnuel.length - 1].x);
    const pas = Math.max(2, Math.round((fin - debut) / 8 / 2) * 2);
    const result = [];
    for (let a = debut; a <= fin; a += pas) result.push(a);
    return result;
  })();
</script>

<div class="piezo-nappe">
  {#if etat === "chargement"}
    <p class="etat">Chargement des données piézométriques…</p>
  {:else if etat === "erreur"}
    <p class="etat">Données piézométriques temporairement indisponibles.</p>
  {:else if etat === "vide"}
    <p class="etat">Aucun piézomètre suivi sur le territoire pour le moment.</p>
  {:else}
    {#if stations.length > 1}
      <div class="selecteur-station">
        <label for="station-piezo">Station</label>
        <select id="station-piezo" on:change={(e) => selectionnerStation(e.currentTarget.value)}>
          {#each stations as s}
            <option value={s.externalId} selected={s.externalId === stationSelectionnee?.externalId}>{s.nom}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if chargementChronique}
      <p class="etat">Chargement de la chronique…</p>
    {:else if chronique?.stats}
      <p class="en-tete-station">
        {stationSelectionnee?.nom}
        {#if stationSelectionnee?.altitudeM}<span class="detail">— altitude station {stationSelectionnee.altitudeM} m</span>{/if}
      </p>

      <div class="cartouche">
        <p class="derniere-mesure">
          <strong>{formaterNiveau(chronique.stats.derniere.niveau_m_ngf)}</strong>
          {#if chronique.stats.derniere.profondeur_m !== null}
            <span class="detail">(nappe à {formaterProfondeur(chronique.stats.derniere.profondeur_m)})</span>
          {/if}
          <span class="detail">le {formaterDate(chronique.stats.derniere.date)}</span>
        </p>
        {#if chronique.stats.situation}
          <p class="situation">
            <span class="pastille-situation" style={`background:${COULEUR_SITUATION[chronique.stats.situation.classe]}`}></span>
            niveau {chronique.stats.situation.libelle} pour un mois de {formaterMois(chronique.stats.derniere.date)}
          </p>
        {/if}
        <p class="minmax">
          plus bas {formaterNiveau(chronique.stats.min.niveau_m_ngf)} le {formaterDate(chronique.stats.min.date)}<br />
          plus haut {formaterNiveau(chronique.stats.max.niveau_m_ngf)} le {formaterDate(chronique.stats.max.date)}
        </p>
        <p class="periode">
          Chronique du {formaterDate(chronique.stats.debut)} au {formaterDate(chronique.stats.fin)} ({chronique.stats.nb.toLocaleString(
            "fr-FR",
          )} mesures)
        </p>
      </div>

      <h4>Niveau de la nappe <span class="unite">(m NGF)</span></h4>
      <GrapheLignes
        {series}
        formatX={(v) => String(Math.round(v))}
        formatY={(v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
        ticksX={ticksXAnnees}
        ligneReference={medianeNiveau !== null ? { valeur: medianeNiveau, label: "médiane" } : null}
        hauteur={260}
      />
    {:else}
      <p class="etat">Aucune mesure disponible pour cette station.</p>
    {/if}
  {/if}
</div>

<style>
  .piezo-nappe {
    margin-top: 1rem;
  }

  .etat {
    color: var(--texte-tertiaire);
    font-size: 0.9rem;
  }

  .selecteur-station {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }

  .selecteur-station select {
    font-family: var(--font-body);
    font-size: 0.85rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--bordure);
    border-radius: var(--rayon);
    background: var(--surface-elevee);
    color: var(--texte-principal);
  }

  .en-tete-station {
    font-family: var(--font-display);
    font-size: 1.05rem;
    margin: 0 0 0.6rem;
  }

  .detail {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--texte-tertiaire);
  }

  .cartouche {
    padding: 0.8rem 1rem;
    border: 1px solid var(--bordure);
    border-radius: var(--rayon);
    font-size: 0.85rem;
    line-height: 1.6;
  }

  .cartouche p {
    margin: 0.2rem 0;
  }

  .situation {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .pastille-situation {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .minmax {
    color: var(--texte-tertiaire);
    font-size: 0.8rem;
  }

  .periode {
    margin-top: 0.5rem !important;
    padding-top: 0.5rem;
    border-top: 1px solid var(--bordure);
    color: var(--texte-tertiaire);
    font-size: 0.75rem;
  }

  h4 {
    font-family: var(--font-display);
    font-size: 0.95rem;
    margin: 1.4rem 0 0.5rem;
  }

  .unite {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--texte-tertiaire);
    font-weight: normal;
  }
</style>
