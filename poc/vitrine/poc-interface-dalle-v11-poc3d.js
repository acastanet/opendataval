    const VIGILANCE_PHENOMENA = [
      ["wind", "Vent"],
      ["rain_flood", "Pluie-inondation"],
      ["flood", "Crues"],
      ["thunderstorm", "Orages"],
      ["snow_ice", "Neige-verglas"],
      ["avalanche", "Avalanches"],
      ["heatwave", "Canicule"],
      ["extreme_cold", "Grand froid"],
      ["waves_submersion", "Vagues-submersion"],
    ];

    const SPHERES = [
      {
        id: "atmosphere",
        name: "Atmosphère",
        color: "#0b6f8b",
        summary: "Météo locale",
        layers: [
          { name: "Température estimée", source: "Service météo · chargement", value: "…", dataKey: "weather-current" },
          { name: "Minimum aujourd’hui", source: "Météo-France · prévision", value: "…", dataKey: "weather-minimum" },
          { name: "Maximum aujourd’hui", source: "Météo-France · prévision", value: "…", dataKey: "weather-maximum" },
        ],
      },
      {
        id: "risks",
        name: "Vigilances météo",
        color: "#b94a1e",
        summary: "Aujourd’hui et demain · Gard",
        notice: "Information départementale : elle ne décrit pas le risque exact à cette adresse.",
        officialLink: {
          label: "Consulter la vigilance officielle du Gard",
          href: "https://vigilance.meteofrance.fr/fr/gard",
        },
        layers: [
          {
            name: "Niveau général",
            source: "Service Vigilance · chargement",
            value: "…",
            dataKey: "vigilance-overall",
          },
          ...VIGILANCE_PHENOMENA.map(([code, name]) => ({
            name,
            source: "Service Vigilance · chargement",
            value: "…",
            dataKey: `vigilance-${code}`,
          })),
        ],
      },
      {
        id: "hydrosphere",
        name: "Hydrosphère",
        color: "#1769aa",
        summary: "Eaux de surface et débits",
        layers: [
          { name: "Cours d’eau — Hérault", source: "Sandre · à 84 m", value: "84 m" },
          { name: "Débit observé", source: "HydroPortail", value: "2,4 m³/s" },
          { name: "Eau LiDAR", source: "IGN LiDAR HD", control: "waterToggle", enabled: true },
        ],
      },
      {
        id: "biosphere",
        name: "Biosphère",
        color: "#52663a",
        summary: "Végétation et canopée LiDAR",
        layers: [
          { name: "Végétation 3D", source: "IGN LiDAR HD", control: "vegetationToggle", enabled: true },
          { name: "Canopée dense", source: "IGN LiDAR HD", control: "canopyToggle", enabled: true },
          { name: "Strate arbustive", source: "IGN LiDAR HD", control: "understoryToggle", enabled: true },
          { name: "Hauteur de canopée", source: "mesure locale", value: "14,2 m" },
        ],
      },
      {
        id: "anthroposphere",
        name: "Anthroposphère",
        color: "#345e70",
        summary: "Bâti, adresse et accès",
        layers: [
          { name: "Bâtiments 3D", source: "IGN · reconstruction Roofer", control: "buildingsToggle", enabled: true },
          { name: "Ponts", source: "IGN LiDAR HD", control: "bridgeToggle", enabled: true },
          { name: "Adresse BAN", source: "Base Adresse Nationale", value: "18 m" },
        ],
      },
      {
        id: "lithosphere",
        name: "Lithosphère",
        color: "#6b4226",
        summary: "Relief, sol et géologie",
        layers: [
          { name: "Terrain haute résolution", source: "IGN LiDAR HD · maille 0,5 m", control: "terrainToggle", enabled: true },
          { name: "Carte géologique", source: "BRGM · BD Charm-50", control: "geologyToggle", enabled: false },
          { name: "Altitude centrale", source: "IGN RGE ALTI", value: "542,1 m" },
        ],
      },
      {
        id: "pedosphere",
        name: "Pédosphère",
        color: "#8a6a3e",
        summary: "Sols, humidité et usages du terrain",
        layers: [
          { name: "Nature des sols", source: "GIS Sol · contexte", value: "À qualifier" },
          { name: "Occupation du sol", source: "OCS GE · contexte", value: "Mixte" },
        ],
      },
    ];

    const CLOSED_SPHERE_HEIGHT = 64;
    const SPHERE_GAP = 11;
    const MOBILE_QUERY = "(max-width: 900px)";
    const VIEWER_STYLE = `
      .brand, .panel, .panel-toggle, .building-card, .camera-pose-toast,
      .preview-banner, .error { display: none !important; }
      .viewport-marks {
        right: auto !important;
        bottom: 26px !important;
        left: 26px !important;
      }
    `;
    const READY_STATUS = /prêt(?:e)?|chargée|sc[èe]ne prête/i;
    const SETTINGS_SCHEMA = "opendatavda.affichage-3d";
    const SETTINGS_VERSION = 1;
    const LIVE_DATA_REFRESH_MS = 5 * 60 * 1000;
    const WEATHER_COORDINATES = { latitude: 44.081089, longitude: 3.641219 };
    const OUTPUT_IDS = {
      geologyOpacity: "geologyOpacityValue",
      pointSize: "pointSizeValue",
      terrainOpacity: "opacityValue",
      orthoEast: "orthoEastValue",
      orthoNorth: "orthoNorthValue",
      sunHeight: "sunValue",
      sunAzimuth: "azimuthValue",
      sunIntensity: "sunIntensityValue",
      environmentIntensity: "environmentIntensityValue",
      hemisphereIntensity: "hemisphereIntensityValue",
      displayExposure: "displayExposureValue",
      displayContrast: "displayContrastValue",
      verticalScale: "verticalValue",
      crownX: "crownXValue",
      crownY: "crownYValue",
      crownZ: "crownZValue",
    };

    const comparisonSetting = {
      type: "choice",
      name: "comparisonMode",
      label: "Composition",
      options: [
        ["bare", "Sol nu"],
        ["vegetation", "Scène 3D"],
        ["source", "LiDAR HD"],
        ["overlay", "3D + LiDAR"],
      ],
    };
    const renderModeSetting = {
      type: "choice",
      name: "renderMode",
      label: "Style du modèle",
      options: [
        ["ortho", "Orthophoto"],
        ["model", "Modèle"],
        ["quality", "Qualité"],
      ],
    };
    const toggle = (id, label) => ({ type: "toggle", id, label });
    const range = (id, label, min, max, step) => ({ type: "range", id, label, min, max, step });
    const select = (id, label, options) => ({ type: "select", id, label, options });
    const action = (id, label, secondary = false) => ({ type: "action", id, label, secondary });

    const ADVANCED_SETTINGS = [
      { title: "Représentation", items: [comparisonSetting, renderModeSetting] },
      {
        title: "Toutes les couches",
        items: [
          toggle("terrainToggle", "Terrain IGN"),
          toggle("buildingsToggle", "Bâtiments 3D"),
          toggle("vegetationToggle", "Végétation"),
          toggle("canopyToggle", "Canopée dense"),
          toggle("understoryToggle", "Strate arbustive"),
          toggle("waterToggle", "Eau"),
          toggle("bridgeToggle", "Ponts"),
          toggle("circularExtentToggle", "Emprise circulaire"),
          toggle("circularBaseToggle", "Socle cylindrique"),
          toggle("geologyToggle", "Carte géologique BRGM"),
          range("geologyOpacity", "Opacité de la géologie", 10, 100, 1),
        ],
      },
      {
        title: "Nuage LiDAR HD",
        note: "Ces réglages prennent effet lorsque le nuage de points est visible.",
        items: [
          select("pointColorMode", "Couleur des points", [
            ["ortho", "Orthophotographie"],
            ["classification", "Classification"],
            ["intensity", "Intensité"],
            ["elevation", "Altitude"],
          ]),
          toggle("foliageGreenToggle", "Feuillage corrigé en vert"),
          range("pointSize", "Taille des points", 40, 320, 1),
          { type: "lidarClasses", label: "Classes LiDAR visibles" },
        ],
      },
      {
        title: "Textures et matériaux",
        items: [
          toggle("terrainTextureToggle", "Orthophoto du terrain"),
          toggle("roofTextureToggle", "Texture des toitures"),
          toggle("wireframeToggle", "Maillage des bâtiments"),
          range("terrainOpacity", "Opacité du terrain", 15, 100, 1),
          range("orthoEast", "Calage photo — est", -12, 12, 0.1),
          range("orthoNorth", "Calage photo — nord", -12, 12, 0.1),
        ],
      },
      {
        title: "Éclairage",
        items: [
          toggle("sunLockToMeasure", "Soleil de l’orthophoto"),
          range("sunHeight", "Hauteur du soleil", 10, 75, 0.1),
          range("sunAzimuth", "Azimut du soleil", 0, 359, 0.1),
          range("sunIntensity", "Intensité du soleil", 0.5, 4, 0.1),
          range("environmentIntensity", "Lumière d’environnement", 0, 0.8, 0.01),
          range("hemisphereIntensity", "Lumière hémisphérique", 0, 1.2, 0.01),
          action("contrastLighting", "Préréglage contrasté", true),
          action("grazingLight", "Lumière rasante (12°)", true),
        ],
      },
      {
        title: "Tonalité",
        items: [
          select("toneMapping", "Courbe de rendu", [
            ["neutral", "Neutre"],
            ["agx", "AgX"],
            ["aces", "ACES Filmic"],
            ["none", "Aucune"],
          ]),
          range("displayExposure", "Exposition", 0.5, 2, 0.05),
          range("displayContrast", "Contraste", 0.8, 1.4, 0.01),
        ],
      },
      {
        title: "Relief et végétation",
        items: [
          range("verticalScale", "Exagération verticale", 100, 250, 1),
          select("foliageShading", "Ombrage du feuillage", [
            ["faceted", "Facettes"],
            ["smooth", "Lissé"],
          ]),
          range("crownX", "Houppiers — largeur est-ouest", 20, 150, 1),
          range("crownY", "Houppiers — hauteur", 20, 150, 1),
          range("crownZ", "Houppiers — largeur nord-sud", 20, 150, 1),
          action("crownReset", "Rétablir la forme mesurée", true),
        ],
      },
      {
        title: "Navigation visuelle",
        items: [
          toggle("centerRotationToggle", "Rotation autour du centre"),
          action("viewReset", "Vue générale", true),
          action("viewCentre", "Vue centrale", true),
          action("viewRoof", "Vue des toitures", true),
        ],
      },
      {
        title: "Actions",
        items: [
          action("resetSettings", "Réinitialiser tous les réglages", true),
          action("exportPng", "Exporter la vue en PNG"),
        ],
      },
      { title: "Profils de réglages", type: "profiles", items: [] },
    ];

    const elements = {
      stack: document.getElementById("sphereStack"),
      frame: document.getElementById("sceneFrame"),
      viewerStatus: document.getElementById("viewerStatus"),
      menuButtons: [...document.querySelectorAll("[data-menu-button]")],
      menus: {
        spheres: document.getElementById("spheresMenu"),
        display: document.getElementById("displayMenu"),
        more: document.getElementById("moreMenu"),
      },
    };
    const state = {
      activeSphere: 1,
      openedSphere: 1,
      sphereNodes: [],
      wheelLocked: false,
      touchStartY: null,
      activeMenu: null,
      viewerDocument: null,
    };

    function isMobile() {
      return window.matchMedia(MOBILE_QUERY).matches;
    }

    function setActiveMenu(menu) {
      state.activeMenu = menu;
      for (const [name, panel] of Object.entries(elements.menus)) {
        panel.hidden = name !== menu;
      }
      for (const button of elements.menuButtons) {
        const active = button.dataset.menuButton === menu;
        button.setAttribute("aria-expanded", String(active));
      }
      // Le panneau des sphères est maintenant fermé à l'ouverture. Son gabarit n'existe
      // donc pas encore lors du premier calcul : le recalculer après l'avoir affiché.
      if (menu === "spheres") layoutSpheres();
    }

    function toggleMenu(menu) {
      setActiveMenu(state.activeMenu === menu ? null : menu);
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function renderSetting(setting) {
      if (setting.type === "choice") {
        const groupName = `ui-${setting.name}-${Math.random().toString(36).slice(2)}`;
        const options = setting.options.map(([value, label]) => `
          <label>
            <input type="radio" name="${groupName}" data-viewer-name="${setting.name}" value="${value}" disabled />
            <span>${escapeHtml(label)}</span>
          </label>
        `).join("");
        return `
          <fieldset class="setting-choice">
            <legend>${escapeHtml(setting.label)}</legend>
            <div class="setting-choice__options">${options}</div>
          </fieldset>
        `;
      }
      if (setting.type === "toggle") {
        return `
          <label class="setting-toggle">
            <span>${escapeHtml(setting.label)}</span>
            <input type="checkbox" data-viewer-id="${setting.id}" disabled />
          </label>
        `;
      }
      if (setting.type === "range") {
        return `
          <label class="setting-range">
            <span>${escapeHtml(setting.label)}</span>
            <output data-setting-output="${setting.id}">—</output>
            <input type="range" min="${setting.min}" max="${setting.max}" step="${setting.step}" data-viewer-id="${setting.id}" disabled />
          </label>
        `;
      }
      if (setting.type === "select") {
        const options = setting.options.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("");
        return `
          <label class="setting-select">
            <span>${escapeHtml(setting.label)}</span>
            <select data-viewer-id="${setting.id}" disabled>${options}</select>
          </label>
        `;
      }
      if (setting.type === "action") {
        return `<button class="settings-action${setting.secondary ? " settings-action--secondary" : ""}" type="button" data-viewer-action="${setting.id}" disabled>${escapeHtml(setting.label)}</button>`;
      }
      if (setting.type === "lidarClasses") {
        return `
          <fieldset class="lidar-classes">
            <legend>${escapeHtml(setting.label)}</legend>
            <div class="lidar-class-list" data-lidar-class-list><p class="settings-note">Classes disponibles après le chargement de la dalle.</p></div>
          </fieldset>
        `;
      }
      return "";
    }

    function renderProfiles() {
      return `
        <section class="settings-group settings-profiles">
          <h3>Profils de réglages</h3>
          <p class="settings-note">Enregistrez l’ensemble des paramètres visuels dans un fichier JSON, puis rechargez-le pour retrouver ce rendu.</p>
          <div class="profile-actions">
            <button class="settings-action" type="button" data-settings-export disabled>Enregistrer en JSON</button>
            <label class="settings-action settings-action--secondary" data-settings-import-label>
              Charger un JSON
              <input type="file" accept="application/json,.json" data-settings-import disabled />
            </label>
          </div>
          <output class="profile-feedback" data-profile-feedback role="status" aria-live="polite"></output>
        </section>
      `;
    }

    function renderSettingsGroups(groups) {
      return groups.map((group) => {
        if (group.type === "profiles") return renderProfiles();
        const condition = group.condition ? ` data-condition="${group.condition}"` : "";
        const note = group.note ? `<p class="settings-note">${escapeHtml(group.note)}</p>` : "";
        return `
          <section class="settings-group"${condition}>
            <h3>${escapeHtml(group.title)}</h3>
            ${note}
            <div class="settings-fields">${group.items.map(renderSetting).join("")}</div>
          </section>
        `;
      }).join("");
    }

    function buildDisplaySettings() {
      document.getElementById("displaySettings").innerHTML = renderSettingsGroups(ADVANCED_SETTINGS);
    }

    function renderLayer(layer, sphereIndex, layerIndex) {
      const dynamicValue = layer.dataKey ? ` data-live-value="${layer.dataKey}"` : "";
      const dynamicSource = layer.dataKey ? ` data-live-source="${layer.dataKey}"` : "";
      const dynamicRow = layer.dataKey ? ` data-live-row="${layer.dataKey}"` : "";
      const control = layer.control
        ? `<button
            class="switch"
            type="button"
            data-sphere="${sphereIndex}"
            data-layer="${layerIndex}"
            aria-label="Afficher ${escapeHtml(layer.name)}"
            aria-pressed="${layer.enabled}"
          ></button>`
        : `<span class="datum"${dynamicValue}>${escapeHtml(layer.value)}</span>`;

      return `
        <div class="data-layer"${dynamicRow}>
          <span class="data-layer__text">
            <span class="data-layer__name">${escapeHtml(layer.name)}</span>
            <span class="data-layer__source"${dynamicSource}>${escapeHtml(layer.source)}</span>
          </span>
          ${control}
        </div>
      `;
    }

    function renderSphere(sphere, sphereIndex) {
      const layers = sphere.layers
        .map((layer, layerIndex) => renderLayer(layer, sphereIndex, layerIndex))
        .join("");
      const notice = sphere.notice
        ? `<p class="sphere-notice"><strong>À savoir</strong>${escapeHtml(sphere.notice)}</p>`
        : "";
      const officialLink = sphere.officialLink
        ? `<a class="sphere-official-link" href="${escapeHtml(sphere.officialLink.href)}" target="_blank" rel="noreferrer">${escapeHtml(sphere.officialLink.label)}<span aria-hidden="true">↗</span></a>`
        : "";

      return `
        <section class="sphere" style="--sphere:${sphere.color}" data-index="${sphereIndex}" data-sphere-id="${sphere.id}">
          <button class="sphere-head" type="button" data-sphere-head="${sphereIndex}" aria-expanded="false">
            <span class="sphere-index">0${sphereIndex + 1}</span>
            <span>
              <span class="sphere-name">${escapeHtml(sphere.name)}</span>
              <span class="sphere-summary">${escapeHtml(sphere.summary)}</span>
            </span>
            <span class="sphere-count">${sphere.layers.length}</span>
          </button>
          <div class="sphere-body">
            <div class="sphere-body-inner">
              ${notice}
              <div class="layer-list">${layers}</div>
              ${officialLink}
            </div>
          </div>
        </section>
      `;
    }

    function buildSpheres() {
      const cards = SPHERES.map(renderSphere).join("");
      elements.stack.innerHTML = cards;
      state.sphereNodes = [...elements.stack.querySelectorAll(".sphere")];
      layoutSpheres();
    }

    function weatherApiBaseUrl() {
      const localLiveServer = ["127.0.0.1", "localhost"].includes(window.location.hostname)
        && window.location.port === "5501";
      return localLiveServer ? `${window.location.protocol}//${window.location.hostname}:8080` : "";
    }

    function formatTemperature(value) {
      return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} °C`;
    }

    function updateLiveDatum(key, value, source, stateName = "ready", level = "") {
      const datum = elements.stack.querySelector(`[data-live-value="${key}"]`);
      const sourceNode = elements.stack.querySelector(`[data-live-source="${key}"]`);
      if (datum) {
        datum.textContent = value;
        datum.dataset.state = stateName;
        if (level) datum.dataset.level = level;
        else delete datum.dataset.level;
      }
      if (sourceNode) sourceNode.textContent = source;
    }

    async function refreshAtmosphere() {
      const query = new URLSearchParams({
        lat: String(WEATHER_COORDINATES.latitude),
        lon: String(WEATHER_COORDINATES.longitude),
      });
      try {
        const response = await fetch(`${weatherApiBaseUrl()}/api/v2/weather/temperature?${query}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`service météo HTTP ${response.status}`);
        const weather = await response.json();
        const current = Number(weather.temperature?.valueCelsius);
        const minimum = Number(weather.today?.minimumC);
        const maximum = Number(weather.today?.maximumC);
        if (!Number.isFinite(current)) throw new Error("température météo absente");

        const provider = weather.provenance?.source?.provider || "Service météo";
        const currentNature = weather.temperature?.nature === "station_adjusted_by_model"
          ? "estimation station + modèle"
          : weather.temperature?.nature === "station_observation"
            ? "observation locale"
            : "estimation du modèle";
        updateLiveDatum("weather-current", formatTemperature(current), `${provider} · ${currentNature}`);
        if (
          weather.today?.nature === "model_forecast"
          && Number.isFinite(minimum)
          && Number.isFinite(maximum)
        ) {
          updateLiveDatum("weather-minimum", formatTemperature(minimum), "Météo-France · prévision du jour");
          updateLiveDatum("weather-maximum", formatTemperature(maximum), "Météo-France · prévision du jour");
        } else {
          updateLiveDatum("weather-minimum", "Indisponible", "Prévision quotidienne indisponible", "error");
          updateLiveDatum("weather-maximum", "Indisponible", "Prévision quotidienne indisponible", "error");
        }
      } catch (error) {
        console.warn("Atmosphère : données météo indisponibles", error);
        for (const key of ["weather-current", "weather-minimum", "weather-maximum"]) {
          const datum = elements.stack.querySelector(`[data-live-value="${key}"]`);
          if (datum?.dataset.state === "ready") continue;
          updateLiveDatum(key, "Indisponible", "Service météo · nouvelle tentative automatique", "error");
        }
      }
    }

    function vigilanceLevel(period, phenomenonCode) {
      if (!period) return null;
      if (phenomenonCode === "overall") return period.overall_level || null;
      const phenomena = Array.isArray(period.phenomena) ? period.phenomena : [];
      return phenomena.find((phenomenon) => phenomenon?.code === phenomenonCode)?.level || {
        code: "green",
        rank: 0,
        label: "Vigilance verte",
      };
    }

    function vigilanceValue(todayLevel, tomorrowLevel) {
      const today = String(todayLevel?.label || "Indisponible").replace(/^Vigilance\s+/i, "");
      if (!tomorrowLevel) return today;
      const tomorrow = String(tomorrowLevel.label || "Indisponible").replace(/^Vigilance\s+/i, "");
      return `${today} / ${tomorrow}`;
    }

    function highestVigilanceLevel(...levels) {
      return levels
        .filter(Boolean)
        .sort((left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0))[0] || null;
    }

    function orderVigilanceAlerts() {
      const list = elements.stack.querySelector('[data-sphere-id="risks"] .layer-list');
      if (!list) return;
      const rows = [...list.querySelectorAll("[data-live-row^='vigilance-']")];
      const overall = rows.find((row) => row.dataset.liveRow === "vigilance-overall");
      const phenomenonOrder = new Map(VIGILANCE_PHENOMENA.map(([code], index) => [`vigilance-${code}`, index]));
      const alerts = rows
        .filter((row) => row !== overall)
        .sort((left, right) => {
          const severity = Number(right.dataset.vigilanceRank || 0) - Number(left.dataset.vigilanceRank || 0);
          if (severity !== 0) return severity;
          return Number(phenomenonOrder.get(left.dataset.liveRow) ?? 99)
            - Number(phenomenonOrder.get(right.dataset.liveRow) ?? 99);
        });
      if (overall) list.appendChild(overall);
      for (const alert of alerts) list.appendChild(alert);
    }

    async function refreshVigilance() {
      const query = new URLSearchParams({ department_code: "30" });
      try {
        const response = await fetch(`${weatherApiBaseUrl()}/api/v2/vigilance?${query}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`service Vigilance HTTP ${response.status}`);
        const vigilance = await response.json();
        const periods = Array.isArray(vigilance.periods) ? vigilance.periods : [];
        const today = periods.find((period) => period?.day === "today");
        const tomorrow = periods.find((period) => period?.day === "tomorrow") || null;
        if (vigilance.data_status !== "available" || !today) {
          throw new Error("vigilance officielle incomplète");
        }

        const department = vigilance.location?.department_name || "Gard";
        const freshness = vigilance.freshness_status === "stale" ? " · dernière publication connue" : "";
        const periodLabel = `aujourd’hui${tomorrow ? " / demain" : ""}`;
        const keys = [["overall", "vigilance-overall"], ...VIGILANCE_PHENOMENA.map(([code]) => [code, `vigilance-${code}`])];
        for (const [phenomenonCode, dataKey] of keys) {
          const todayLevel = vigilanceLevel(today, phenomenonCode);
          const tomorrowLevel = vigilanceLevel(tomorrow, phenomenonCode);
          const highestLevel = highestVigilanceLevel(todayLevel, tomorrowLevel);
          updateLiveDatum(
            dataKey,
            vigilanceValue(todayLevel, tomorrowLevel),
            phenomenonCode === "overall"
              ? `Météo-France · ${department} · ${periodLabel}${freshness}`
              : `${department} · ${periodLabel}${freshness}`,
            "ready",
            highestLevel?.code || "",
          );
          const row = elements.stack.querySelector(`[data-live-row="${dataKey}"]`);
          if (row) row.dataset.vigilanceRank = String(highestLevel?.rank ?? 0);
        }
        orderVigilanceAlerts();
      } catch (error) {
        console.warn("Vigilances météo : données indisponibles", error);
        for (const key of ["vigilance-overall", ...VIGILANCE_PHENOMENA.map(([code]) => `vigilance-${code}`)]) {
          const datum = elements.stack.querySelector(`[data-live-value="${key}"]`);
          if (datum?.dataset.state === "ready" || datum?.dataset.state === "stale") {
            const sourceNode = elements.stack.querySelector(`[data-live-source="${key}"]`);
            datum.dataset.state = "stale";
            if (sourceNode) sourceNode.textContent = "Dernière donnée affichée · actualisation impossible";
            continue;
          }
          updateLiveDatum(key, "Indisponible", "Service Vigilance · nouvelle tentative automatique", "error");
        }
      }
    }

    function openedHeight() {
      const breathingRoom = isMobile() ? 34 : 86;
      return Math.min(330, Math.max(260, elements.stack.clientHeight - breathingRoom));
    }

    function sphereHeight(index) {
      return index === state.openedSphere ? openedHeight() : CLOSED_SPHERE_HEIGHT;
    }

    function layoutSpheres() {
      if (!state.sphereNodes.length) return;
      const { activeSphere, openedSphere, sphereNodes } = state;
      const centerY = elements.stack.clientHeight / 2;
      const activeHeight = sphereHeight(activeSphere);
      const positions = new Array(sphereNodes.length);
      positions[activeSphere] = centerY - activeHeight / 2;

      let cursor = positions[activeSphere] - SPHERE_GAP;
      for (let index = activeSphere - 1; index >= 0; index -= 1) {
        cursor -= sphereHeight(index);
        positions[index] = cursor;
        cursor -= SPHERE_GAP;
      }

      cursor = positions[activeSphere] + activeHeight + SPHERE_GAP;
      for (let index = activeSphere + 1; index < sphereNodes.length; index += 1) {
        positions[index] = cursor;
        cursor += sphereHeight(index) + SPHERE_GAP;
      }

      sphereNodes.forEach((node, index) => {
        const isOpen = index === openedSphere;
        const isActive = index === activeSphere;
        node.style.top = `${positions[index]}px`;
        node.style.height = `${sphereHeight(index)}px`;
        node.dataset.open = String(isOpen);
        node.dataset.active = String(isActive);
        node.style.zIndex = isOpen ? "3" : String(2 - Math.min(1, Math.abs(index - activeSphere)));
        node.querySelector(".sphere-head").setAttribute("aria-expanded", String(isOpen));
      });
    }

    function moveSphere(direction) {
      const next = Math.max(0, Math.min(SPHERES.length - 1, state.activeSphere + direction));
      if (next === state.activeSphere) return;
      state.activeSphere = next;
      if (state.openedSphere !== -1) state.openedSphere = next;
      layoutSpheres();
    }

    function viewerDocument() {
      try {
        return elements.frame.contentDocument;
      } catch {
        return null;
      }
    }

    function triggerViewerControl(id) {
      const control = viewerDocument()?.getElementById(id);
      if (!control || control.disabled) return false;
      control.click();
      return true;
    }

    function sourceControlFor(input) {
      const doc = viewerDocument();
      if (!doc) return null;
      if (input.dataset.viewerName) {
        return doc.querySelector(`[name="${input.dataset.viewerName}"][value="${input.value}"]`);
      }
      return input.dataset.viewerId ? doc.getElementById(input.dataset.viewerId) : null;
    }

    function sourceOutputText(id, source) {
      const outputId = OUTPUT_IDS[id];
      const output = outputId ? viewerDocument()?.getElementById(outputId) : null;
      return output?.textContent?.trim() || source?.value || "—";
    }

    function syncSphereControls(doc) {
      SPHERES.forEach((sphere, sphereIndex) => {
        sphere.layers.forEach((layer, layerIndex) => {
          if (!layer.control) return;
          const source = doc.getElementById(layer.control);
          if (!source) return;
          layer.enabled = source.checked;
          elements.stack.querySelector(`[data-sphere="${sphereIndex}"][data-layer="${layerIndex}"]`)
            ?.setAttribute("aria-pressed", String(source.checked));
        });
      });
    }

    function syncLidarClasses(doc) {
      const sourceRows = [...doc.querySelectorAll("#sourcePointLegend label")];
      for (const list of document.querySelectorAll("[data-lidar-class-list]")) {
        if (!sourceRows.length) {
          list.innerHTML = '<p class="settings-note">Classes disponibles après le chargement de la dalle.</p>';
          continue;
        }
        list.innerHTML = sourceRows.map((row, index) => {
          const input = row.querySelector('input[type="checkbox"]');
          const label = row.querySelector(".label")?.textContent || `Classe ${index + 1}`;
          return `
            <label>
              <span>${escapeHtml(label)}</span>
              <input type="checkbox" data-lidar-class-index="${index}" ${input?.checked ? "checked" : ""} />
            </label>
          `;
        }).join("");
      }
    }

    function syncDisplaySettings() {
      const doc = viewerDocument();
      if (!doc) return;

      for (const input of document.querySelectorAll("[data-viewer-id], [data-viewer-name]")) {
        const source = sourceControlFor(input);
        input.disabled = !source || source.disabled;
        if (!source) continue;
        if (input.type === "checkbox" || input.type === "radio") input.checked = source.checked;
        else input.value = source.value;
        const id = input.dataset.viewerId;
        if (id) {
          const output = input.closest(".setting-range")?.querySelector("[data-setting-output]");
          if (output) output.textContent = sourceOutputText(id, source);
        }
      }

      for (const button of document.querySelectorAll("[data-viewer-action]")) {
        const source = doc.getElementById(button.dataset.viewerAction);
        button.disabled = !source || source.disabled;
      }

      const mode = doc.querySelector('[name="comparisonMode"]:checked')?.value;
      for (const group of document.querySelectorAll('[data-condition="lidar-normal"]')) {
        group.hidden = mode !== "source" && mode !== "overlay";
      }

      const ready = Boolean(doc.getElementById("resetSettings"));
      for (const control of document.querySelectorAll("[data-settings-export], [data-settings-import]")) {
        control.disabled = !ready;
      }
      syncSphereControls(doc);
      syncLidarClasses(doc);
    }

    function forwardSettingEvent(event) {
      const input = event.target.closest("[data-viewer-id], [data-viewer-name]");
      if (!input || input.disabled) return;
      const source = sourceControlFor(input);
      if (!source || source.disabled) return;

      if (input.dataset.viewerName) {
        if (event.type === "change") source.click();
      } else if (source.type === "checkbox") {
        if (event.type === "change" && source.checked !== input.checked) source.click();
      } else {
        source.value = input.value;
        source.dispatchEvent(new Event(event.type, { bubbles: true }));
      }
      window.requestAnimationFrame(syncDisplaySettings);
    }

    function profileFeedback(message, stateName = "success") {
      const output = document.querySelector("[data-profile-feedback]");
      if (!output) return;
      output.textContent = message;
      output.dataset.state = stateName;
    }

    function serializableControlValue(control) {
      if (control.type === "checkbox") return control.checked;
      if (control.type === "range" || control.type === "number") return Number(control.value);
      return control.value;
    }

    function captureSettingsProfile() {
      const doc = viewerDocument();
      if (!doc) throw new Error("Le visualiseur n’est pas prêt.");
      const ids = [...new Set(
        ADVANCED_SETTINGS.flatMap((group) => group.items)
          .filter((item) => item.id && item.type !== "action")
          .map((item) => item.id),
      )];
      const settings = {};
      for (const id of ids) {
        const control = doc.getElementById(id);
        if (control) settings[id] = serializableControlValue(control);
      }
      for (const name of ["comparisonMode", "renderMode"]) {
        settings[name] = doc.querySelector(`[name="${name}"]:checked`)?.value ?? null;
      }
      settings.lidarClasses = [...doc.querySelectorAll("#sourcePointLegend label")].map((row, index) => ({
        index,
        label: row.querySelector(".label")?.textContent || `Classe ${index + 1}`,
        visible: row.querySelector('input[type="checkbox"]')?.checked ?? true,
      }));
      const scene = new URL(elements.frame.src).searchParams.get("scene");
      return {
        schema: SETTINGS_SCHEMA,
        version: SETTINGS_VERSION,
        exportedAt: new Date().toISOString(),
        scene,
        settings,
      };
    }

    function exportSettingsProfile() {
      try {
        const profile = captureSettingsProfile();
        const blob = new Blob([`${JSON.stringify(profile, null, 2)}\n`], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
        link.href = url;
        link.download = `affichage-3d-${profile.scene || "dalle"}-${stamp}.json`;
        link.click();
        URL.revokeObjectURL(url);
        profileFeedback("Profil JSON enregistré.");
      } catch (error) {
        profileFeedback(error.message || "Impossible d’enregistrer le profil.", "error");
      }
    }

    function applyControlValue(control, value) {
      if (!control || control.disabled) return;
      if (control.type === "checkbox") {
        if (control.checked !== Boolean(value)) control.click();
        return;
      }
      control.value = String(value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function applySettingsProfile(profile) {
      if (!profile || profile.schema !== SETTINGS_SCHEMA || profile.version !== SETTINGS_VERSION) {
        throw new Error("Ce fichier n’est pas un profil d’affichage 3D compatible.");
      }
      if (!profile.settings || typeof profile.settings !== "object") {
        throw new Error("Le profil ne contient aucun réglage.");
      }
      const doc = viewerDocument();
      if (!doc) throw new Error("Le visualiseur n’est pas prêt.");
      const values = profile.settings;

      for (const name of ["comparisonMode", "renderMode"]) {
        const value = values[name];
        const radio = typeof value === "string"
          ? doc.querySelector(`[name="${name}"][value="${CSS.escape(value)}"]`)
          : null;
        if (radio && !radio.checked) radio.click();
      }

      const deferredIds = new Set(["sunLockToMeasure"]);
      for (const [id, value] of Object.entries(values)) {
        if (["comparisonMode", "renderMode", "lidarClasses"].includes(id) || deferredIds.has(id)) continue;
        applyControlValue(doc.getElementById(id), value);
      }
      for (const id of deferredIds) {
        if (Object.hasOwn(values, id)) applyControlValue(doc.getElementById(id), values[id]);
      }

      if (Array.isArray(values.lidarClasses)) {
        const sourceInputs = [...doc.querySelectorAll('#sourcePointLegend input[type="checkbox"]')];
        for (const item of values.lidarClasses) {
          const input = sourceInputs[Number(item.index)];
          if (input && input.checked !== Boolean(item.visible)) input.click();
        }
      }
      syncDisplaySettings();
      window.setTimeout(syncDisplaySettings, 250);
    }

    async function importSettingsProfile(file) {
      try {
        const profile = JSON.parse(await file.text());
        applySettingsProfile(profile);
        profileFeedback(`Profil « ${file.name} » chargé.`);
      } catch (error) {
        profileFeedback(error.message || "Le fichier JSON est illisible.", "error");
      }
    }

    buildDisplaySettings();

    elements.menus.display.addEventListener("input", forwardSettingEvent);
    elements.menus.display.addEventListener("change", (event) => {
      if (event.target.matches("[data-settings-import]")) {
        const file = event.target.files?.[0];
        if (file) importSettingsProfile(file);
        event.target.value = "";
        return;
      }
      const lidarClass = event.target.closest("[data-lidar-class-index]");
      if (lidarClass) {
        const source = viewerDocument()?.querySelectorAll('#sourcePointLegend input[type="checkbox"]')[Number(lidarClass.dataset.lidarClassIndex)];
        if (source && source.checked !== lidarClass.checked) source.click();
        syncDisplaySettings();
        return;
      }
      forwardSettingEvent(event);
    });
    elements.menus.display.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-viewer-action]");
      if (actionButton) {
        triggerViewerControl(actionButton.dataset.viewerAction);
        window.requestAnimationFrame(syncDisplaySettings);
        window.setTimeout(syncDisplaySettings, 120);
        return;
      }
      if (event.target.closest("[data-settings-export]")) exportSettingsProfile();
    });

    elements.stack.addEventListener("click", (event) => {
      const head = event.target.closest("[data-sphere-head]");
      if (head) {
        const next = Number(head.dataset.sphereHead);
        state.activeSphere = next;
        state.openedSphere = state.openedSphere === next ? -1 : next;
        layoutSpheres();
        return;
      }

      const toggle = event.target.closest(".switch");
      if (!toggle) return;
      const sphereIndex = Number(toggle.dataset.sphere);
      const layerIndex = Number(toggle.dataset.layer);
      const layer = SPHERES[sphereIndex]?.layers[layerIndex];
      if (!layer?.control) return;
      layer.enabled = !layer.enabled;
      toggle.setAttribute("aria-pressed", String(layer.enabled));
      triggerViewerControl(layer.control);
    });

    elements.stack.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (state.wheelLocked || Math.abs(event.deltaY) < 4) return;
      state.wheelLocked = true;
      moveSphere(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => { state.wheelLocked = false; }, 150);
    }, { passive: false });

    elements.stack.addEventListener("touchstart", (event) => {
      state.touchStartY = event.touches[0]?.clientY ?? null;
    }, { passive: true });

    elements.stack.addEventListener("touchend", (event) => {
      if (state.touchStartY === null) return;
      const endY = event.changedTouches[0]?.clientY ?? state.touchStartY;
      const delta = state.touchStartY - endY;
      if (Math.abs(delta) > 28) moveSphere(delta > 0 ? 1 : -1);
      state.touchStartY = null;
    }, { passive: true });

    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input, select, textarea, .switch")) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveSphere(event.key === "ArrowDown" ? 1 : -1);
        state.sphereNodes[state.activeSphere]?.querySelector(".sphere-head")?.focus();
      }
      if (event.key === "Enter" && state.openedSphere === -1 && !event.target.closest(".sphere-head")) {
        state.openedSphere = state.activeSphere;
        layoutSpheres();
      }
      if (event.key === "Escape" && state.activeMenu) {
        setActiveMenu(null);
        return;
      }
      if (event.key === "Escape" && state.openedSphere !== -1) {
        state.openedSphere = -1;
        layoutSpheres();
      }
    });

    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        triggerViewerControl(button.dataset.view);
        document.querySelectorAll("[data-view]").forEach((candidate) => {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        });
      });
    });

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        const radio = viewerDocument()?.querySelector(`[name="comparisonMode"][value="${mode}"]`);
        radio?.click();
        document.querySelectorAll("[data-mode]").forEach((candidate) => {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        });
      });
    });

    function mirrorText(sourceId, targetId) {
      const source = viewerDocument()?.getElementById(sourceId);
      const target = document.getElementById(targetId);
      if (!source || !target) return;
      const update = () => { target.textContent = source.textContent || "—"; };
      update();
      new MutationObserver(update).observe(source, { childList: true, characterData: true, subtree: true });
    }

    function syncViewerStatus(status) {
      const update = () => {
        const statusText = status.textContent || "";
        const ready = READY_STATUS.test(statusText);
        elements.viewerStatus.textContent = ready ? "Scène 3D prête" : (statusText || "Scène chargée");
        elements.viewerStatus.dataset.state = ready ? "ready" : "loading";
      };
      update();
      new MutationObserver(update).observe(status, { childList: true, characterData: true, subtree: true });
    }

    function initializeViewer() {
      const doc = viewerDocument();
      if (!doc) return;

      const style = doc.createElement("style");
      style.textContent = VIEWER_STYLE;
      doc.head.appendChild(style);

      mirrorText("buildingCount", "buildingCount");
      mirrorText("elevationRange", "elevationRange");

      // La dalle doit pouvoir être déplacée depuis cette interface. Le visualiseur peut avoir
      // mémorisé un pivot centré dans une session experte : on le désactive ici à l'ouverture.
      const centerRotation = doc.getElementById("centerRotationToggle");
      if (centerRotation?.checked) {
        centerRotation.checked = false;
        centerRotation.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const status = doc.getElementById("status");
      if (status) syncViewerStatus(status);

      if (state.viewerDocument !== doc) {
        const scheduleSync = () => window.requestAnimationFrame(syncDisplaySettings);
        doc.addEventListener("input", scheduleSync);
        doc.addEventListener("change", scheduleSync);
        const lidarLegend = doc.getElementById("sourcePointLegend");
        if (lidarLegend) {
          new MutationObserver(scheduleSync).observe(lidarLegend, {
            childList: true,
            subtree: true,
          });
        }
        state.viewerDocument = doc;
      }
      syncDisplaySettings();
    }

    for (const button of elements.menuButtons) {
      button.addEventListener("click", () => toggleMenu(button.dataset.menuButton));
    }
    elements.frame.addEventListener("load", initializeViewer);
    if (elements.frame.contentDocument?.readyState === "complete") initializeViewer();

    window.addEventListener("resize", layoutSpheres);
    buildSpheres();
    refreshAtmosphere();
    refreshVigilance();
    window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshAtmosphere();
      refreshVigilance();
    }, LIVE_DATA_REFRESH_MS);
