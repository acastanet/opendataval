/*
 * Moteur de graphe SVG réutilisable pour la mini app (sans build, scripts classiques).
 * Reprend les briques éprouvées de apps/web/src/lib/graphe.ts :
 *   - echelleLineaire, ticks, decimerMinMax, cheminLigne
 * Et y ajoute la lecture :
 *   - survol / tap : infobulle « date + heure + valeur »
 *   - annotations d'épisodes : marqueurs posés sur les pics fournis par l'appelant
 *   - format « grand » (viewBox ~720×300, width:100%)
 */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";

  /** Fonction affine domaine -> plage (px). */
  function echelleLineaire(domaine, plage) {
    var d0 = domaine[0],
      d1 = domaine[1],
      p0 = plage[0],
      p1 = plage[1];
    if (d1 === d0) return function () { return (p0 + p1) / 2; };
    return function (v) { return p0 + ((v - d0) / (d1 - d0)) * (p1 - p0); };
  }

  /** Graduations « propres » (pas 1/2/5 × 10^n) couvrant [min, max]. */
  function ticks(min, max, nbCible) {
    nbCible = nbCible || 5;
    if (min === max) return [min];
    var etendue = max - min;
    var pasBrut = etendue / Math.max(1, nbCible);
    var magnitude = Math.pow(10, Math.floor(Math.log10(pasBrut)));
    var residu = pasBrut / magnitude;
    var pas = (residu >= 5 ? 10 : residu >= 2 ? 5 : residu >= 1 ? 2 : 1) * magnitude;
    var debut = Math.ceil(min / pas) * pas;
    var resultat = [];
    for (var v = debut; v <= max + pas * 1e-6; v += pas) {
      resultat.push(Math.round(v / pas) * pas);
    }
    return resultat;
  }

  /** Décime une série triée par x en gardant le min et le max de chaque tranche (préserve les pics). */
  function decimerMinMax(points, nbBuckets) {
    if (points.length <= nbBuckets * 2) return points;
    var xMin = points[0].x,
      xMax = points[points.length - 1].x;
    var largeur = (xMax - xMin) / nbBuckets || 1;
    var resultat = [];
    var i = 0;
    for (var b = 0; b < nbBuckets; b++) {
      var limite = xMin + (b + 1) * largeur;
      var bucket = [];
      while (i < points.length && (b === nbBuckets - 1 ? points[i].x <= xMax : points[i].x < limite)) {
        bucket.push(points[i]);
        i++;
      }
      if (bucket.length === 0) continue;
      if (bucket.length === 1) {
        resultat.push(bucket[0]);
        continue;
      }
      var min = bucket.reduce(function (a, c) { return c.y < a.y ? c : a; });
      var max = bucket.reduce(function (a, c) { return c.y > a.y ? c : a; });
      if (bucket.indexOf(min) <= bucket.indexOf(max)) resultat.push(min, max);
      else resultat.push(max, min);
    }
    return resultat;
  }

  /** Chemin SVG "M..L.." reliant les points projetés ; coupe la ligne aux valeurs y nulles. */
  function cheminLigne(points) {
    var d = "";
    var trace = false;
    for (var k = 0; k < points.length; k++) {
      var p = points[k];
      if (p.y === null) {
        trace = false;
        continue;
      }
      d += (trace ? "L" : "M") + p.x.toFixed(1) + "," + p.y.toFixed(1) + " ";
      trace = true;
    }
    return d.trim();
  }

  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    if (attrs) {
      for (var a in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, a)) e.setAttribute(a, attrs[a]);
      }
    }
    return e;
  }

  function creer(conteneur, options) {
    options = options || {};
    var L = options.largeur || 720;
    var H = options.hauteur || 300;
    var marges = options.marges || { gauche: 64, droite: 18, haut: 18, bas: 38 };
    var afficherAxes = options.axes !== false;
    var afficherGrille = options.grille !== false;
    var W = L - marges.gauche - marges.droite;
    var Hc = H - marges.haut - marges.bas;

    conteneur.classList.add("graphe-cont");
    conteneur.innerHTML = "";

    var svg = el("svg", {
      viewBox: "0 0 " + L + " " + H,
      class: "graphe-svg",
      preserveAspectRatio: "none",
      role: "img",
    });
    conteneur.appendChild(svg);

    var defs = el("defs");
    var clipId = "clip-" + Math.random().toString(36).slice(2);
    var clip = el("clipPath", { id: clipId });
    clip.appendChild(el("rect", { x: marges.gauche, y: marges.haut, width: W, height: Hc }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    var gGrille = el("g", { class: "grille" });
    var gAire = el("path", { class: "aire-graphe", "clip-path": "url(#" + clipId + ")", fill: "none" });
    var gLigne = el("path", { class: "chemin-graphe", "clip-path": "url(#" + clipId + ")", fill: "none" });
    var gAnn = el("g", { class: "annotations" });
    var gAxesX = el("g", { class: "axes-x" });
    var gAxesY = el("g", { class: "axes-y" });
    var gCurseur = el("g", { class: "curseur", "pointer-events": "none", visibility: "hidden" });
    var ligneCurseur = el("line", { class: "ligne-curseur", y1: marges.haut, y2: marges.haut + Hc });
    var pointCurseur = el("circle", { class: "point-curseur", r: 3.5 });
    gCurseur.appendChild(ligneCurseur);
    gCurseur.appendChild(pointCurseur);

    svg.appendChild(gGrille);
    svg.appendChild(gAire);
    svg.appendChild(gLigne);
    svg.appendChild(gAnn);
    svg.appendChild(gAxesX);
    svg.appendChild(gAxesY);
    svg.appendChild(gCurseur);

    var overlay = el("rect", {
      x: 0, y: 0, width: L, height: H,
      fill: "transparent",
      class: "overlay-survol",
    });
    svg.appendChild(overlay);

    var infobulle = document.createElement("div");
    infobulle.className = "graphe-infobulle";
    infobulle.style.visibility = "hidden";
    conteneur.appendChild(infobulle);

    var etat = { points: [], maps: [] };

    function vider(groupe) {
      while (groupe.firstChild) groupe.removeChild(groupe.firstChild);
    }

    function afficher(donnees) {
      etat.maps = [];
      vider(gGrille);
      vider(gAnn);
      vider(gAxesX);
      vider(gAxesY);

      var points = (donnees.points || []).filter(function (p) { return p.x != null; });
      etat.points = points;
      if (points.length < 2) {
        gLigne.setAttribute("d", "");
        gAire.setAttribute("d", "");
        gCurseur.setAttribute("visibility", "hidden");
        infobulle.style.visibility = "hidden";
        return;
      }

      var fenetreX = donnees.fenetreX || null;
      var xMin = fenetreX ? fenetreX[0] : points[0].x;
      var xMax = fenetreX ? fenetreX[1] : points[points.length - 1].x;
      var xSpan = xMax - xMin || 1;

      var visibles = points;
      if (fenetreX) {
        visibles = points.filter(function (p) { return p.x >= xMin && p.x <= xMax; });
        if (visibles.length < 2) visibles = points;
      }

      var valeurs = visibles.map(function (p) { return p.y; }).filter(function (v) { return v != null; });
      var yMin = donnees.echelleYFixe ? donnees.echelleYFixe[0] : Math.min.apply(null, valeurs);
      var yMax = donnees.echelleYFixe ? donnees.echelleYFixe[1] : Math.max.apply(null, valeurs);
      if (!isFinite(yMin) || !isFinite(yMax)) { yMin = 0; yMax = 1; }
      if (yMin === yMax) {
        var m = Math.abs(yMax) || 1;
        yMin -= m * 0.1;
        yMax += m * 0.1;
      } else {
        var pad = (yMax - yMin) * 0.12;
        yMin -= pad;
        yMax += pad;
      }
      var ySpan = yMax - yMin || 1;

      var sx = echelleLineaire([xMin, xMax], [marges.gauche, marges.gauche + W]);
      var sy = echelleLineaire([yMin, yMax], [marges.haut + Hc, marges.haut]);

      var maps = visibles.map(function (p) {
        return {
          x: sx(p.x),
          y: p.y == null ? null : sy(p.y),
          px: p.x,
          py: p.y,
          meta: p.meta || null,
        };
      });
      etat.maps = maps;

      gLigne.setAttribute("d", cheminLigne(maps));
      gLigne.setAttribute("stroke", donnees.couleur || "var(--color-torrent)");
      gLigne.setAttribute("stroke-width", options.epaisseur || 1.6);

      if (donnees.remplissage !== false) {
        var line = cheminLigne(maps);
        var area = line +
          " L" + maps[maps.length - 1].x.toFixed(1) + "," + (marges.haut + Hc) +
          " L" + maps[0].x.toFixed(1) + "," + (marges.haut + Hc) + " Z";
        gAire.setAttribute("d", area);
        gAire.setAttribute("fill", donnees.couleur || "var(--color-torrent)");
      } else {
        gAire.setAttribute("d", "");
      }

      if (afficherGrille) {
        var yTicks = ticks(yMin, yMax, options.nbTicksY || 4);
        yTicks.forEach(function (v) {
          var y = sy(v);
          gGrille.appendChild(el("line", {
            x1: marges.gauche, x2: marges.gauche + W, y1: y, y2: y,
            class: "grille-line",
          }));
          if (afficherAxes) {
            var t = el("text", { x: marges.gauche - 6, y: y + 3, "text-anchor": "end" });
            t.textContent = donnees.yFormat ? donnees.yFormat(v) : v.toFixed(2);
            gAxesY.appendChild(t);
          }
        });
      }

      if (afficherAxes) {
        var xTicks = options.nbTicksX || 5;
        for (var i = 0; i <= xTicks; i++) {
          var frac = xTicks === 0 ? 0 : i / xTicks;
          var xv = xMin + frac * xSpan;
          var x = sx(xv);
          var tx = el("text", { x: x, y: marges.haut + Hc + 16, "text-anchor": "middle" });
          tx.textContent = donnees.xFormat ? donnees.xFormat(xv) : new Date(xv).toLocaleDateString("fr-FR");
          gAxesX.appendChild(tx);
        }
      }

      if (donnees.annotations && donnees.annotations.length) {
        donnees.annotations.forEach(function (a) {
          if (a.x < xMin || a.x > xMax) return;
          var ax = sx(a.x);
          var ay = a.y == null ? null : sy(a.y);
          if (ay == null) return;
          gAnn.appendChild(el("circle", { cx: ax, cy: ay, r: 3, class: "marqueur-episode" }));
          if (a.label) {
            var anchor = ax > L - 90 ? "end" : "middle";
            var lx = anchor === "end" ? ax - 4 : ax;
            var t = el("text", { x: lx, y: ay - 7, "text-anchor": anchor, class: "label-episode" });
            t.textContent = a.label;
            gAnn.appendChild(t);
          }
        });
      }

      gCurseur.setAttribute("visibility", "hidden");
      infobulle.style.visibility = "hidden";
    }

    function montrerCurseur(vx, clientX) {
      if (etat.maps.length < 2) return;
      var plusProche = null;
      for (var i = 0; i < etat.maps.length; i++) {
        if (etat.maps[i].y == null) continue;
        if (!plusProche || Math.abs(etat.maps[i].x - vx) < Math.abs(plusProche.x - vx)) {
          plusProche = etat.maps[i];
        }
      }
      if (!plusProche) return;

      ligneCurseur.setAttribute("x1", plusProche.x);
      ligneCurseur.setAttribute("x2", plusProche.x);
      pointCurseur.setAttribute("cx", plusProche.x);
      pointCurseur.setAttribute("cy", plusProche.y);
      gCurseur.setAttribute("visibility", "visible");

      if (!options.tooltip) return;
      infobulle.innerHTML = options.tooltip(plusProche.meta, plusProche.py);
      infobulle.style.visibility = "visible";

      var rect = conteneur.getBoundingClientRect();
      var px = (plusProche.x / L) * rect.width;
      var posX = px + 14;
      if (posX + infobulle.offsetWidth > rect.width) posX = px - infobulle.offsetWidth - 14;
      infobulle.style.left = Math.max(2, posX) + "px";
      infobulle.style.top = Math.max(2, (plusProche.y / H) * rect.height - infobulle.offsetHeight - 8) + "px";
    }

    function cacherCurseur() {
      gCurseur.setAttribute("visibility", "hidden");
      infobulle.style.visibility = "hidden";
    }

    function surDeplacement(evt) {
      var rect = conteneur.getBoundingClientRect();
      var xClient = evt.touches ? evt.touches[0].clientX : evt.clientX;
      var vx = ((xClient - rect.left) / rect.width) * L;
      montrerCurseur(vx, xClient);
    }

    overlay.addEventListener("pointermove", surDeplacement);
    overlay.addEventListener("pointerdown", surDeplacement);
    overlay.addEventListener("pointerleave", cacherCurseur);
    overlay.addEventListener("touchmove", function (e) { surDeplacement(e); }, { passive: true });

    return { afficher: afficher, svg: svg, cacher: cacherCurseur };
  }

  window.Graphe = {
    creer: creer,
    echelleLineaire: echelleLineaire,
    ticks: ticks,
    decimerMinMax: decimerMinMax,
    cheminLigne: cheminLigne,
  };
})();
