<script>
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  const dispatch = createEventDispatcher();

  const LABELS = { adresse: "Adresses", lieu: "Lieux", commune: "Communes" };
  const ORDRE = ["adresse", "lieu", "commune"];
  const DELAI_DEBOUNCE = 250;
  const LONGUEUR_MIN = 3;

  let q = "";
  let resultats = [];
  let ouvert = false;
  let chargement = false;
  let indexActif = -1;
  let racine;
  let minuteur;
  let controleur;

  $: parGroupe = ORDRE.map((type) => ({
    type,
    label: LABELS[type],
    items: resultats.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  $: plat = parGroupe.flatMap((g) => g.items);

  function onSaisie() {
    clearTimeout(minuteur);
    indexActif = -1;
    if (q.trim().length < LONGUEUR_MIN) {
      resultats = [];
      ouvert = false;
      chargement = false;
      controleur?.abort();
      return;
    }
    chargement = true;
    minuteur = setTimeout(rechercher, DELAI_DEBOUNCE);
  }

  async function rechercher() {
    controleur?.abort();
    controleur = new AbortController();
    const requete = q;
    try {
      const res = await fetch(`/api/recherche?q=${encodeURIComponent(requete)}`, {
        signal: controleur.signal,
      });
      const data = await res.json();
      if (requete !== q) return; // la saisie a changé entre-temps
      resultats = data.resultats ?? [];
      ouvert = true;
    } catch (err) {
      if (err.name !== "AbortError") console.error("recherche indisponible", err);
    } finally {
      chargement = false;
    }
  }

  function selectionner(r) {
    dispatch("selection", r);
    q = r.label;
    resultats = [];
    ouvert = false;
    indexActif = -1;
  }

  function onClavier(e) {
    if (e.key === "ArrowDown") {
      if (!ouvert || plat.length === 0) return;
      e.preventDefault();
      indexActif = Math.min(indexActif + 1, plat.length - 1);
    } else if (e.key === "ArrowUp") {
      if (!ouvert || plat.length === 0) return;
      e.preventDefault();
      indexActif = Math.max(indexActif - 1, 0);
    } else if (e.key === "Enter") {
      if (indexActif >= 0 && plat[indexActif]) {
        e.preventDefault();
        selectionner(plat[indexActif]);
      } else if (plat.length === 1) {
        e.preventDefault();
        selectionner(plat[0]);
      }
    } else if (e.key === "Escape") {
      if (ouvert) {
        e.preventDefault();
        ouvert = false;
        indexActif = -1;
      }
    }
  }

  function onClicExterieur(e) {
    if (racine && !racine.contains(e.target)) {
      ouvert = false;
    }
  }

  onMount(() => {
    document.addEventListener("mousedown", onClicExterieur);
  });

  onDestroy(() => {
    document.removeEventListener("mousedown", onClicExterieur);
    clearTimeout(minuteur);
    controleur?.abort();
  });
</script>

<div class="recherche" bind:this={racine}>
  <div class="champ">
    <svg class="icone-loupe" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
      <line x1="13" y1="13" x2="18" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <input
      type="text"
      role="combobox"
      aria-expanded={ouvert}
      aria-autocomplete="list"
      aria-controls="liste-recherche"
      aria-activedescendant={indexActif >= 0 ? `option-${indexActif}` : undefined}
      placeholder="Adresse, lieu, commune…"
      bind:value={q}
      on:input={onSaisie}
      on:keydown={onClavier}
      on:focus={() => {
        if (resultats.length) ouvert = true;
      }}
    />
    {#if chargement}
      <span class="spinner" aria-hidden="true"></span>
    {/if}
  </div>

  <ul class="resultats" id="liste-recherche" role="listbox" hidden={!ouvert}>
    {#if plat.length === 0 && !chargement}
      <li class="vide" role="presentation">Aucun résultat pour « {q} »</li>
    {/if}
    {#each parGroupe as groupe (groupe.type)}
      <li class="entete-groupe" role="presentation">{groupe.label}</li>
      {#each groupe.items as r (r.couche + r.label + r.lon)}
        {@const i = plat.indexOf(r)}
        <li role="presentation">
          <button
            type="button"
            id={`option-${i}`}
            role="option"
            aria-selected={indexActif === i}
            class:actif={indexActif === i}
            on:mousedown|preventDefault={() => selectionner(r)}
            on:mouseenter={() => (indexActif = i)}
          >
            <span class="label">{r.label}</span>
            {#if r.sousLabel}<span class="sous-label">{r.sousLabel}</span>{/if}
          </button>
        </li>
      {/each}
    {/each}
  </ul>
</div>

<style>
  .recherche {
    position: absolute;
    top: 0.6rem;
    left: 1rem;
    z-index: 5;
    width: min(20rem, 60vw);
  }

  .champ {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0 0.6rem;
    box-shadow: var(--shadow, 0 2px 10px rgba(0, 0, 0, 0.15));
  }

  .icone-loupe {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: var(--border);
  }

  .champ input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 0.5rem 0;
    font-family: var(--font-body);
    color: var(--fg);
  }

  .champ input:focus {
    outline: none;
  }

  .champ:has(input:focus) {
    border-color: var(--accent);
  }

  .spinner {
    width: 0.8rem;
    height: 0.8rem;
    flex-shrink: 0;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: tourner 0.7s linear infinite;
  }

  @keyframes tourner {
    to {
      transform: rotate(360deg);
    }
  }

  .resultats {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    right: 0;
    margin: 0;
    padding: 0.3rem;
    list-style: none;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-height: 18rem;
    overflow-y: auto;
    box-shadow: var(--shadow, 0 4px 14px rgba(0, 0, 0, 0.18));
  }

  .entete-groupe {
    padding: 0.35rem 0.5rem 0.15rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--border);
  }

  .resultats button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.5rem;
    border: none;
    border-radius: calc(var(--radius) - 1px);
    background: transparent;
    cursor: pointer;
    color: var(--fg);
    font-family: var(--font-body);
  }

  .resultats button:hover,
  .resultats button.actif {
    background: rgba(154, 155, 147, 0.22);
  }

  .label {
    font-size: 0.85rem;
  }

  .sous-label {
    font-size: 0.72rem;
    color: var(--border);
  }

  .vide {
    padding: 0.6rem 0.5rem;
    font-size: 0.8rem;
    color: var(--border);
  }

  @media (max-width: 720px) {
    .recherche {
      width: min(16rem, 65vw);
    }
  }
</style>
