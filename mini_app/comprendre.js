"use strict";

/*
 * comprendre.js — logique de la page didactique « Le voyage de l'eau ».
 * Consomme window.EauCommun (réseau, formatage, stats, cache, thème, bandeau santé) et
 * window.Graphe (graphes SVG). Remplit les données live et les schémas dynamiques :
 *   - chapitre 2 (torrent) : hauteur live + phrase de synthèse + jauge + graphe 30 j
 *   - chapitre 3 (fleuve)  : profil altitudinal (hauteur/tendance par station)
 *   - chapitre 4 (crues)   : frise des plus fortes crues
 *   - chapitre 5 (nappe)   : niveau live projeté dans la coupe SVG + graphe 13 mois
 */
(function () {
  "use strict";

  var C = window.EauCommun;
  var Graphe = window.Graphe;

  // Base pour résoudre ./data/ (page servie à /eau/, script à /eau/comprendre.js).
  var BASE_SRC =
    typeof document !== "undefined" && document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : location.href;
  var URL_BASE = new URL(".", BASE_SRC).href;

  var CACHE_TORRENT = "cache-comprendre-torrent";
  var CACHE_CRUES = "cache-crues-valleraugue"; // partagé avec le tableau de bord
  var CACHE_FLEUVE = "cache-vigicrues-fleuve"; // partagé avec le tableau de bord

  /* ============================================================ *
   * Chapitre 2 — Le torrent (rivière live)
   * ============================================================ */
  function qualifierRang(r) {
    if (r < 0.15) return { mot: "très bas", ton: "bas" };
    if (r < 0.35) return { mot: "plutôt bas", ton: "bas" };
    if (r < 0.65) return { mot: "habituel", ton: "stable" };
    if (r < 0.85) return { mot: "plutôt haut", ton: "haut" };
    return { mot: "très haut", ton: "haut" };
  }

  function afficherTorrent(mesures) {
    var valides = mesures.filter(function (m) { return m.y != null; });
    if (!valides.length) throw new Error("aucune mesure");
    var derniere = valides[valides.length - 1];

    document.getElementById("torrent-etat").hidden = true;
    document.getElementById("torrent-live").hidden = false;

    document.getElementById("torrent-valeur").textContent = C.formaterHauteur(derniere.y);
    var tendance = C.calculerTendance(mesures, 3 * 3600000);
    var tEl = document.getElementById("torrent-tendance");
    tEl.textContent = tendance;
    tEl.className = "mesure-tendance " + (tendance === "↗" ? "haut" : tendance === "↘" ? "bas" : "stable");
    document.getElementById("torrent-meta").textContent =
      "St-André-de-Majencoules · le " + C.formaterDateCourte(derniere.meta.date) + " à " + C.formaterHeure(derniere.meta.date);

    // Phrase de synthèse + jauge : position dans la distribution récente.
    var valeurs = valides.map(function (m) { return m.y; });
    var rang = C.rangDansDistribution(valeurs, derniere.y);
    if (rang != null) {
      var q = qualifierRang(rang);
      document.getElementById("torrent-synthese").innerHTML =
        "En ce moment, l'Hérault est à <strong>" + C.formaterHauteur(derniere.y) +
        "</strong> : un niveau <strong>" + q.mot + "</strong> au regard de ces dernières semaines.";
      var jauge = document.getElementById("torrent-jauge");
      jauge.hidden = false;
      document.getElementById("jauge-curseur").style.left = Math.round(rang * 100) + "%";
    }

    // Graphe 30 j.
    var graphe = Graphe.creer(document.getElementById("torrent-graphe"), {
      largeur: 720, hauteur: 280, axes: true, tooltip: tooltipTorrent,
    });
    var fin = Date.now();
    var debut = fin - 30 * 86400000;
    graphe.afficher({
      points: mesures,
      fenetreX: [debut, fin],
      couleur: "var(--color-torrent)",
      yFormat: function (v) { return C.formaterNombre(v, 2) + " m"; },
      xFormat: function (ms) { return C.formaterJourMois(ms); },
      tooltip: tooltipTorrent,
    });
    document.getElementById("torrent-legende").textContent =
      "Hauteur d'eau (m) · 30 derniers jours · " + mesures.length + " mesures";
  }

  function tooltipTorrent(meta, valeur) {
    if (!meta) return "";
    return "<strong>" + C.formaterHauteur(valeur) + "</strong><br>" +
      C.formaterDateCourte(meta.date) + " à " + C.formaterHeure(meta.date);
  }

  async function chargerTorrent() {
    var etat = document.getElementById("torrent-etat");
    try {
      var data = await C.fetchAvecRetry(function () {
        return C.fetchVigicrues(C.CODE_STATION_RIVIERE_VIGICRUES, "H");
      }, 2);
      if (!data.length) throw new Error("aucune observation");
      var mesures = data.map(function (o) {
        return { x: o.x, y: o.y, meta: { date: new Date(o.x).toISOString(), valeur: o.y } };
      });
      C.ecrireCache(CACHE_TORRENT, mesures);
      afficherTorrent(mesures);
    } catch (err) {
      console.error("torrent indisponible", err);
      var cache = C.lireCache(CACHE_TORRENT);
      if (cache && cache.length) {
        afficherTorrent(cache);
        var d = cache.filter(function (m) { return m.y != null; }).slice(-1)[0];
        C.afficherBandeauSante("Rivière : dernières valeurs connues (" +
          (d ? C.formaterDateCourte(d.meta.date) : "") + ") — source live indisponible.");
        return;
      }
      etat.textContent = "Données rivière temporairement indisponibles (Vigicrues injoignable).";
      etat.classList.add("erreur");
    }
  }

  /* ============================================================ *
   * Chapitre 3 — La descente : profil altitudinal
   * ============================================================ */
  function chargerProfil() {
    var etat = document.getElementById("profil-etat");
    var cont = document.getElementById("profil-cont");
    var cache = C.lireCache(CACHE_FLEUVE) || {};

    var promesses = C.STATIONS_FLEUVE.map(function (st) {
      if (!C.CODES_FLEUVE_VIGICRUES.has(st.code)) {
        return Promise.resolve({ st: st, nonSuivie: true });
      }
      return C.fetchAvecRetry(function () { return C.fetchVigicrues(st.code, "H"); }, 2)
        .then(function (data) { return { st: st, data: data }; })
        .catch(function () { return { st: st, data: cache[st.code] || null, fallBack: true }; });
    });

    Promise.allSettled(promesses).then(function (resultats) {
      var lignes = C.STATIONS_FLEUVE.map(function (st) {
        var r = resultats.find(function (x) { return x.value && x.value.st.code === st.code; });
        var v = r ? r.value : {};
        if (v.nonSuivie) return { st: st, nonSuivie: true };
        if (!v.data || !v.data.length) return { st: st, erreur: true };
        cache[st.code] = v.data;
        var derniere = v.data[v.data.length - 1];
        return { st: st, hauteur: derniere.y, tendance: C.calculerTendance(v.data, 3 * 3600000) };
      });
      C.ecrireCache(CACHE_FLEUVE, cache);
      construireProfil(cont, lignes);
      etat.hidden = true;
    }).catch(function (err) {
      console.error("profil indisponible", err);
      etat.textContent = "Profil du fleuve temporairement indisponible.";
      etat.classList.add("erreur");
    });
  }

  function construireProfil(cont, lignes) {
    var L = 720, H = 320;
    var margL = 24, margR = 20, yTop = 46, yBottom = 200;
    var n = lignes.length;
    var altMax = Math.max.apply(null, C.STATIONS_FLEUVE.map(function (s) { return s.alt; }));
    var W = L - margL - margR;

    function xAt(i) { return margL + (n === 1 ? W / 2 : (i * W) / (n - 1)); }
    function yAlt(alt) { return yBottom - (alt / altMax) * (yBottom - yTop); }

    var pts = lignes.map(function (l, i) { return { x: xAt(i), y: yAlt(l.st.alt), l: l }; });

    var svg = '<svg class="graphe-svg" viewBox="0 0 ' + L + " " + H +
      '" preserveAspectRatio="none" role="img" aria-label="Profil altitudinal de l\'Hérault avec la hauteur d\'eau du moment par station.">';

    // sol (aire sous la ligne de crête des stations)
    var d = "M" + pts[0].x + "," + pts[0].y;
    for (var i = 1; i < pts.length; i++) d += " L" + pts[i].x + "," + pts[i].y;
    var aire = d + " L" + pts[pts.length - 1].x + "," + yBottom + " L" + pts[0].x + "," + yBottom + " Z";
    svg += '<path class="profil-sol" d="' + aire + '" />';
    svg += '<path class="profil-ligne" d="' + d + '" />';

    // ligne de niveau de la mer
    svg += '<line x1="' + margL + '" y1="' + yBottom + '" x2="' + (L - margR) + '" y2="' + yBottom +
      '" stroke="var(--color-mer)" stroke-width="1" stroke-dasharray="4 3" opacity="0.7" />';
    svg += '<text class="profil-station-label" x="' + (L - margR) + '" y="' + (yBottom + 14) +
      '" text-anchor="end">niveau de la mer</text>';

    // points + valeurs + noms
    pts.forEach(function (p) {
      var cls = "profil-point" + (p.l.nonSuivie || p.l.erreur ? " non-suivie" : "");
      svg += '<circle class="' + cls + '" cx="' + p.x + '" cy="' + p.y + '" r="4" />';
      // valeur live au-dessus du point
      if (p.l.hauteur != null) {
        var fleche = p.l.tendance || "";
        svg += '<text class="profil-station-val" x="' + p.x + '" y="' + (p.y - 9) +
          '" text-anchor="middle">' + C.formaterNombre(p.l.hauteur, 2) + " m " + fleche + "</text>";
      } else {
        svg += '<text class="profil-station-val" x="' + p.x + '" y="' + (p.y - 9) +
          '" text-anchor="middle" opacity="0.6">—</text>';
      }
      // nom station (incliné pour éviter les chevauchements)
      svg += '<text class="profil-station-label" transform="translate(' + p.x + "," + (yBottom + 24) +
        ') rotate(-38)" text-anchor="end">' + p.l.st.nom + "</text>";
    });

    svg += "</svg>";
    cont.innerHTML = svg;
  }

  /* ============================================================ *
   * Chapitre 4 — Mémoire des crues (frise)
   * ============================================================ */
  function grouperEpisodesCrues(jours) {
    var seuil = C.percentile(jours.map(function (j) { return j.debit; }), 90);
    var episodes = [];
    var enc = null;
    for (var i = 0; i < jours.length; i++) {
      var j = jours[i];
      if (j.debit >= seuil) {
        if (!enc) {
          enc = { debut: j.date, fin: j.date, picDebit: j.debit, picDate: j.date, nbJours: 1 };
          episodes.push(enc);
        } else {
          var ecart = (j.x - jours[i - 1].x) / 86400000;
          if (ecart <= 1.5) {
            enc.fin = j.date;
            enc.nbJours += 1;
            if (j.debit > enc.picDebit) { enc.picDebit = j.debit; enc.picDate = j.date; }
          } else {
            enc = { debut: j.date, fin: j.date, picDebit: j.debit, picDate: j.date, nbJours: 1 };
            episodes.push(enc);
          }
        }
      } else {
        enc = null;
      }
    }
    return episodes;
  }

  async function chargerCrues() {
    var etat = document.getElementById("crues-etat");
    var frise = document.getElementById("crues-frise");
    try {
      var data = C.lireCache(CACHE_CRUES);
      if (!data) {
        data = await C.fetchAllHubeau(
          "https://hubeau.eaufrance.fr/api/v2/hydrometrie/obs_elab?code_entite=" + C.CODE_STATION_RIVIERE +
          "&grandeur_hydro_elab=QmnJ&sort=asc&size=1000"
        );
        C.ecrireCache(CACHE_CRUES, data);
      }
      if (!data.length) throw new Error("aucune donnée historique");

      var jours = data
        .map(function (o) {
          return {
            date: o.date_obs_elab,
            x: Date.parse(o.date_obs_elab),
            debit: o.resultat_obs_elab == null ? null : Number(o.resultat_obs_elab) / 1000, // l/s → m³/s
          };
        })
        .filter(function (j) { return j.debit != null; })
        .sort(function (a, b) { return a.x - b.x; });

      var episodes = grouperEpisodesCrues(jours).sort(function (a, b) { return b.picDebit - a.picDebit; }).slice(0, 7);
      if (!episodes.length) throw new Error("aucun épisode");
      var maxPic = episodes[0].picDebit;

      frise.innerHTML = "";
      episodes.forEach(function (ep) {
        var largeur = Math.max(4, Math.round((ep.picDebit / maxPic) * 100));
        var ligne = document.createElement("div");
        ligne.className = "frise-ligne";
        ligne.innerHTML =
          '<span class="frise-date">' + C.formaterDateCourte(ep.picDate) + "</span>" +
          '<span class="frise-barre-fond"><span class="frise-barre" style="width:0%"></span></span>' +
          '<span class="frise-debit">' + C.formaterNombre(ep.picDebit, 0) + " m³/s</span>";
        frise.appendChild(ligne);
        // animation de remplissage au prochain frame
        requestAnimationFrame(function () {
          ligne.querySelector(".frise-barre").style.width = largeur + "%";
        });
      });

      var recordLitres = C.formaterNombre(maxPic * 1000, 0);
      document.getElementById("crues-equivalence").textContent =
        "Record depuis 2008 : " + C.formaterNombre(maxPic, 0) + " m³/s le " +
        C.formaterDateCourte(episodes[0].picDate) + " — soit " + recordLitres + " litres qui passent chaque seconde.";

      etat.hidden = true;
    } catch (err) {
      console.error("crues indisponibles", err);
      etat.textContent = "Historique des crues temporairement indisponible.";
      etat.classList.add("erreur");
    }
  }

  /* ============================================================ *
   * Chapitre 5 — La nappe (live + coupe SVG)
   * ============================================================ */
  // Coordonnées de la coupe SVG (index.astro) pour projeter le niveau d'eau.
  var NAPPE_Y_BAS = 250; // niveau le plus bas de l'historique → eau profonde
  var NAPPE_Y_HAUT = 112; // niveau le plus haut → eau proche de la surface
  var NAPPE_FOND = 320;
  var NAPPE_PUITS_FOND = 310;
  var NAPPE_SURFACE_SOL = 70;

  function reglerCoupeNappe(niveau, min, max, profondeur) {
    var frac = max > min ? (niveau - min) / (max - min) : 0.5;
    frac = Math.max(0, Math.min(1, frac));
    var y = NAPPE_Y_BAS - frac * (NAPPE_Y_BAS - NAPPE_Y_HAUT);

    var eau = document.getElementById("coupe-eau");
    eau.setAttribute("y", y);
    eau.setAttribute("height", NAPPE_FOND - y);
    var surf = document.getElementById("coupe-surface-eau");
    surf.setAttribute("y1", y);
    surf.setAttribute("y2", y);
    var puits = document.getElementById("coupe-eau-puits");
    puits.setAttribute("y", y);
    puits.setAttribute("height", NAPPE_PUITS_FOND - y);
    var fleche = document.getElementById("coupe-fleche-prof");
    fleche.setAttribute("y2", y);
    var label = document.getElementById("coupe-prof-label");
    label.setAttribute("y", (NAPPE_SURFACE_SOL + y) / 2);
    if (profondeur != null) label.textContent = C.formaterNombre(Math.abs(profondeur), 1) + " m";
  }

  function chargerHistoriqueLocal() {
    return fetch(URL_BASE + "data/historique-valleraugue.json")
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function getDate13MoisAvant() {
    var d = new Date();
    d.setMonth(d.getMonth() - 13);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function chargerNappeRecentes() {
    return C.fetchAllHubeau(
      "https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/chroniques?code_bss=" +
      encodeURIComponent(C.CODE_BSS) + "&format=json&date_debut_mesure=" + getDate13MoisAvant() + "&size=5000"
    );
  }

  function dedupTri(a, b) {
    var map = new Map();
    a.concat(b).forEach(function (m) { map.set(m.date, m); });
    return Array.from(map.values()).sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
  }

  function statsNappe(serie) {
    var valides = serie.filter(function (m) { return m.niveau_m_ngf != null; })
      .map(function (m) { return { date: m.date, niveau: Number(m.niveau_m_ngf), profondeur: m.profondeur_m == null ? null : Number(m.profondeur_m) }; });
    if (!valides.length) return null;
    var derniereM = serie[serie.length - 1];
    var derniere = {
      date: derniereM.date,
      niveau_m_ngf: derniereM.niveau_m_ngf == null ? null : Number(derniereM.niveau_m_ngf),
      profondeur_m: derniereM.profondeur_m == null ? null : Number(derniereM.profondeur_m),
    };
    var min = valides.reduce(function (a, b) { return b.niveau < a.niveau ? b : a; });
    var max = valides.reduce(function (a, b) { return b.niveau > a.niveau ? b : a; });

    var situation = null;
    if (derniere.niveau_m_ngf != null) {
      var mois = derniere.date.slice(5, 7);
      var ref = valides.filter(function (m) { return m.date.slice(5, 7) === mois; });
      if (ref.length >= C.NB_REFERENCE_MIN) {
        var nbInf = ref.filter(function (m) { return m.niveau < derniere.niveau_m_ngf; }).length;
        var p = nbInf / ref.length;
        var s = C.SEUILS_SITUATION.find(function (x) { return p < x.max; }) || C.SEUILS_SITUATION[C.SEUILS_SITUATION.length - 1];
        situation = { classe: s.classe, libelle: s.libelle };
      }
    }
    return {
      derniere: derniere,
      min: { date: min.date, niveau: min.niveau },
      max: { date: max.date, niveau: max.niveau },
      nb: valides.length,
      debut: serie[0].date,
      fin: derniereM.date,
      situation: situation,
    };
  }

  function tooltipNappe(meta, valeur) {
    if (!meta) return "";
    return "<strong>" + C.formaterNiveauNappe(valeur) + "</strong><br>" + C.formaterDateCourte(meta.date);
  }

  async function chargerNappe() {
    var etat = document.getElementById("nappe-etat");
    try {
      var res = await Promise.all([chargerHistoriqueLocal(), chargerNappeRecentes()]);
      var historique = res[0], recentes = res[1];
      var seuil = getDate13MoisAvant();
      var serie = dedupTri(
        historique.map(function (m) { return { date: m.date_mesure, niveau_m_ngf: m.niveau_nappe_eau, profondeur_m: m.profondeur_nappe }; }),
        recentes.map(function (m) { return { date: m.date_mesure, niveau_m_ngf: m.niveau_nappe_eau, profondeur_m: m.profondeur_nappe }; })
      ).filter(function (m) { return m.date >= seuil; });

      var stats = statsNappe(serie);
      if (!stats) throw new Error("aucune mesure exploitable");

      etat.hidden = true;
      document.getElementById("nappe-live").hidden = false;
      document.getElementById("nappe-valeur").textContent = C.formaterNiveauNappe(stats.derniere.niveau_m_ngf);
      if (stats.derniere.profondeur_m != null) {
        document.getElementById("nappe-profondeur").textContent = "(nappe à " + C.formaterProfondeur(stats.derniere.profondeur_m) + ")";
      }
      document.getElementById("nappe-meta").textContent = "le " + C.formaterDateCourte(stats.derniere.date);

      if (stats.situation) {
        var bloc = document.getElementById("nappe-situation");
        bloc.hidden = false;
        document.getElementById("nappe-pastille").style.background = C.COULEUR_SITUATION[stats.situation.classe];
        document.getElementById("nappe-situation-txt").textContent =
          "Niveau " + stats.situation.libelle + " pour un mois de " + C.formaterMois(stats.derniere.date) + ".";
      }

      document.getElementById("nappe-minmax").textContent =
        "Sur 13 mois : plus bas " + C.formaterNiveauNappe(stats.min.niveau) + " (" + C.formaterDateCourte(stats.min.date) +
        ") · plus haut " + C.formaterNiveauNappe(stats.max.niveau) + " (" + C.formaterDateCourte(stats.max.date) + ")";

      // Coupe SVG : projeter le niveau du moment dans [min, max].
      if (stats.derniere.niveau_m_ngf != null) {
        reglerCoupeNappe(stats.derniere.niveau_m_ngf, stats.min.niveau, stats.max.niveau, stats.derniere.profondeur_m);
      }

      // Graphe 13 mois.
      var graphe = Graphe.creer(document.getElementById("nappe-graphe"), {
        largeur: 720, hauteur: 280, axes: true, tooltip: tooltipNappe,
      });
      var points = serie.filter(function (m) { return m.niveau_m_ngf != null; })
        .map(function (m) { return { x: Date.parse(m.date), y: Number(m.niveau_m_ngf), meta: { date: m.date } }; });
      graphe.afficher({
        points: points,
        couleur: "var(--color-torrent)",
        yFormat: function (v) { return C.formaterNombre(v, 1) + " m"; },
        xFormat: function (ms) { return C.formaterJourMois(ms); },
        tooltip: tooltipNappe,
      });
      document.getElementById("nappe-legende").textContent =
        C.formaterDateCourte(stats.debut) + " → " + C.formaterDateCourte(stats.fin) +
        " (" + stats.nb.toLocaleString("fr-FR") + " mesures)";
    } catch (err) {
      console.error("nappe indisponible", err);
      etat.textContent = "Données nappe temporairement indisponibles (Hub'Eau injoignable).";
      etat.classList.add("erreur");
    }
  }

  /* ============================================================ *
   * Navigation au scroll (fil de l'eau) + révélations
   * ============================================================ */
  function initScroll() {
    var chapitres = Array.prototype.slice.call(document.querySelectorAll(".chapitre"));
    var liens = {};
    document.querySelectorAll(".fil-eau a").forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      liens[id] = a;
    });

    if (!("IntersectionObserver" in window)) {
      chapitres.forEach(function (c) { c.classList.add("vu"); });
      return;
    }

    var obsReveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add("vu"); });
    }, { threshold: 0.12 });
    chapitres.forEach(function (c) { obsReveal.observe(c); });

    var obsNav = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(liens).forEach(function (id) { liens[id].classList.remove("actif"); });
        var actif = liens[e.target.id];
        if (actif) actif.classList.add("actif");
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    chapitres.forEach(function (c) { obsNav.observe(c); });
  }

  /* ============================================================ *
   * Démarrage
   * ============================================================ */
  var btn = document.getElementById("bouton-theme");
  if (btn) btn.addEventListener("click", C.toggleTheme);
  C.appliquerTheme();

  initScroll();
  chargerTorrent();
  chargerProfil();
  chargerCrues();
  chargerNappe();

  function majHorodatage() {
    var h = document.getElementById("horodatage");
    if (h) h.textContent = "Actualisé à " + new Date().toLocaleTimeString("fr-FR") + " — données Vigicrues & Hub'Eau en direct.";
  }
  majHorodatage();
  setInterval(majHorodatage, 30000);
})();
