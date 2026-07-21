<script>
  import { onMount, onDestroy } from "svelte";
  import { fly } from "svelte/transition";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { TERRITOIRE } from "@opendata-vda/shared/territoire";
  import RechercheLieux from "./RechercheLieux.svelte";
  import {
    BASEMAPS,
    GEOLOGIE_WMS,
    ajouterControleFondIgn,
    ajouterCoucheCarte,
    enregistrerProtocolePmtiles,
    activerRelief,
    desactiverRelief,
    reglerExagerationRelief,
  } from "../lib/carte";
  import { decimerMinMax } from "../lib/graphe";
  import { SECTIONS } from "@opendata-vda/shared/sections";
  import { COUCHES, COUCHES_PAR_SLUG, couchesDeSection, titrePopup, lignesPopup } from "@opendata-vda/shared/catalogue";

  // Groupes d'infrastructure fixes (couches non issues de couches.objets : contours servis par
  // /api/territoire, géologie en WMS). Les groupes thématiques, eux, sont dérivés de SECTIONS.
  const GROUPES_INFRA = [
    {
      id: "limites",
      titre: "Limites administratives",
      couleur: "#2b3238",
      couches: [
        { slug: "commune", libelle: "Commune" },
        { slug: "epci", libelle: "Intercommunalité (EPCI)" },
      ],
    },
    {
      id: "geologie",
      titre: "Géologie (BRGM)",
      couleur: "#6b4226",
      couches: [{ slug: "geologie", libelle: "Carte géologique 1/50 000" }],
    },
  ];

  /** Identifiants des layers MapLibre créés pour chaque couche (une couche peut avoir plusieurs layers). */
  const layerIdsParCouche = {};

  let mapContainer;
  let map;
  let pret = false;
  let panneauOuvert = true;
  let theme = "auto";
  let basemapActif = "photo";
  // Couches actuellement visibles (granularité par couche). État initial : descripteur `visibleParDefaut`.
  let visibles = new Set(COUCHES.filter((c) => c.visibleParDefaut).map((c) => c.slug));
  let ouvertsManuel = new Set(); // groupes explicitement dépliés par l'utilisateur
  let catalogue = [];
  let opaciteGeologie = 0.55;
  let relief3d = true;
  let exagerationRelief = 1.3;

  let popup = null; // { titre, lignes: [[label, valeur]], sourceUrl, serie, stats }
  let popupChargement = false;

  const COULEUR_SITUATION = {
    tres_bas: "#b5533c",
    bas: "#c99a3e",
    modere: "var(--border)",
    haut: "#5c7a44",
    tres_haut: "#3e6e82",
  };

  let marqueurRecherche = null;
  const ZOOM_PAR_TYPE = { adresse: 16, lieu: 15, commune: 13 };

  $: nbParCouche = Object.fromEntries(catalogue.map((c) => [c.couche, c.nb]));
  // Un groupe thématique par section ayant au moins une couche non vide en base.
  $: groupes = [
    ...GROUPES_INFRA,
    ...SECTIONS.map((s) => {
      const couches = couchesDeSection(s.slug)
        .filter((c) => (nbParCouche[c.slug] ?? 0) > 0)
        .map((c) => ({ slug: c.slug, libelle: c.libellePluriel, nb: nbParCouche[c.slug] }));
      return couches.length ? { id: `sec-${s.slug}`, titre: s.titre, couleur: s.couleur, couches } : null;
    }).filter((g) => g),
  ];
  // État d'affichage dérivé : dépend explicitement de `visibles`/`ouvertsManuel` pour que Svelte
  // réévalue interrupteurs de groupe et accordéons à chaque bascule (une fonction masquerait ces
  // dépendances au compilateur). Un groupe est déplié s'il a une couche active ou est ouvert manuellement.
  $: etatGroupes = groupes.map((g) => {
    const partiel = g.couches.some((c) => visibles.has(c.slug));
    return {
      ...g,
      tout: g.couches.every((c) => visibles.has(c.slug)),
      ouvert: partiel || ouvertsManuel.has(g.id),
      badge: g.couches.reduce((s, c) => s + (c.nb ?? 0), 0),
    };
  });

  function appliquerTheme(t) {
    theme = t;
    if (t === "auto") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = t;
    }
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* stockage indisponible, on ignore */
    }
  }

  function estCoucheVisible(slug) {
    return visibles.has(slug);
  }

  function definirVisibiliteCouche(slug, on) {
    if (on) visibles.add(slug);
    else visibles.delete(slug);
    const visibility = on ? "visible" : "none";
    for (const layerId of layerIdsParCouche[slug] ?? []) {
      if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }

  function basculerCouche(slug) {
    definirVisibiliteCouche(slug, !visibles.has(slug));
    visibles = new Set(visibles);
  }

  function basculerGroupe(g) {
    const tout = g.couches.every((c) => visibles.has(c.slug));
    for (const c of g.couches) definirVisibiliteCouche(c.slug, !tout);
    visibles = new Set(visibles);
  }

  function basculerOuvert(id) {
    if (ouvertsManuel.has(id)) ouvertsManuel.delete(id);
    else ouvertsManuel.add(id);
    ouvertsManuel = new Set(ouvertsManuel);
  }

  function changerOpaciteGeologie(v) {
    opaciteGeologie = v;
    if (map?.getLayer("geologie-layer")) {
      map.setPaintProperty("geologie-layer", "raster-opacity", v);
    }
  }

  function basculerRelief() {
    if (!map) return;
    relief3d = !relief3d;
    if (relief3d) {
      activerRelief(map, exagerationRelief);
      map.easeTo({ pitch: 60 });
    } else {
      desactiverRelief(map);
      map.easeTo({ pitch: 0 });
    }
  }

  function changerExagerationRelief(v) {
    exagerationRelief = v;
    if (map && relief3d) reglerExagerationRelief(map, v);
  }

  function changerBasemap(id) {
    basemapActif = id;
    for (const b of BASEMAPS) {
      const layerId = `basemap-${b.id}`;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", b.id === id ? "visible" : "none");
      }
    }
  }

  async function onClicFeature(couche, feature) {
    if (!feature) return;
    const props = feature.properties ?? {};
    const titre = titrePopup(couche, props);
    const lignes = lignesPopup(couche, props).map((l) => [l.libelle, l.valeur]);
    popup = { titre, lignes, sourceUrl: props.source_url, serie: null, stats: null };

    if (couche.chronique) {
      popupChargement = true;
      try {
        const cle = props[couche.chronique.cle];
        const res = await fetch(`${couche.chronique.endpoint}?code_bss=${encodeURIComponent(cle)}`);
        const data = await res.json();
        popup = { ...popup, serie: data.mesures ?? [], stats: data.stats ?? null };
      } catch (err) {
        console.error("chronique indisponible", err);
      } finally {
        popupChargement = false;
      }
    }
  }

  function fermerPopup() {
    popup = null;
  }

  function formaterDateCourte(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
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

  function serieVersChemin(serie, largeur, hauteur) {
    if (!serie || serie.length === 0) return "";
    const valides = serie
      .filter((p) => p.niveau_m_ngf !== null)
      .map((p) => ({ x: Date.parse(p.date), y: Number(p.niveau_m_ngf) }));
    const points = decimerMinMax(valides, 120);
    if (points.length < 2) return "";
    const xs = points.map((p) => p.x);
    const xMin = Math.min(...xs);
    const xSpan = Math.max(...xs) - xMin || 1;
    const valeurs = points.map((p) => p.y);
    const min = Math.min(...valeurs);
    const span = Math.max(...valeurs) - min || 1;
    return points
      .map((p, i) => {
        const x = ((p.x - xMin) / xSpan) * largeur;
        const y = hauteur - ((p.y - min) / span) * hauteur;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function onSelectionRecherche(e) {
    const r = e.detail;
    if (!map) return;
    map.flyTo({ center: [r.lon, r.lat], zoom: ZOOM_PAR_TYPE[r.type] ?? 14 });
    marqueurRecherche?.remove();
    marqueurRecherche = new maplibregl.Marker({ color: "#b5533c" }).setLngLat([r.lon, r.lat]).addTo(map);
  }

  onMount(async () => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored) appliquerTheme(stored);
    } catch {
      /* stockage indisponible, thème auto par défaut */
    }

    enregistrerProtocolePmtiles(maplibregl.addProtocol);

    map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {},
        layers: [],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [TERRITOIRE.montAigoual.lon, TERRITOIRE.montAigoual.lat],
      zoom: 11,
      pitch: 60,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");

    map.on("load", async () => {
      for (const b of BASEMAPS) {
        map.addSource(`basemap-${b.id}-src`, {
          type: "raster",
          tiles: [b.tiles],
          tileSize: 256,
          attribution: b.attribution,
        });
        map.addLayer({
          id: `basemap-${b.id}`,
          type: "raster",
          source: `basemap-${b.id}-src`,
          layout: { visibility: b.id === basemapActif ? "visible" : "none" },
        });
      }
      ajouterControleFondIgn(map, {
        planLayerId: "basemap-plan",
        photoLayerId: "basemap-photo",
        autresLayerIds: ["basemap-satellite"],
        actif: basemapActif,
        onChange: (fond) => { changerBasemap(fond); },
      });

      map.addSource("geologie-src", {
        type: "raster",
        tiles: [GEOLOGIE_WMS],
        tileSize: 256,
        attribution: "© BRGM",
      });
      map.addLayer({
        id: "geologie-layer",
        type: "raster",
        source: "geologie-src",
        paint: { "raster-opacity": opaciteGeologie },
        layout: { visibility: estCoucheVisible("geologie") ? "visible" : "none" },
      });
      layerIdsParCouche.geologie = ["geologie-layer"];

      try {
        const res = await fetch("/api/territoire");
        const data = await res.json();
        if (data.commune?.geometry) {
          map.addSource("commune-src", {
            type: "geojson",
            data: { type: "Feature", geometry: data.commune.geometry, properties: { nom: data.commune.nom, population: data.commune.population } },
            attribution: "IGN / INSEE (Etalab)",
          });
          map.addLayer({
            id: "commune-line",
            type: "line",
            source: "commune-src",
            paint: { "line-color": "#2b3238", "line-width": 2.5 },
            layout: { visibility: estCoucheVisible("commune") ? "visible" : "none" },
          });
          layerIdsParCouche.commune = ["commune-line"];
          map.on("click", "commune-line", () =>
            (popup = {
              titre: data.commune.nom,
              lignes: [
                ["population", `${data.commune.population} hab.`],
                ["code INSEE", data.commune.code_insee],
              ],
              sourceUrl: "https://geo.api.gouv.fr",
              serie: null,
            }),
          );
        }
        if (data.epci?.communes?.length) {
          map.addSource("epci-src", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: data.epci.communes.map((c) => ({
                type: "Feature",
                geometry: c.geometry,
                properties: { nom: c.nom, population: c.population, code_insee: c.code_insee },
              })),
            },
            attribution: "IGN / INSEE (Etalab)",
          });
          map.addLayer({
            id: "epci-line",
            type: "line",
            source: "epci-src",
            paint: { "line-color": "#9a9b93", "line-width": 1 },
            layout: { visibility: estCoucheVisible("epci") ? "visible" : "none" },
          });
          map.addLayer({
            id: "epci-fill",
            type: "fill",
            source: "epci-src",
            paint: { "fill-color": "#9a9b93", "fill-opacity": 0.001 },
            layout: { visibility: estCoucheVisible("epci") ? "visible" : "none" },
          });
          layerIdsParCouche.epci = ["epci-line", "epci-fill"];
          map.on("click", "epci-fill", (e) => {
            const p = e.features?.[0]?.properties;
            if (!p) return;
            popup = {
              titre: p.nom,
              lignes: [
                ["population", `${p.population} hab.`],
                ["code INSEE", p.code_insee],
              ],
              sourceUrl: "https://geo.api.gouv.fr",
              serie: null,
            };
          });
        }
      } catch (err) {
        console.error("territoire indisponible", err);
      }

      if (relief3d) activerRelief(map, exagerationRelief);

      try {
        const res = await fetch("/api/couches");
        const data = await res.json();
        catalogue = data.couches ?? [];
        // Résout chaque couche non vide via le descripteur ; polygones d'abord (sous les points).
        const couchesResolues = catalogue
          .filter((c) => c.nb > 0)
          .map((c) => COUCHES_PAR_SLUG.get(c.couche))
          .filter((c) => c)
          .sort((a, b) => (a.geometrie === b.geometrie ? 0 : a.geometrie === "polygone" ? -1 : 1));
        for (const couche of couchesResolues) {
          try {
            const gjRes = await fetch(`/api/couches/${couche.slug}/geojson`);
            const geojson = await gjRes.json();
            layerIdsParCouche[couche.slug] = ajouterCoucheCarte(
              map,
              couche,
              geojson,
              estCoucheVisible(couche.slug),
              (feature) => onClicFeature(couche, feature),
            );
          } catch (err) {
            console.error(`couche ${couche.slug} indisponible`, err);
          }
        }
      } catch (err) {
        console.error("catalogue des couches indisponible", err);
      }

      pret = true;
    });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<div class="explorateur">
  <div class="carte" bind:this={mapContainer}></div>

  <header class="entete">
    <div class="entete-texte">
      <h1>{TERRITOIRE.commune.nom}</h1>
      <p class="sous-titre">Explorateur de données ouvertes — {TERRITOIRE.epci.nomCourt}</p>
    </div>
  </header>

  <button
    class="bouton-theme"
    title="Changer de thème"
    on:click={() => appliquerTheme(theme === "dark" ? "light" : theme === "light" ? "auto" : "dark")}
  >
    {#if theme === "dark"}
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 11.5A6 6 0 1 1 8.5 5a5 5 0 0 0 6.5 6.5Z" fill="currentColor" /></svg>
    {:else if theme === "light"}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.4" fill="currentColor" />
        <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <line x1="10" y1="1.6" x2="10" y2="3.6" />
          <line x1="10" y1="16.4" x2="10" y2="18.4" />
          <line x1="1.6" y1="10" x2="3.6" y2="10" />
          <line x1="16.4" y1="10" x2="18.4" y2="10" />
          <line x1="4.3" y1="4.3" x2="5.7" y2="5.7" />
          <line x1="14.3" y1="14.3" x2="15.7" y2="15.7" />
          <line x1="4.3" y1="15.7" x2="5.7" y2="14.3" />
          <line x1="14.3" y1="5.7" x2="15.7" y2="4.3" />
        </g>
      </svg>
    {:else}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.3" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path d="M10 2.7a7.3 7.3 0 0 1 0 14.6Z" fill="currentColor" />
      </svg>
    {/if}
    <span class="sr-only">Thème : {theme}</span>
  </button>

  <RechercheLieux on:selection={onSelectionRecherche} />

  <button class="bouton-panneau" on:click={() => (panneauOuvert = !panneauOuvert)}>
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 2l7 4-7 4-7-4 7-4Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      <path d="M2 10l7 4 7-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      <path d="M2 13.5l7 4 7-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
    </svg>
    {panneauOuvert ? "Masquer les couches" : "Couches"}
  </button>

  <aside class="panneau" class:ouvert={panneauOuvert}>
    <button
      class="poignee"
      aria-label={panneauOuvert ? "Masquer les couches" : "Afficher les couches"}
      on:click={() => (panneauOuvert = !panneauOuvert)}
    ></button>
    <h2>Couches de données</h2>

    <div class="groupe-fonds" role="radiogroup" aria-label="Fond de carte">
      {#each BASEMAPS as b}
        <button
          type="button"
          role="radio"
          aria-checked={basemapActif === b.id}
          class:actif={basemapActif === b.id}
          on:click={() => changerBasemap(b.id)}
        >
          {b.label}
        </button>
      {/each}
    </div>

    <div class="ligne-groupe ligne-relief" on:click={basculerRelief}>
      <button
        type="button"
        class="interrupteur"
        class:actif={relief3d}
        role="switch"
        aria-checked={relief3d}
        aria-label="Afficher le relief en 3D"
        on:click|stopPropagation={basculerRelief}
      >
        <span class="poucet"></span>
      </button>
      <span class="nom-groupe">Relief 3D</span>
    </div>
    {#if relief3d}
      <div class="controle-opacite controle-relief">
        <label for="exageration-relief">Exagération</label>
        <input
          id="exageration-relief"
          type="range"
          min="1"
          max="2.5"
          step="0.1"
          value={exagerationRelief}
          on:input={(e) => changerExagerationRelief(Number(e.currentTarget.value))}
        />
      </div>
    {/if}

    <ul class="liste-groupes">
      {#each etatGroupes as g (g.id)}
        <li>
          <div class="ligne-groupe">
            <button
              type="button"
              class="interrupteur"
              class:actif={g.tout}
              role="switch"
              aria-checked={g.tout}
              aria-label={`Afficher tout : ${g.titre}`}
              on:click={() => basculerGroupe(g)}
            >
              <span class="poucet"></span>
            </button>
            <span class="pastille" style={`background:${g.couleur}`}></span>
            <button
              type="button"
              class="entete-groupe"
              aria-expanded={g.ouvert}
              on:click={() => basculerOuvert(g.id)}
            >
              <span class="nom-groupe">{g.titre}</span>
              {#if g.badge}
                <span class="badge">{g.badge}</span>
              {/if}
              <svg class="chevron" class:ouvert={g.ouvert} viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          {#if g.ouvert}
            <ul class="liste-couches">
              {#each g.couches as c (c.slug)}
                <li class="ligne-couche">
                  <button
                    type="button"
                    class="interrupteur"
                    class:actif={visibles.has(c.slug)}
                    role="switch"
                    aria-checked={visibles.has(c.slug)}
                    aria-label={`Afficher ${c.libelle}`}
                    on:click={() => basculerCouche(c.slug)}
                  >
                    <span class="poucet"></span>
                  </button>
                  <span class="nom-couche">{c.libelle}</span>
                  {#if c.nb}
                    <span class="badge">{c.nb}</span>
                  {/if}
                </li>
              {/each}
              {#if g.id === "geologie" && visibles.has("geologie")}
                <div class="controle-opacite">
                  <label for="opacite-geologie">Opacité</label>
                  <input
                    id="opacite-geologie"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={opaciteGeologie}
                    on:input={(e) => changerOpaciteGeologie(Number(e.currentTarget.value))}
                  />
                </div>
              {/if}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>

    <p class="note-panneau">
      Cliquez sur un élément de la carte pour voir le détail. Les données sont mises à jour
      automatiquement par un service interne (mensuel à quotidien selon la source).
    </p>
  </aside>

  {#if popup}
    <div class="fiche" role="dialog" aria-label={popup.titre} transition:fly={{ y: 16, duration: 180 }}>
      <button class="fermer" on:click={fermerPopup} aria-label="Fermer">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
      <h3>{popup.titre}</h3>
      {#if popupChargement}
        <p class="chargement">Chargement…</p>
      {/if}
      <dl>
        {#each popup.lignes as [label, valeur]}
          <dt>{label}</dt>
          <dd>{valeur}</dd>
        {/each}
      </dl>
      {#if popup.stats}
        <div class="stats-chronique">
          <p class="derniere-mesure">
            <strong>{formaterNiveau(popup.stats.derniere.niveau_m_ngf)}</strong>
            {#if popup.stats.derniere.profondeur_m !== null}
              <span class="detail">(nappe à {formaterProfondeur(popup.stats.derniere.profondeur_m)})</span>
            {/if}
            <span class="detail">le {formaterDateCourte(popup.stats.derniere.date)}</span>
          </p>
          {#if popup.stats.situation}
            <p class="situation">
              <span class="pastille-situation" style={`background:${COULEUR_SITUATION[popup.stats.situation.classe]}`}></span>
              niveau {popup.stats.situation.libelle} pour un mois de {formaterMois(popup.stats.derniere.date)}
            </p>
          {/if}
          <p class="minmax">
            plus bas {formaterNiveau(popup.stats.min.niveau_m_ngf)} ({formaterDateCourte(popup.stats.min.date)}) ·
            plus haut {formaterNiveau(popup.stats.max.niveau_m_ngf)} ({formaterDateCourte(popup.stats.max.date)})
          </p>
        </div>
      {/if}
      {#if popup.serie && popup.serie.length > 1}
        <svg viewBox="0 0 240 60" class="graphe" role="img" aria-label="Évolution du niveau de la nappe">
          <path d={serieVersChemin(popup.serie, 240, 60)} fill="none" stroke="var(--color-torrent)" stroke-width="1.5" />
        </svg>
        {#if popup.stats}
          <p class="legende-graphe">
            {formaterDateCourte(popup.stats.debut)} → {formaterDateCourte(popup.stats.fin)} ({popup.stats.nb} mesures)
          </p>
        {/if}
      {/if}
      {#if popup.sourceUrl}
        <a href={popup.sourceUrl} target="_blank" rel="noopener">Voir la source →</a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .explorateur {
    position: relative;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    font-family: var(--font-body);
  }

  .carte {
    position: absolute;
    inset: 0;
  }

  .entete {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    /* padding-left élargi pour dégager le chevron « retour accueil » flottant. */
    padding: 0.6rem 1rem 0.9rem 3.4rem;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), transparent);
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    background-image: var(--contour-rule);
    background-repeat: repeat-x;
    background-position: bottom;
    background-size: 64px 12px;
  }

  .entete-texte {
    min-width: 0;
  }

  .entete h1 {
    font-family: var(--font-display);
    font-size: 1.4rem;
    margin: 0;
    letter-spacing: 0.02em;
  }

  .sous-titre {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    opacity: 0.9;
  }

  .bouton-theme {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--panel-bg);
    color: var(--fg);
    box-shadow: var(--shadow);
    cursor: pointer;
  }

  .bouton-theme svg {
    width: 1.1rem;
    height: 1.1rem;
  }

  .bouton-theme:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .bouton-panneau {
    display: none;
  }

  .panneau {
    position: absolute;
    top: 3.6rem;
    left: 1rem;
    bottom: 1rem;
    width: 17rem;
    z-index: 4;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.9rem;
    overflow-y: auto;
    backdrop-filter: blur(2px);
    box-shadow: var(--shadow);
  }

  .panneau h2 {
    font-family: var(--font-display);
    font-size: 1rem;
    margin: 0 0 0.6rem;
  }

  .poignee {
    display: none;
  }

  .groupe-fonds {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 0.9rem;
  }

  .groupe-fonds button {
    flex: 1;
    padding: 0.45rem 0.3rem;
    border: none;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
    font-family: var(--font-body);
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .groupe-fonds button:last-child {
    border-right: none;
  }

  .groupe-fonds button.actif {
    background: var(--fg);
    color: var(--bg);
  }

  .groupe-fonds button:not(.actif):hover {
    background: rgba(154, 155, 147, 0.18);
  }

  .groupe-fonds button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .liste-groupes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    font-size: 0.9rem;
  }

  .ligne-groupe {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .entete-groupe {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--fg);
    font-family: var(--font-body);
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
  }

  .entete-groupe:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .nom-groupe {
    flex: 1;
  }

  .chevron {
    width: 0.7rem;
    height: 0.7rem;
    flex-shrink: 0;
    color: var(--border);
    transition: transform 150ms ease;
  }

  .chevron.ouvert {
    transform: rotate(180deg);
  }

  .liste-couches {
    list-style: none;
    margin: 0.35rem 0 0 2.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .ligne-couche {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
  }

  .nom-couche {
    flex: 1;
    min-width: 0;
  }

  .badge {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--border);
    background: rgba(154, 155, 147, 0.18);
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
  }

  .interrupteur {
    position: relative;
    flex-shrink: 0;
    width: 2rem;
    height: 1.15rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .interrupteur .poucet {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 50%;
    background: var(--border);
    transition: transform 150ms ease, background 150ms ease;
  }

  .interrupteur.actif {
    background: var(--accent);
    border-color: var(--accent);
  }

  .interrupteur.actif .poucet {
    background: var(--panel-bg);
    transform: translateX(0.85rem);
  }

  .interrupteur:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .pastille {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .ligne-relief {
    margin-bottom: 0.9rem;
    font-size: 0.9rem;
  }

  .controle-opacite {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.35rem 0 0 2.5rem;
    font-size: 0.7rem;
    color: var(--border);
  }

  .controle-relief {
    margin: -0.5rem 0 0.9rem 2.5rem;
  }

  .controle-opacite input[type="range"] {
    flex: 1;
    accent-color: var(--accent);
  }

  .note-panneau {
    margin-top: 0.9rem;
    font-size: 0.72rem;
    color: var(--border);
    line-height: 1.4;
  }

  .fiche {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    z-index: 6;
    width: 17rem;
    max-width: calc(100vw - 2rem);
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.9rem;
    font-size: 0.85rem;
    box-shadow: var(--shadow);
  }

  .fiche h3 {
    font-family: var(--font-display);
    margin: 0 0 0.5rem;
    padding-right: 1.2rem;
  }

  .fermer {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--fg);
  }

  .fermer svg {
    width: 0.85rem;
    height: 0.85rem;
  }

  .fermer:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .fiche dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.6rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .fiche dt {
    color: var(--border);
  }

  .fiche dd {
    margin: 0;
  }

  .stats-chronique {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
    font-size: 0.78rem;
    line-height: 1.5;
  }

  .stats-chronique p {
    margin: 0.15rem 0;
  }

  .detail {
    color: var(--border);
  }

  .situation {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .pastille-situation {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .minmax {
    color: var(--border);
    font-size: 0.72rem;
  }

  .graphe {
    width: 100%;
    height: auto;
    margin-top: 0.6rem;
  }

  .legende-graphe {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--border);
    margin: 0.2rem 0 0;
  }

  .fiche a {
    display: inline-block;
    margin-top: 0.5rem;
    font-size: 0.75rem;
  }

  .chargement {
    font-size: 0.75rem;
    color: var(--border);
  }

  @media (max-width: 720px) {
    .entete {
      padding-right: 3rem;
    }

    .bouton-panneau {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      position: absolute;
      left: 1rem;
      bottom: 1rem;
      z-index: 5;
      border: 1px solid var(--border);
      background: var(--panel-bg);
      color: var(--fg);
      border-radius: var(--radius);
      padding: 0.5rem 0.9rem;
      font-size: 0.85rem;
      box-shadow: var(--shadow);
    }

    .bouton-panneau svg {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
    }

    .panneau {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 45vh;
      border-radius: var(--radius) var(--radius) 0 0;
      border-bottom: none;
      transform: translateY(calc(100% - 2.5rem));
      transition: transform 200ms ease;
    }

    .panneau.ouvert {
      transform: translateY(0);
    }

    .poignee {
      display: block;
      width: 2.5rem;
      height: 0.3rem;
      padding: 0;
      border: none;
      border-radius: 999px;
      background: var(--border);
      margin: 0 auto 0.6rem;
      cursor: pointer;
    }

    .fiche {
      left: 1rem;
      right: 1rem;
      width: auto;
      bottom: 5rem;
    }
  }
</style>
