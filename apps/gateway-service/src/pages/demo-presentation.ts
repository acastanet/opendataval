/**
 * Présentation « lisible » des réponses des démos, exécutée côté navigateur.
 *
 * La constante `PRESENTERS_SCRIPT` est un script inline (même approche que
 * `DEMO_SCRIPT` dans `demo.ts`) qui installe `window.__presenters`. À partir de
 * l'identifiant du service et de la réponse JSON, il peint le panneau « Résultat »
 * avec une synthèse en français, compréhensible en un coup d'œil.
 *
 * Contrainte de sécurité (voir AGENTS.md) : le contenu provient de données
 * externes, donc tout est construit en DOM via `document.createElement` et
 * `textContent`. Aucune interpolation HTML n'est utilisée ici.
 */
export const PRESENTERS_SCRIPT = `
(function () {
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function kv(label, value, opts) {
    opts = opts || {};
    var card = el("div", "kv" + (opts.wide ? " wide" : ""));
    card.appendChild(el("span", "k", label));
    var v = el("span", "v" + (opts.big ? " big" : ""), value);
    card.appendChild(v);
    return card;
  }

  function badge(level, label) {
    var b = el("span", "badge", label);
    if (level) b.setAttribute("data-level", level);
    return b;
  }

  function grid(children) {
    var g = el("div", "summary");
    children.forEach(function (child) { if (child) g.appendChild(child); });
    return g;
  }

  function note(text) {
    return el("p", "summary-note", text);
  }

  // Formatte une date ISO en date/heure française, ou renvoie la valeur brute.
  function frDate(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (isNaN(t)) return String(value);
    try { return new Date(t).toLocaleString("fr-FR"); } catch (e) { return String(value); }
  }

  function frNumber(value, digits) {
    if (typeof value !== "number" || isNaN(value)) return "—";
    try {
      return value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch (e) { return String(value); }
  }

  // Rend un statut d'enrichissement Geography en libellé lisible.
  var GEO_STATUS = {
    available: "disponible",
    not_found: "non trouvé",
    unavailable: "indisponible",
    timeout: "délai dépassé",
  };

  function geographyView(data) {
    var out = document.createDocumentFragment();
    var cards = [];
    var territory = data.territory || {};
    if (territory.status === "available" && territory.data) {
      var t = territory.data;
      if (t.commune) cards.push(kv("Commune", t.commune.name));
      if (t.department) cards.push(kv("Département", t.department.name + " (" + t.department.code + ")"));
      if (t.epci) cards.push(kv("Intercommunalité", t.epci.name));
    } else {
      cards.push(kv("Territoire", GEO_STATUS[territory.status] || territory.status || "—"));
    }
    var address = data.address || {};
    if (address.status === "available" && address.data) {
      cards.push(kv("Adresse la plus proche", address.data.formatted, { wide: true }));
    }
    var elevation = data.elevation || {};
    if (elevation.status === "available" && elevation.data) {
      cards.push(kv("Altitude", frNumber(elevation.data.meters, 0) + " m"));
    }
    if (data.query) {
      cards.push(kv("Position interrogée", frNumber(data.query.latitude, 4) + ", " + frNumber(data.query.longitude, 4)));
    }
    out.appendChild(grid(cards));
    return out;
  }

  var WEATHER_NATURE = {
    station_observation: "Observation d'une station proche",
    station_adjusted_by_model: "Station ajustée par le modèle AROME",
    model_at_point: "Modèle AROME au point",
  };

  function weatherView(data) {
    var out = document.createDocumentFragment();
    var temp = data.temperature || {};
    var cards = [];
    cards.push(kv("Température", frNumber(temp.valueCelsius, 1) + " °C", { big: true }));
    cards.push(kv("Nature de la mesure", WEATHER_NATURE[temp.nature] || temp.nature || "—"));
    cards.push(kv("Heure de référence", frDate(temp.referenceTime)));
    var source = (data.provenance && data.provenance.source) || {};
    if (source.provider) cards.push(kv("Source", source.provider + (source.product ? " — " + source.product : "")));
    var location = data.location || {};
    if (typeof location.altitudeMeters === "number") cards.push(kv("Altitude", frNumber(location.altitudeMeters, 0) + " m"));
    out.appendChild(grid(cards));
    if (data.degraded) out.appendChild(note("Réponse dégradée : au moins une source n'était pas disponible."));
    else if (temp.stale) out.appendChild(note("La dernière observation de station est ancienne."));
    return out;
  }

  var DAY_LABEL = { today: "Aujourd'hui", tomorrow: "Demain" };

  function vigilanceView(data) {
    var out = document.createDocumentFragment();
    var location = data.location || {};
    out.appendChild(grid([
      kv("Département", (location.department_name || "—") + (location.department_code ? " (" + location.department_code + ")" : "")),
    ]));
    var periods = Array.isArray(data.periods) ? data.periods : [];
    periods.forEach(function (period) {
      var overall = period.overall_level || {};
      var block = el("div", "kv wide");
      block.appendChild(el("span", "k", DAY_LABEL[period.day] || period.day || "Période"));
      var badges = el("div", "badges");
      badges.appendChild(badge(overall.code, overall.label || overall.code || "—"));
      var phenomena = Array.isArray(period.phenomena) ? period.phenomena : [];
      phenomena.forEach(function (phenomenon) {
        var level = phenomenon.level || {};
        badges.appendChild(badge(level.code, phenomenon.label + " : " + (level.label || level.code || "")));
      });
      block.appendChild(badges);
      out.appendChild(block);
    });
    var warnings = Array.isArray(data.warnings) ? data.warnings : [];
    warnings.forEach(function (warning) {
      if (warning && warning.message) out.appendChild(note(warning.message));
    });
    return out;
  }

  var FIRE_STATUS = {
    available: "Toutes les sources ont répondu.",
    partial: "Une partie des sources seulement a répondu.",
    unavailable: "Aucune source n'a répondu.",
  };
  var FIRE_SOURCE_STATUS = {
    available: "disponible",
    unavailable: "indisponible",
    not_configured: "non configurée",
  };

  function fireView(data) {
    var out = document.createDocumentFragment();
    var location = data.location || {};
    var realtime = data.realtime || {};
    var suspicions = Array.isArray(realtime.suspicions) ? realtime.suspicions : [];
    var history = data.history || {};
    var historicalSuspicions = Array.isArray(history.suspicions) ? history.suspicions : [];
    var radius = location.radius_km;
    var cards = [];
    if (suspicions.length === 0) {
      cards.push(kv("Temps réel", "Aucune suspicion dans un rayon de " + (radius || "?") + " km", { wide: true }));
    } else {
      cards.push(kv("Suspicions en temps réel", String(suspicions.length) + " dans un rayon de " + (radius || "?") + " km", { wide: true }));
    }
    if (typeof realtime.window_minutes === "number") {
      cards.push(kv("Fenêtre temps réel", String(realtime.window_minutes) + " min"));
    }
    if (typeof history.days === "number") {
      cards.push(kv(
        "Historique cartographié",
        historicalSuspicions.length + " suspicion" + (historicalSuspicions.length === 1 ? "" : "s") + " sur " + history.days + " jours",
      ));
    }
    cards.push(kv("État des données", FIRE_STATUS[data.data_status] || data.data_status || "—"));
    var last = data.last_detection_50km;
    if (last) {
      cards.push(kv("Dernière détection (50 km)", frDate(last.observed_at) + " à " + frNumber(last.distance_km, 1) + " km"));
    } else {
      cards.push(kv("Dernière détection (50 km)", "Aucune sur la période"));
    }
    if (data.generated_at) cards.push(kv("Réponse générée", frDate(data.generated_at)));
    out.appendChild(grid(cards));

    var sources = Array.isArray(data.sources) ? data.sources : [];
    if (sources.length > 0) {
      out.appendChild(el("h3", "", "État des sources"));
      var sourceCards = [];
      sources.forEach(function (source) {
        var state = FIRE_SOURCE_STATUS[source.state] || source.state || "—";
        var count = typeof source.detection_count === "number"
          ? source.detection_count + " détection" + (source.detection_count === 1 ? "" : "s")
          : "nombre inconnu";
        var latest = source.latest_observation_at
          ? " · dernière observation " + frDate(source.latest_observation_at)
          : "";
        sourceCards.push(kv(source.source || "Source", state + " · " + count + latest, { wide: true }));
        if (source.detail) sourceCards.push(kv("Détail " + (source.source || "source"), source.detail, { wide: true }));
      });
      out.appendChild(grid(sourceCards));
    }

    var warnings = Array.isArray(data.warnings) ? data.warnings : [];
    warnings.forEach(function (warning) {
      if (warning && warning.message) out.appendChild(note(warning.message));
    });
    return out;
  }

  var ASSOCIATION_STATUS = {
    active: "Active",
    dissolved: "Dissoute",
    unknown: "Statut inconnu",
  };

  function associationValue(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function associationDetails(association) {
    var address = association.address || {};
    var location = association.location || {};
    var source = association.source || {};
    var values = [
      ["Identifiant RNA", association.rnaId],
      ["Identifiant historique", association.legacyId],
      ["Nom court", association.shortTitle],
      ["Objet", association.purpose],
      ["Catégorie principale", association.categoryPrimary],
      ["Catégorie secondaire", association.categorySecondary],
      ["Statut", ASSOCIATION_STATUS[association.administrativeStatus] || association.administrativeStatus],
      ["Date de création", association.creationDate],
      ["Date de déclaration", association.declarationDate],
      ["Date de dissolution", association.dissolutionDate],
      ["Site internet", association.website],
      ["SIREN", association.siren],
      ["SIRET", association.siret],
      ["Adresse", address.label],
      ["Voie", address.street],
      ["Code postal", address.postalCode],
      ["Commune", address.municipalityName],
      ["Code INSEE source", address.sourceCommuneCode],
      ["Code INSEE normalisé", address.normalizedCommuneCode],
      ["Latitude", location.latitude],
      ["Longitude", location.longitude],
      ["Précision géocodage", location.precision],
      ["Score géocodage", location.score],
      ["Source", source.name],
      ["Source mise à jour", source.sourceUpdatedAt],
      ["Importé le", source.importedAt],
    ];
    var details = el("details", "association-details");
    details.appendChild(el("summary", "", "Voir toutes les informations"));
    var list = el("div", "summary");
    values.forEach(function (entry) { list.appendChild(kv(entry[0], associationValue(entry[1]), { wide: entry[0] === "Objet" || entry[0] === "Adresse" })); });
    details.appendChild(list);
    return details;
  }

  function associationsView(data) {
    var out = document.createDocumentFragment();
    var source = data.source || {};
    var associations = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.associations)
        ? data.associations
        : Array.isArray(data.results)
          ? data.results
          : [];
    var total = typeof data.total === "number" ? data.total : associations.length;
    out.appendChild(grid([
      kv("Associations trouvées", String(total), { big: true }),
      source.snapshotUpdatedAt ? kv("Données mises à jour", frDate(source.snapshotUpdatedAt)) : null,
      source.freshness ? kv("Fraîcheur", source.freshness) : null,
    ]));

    if (associations.length === 0) {
      out.appendChild(note("Aucune association ne correspond aux critères renseignés."));
      return out;
    }

    var list = el("div", "summary");
    associations.forEach(function (association) {
      var title = association.title || association.shortTitle || "Association sans titre";
      var details = [];
      if (association.administrativeStatus) {
        details.push(ASSOCIATION_STATUS[association.administrativeStatus] || association.administrativeStatus);
      }
      if (association.categoryPrimary) details.push(association.categoryPrimary);
      if (association.address && association.address.label) details.push(association.address.label);
      var card = kv(title, details.join(" · ") || "Informations détaillées dans le JSON", { wide: true });
      if (association.purpose) card.appendChild(el("span", "summary-note", association.purpose));
      card.appendChild(associationDetails(association));
      list.appendChild(card);
    });
    out.appendChild(list);
    if (data.nextCursor) out.appendChild(note("D’autres résultats sont disponibles avec le curseur de page suivante."));
    return out;
  }

  // Repli générique : liste les valeurs primitives de premier niveau.
  function genericView(data) {
    var cards = [];
    if (data && typeof data === "object") {
      Object.keys(data).forEach(function (key) {
        var value = data[key];
        var kind = typeof value;
        if (value === null || kind === "string" || kind === "number" || kind === "boolean") {
          cards.push(kv(key, String(value)));
        }
      });
    }
    if (cards.length === 0) return note("Réponse reçue. Consultez l'onglet « JSON brut » pour le détail.");
    return grid(cards);
  }

  var VIEWS = {
    geography: geographyView,
    weather: weatherView,
    vigilance: vigilanceView,
    fire: fireView,
    associations: associationsView,
  };

  function errorView(error) {
    var out = document.createDocumentFragment();
    out.appendChild(grid([
      kv("Erreur", error.code || "—"),
      kv("Message", error.message || "—", { wide: true }),
    ]));
    return out;
  }

  window.__presenters = {
    render: function (serviceId, data, mount) {
      if (!mount) return;
      mount.textContent = "";
      if (!data || typeof data !== "object") {
        mount.appendChild(note("Réponse illisible. Consultez l'onglet « JSON brut »."));
        return;
      }
      if (data.error && typeof data.error === "object") {
        mount.appendChild(errorView(data.error));
        return;
      }
      var view = VIEWS[serviceId] || genericView;
      mount.appendChild(view(data));
    },
  };
})();
`;
