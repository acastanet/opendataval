"use strict";

/*
 * Socle commun aux deux pages « eau » (tableau de bord app.js + page didactique comprendre.js).
 * Regroupe les briques pures et sans état : accès réseau (Hub'Eau + proxy Vigicrues), formatage,
 * statistiques (percentile, tendance, détection d'épisodes), cache localStorage, constantes de
 * stations et le couple thème clair/sombre. Exposé via window.EauCommun (même pattern que window.Graphe).
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Constantes & stations
   * ------------------------------------------------------------------ */
  var CODE_STATION_RIVIERE = "Y200001002"; // Valleraugue (amont, non télésuivie en direct)
  var CODE_STATION_RIVIERE_VIGICRUES = "Y200002701"; // St-André-de-Majencoules (la + proche en aval)
  var CODE_BSS = "09364X0017/111111"; // piézomètre nappe Valleraugue

  // Stations de l'Hérault en service, ordonnées amont → aval (vérifiées 2026-07-13).
  // Valleraugue et Florensac ne sont pas télésuivies par Vigicrues (état « non télésuivie »).
  // lon/lat récupérés du référentiel Hub'Eau ; alt = altitude approchée (m) pour le profil pédagogique.
  var STATIONS_FLEUVE = [
    { code: "Y200001002", nom: "Valleraugue", lon: 3.653119, lat: 44.078963, alt: 350 },
    { code: "Y200002701", nom: "St-André-de-Majencoules", lon: 3.680813, lat: 44.014378, alt: 230 },
    { code: "Y210001001", nom: "Ganges", lon: 3.702161, lat: 43.932108, alt: 170 },
    { code: "Y210002001", nom: "Laroque", lon: 3.735832, lat: 43.915407, alt: 105 },
    { code: "Y214002001", nom: "St-Guilhem", lon: 3.599180, lat: 43.749189, alt: 75 },
    { code: "Y214001002", nom: "Gignac-Aval", lon: 3.534624, lat: 43.651523, alt: 45 },
    { code: "Y230002001", nom: "Aspiran", lon: 3.470101, lat: 43.570381, alt: 40 },
    { code: "Y233001002", nom: "Montagnac", lon: 3.444189, lat: 43.476127, alt: 18 },
    { code: "Y237001002", nom: "Florensac", lon: 3.446707, lat: 43.384050, alt: 10 },
    { code: "Y237002001", nom: "Agde", lon: 3.478336, lat: 43.326099, alt: 3 },
  ];
  var CODES_FLEUVE_VIGICRUES = new Set(
    STATIONS_FLEUVE.map(function (s) { return s.code; }).filter(function (c) {
      return c !== "Y200001002" && c !== "Y237001002";
    })
  );

  var SEUILS_SITUATION = [
    { max: 0.1, classe: "tres_bas", libelle: "très bas" },
    { max: 0.25, classe: "bas", libelle: "bas" },
    { max: 0.75, classe: "modere", libelle: "modéré" },
    { max: 0.9, classe: "haut", libelle: "haut" },
    { max: Infinity, classe: "tres_haut", libelle: "très haut" },
  ];
  var NB_REFERENCE_MIN = 24;

  var COULEUR_SITUATION = {
    tres_bas: "#b5533c",
    bas: "#c99a3e",
    modere: "var(--border)",
    haut: "#5c7a44",
    tres_haut: "#3e6e82",
  };

  /* ------------------------------------------------------------------ *
   * Utilitaires réseau — Hub'Eau (pagination via champ next)
   * ------------------------------------------------------------------ */
  async function fetchAllHubeau(url) {
    var resultats = [];
    var suivant = url;
    while (suivant) {
      var res = await fetch(suivant);
      if (!res.ok) throw new Error("Hub'Eau → HTTP " + res.status);
      var page = await res.json();
      resultats.push.apply(resultats, page.data || []);
      suivant = page.next;
    }
    return resultats;
  }

  /* ------------------------------------------------------------------ *
   * Utilitaires réseau — Vigicrues (repli live via proxy même origine)
   * ------------------------------------------------------------------ */
  async function fetchVigicrues(code, grandeur) {
    var res = await fetch(
      "/api/vigicrues/observations?code=" + encodeURIComponent(code) + "&grandeur=" + encodeURIComponent(grandeur)
    );
    if (!res.ok) throw new Error("proxy Vigicrues → HTTP " + res.status);
    var json = await res.json();
    if (!json || !json.Serie || !Array.isArray(json.Serie.ObssHydro)) {
      throw new Error("réponse Vigicrues inattendue");
    }
    return json.Serie.ObssHydro
      .map(function (o) {
        return {
          x: Number(o.DtObsHydro),
          y: o.ResObsHydro == null ? null : Number(o.ResObsHydro), // H en m, Q en m³/s (tel quel)
        };
      })
      .filter(function (m) { return m.x && m.y != null; })
      .sort(function (a, b) { return a.x - b.x; });
  }

  // Retry avec délai croissant (2 tentatives) pour amortir une panne transitoire.
  async function fetchAvecRetry(fn, tentatives) {
    tentatives = tentatives == null ? 2 : tentatives;
    var derniereErr;
    for (var i = 0; i <= tentatives; i++) {
      try {
        return await fn();
      } catch (e) {
        derniereErr = e;
        if (i < tentatives) await new Promise(function (r) { setTimeout(r, 1000 * (i + 1)); });
      }
    }
    throw derniereErr;
  }

  /* ------------------------------------------------------------------ *
   * Formatage
   * ------------------------------------------------------------------ */
  function formaterDateCourte(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }
  function formaterMois(iso) {
    return new Date(iso).toLocaleDateString("fr-FR", { month: "long" });
  }
  function formaterHeure(iso) {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function formaterJourMois(iso) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
  function formaterNombre(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return Number(v).toLocaleString("fr-FR", { maximumFractionDigits: digits == null ? 2 : digits });
  }
  function formaterNiveauNappe(v) {
    return v == null ? "—" : formaterNombre(v, 1) + " m NGF";
  }
  function formaterProfondeur(v) {
    if (v == null) return "";
    var abs = formaterNombre(Math.abs(Number(v)), 1);
    return v < 0 ? abs + " m au-dessus du repère" : abs + " m sous le repère";
  }
  function formaterHauteur(v) {
    return v == null ? "—" : formaterNombre(v, 2) + " m";
  }

  /* ------------------------------------------------------------------ *
   * Statistiques (fonctions pures)
   * ------------------------------------------------------------------ */
  function percentile(valeurs, p) {
    var tri = valeurs.slice().sort(function (a, b) { return a - b; });
    var idx = Math.min(tri.length - 1, Math.max(0, Math.floor((p / 100) * (tri.length - 1))));
    return tri[idx];
  }

  // Rang (0..1) d'une valeur dans une distribution : fraction des observations qui lui sont inférieures.
  function rangDansDistribution(valeurs, v) {
    if (!valeurs.length) return null;
    var nbInf = valeurs.filter(function (x) { return x < v; }).length;
    return nbInf / valeurs.length;
  }

  function calculerTendance(mesures, fenetreMs) {
    if (mesures.length < 2) return "→";
    var derniere = mesures[mesures.length - 1];
    if (derniere.y == null) return "→";
    var limite = derniere.x - fenetreMs;
    var ref = null;
    for (var i = mesures.length - 2; i >= 0; i--) {
      if (mesures[i].x >= limite) ref = mesures[i].y;
      else break;
    }
    if (ref == null || ref === 0) return "→";
    var delta = (derniere.y - ref) / Math.abs(ref);
    if (delta > 0.03) return "↗";
    if (delta < -0.03) return "↘";
    return "→";
  }

  function detecterEpisodes(mesures, options) {
    options = options || {};
    if (mesures.length < 3) return [];
    var valeurs = mesures.map(function (m) { return m.y == null ? null : m.y; }).filter(function (v) { return v != null; });
    if (valeurs.length === 0) return [];

    var seuil = options.seuil != null ? options.seuil : percentile(valeurs, options.percentile || 90);
    var fusionMs = options.fusionMs != null ? options.fusionMs : 3600 * 1000;
    var minDurMs = options.minDurMs != null ? options.minDurMs : 2 * 3600 * 1000;

    var bruts = [];
    var enCours = null;
    for (var i = 0; i < mesures.length; i++) {
      var m = mesures[i];
      var depasse = m.y != null && m.y >= seuil;
      if (depasse) {
        if (!enCours) {
          enCours = { debut: m.x, fin: m.x, pic: m, seuil: seuil, points: 1 };
          bruts.push(enCours);
        } else {
          enCours.fin = m.x;
          enCours.points += 1;
        }
        if (!enCours.pic || (m.y != null && m.y > enCours.pic.y)) enCours.pic = m;
      } else {
        enCours = null;
      }
    }

    var fusionnes = [];
    for (var j = 0; j < bruts.length; j++) {
      var ep = bruts[j];
      var prec = fusionnes[fusionnes.length - 1];
      if (prec && ep.debut - prec.fin <= fusionMs) {
        prec.fin = ep.fin;
        prec.points += ep.points;
        if (!prec.pic || (ep.pic.y != null && ep.pic.y > prec.pic.y)) prec.pic = ep.pic;
      } else {
        fusionnes.push(ep);
      }
    }

    return fusionnes.filter(function (e) { return e.fin - e.debut >= minDurMs && e.pic && e.pic.y != null; });
  }

  /* ------------------------------------------------------------------ *
   * Cache localStorage
   * ------------------------------------------------------------------ */
  function lireCache(cle) {
    try {
      var brut = localStorage.getItem(cle);
      if (!brut) return null;
      var obj = JSON.parse(brut);
      if (Date.now() - obj.ts > 7 * 86400000) return null;
      return obj.data;
    } catch (e) {
      return null;
    }
  }
  function ecrireCache(cle, data) {
    try {
      localStorage.setItem(cle, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {
      /* quota / indisponible : ignoré */
    }
  }

  /* ------------------------------------------------------------------ *
   * Thème clair/sombre (préférence partagée entre les deux pages)
   * ------------------------------------------------------------------ */
  function appliquerTheme() {
    var sombre = localStorage.getItem("theme-mini") === "sombre";
    document.documentElement.classList.toggle("dark", sombre);
    var btn = document.getElementById("bouton-theme");
    if (btn) btn.textContent = sombre ? "☀️ Clair" : "🌙 Sombre";
  }
  function toggleTheme() {
    var sombre = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", sombre);
    localStorage.setItem("theme-mini", sombre ? "sombre" : "clair");
    var btn = document.getElementById("bouton-theme");
    if (btn) btn.textContent = sombre ? "☀️ Clair" : "🌙 Sombre";
  }

  /* ------------------------------------------------------------------ *
   * Bandeau global de santé des sources live
   * ------------------------------------------------------------------ */
  var messagesSante = new Set();
  function afficherBandeauSante(msg) {
    messagesSante.add(msg);
    rendreBandeauSante();
  }
  function effacerBandeauSante(msg) {
    if (msg) messagesSante.delete(msg);
    rendreBandeauSante();
  }
  function rendreBandeauSante() {
    var bandeau = document.getElementById("bandeau-sante");
    if (!bandeau) {
      bandeau = document.createElement("div");
      bandeau.id = "bandeau-sante";
      bandeau.className = "bandeau-sante";
      bandeau.hidden = true;
      var main = document.querySelector("main.page") || document.querySelector("main");
      if (main) main.insertBefore(bandeau, main.firstChild);
    }
    if (!bandeau) return;
    if (!messagesSante.size) {
      bandeau.hidden = true;
      bandeau.innerHTML = "";
      return;
    }
    bandeau.hidden = false;
    bandeau.innerHTML =
      '<span class="bandeau-icone">⚠️</span> ' +
      Array.from(messagesSante).map(function (m) { return '<span class="bandeau-msg">' + m + "</span>"; }).join("");
  }

  /* ------------------------------------------------------------------ *
   * Export global
   * ------------------------------------------------------------------ */
  window.EauCommun = {
    // constantes
    CODE_STATION_RIVIERE: CODE_STATION_RIVIERE,
    CODE_STATION_RIVIERE_VIGICRUES: CODE_STATION_RIVIERE_VIGICRUES,
    CODE_BSS: CODE_BSS,
    STATIONS_FLEUVE: STATIONS_FLEUVE,
    CODES_FLEUVE_VIGICRUES: CODES_FLEUVE_VIGICRUES,
    SEUILS_SITUATION: SEUILS_SITUATION,
    NB_REFERENCE_MIN: NB_REFERENCE_MIN,
    COULEUR_SITUATION: COULEUR_SITUATION,
    // réseau
    fetchAllHubeau: fetchAllHubeau,
    fetchVigicrues: fetchVigicrues,
    fetchAvecRetry: fetchAvecRetry,
    // formatage
    formaterDateCourte: formaterDateCourte,
    formaterMois: formaterMois,
    formaterHeure: formaterHeure,
    formaterJourMois: formaterJourMois,
    formaterNombre: formaterNombre,
    formaterNiveauNappe: formaterNiveauNappe,
    formaterProfondeur: formaterProfondeur,
    formaterHauteur: formaterHauteur,
    // stats
    percentile: percentile,
    rangDansDistribution: rangDansDistribution,
    calculerTendance: calculerTendance,
    detecterEpisodes: detecterEpisodes,
    // cache
    lireCache: lireCache,
    ecrireCache: ecrireCache,
    // thème
    appliquerTheme: appliquerTheme,
    toggleTheme: toggleTheme,
    // bandeau santé
    afficherBandeauSante: afficherBandeauSante,
    effacerBandeauSante: effacerBandeauSante,
  };
})();
