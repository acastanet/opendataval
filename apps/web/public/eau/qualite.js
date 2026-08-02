"use strict";

(function () {
  const CENTRE = { lon: 3.6272, lat: 44.081 };
  const CODE_COMMUNE = "30339";
  const CODE_DEPARTEMENT = "30";
  const CODE_BSS = window.EauCommun && window.EauCommun.CODE_BSS;
  const fetchAllHubeau = window.EauCommun && window.EauCommun.fetchAllHubeau;

  const PARAMETRES_CLES = {
    "1302": "pH",
    "1303": "Conductivité",
    "1340": "Nitrates",
  };

  function texte(value, fallback = "—") {
    return value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function nombre(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
  }

  function dateFr(value) {
    if (!value) return "date inconnue";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return texte(value);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchToutesPages(url) {
    if (typeof fetchAllHubeau === "function") return fetchAllHubeau(url);
    const json = await fetchJson(url);
    return json.data || [];
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const rad = (v) => (v * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function coordonnees(obj) {
    const lon = Number(obj.longitude ?? obj.longitude_station ?? obj.x ?? obj.coord_x);
    const lat = Number(obj.latitude ?? obj.latitude_station ?? obj.y ?? obj.coord_y);
    return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
  }

  function classeEtat(libelle) {
    const v = (libelle || "").toLowerCase();
    if (v.includes("assec") || v.includes("non visible") || v.includes("mauvais") || v.includes("insuffisant")) return "etat-mauvais";
    if (v.includes("faible") || v.includes("moyen")) return "etat-moyen";
    if (v.includes("visible") || v.includes("bon") || v.includes("excellent")) return "etat-bon";
    return "etat-inconnu";
  }

  function carteAnalyse(parametre, analyse) {
    const article = document.createElement("article");
    article.className = "analyse-carte";
    const valeur = analyse.resultat ?? analyse.resultat_numerique ?? analyse.valeur;
    const unite = analyse.symbole_unite ?? analyse.libelle_unite ?? analyse.unite ?? "";
    const nom = analyse.nom_param ?? analyse.libelle_parametre ?? PARAMETRES_CLES[parametre] ?? `Paramètre ${parametre}`;
    const qualification = analyse.libelle_qualification ?? analyse.qualification ?? "";
    article.innerHTML = `
      <h3>${texte(nom)}</h3>
      <p class="valeur-principale">${nombre(valeur, 3)} ${texte(unite, "")}</p>
      <p class="meta-donnee">Prélèvement du ${dateFr(analyse.date_prelevement)}</p>
      ${qualification ? `<p class="meta-donnee">${texte(qualification)}</p>` : ""}
    `;
    return article;
  }

  function derniereAnalyseParParametre(analyses) {
    const map = new Map();
    analyses.forEach((a) => {
      const code = String(a.code_param ?? a.code_parametre ?? "");
      if (!code) return;
      const date = new Date(a.date_prelevement || 0).getTime();
      const precedente = map.get(code);
      const datePrecedente = precedente ? new Date(precedente.date_prelevement || 0).getTime() : -Infinity;
      if (!precedente || date > datePrecedente) map.set(code, a);
    });
    return map;
  }

  async function chargerOnde() {
    const etat = document.getElementById("onde-etat");
    const contenu = document.getElementById("onde-contenu");
    const lignes = document.getElementById("onde-lignes");
    const resume = document.getElementById("onde-resume");

    try {
      const stations = await fetchToutesPages(
        `https://hubeau.eaufrance.fr/api/v1/ecoulement/stations?code_departement=${CODE_DEPARTEMENT}&size=5000&format=json`
      );

      const proches = stations
        .map((station) => {
          const c = coordonnees(station);
          return { station, distance: c ? distanceKm(CENTRE.lat, CENTRE.lon, c.lat, c.lon) : Infinity };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8);

      if (!proches.length) throw new Error("aucune station ONDE trouvée dans le Gard");

      const observations = await Promise.all(
        proches.map(async ({ station, distance }) => {
          const code = station.code_station;
          try {
            const data = await fetchToutesPages(
              `https://hubeau.eaufrance.fr/api/v1/ecoulement/observations?code_station=${encodeURIComponent(code)}&size=500&format=json`
            );
            data.sort((a, b) => new Date(b.date_observation) - new Date(a.date_observation));
            return { station, distance, observation: data[0] || null };
          } catch (error) {
            return { station, distance, observation: null };
          }
        })
      );

      lignes.innerHTML = "";
      observations.forEach(({ station, distance, observation }) => {
        const libelle = observation?.libelle_ecoulement ?? observation?.libelle_observation ?? observation?.etat_ecoulement ?? "Non renseigné";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${texte(station.libelle_cours_eau)}</td>
          <td>${texte(station.libelle_station)}</td>
          <td>${observation ? dateFr(observation.date_observation) : "Aucune observation récupérée"}</td>
          <td><span class="etat-ecoulement ${classeEtat(libelle)}">${texte(libelle)}</span></td>
          <td>${Number.isFinite(distance) ? `${nombre(distance, 1)} km` : "—"}</td>
        `;
        lignes.appendChild(tr);
      });

      const disponibles = observations.filter((x) => x.observation);
      const plusRecente = disponibles.sort((a, b) => new Date(b.observation.date_observation) - new Date(a.observation.date_observation))[0];
      resume.innerHTML = `
        <article class="donnee-carte"><h3>Stations présentées</h3><p class="valeur-principale">${observations.length}</p><p class="meta-donnee">les plus proches parmi le réseau gardois</p></article>
        <article class="donnee-carte"><h3>Dernier passage disponible</h3><p class="valeur-principale">${plusRecente ? dateFr(plusRecente.observation.date_observation) : "—"}</p><p class="meta-donnee">mise à jour par campagnes</p></article>
        <article class="donnee-carte"><h3>Source</h3><p>Observatoire national des étiages</p><a href="https://hubeau.eaufrance.fr/page/api-ecoulement" target="_blank" rel="noopener">Hub'Eau / OFB →</a></article>
      `;
      etat.hidden = true;
      contenu.hidden = false;
    } catch (error) {
      console.error("ONDE indisponible", error);
      etat.textContent = "Les observations ONDE sont temporairement indisponibles.";
      etat.classList.add("erreur");
    }
  }

  async function chargerAdes() {
    const etat = document.getElementById("ades-etat");
    const contenu = document.getElementById("ades-contenu");
    const stationEl = document.getElementById("ades-station");
    const parametresEl = document.getElementById("ades-parametres");

    try {
      let stations = [];
      if (CODE_BSS) {
        stations = await fetchToutesPages(
          `https://hubeau.eaufrance.fr/api/v1/qualite_nappes/stations?code_bss=${encodeURIComponent(CODE_BSS)}&size=100&format=json`
        );
      }
      if (!stations.length) {
        stations = await fetchToutesPages(
          `https://hubeau.eaufrance.fr/api/v1/qualite_nappes/stations?code_commune=${CODE_COMMUNE}&size=1000&format=json`
        );
      }
      if (!stations.length) throw new Error("aucun point ADES trouvé");

      const station = stations.sort((a, b) => Number(b.nb_analyses || 0) - Number(a.nb_analyses || 0))[0];
      const filtre = station.bss_id
        ? `bss_id=${encodeURIComponent(station.bss_id)}`
        : `code_bss=${encodeURIComponent(station.code_bss || CODE_BSS)}`;

      let analyses = await fetchToutesPages(
        `https://hubeau.eaufrance.fr/api/v1/qualite_nappes/analyses?${filtre}&code_param=1302,1303,1340&size=5000&format=json`
      );
      if (!analyses.length) {
        analyses = await fetchToutesPages(
          `https://hubeau.eaufrance.fr/api/v1/qualite_nappes/analyses?${filtre}&size=1000&format=json`
        );
      }
      const dernieres = derniereAnalyseParParametre(analyses);
      if (!dernieres.size) throw new Error("aucune analyse ADES disponible");

      const nomStation = station.libelle_station ?? station.nom_station ?? station.libelle ?? "Point d'eau ADES";
      stationEl.textContent = `${texte(nomStation)} · ${texte(station.bss_id ?? station.code_bss)} · dernière campagne connue : ${dateFr(station.date_fin_prelevement)}`;
      parametresEl.innerHTML = "";

      const prioritaires = ["1302", "1303", "1340"].filter((code) => dernieres.has(code));
      const autres = [...dernieres.keys()].filter((code) => !prioritaires.includes(code)).slice(0, 3);
      [...prioritaires, ...autres].slice(0, 6).forEach((code) => {
        parametresEl.appendChild(carteAnalyse(code, dernieres.get(code)));
      });

      etat.hidden = true;
      contenu.hidden = false;
    } catch (error) {
      console.error("ADES indisponible", error);
      etat.textContent = "Les analyses ADES de ce point sont absentes ou temporairement indisponibles.";
      etat.classList.add("erreur");
    }
  }

  async function chargerBaignade() {
    const etat = document.getElementById("baignade-etat");
    const contenu = document.getElementById("baignade-contenu");
    const resume = document.getElementById("baignade-resume");
    const lignes = document.getElementById("baignade-lignes");

    try {
      const response = await fetch("/eau/data/baignade-mouretou.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const derniere = data.prelevements[data.prelevements.length - 1];

      resume.innerHTML = `
        <article class="donnee-carte"><h3>Dernier classement consolidé</h3><p class="valeur-principale"><span class="etat-qualite ${classeEtat(data.classement.libelle)}">${texte(data.classement.libelle)}</span></p><p class="meta-donnee">saison ${data.classement.annee}</p></article>
        <article class="donnee-carte"><h3>Dernier prélèvement consolidé</h3><p class="valeur-principale">${dateFr(derniere.date)}</p><p class="meta-donnee">${texte(derniere.resultat)}</p></article>
        <article class="donnee-carte"><h3>Saison en cours</h3><p>Les résultats 2026 doivent être consultés sur le portail officiel.</p><p class="meta-donnee">Le fichier local sert de référence historique vérifiée.</p></article>
      `;

      lignes.innerHTML = "";
      data.prelevements.forEach((p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${dateFr(p.date)}</td>
          <td>${nombre(p.escherichia_coli, 0)} UFC/100 mL</td>
          <td>${nombre(p.enterocoques_intestinaux, 0)} UFC/100 mL</td>
          <td><span class="etat-qualite ${classeEtat(p.resultat)}">${texte(p.resultat)}</span></td>
        `;
        lignes.appendChild(tr);
      });

      etat.hidden = true;
      contenu.hidden = false;
    } catch (error) {
      console.error("baignade indisponible", error);
      etat.textContent = "Les résultats de baignade n'ont pas pu être chargés.";
      etat.classList.add("erreur");
    }
  }

  function actualiserHorodatage() {
    const h = document.getElementById("horodatage");
    if (h) h.textContent = `Consulté à ${new Date().toLocaleTimeString("fr-FR")} — fréquence de mise à jour variable selon les réseaux`;
  }

  chargerOnde();
  chargerAdes();
  chargerBaignade();
  setTimeout(actualiserHorodatage, 50);
  setInterval(actualiserHorodatage, 30000);
})();
