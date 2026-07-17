"use strict";

/* ------------------------------------------------------------------ *
 * Socle commun (constantes, réseau, formatage, stats, cache, thème)
 * fourni par eau-commun.js — chargé avant ce script (voir tableau-de-bord.astro).
 * ------------------------------------------------------------------ */
const {
  CODE_STATION_RIVIERE,
  CODE_STATION_RIVIERE_VIGICRUES,
  CODE_BSS,
  STATIONS_FLEUVE,
  CODES_FLEUVE_VIGICRUES,
  SEUILS_SITUATION,
  NB_REFERENCE_MIN,
  COULEUR_SITUATION,
  fetchAllHubeau,
  fetchVigicrues,
  fetchAvecRetry,
  formaterDateCourte,
  formaterMois,
  formaterHeure,
  formaterJourMois,
  formaterNombre,
  formaterNiveauNappe,
  formaterProfondeur,
  formaterHauteur,
  percentile,
  calculerTendance,
  detecterEpisodes,
  lireCache,
  ecrireCache,
  appliquerTheme,
  toggleTheme,
  afficherBandeauSante,
  effacerBandeauSante,
} = window.EauCommun;

const CACHE_RIVIERE = "cache-vigicrues-riviere";
const CACHE_FLEUVE = "cache-vigicrues-fleuve";

// Chemin de base de la mini app (sert à résoudre ./data/ que la page soit /eau/ ou /eau).
const BASE_APP_SRC =
  typeof document !== "undefined" && document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : location.href;
const URL_BASE_APP = new URL(".", BASE_APP_SRC).href;

/* ------------------------------------------------------------------ *
 * Bloc 1 — Rivière
 * ------------------------------------------------------------------ */
const riviere = {
  mesures: [], // {x: ms, y: m, meta:{date}}
  graphe: null,
  fenetreJours: 30,
  episodes: [],
};

function dateDebutJours(jours) {
  const d = new Date(Date.now() - jours * 86400000);
  return d.toISOString().slice(0, 19);
}

function attacherPeriodeRiviere() {
  document.querySelectorAll("#riviere-periode button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#riviere-periode button").forEach((x) => x.classList.remove("actif"));
      b.classList.add("actif");
      riviere.fenetreJours = Number(b.dataset.jours);
      rendreRiviere(riviere.fenetreJours);
    });
  });
}

function afficherRiviere(etat, contenu) {
  etat.hidden = true;
  contenu.hidden = false;
  rendreCartoucheRiviere();
  detecterEtAfficherEpisodesRiviere();
  rendreRiviere(riviere.fenetreJours);
  attacherPeriodeRiviere();
}

// Valleraugue n'est pas télésuivie en direct : on utilise St-André-de-Majencoules
// (station la plus proche en aval) comme indicateur du haut Hérault via Vigicrues.
async function chargerRiviere() {
  const etat = document.getElementById("riviere-etat");
  const contenu = document.getElementById("riviere-contenu");
  try {
    const data = await fetchAvecRetry(() => fetchVigicrues(CODE_STATION_RIVIERE_VIGICRUES, "H"), 2);
    if (!data.length) throw new Error("aucune observation");

    riviere.mesures = data.map((o) => ({
      x: o.x,
      y: o.y, // déjà en m
      meta: { date: new Date(o.x).toISOString(), valeur: o.y },
    }));

    ecrireCache(CACHE_RIVIERE, riviere.mesures);
    afficherRiviere(etat, contenu);
  } catch (err) {
    console.error("rivière indisponible", err);
    const cache = lireCache(CACHE_RIVIERE);
    if (cache && cache.length) {
      riviere.mesures = cache;
      afficherRiviere(etat, contenu);
      const derniere = cache.filter((m) => m.y != null).slice(-1)[0];
      const dateTxt = derniere ? formaterDateCourte(derniere.meta.date) : "";
      afficherBandeauSante(`Rivière : dernières valeurs connues (${dateTxt}) — source live indisponible.`);
      return;
    }
    etat.textContent = "Données rivière temporairement indisponibles (Vigicrues injoignable).";
    etat.classList.add("erreur");
    contenu.hidden = true;
  }
}

function rendreCartoucheRiviere() {
  const ms = riviere.mesures.filter((m) => m.y != null);
  if (!ms.length) return;
  const derniere = ms[ms.length - 1];
  document.getElementById("riviere-hauteur").textContent = formaterHauteur(derniere.y);
  const tendance = calculerTendance(riviere.mesures, 3 * 3600000);
  document.getElementById("riviere-tendance").textContent = tendance;
  document.getElementById("riviere-tendance").className =
    "cartouche-tendance " + (tendance === "↗" ? "haut" : tendance === "↘" ? "bas" : "stable");
  document.getElementById("riviere-date").textContent =
    `le ${formaterDateCourte(derniere.meta.date)} à ${formaterHeure(derniere.meta.date)}`;
}

function detecterEtAfficherEpisodesRiviere() {
  const valeurs = riviere.mesures.map((m) => m.y).filter((v) => v != null);
  const seuil = percentile(valeurs, 90);
  riviere.episodes = detecterEpisodes(riviere.mesures, {
    seuil,
    fusionMs: 3600 * 1000,
    minDurMs: 2 * 3600 * 1000,
  });

  const bloc = document.getElementById("riviere-episodes");
  const liste = document.getElementById("riviere-list-episodes");
  if (!riviere.episodes.length) {
    bloc.hidden = true;
    return;
  }
  bloc.hidden = false;
  liste.innerHTML = "";
  riviere.episodes
    .slice()
    .sort((a, b) => b.pic.y - a.pic.y)
    .forEach((e, idx) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<button type="button" class="episode-lien">${formaterJourMois(e.pic.meta.date)} ` +
        `— pic ${formaterHauteur(e.pic.y)}</button>`;
      li.querySelector(".episode-lien").addEventListener("click", () => {
        const debut = e.debut - 6 * 3600000;
        const fin = e.fin + 6 * 3600000;
        riviere.graphe.afficher({
          points: riviere.mesures,
          fenetreX: [debut, fin],
          couleur: "var(--color-torrent)",
          yFormat: (v) => formaterNombre(v, 2) + " m",
          xFormat: (ms) => formaterJourMois(ms),
          tooltip: tooltipRiviere,
          annotations: [{ x: e.pic.x, y: e.pic.y, label: formaterJourMois(e.pic.meta.date) }],
        });
        document.getElementById("riviere-legende").textContent =
          `Zoom épisode · ${formaterDateCourte(e.debut)} → ${formaterDateCourte(e.fin)}`;
      });
      liste.appendChild(li);
    });
}

function tooltipRiviere(meta, valeur) {
  if (!meta) return "";
  return `<strong>${formaterHauteur(valeur)}</strong><br>${formaterDateCourte(meta.date)} ` +
    `à ${formaterHeure(meta.date)}`;
}

function rendreRiviere(jours) {
  if (!riviere.graphe) {
    riviere.graphe = window.Graphe.creer(document.getElementById("riviere-graphe"), {
      largeur: 720, hauteur: 300, axes: true, tooltip: tooltipRiviere,
    });
  }
  const fin = Date.now();
  const debut = fin - jours * 86400000;
  const annotations = riviere.episodes
    .filter((e) => e.pic.x >= debut && e.pic.x <= fin)
    .map((e) => ({ x: e.pic.x, y: e.pic.y, label: formaterJourMois(e.pic.meta.date) }));

  riviere.graphe.afficher({
    points: riviere.mesures,
    fenetreX: [debut, fin],
    couleur: "var(--color-torrent)",
    yFormat: (v) => formaterNombre(v, 2) + " m",
    xFormat: (ms) => formaterJourMois(ms),
    tooltip: tooltipRiviere,
    annotations,
  });

  document.getElementById("riviere-legende").textContent =
    `Hauteur (m) · ${jours} dernier${jours > 1 ? "s" : ""} jours · ${riviere.mesures.length} mesures`;
}

/* ------------------------------------------------------------------ *
 * Bloc 2 — Grandes crues passées (obs_elab QmnJ)
 * ------------------------------------------------------------------ */
const CACHE_CRUES = "cache-crues-valleraugue";

async function chargerCrues() {
  const etat = document.getElementById("crues-etat");
  const contenu = document.getElementById("crues-contenu");
  try {
    let data;
    const cache = lireCache(CACHE_CRUES);
    if (cache) {
      data = cache;
    } else {
      data = await fetchAllHubeau(
        `https://hubeau.eaufrance.fr/api/v2/hydrometrie/obs_elab?code_entite=${CODE_STATION_RIVIERE}` +
          `&grandeur_hydro_elab=QmnJ&sort=asc&size=1000`
      );
      ecrireCache(CACHE_CRUES, data);
    }
    if (!data.length) throw new Error("aucune donnée historique");

    const jours = data
      .map((o) => ({
        date: o.date_obs_elab,
        x: Date.parse(o.date_obs_elab),
        debit: o.resultat_obs_elab == null ? null : Number(o.resultat_obs_elab) / 1000, // l/s → m³/s
      }))
      .filter((j) => j.debit != null)
      .sort((a, b) => a.x - b.x);

    const episodes = grouperEpisodesCrues(jours);
    const top = episodes.sort((a, b) => b.picDebit - a.picDebit).slice(0, 8);

    etat.hidden = true;
    contenu.hidden = false;
    rendreSituationCourante(top);
    const liste = document.getElementById("crues-list");
    liste.innerHTML = "";
    top.forEach((ep) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="crue-date">${formaterDateCourte(ep.debut)}` +
        (ep.fin !== ep.debut ? ` – ${formaterDateCourte(ep.fin)}` : "") + `</span>` +
        `<span class="crue-debit">${formaterNombre(ep.picDebit, 1)} m³/s</span>` +
        `<span class="crue-detail">${ep.nbJours} j · pic le ${formaterJourMois(ep.picDate)}</span>`;
      liste.appendChild(li);
    });
  } catch (err) {
    console.error("crues historiques indisponibles", err);
    etat.textContent = "Historique des crues temporairement indisponible.";
    etat.classList.add("erreur");
    contenu.hidden = true;
  }
}

function grouperEpisodesCrues(jours) {
  const seuil = percentile(jours.map((j) => j.debit), 90);
  const episodes = [];
  let encours = null;
  for (let i = 0; i < jours.length; i++) {
    const j = jours[i];
    if (j.debit >= seuil) {
      if (!encours) {
        encours = { debut: j.date, fin: j.date, picDebit: j.debit, picDate: j.date, nbJours: 1 };
        episodes.push(encours);
      } else {
        const prec = jours[i - 1];
        const ecart = (j.x - prec.x) / 86400000;
        if (ecart <= 1.5) {
          encours.fin = j.date;
          encours.nbJours += 1;
          if (j.debit > encours.picDebit) {
            encours.picDebit = j.debit;
            encours.picDate = j.date;
          }
        } else {
          encours = { debut: j.date, fin: j.date, picDebit: j.debit, picDate: j.date, nbJours: 1 };
          episodes.push(encours);
        }
      }
    } else {
      encours = null;
    }
  }
  return episodes;
}

function rendreSituationCourante(top) {
  const zone = document.getElementById("crues-situation");
  if (!riviere.mesures.length) {
    zone.textContent = "Référence : les plus fortes crues journalières enregistrées à Valleraugue depuis 2008.";
    return;
  }
  const derniere = riviere.mesures.filter((m) => m.y != null).slice(-1)[0];
  if (!derniere) return;
  const seuilRef = percentile(top.map((e) => e.picDebit), 50);
  zone.textContent =
    `Hauteur actuelle ${formaterHauteur(derniere.y)}. À titre de comparaison, la médiane des pics des ` +
    `${top.length} plus fortes crues (depuis 2008) vaut ≈ ${formaterNombre(seuilRef, 0)} m³/s journaliers.`;
}

/* ------------------------------------------------------------------ *
 * Bloc 3 — Fleuve amont → aval
 * ------------------------------------------------------------------ */
function chargerFleuve() {
  const etat = document.getElementById("fleuve-etat");
  const contenu = document.getElementById("fleuve-contenu");
  const tuiles = document.getElementById("fleuve-tuiles");

  const grappes = STATIONS_FLEUVE.map((st) => ({
    st,
    el: creerTuile(st),
  }));
  tuiles.innerHTML = "";
  grappes.forEach((g) => tuiles.appendChild(g.el.racine));

  const cache = lireCache(CACHE_FLEUVE) || {};
  const promesses = STATIONS_FLEUVE.map((st) => {
    if (!CODES_FLEUVE_VIGICRUES.has(st.code)) {
      return Promise.resolve({ st, nonSuivie: true });
    }
    return fetchAvecRetry(() => fetchVigicrues(st.code, "H"), 2)
      .then((data) => ({ st, data }))
      .catch(() => ({ st, data: cache[st.code] || null, fallBack: true }));
  });

  Promise.allSettled(promesses).then((resultats) => {
    let ok = 0;
    const fallbacks = [];
    resultats.forEach((r) => {
      const { st, data, nonSuivie, fallBack } = r.value || {};
      const g = grappes.find((x) => x.st.code === st.code);
      if (nonSuivie) {
        g.el.nonSuivie();
        return;
      }
      if (!data || !data.length) {
        g.el.erreur();
        return;
      }
      ok++;
      if (fallBack) fallbacks.push(st.nom);
      const derniere = data[data.length - 1];
      g.el.remplir(formaterHauteur(derniere.y), calculerTendance(data, 3 * 3600000), data);
      cache[st.code] = data;
    });
    ecrireCache(CACHE_FLEUVE, cache);

    etat.hidden = true;
    contenu.hidden = false;
    if (fallbacks.length) {
      afficherBandeauSante(`Fleuve : dernières valeurs connues pour ${fallbacks.join(", ")} — source live indisponible.`);
    }
    if (ok === 0) {
      etat.hidden = false;
      etat.textContent = "Stations du fleuve temporairement indisponibles (Vigicrues injoignable).";
      etat.classList.add("erreur");
      contenu.hidden = true;
    }
  });
}

function creerTuile(st) {
  const racine = document.createElement("div");
  racine.className = "tuile-fleuve";
  racine.innerHTML = `<div class="tuile-tete"><span class="tuile-nom">${st.nom}</span>` +
    `<span class="tuile-valeur">—</span></div>` +
    `<div class="tuile-spark"></div>` +
    `<div class="tuile-tendance">—</div>`;
  const valeurEl = racine.querySelector(".tuile-valeur");
  const tendanceEl = racine.querySelector(".tuile-tendance");
  const sparkEl = racine.querySelector(".tuile-spark");
  let graphe = null;

  return {
    racine,
    remplir(valeurTxt, tendance, mesures) {
      valeurEl.textContent = valeurTxt;
      tendanceEl.textContent = "tendance 3 h " + tendance;
      tendanceEl.className = "tuile-tendance " + (tendance === "↗" ? "haut" : tendance === "↘" ? "bas" : "stable");
      if (!graphe) {
        graphe = window.Graphe.creer(sparkEl, {
          largeur: 220, hauteur: 56, axes: false, grille: false, epaisseur: 1.3,
        });
      }
      graphe.afficher({
        points: mesures,
        couleur: "var(--color-torrent)",
        remplissage: true,
        echelleYFixe: null,
      });
    },
    erreur() {
      valeurEl.textContent = "—";
      tendanceEl.textContent = "indisponible";
      tendanceEl.className = "tuile-tendance";
    },
    nonSuivie() {
      valeurEl.textContent = "—";
      tendanceEl.textContent = "non télésuivie";
      tendanceEl.className = "tuile-tendance neutre";
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bloc 4 — Nappe (reprise logique existante)
 * ------------------------------------------------------------------ */
async function chargerNappe() {
  const etat = document.getElementById("nappe-etat");
  const contenu = document.getElementById("nappe-contenu");
  try {
    const [reponseStation, historique, recentes] = await Promise.all([
      fetch(`https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/stations?code_bss=${encodeURIComponent(CODE_BSS)}&format=json`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      chargerHistoriqueLocal(),
      chargerDonneesNappeRecentes(),
    ]);

    const station = reponseStation.data && reponseStation.data[0];
    if (!station) throw new Error("station introuvable");

    document.getElementById("nappe-valeur-altitude").textContent =
      `${formaterNombre(station.altitude_station, 1)} m`;
    document.getElementById("nappe-altitude").hidden = false;

    const serie = filtrer13DerniersMois(dedupliquerEtTrier(
      historique.map((m) => ({ date: m.date_mesure, niveau_m_ngf: m.niveau_nappe_eau, profondeur_m: m.profondeur_nappe })),
      recentes.map((m) => ({ date: m.date_mesure, niveau_m_ngf: m.niveau_nappe_eau, profondeur_m: m.profondeur_nappe }))
    ));

    const stats = calculerStats(serie);
    if (!stats) throw new Error("aucune mesure exploitable");

    document.getElementById("nappe-niveau-actuel").textContent = formaterNiveauNappe(stats.derniere.niveau_m_ngf);
    if (stats.derniere.profondeur_m != null) {
      document.getElementById("nappe-profondeur").textContent = `(nappe à ${formaterProfondeur(stats.derniere.profondeur_m)})`;
      document.getElementById("nappe-profondeur").hidden = false;
    } else {
      document.getElementById("nappe-profondeur").hidden = true;
    }
    document.getElementById("nappe-date").textContent = `le ${formaterDateCourte(stats.derniere.date)}`;

    if (stats.situation) {
      document.getElementById("nappe-pastille").style.background = COULEUR_SITUATION[stats.situation.classe];
      document.getElementById("nappe-texte-situation").textContent =
        `niveau ${stats.situation.libelle} pour un mois de ${formaterMois(stats.derniere.date)}`;
      document.getElementById("nappe-bloc-situation").hidden = false;
    } else {
      document.getElementById("nappe-bloc-situation").hidden = true;
    }

    document.getElementById("nappe-minmax").textContent =
      `plus bas ${formaterNiveauNappe(stats.min.niveau_m_ngf)} (${formaterDateCourte(stats.min.date)}) · ` +
      `plus haut ${formaterNiveauNappe(stats.max.niveau_m_ngf)} (${formaterDateCourte(stats.max.date)})`;

    const pics = detecterPics(serie, 12);
    const blocPics = document.getElementById("nappe-pics");
    if (pics.length) {
      blocPics.innerHTML = pics.map((pic) => `<span class="pic">${formaterPic(pic)}</span>`).join(" · ");
      blocPics.hidden = false;
    } else {
      blocPics.hidden = true;
    }

    const graphe = window.Graphe.creer(document.getElementById("nappe-graphe"), {
      largeur: 720, hauteur: 300, axes: true, tooltip: tooltipNappe,
    });
    const points = serie
      .filter((m) => m.niveau_m_ngf != null)
      .map((m) => ({ x: Date.parse(m.date), y: Number(m.niveau_m_ngf), meta: { date: m.date, valeur: m.niveau_m_ngf } }));
    const annotations = pics.map((p) => ({
      x: Date.parse(p.date),
      y: Number(p.niveau_m_ngf),
      label: formaterJourMois(p.date),
    }));
    graphe.afficher({
      points,
      couleur: "var(--color-torrent)",
      yFormat: (v) => formaterNombre(v, 2) + " m",
      xFormat: (ms) => formaterJourMois(ms),
      tooltip: tooltipNappe,
      annotations,
    });

    document.getElementById("nappe-legende").textContent =
      `${formaterDateCourte(stats.debut)} → ${formaterDateCourte(stats.fin)} (${stats.nb.toLocaleString("fr-FR")} mesures)`;

    etat.hidden = true;
    contenu.hidden = false;
  } catch (err) {
    console.error("nappe indisponible", err);
    etat.textContent = "Données nappe temporairement indisponibles (Hub'Eau injoignable).";
    etat.classList.add("erreur");
    contenu.hidden = true;
  }
}

function tooltipNappe(meta, valeur) {
  if (!meta) return "";
  return `<strong>${formaterNiveauNappe(valeur)}</strong><br>${formaterDateCourte(meta.date)}`;
}

async function chargerHistoriqueLocal() {
  try {
    const r = await fetch(URL_BASE_APP + "data/historique-valleraugue.json");
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

function chargerDonneesNappeRecentes() {
  const dateDebut = getDate13MoisAvant();
  return fetchAllHubeau(
    `https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/chroniques?code_bss=${encodeURIComponent(CODE_BSS)}` +
      `&format=json&date_debut_mesure=${dateDebut}&size=5000`
  );
}

function dedupliquerEtTrier(a, b) {
  const map = new Map();
  for (const m of a.concat(b)) map.set(m.date, m);
  return Array.from(map.values()).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}
function getDate13MoisAvant() {
  const d = new Date();
  d.setMonth(d.getMonth() - 13);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function filtrer13DerniersMois(mesures) {
  const seuil = getDate13MoisAvant();
  return mesures.filter((m) => m.date >= seuil);
}

function calculerStats(mesures) {
  if (!mesures.length) return null;
  const valides = mesures
    .filter((m) => m.niveau_m_ngf != null)
    .map((m) => ({ date: m.date, niveau: Number(m.niveau_m_ngf), profondeur: m.profondeur_m == null ? null : Number(m.profondeur_m) }));
  if (!valides.length) return null;

  const derniereMesure = mesures[mesures.length - 1];
  const derniere = {
    date: derniereMesure.date,
    niveau_m_ngf: derniereMesure.niveau_m_ngf == null ? null : Number(derniereMesure.niveau_m_ngf),
    profondeur_m: derniereMesure.profondeur_m == null ? null : Number(derniereMesure.profondeur_m),
  };

  const min = valides.reduce((a, b) => (b.niveau < a.niveau ? b : a));
  const max = valides.reduce((a, b) => (b.niveau > a.niveau ? b : a));

  let situation = null;
  if (derniere.niveau_m_ngf != null) {
    const moisDerniere = derniere.date.slice(5, 7);
    const reference = valides.filter((m) => m.date.slice(5, 7) === moisDerniere);
    if (reference.length >= NB_REFERENCE_MIN) {
      const nbInferieurs = reference.filter((m) => m.niveau < derniere.niveau_m_ngf).length;
      const percentileVal = nbInferieurs / reference.length;
      const seuil = SEUILS_SITUATION.find((s) => percentileVal < s.max) || SEUILS_SITUATION[SEUILS_SITUATION.length - 1];
      situation = { classe: seuil.classe, libelle: seuil.libelle, percentile: percentileVal, nbReference: reference.length };
    }
  }

  return {
    derniere,
    min: { date: min.date, niveau_m_ngf: min.niveau },
    max: { date: max.date, niveau_m_ngf: max.niveau },
    nb: valides.length,
    debut: mesures[0].date,
    fin: derniereMesure.date,
    situation,
  };
}

function detecterPics(mesures, fenetre) {
  const valides = mesures
    .filter((m) => m.niveau_m_ngf != null)
    .map((m) => ({ date: m.date, niveau: Number(m.niveau_m_ngf) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (valides.length < 3) return [];
  const pics = [];
  const demi = Math.floor(fenetre / 2);
  for (let i = demi; i < valides.length - demi; i++) {
    const courant = valides[i].niveau;
    const gauche = valides.slice(Math.max(0, i - demi), i);
    const droite = valides.slice(i + 1, Math.min(valides.length, i + demi + 1));
    const maxGauche = Math.max.apply(null, gauche.map((m) => m.niveau));
    const maxDroite = Math.max.apply(null, droite.map((m) => m.niveau));
    if (courant > maxGauche && courant > maxDroite) {
      pics.push({ date: valides[i].date, niveau_m_ngf: courant });
    }
  }
  return pics;
}

function formaterPic(pic) {
  const d = new Date(pic.date);
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${heure} — ${formaterNiveauNappe(pic.niveau_m_ngf)}`;
}

/* ------------------------------------------------------------------ *
 * Démarrage
 * ------------------------------------------------------------------ */
document.getElementById("bouton-theme").addEventListener("click", toggleTheme);
appliquerTheme();

chargerRiviere();
chargerCrues();
chargerFleuve();
chargerNappe();

setInterval(() => {
  const h = document.getElementById("horodatage");
  if (h) h.textContent = `Actualisé à ${new Date().toLocaleTimeString("fr-FR")} — données en direct`;
}, 30000);
document.getElementById("horodatage").textContent =
  `Actualisé à ${new Date().toLocaleTimeString("fr-FR")} — données en direct`;
