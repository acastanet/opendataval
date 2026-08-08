import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSM } from "three/addons/csm/CSM.js";
import {
  MODULES_DALLE,
  modulesConcernant,
  spheresOrdonnees,
} from "./modules/index.js";
import { entreeDepuisManifeste } from "./manifeste-vers-entree.js";

const BASE = "/api/v2/sites/viewer/";

const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const panelStatus = document.querySelector(".panel__status");
const loadProgress = document.querySelector("#loadProgress");
const errorBox = document.querySelector("#error");
const compass = document.querySelector(".north");
const scaleBar = document.querySelector("#scaleBar");
const scaleLabel = document.querySelector("#scaleLabel");
const buildingDetails = document.querySelector("#buildingDetails");
const cameraPoseToast = document.querySelector("#cameraPoseToast");
const dataInfoDialog = document.querySelector("#dataInfoDialog");
const helpDialog = document.querySelector("#helpDialog");
const controlPanel = document.querySelector("#controlPanel");
const panelToggle = document.querySelector("#panelToggle");
const expertControls = document.querySelector("#expertControls");

function valeurLisible(donnee) {
  if (donnee.value === null || donnee.value === undefined || donnee.value === "") return "—";
  if (Array.isArray(donnee.value)) return `${donnee.value.length} valeurs`;
  const valeur = typeof donnee.value === "object"
    ? JSON.stringify(donnee.value)
    : String(donnee.value);
  return donnee.unit ? `${valeur} ${donnee.unit}` : valeur;
}

function ligneDonnee(donnee, options = {}) {
  const ligne = document.createElement("div");
  ligne.className = "sphere-data";
  if (options.module) ligne.dataset.module = options.module;
  const cle = document.createElement("span");
  cle.className = "sphere-data__key";
  cle.textContent = donnee.key.replaceAll("_", " ");
  const valeur = document.createElement("strong");
  valeur.className = "sphere-data__value";
  valeur.textContent = valeurLisible(donnee);
  ligne.append(cle, valeur);
  if (Array.isArray(donnee.value)) {
    const serie = document.createElement("span");
    serie.className = "sphere-data__series";
    serie.textContent = "Série";
    ligne.append(serie);
  }
  return ligne;
}

/** Construit le panneau produit en DOM pur, avec repli générique pour toute donnée inconnue. */
function construirePanneau(manifeste) {
  const racine = document.querySelector("#sphereControls");
  const fragments = spheresOrdonnees(manifeste).map((sphere) => {
    const details = document.createElement("details");
    details.className = "sphere-section";
    const summary = document.createElement("summary");
    const puce = document.createElement("span");
    puce.className = "sphere-section__dot";
    puce.style.backgroundColor = sphere.couleur;
    const label = document.createElement("span");
    label.className = "sphere-section__label";
    label.textContent = sphere.label;
    const compte = document.createElement("span");
    compte.className = "sphere-section__count";
    compte.textContent = sphere.donnees.length === 0
      ? "aucune donnée"
      : `${sphere.donnees.length} donnée${sphere.donnees.length > 1 ? "s" : ""}`;
    summary.append(puce, label, compte);
    const contenu = document.createElement("div");
    contenu.className = "sphere-section__body";
    const ctx = {
      ajouterDonnee(donnee, options) {
        contenu.append(ligneDonnee(donnee, options));
      },
    };
    for (const module of sphere.modules) module.panneau?.(manifeste, ctx);
    for (const donnee of sphere.generiques) ctx.ajouterDonnee(donnee, { generique: true });
    if (!contenu.childElementCount) {
      const vide = document.createElement("p");
      vide.className = "notice";
      vide.textContent = "Aucune donnée collectée dans cette sphère.";
      contenu.append(vide);
    }
    details.append(summary, contenu);
    return details;
  });
  racine.replaceChildren(...fragments);

  // Les commandes du moteur restent disponibles, mais quittent le premier niveau produit.
  const couches = document.querySelector("#layersControls");
  const expertBody = expertControls.querySelector(".expert__body");
  couches.removeAttribute("open");
  expertBody.prepend(couches);

  const actifs = modulesConcernant(manifeste);
  const sources = actifs.flatMap((module) => module.provenance?.(manifeste) ?? []);
  const dialogue = document.querySelector("#dataInfoContent");
  if (sources.length > 0) {
    const section = document.createElement("section");
    section.className = "data-section data-section--wide module-provenance";
    const titre = document.createElement("h3");
    titre.textContent = "Microservices contributeurs";
    const liste = document.createElement("ul");
    const uniques = new Map(sources.map((source) => [`${source.producer}::${source.dataset}`, source]));
    for (const source of uniques.values()) {
      const item = document.createElement("li");
      item.textContent = `${source.producer} · ${source.dataset}`;
      liste.append(item);
    }
    section.append(titre, liste);
    dialogue.append(section);
  }
}

const buildingMetrics = buildingDetails.querySelector(".building-metrics");
const buildingAttributeFields = new Map();
for (const [id, label] of [
  ["buildingWallMaterial", "Murs (code BD TOPO)"],
  ["buildingRoofMaterial", "Toiture (code BD TOPO)"],
  ["buildingFloorCount", "Nombre d’étages"],
]) {
  const metric = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.id = id;
  description.textContent = "—";
  metric.append(term, description);
  buildingMetrics.append(metric);
  buildingAttributeFields.set(id, description);
}

// Fond clair neutre et brouillard quasi nul, pour ne masquer aucun défaut géométrique.
const BACKGROUND_COLOR = 0xc8d2d8;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);
scene.fog = new THREE.FogExp2(BACKGROUND_COLOR, 0.0002);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(180, 155, 210);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.append(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
// Un environnement neutre très atténué conserve les reflets rasants sans laver les ombres.
const roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnvironment;
const ENVIRONMENT_INTENSITY = 0.08;
scene.environmentIntensity = ENVIRONMENT_INTENSITY;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 15;
controls.maxDistance = 900;

// L'ambiant ayant baissé, le contraste vient du directionnel : c'est lui qui fait lire les
// décrochements de toiture et les ombres portées sur le terrain.
const SUN_INTENSITY = 3.2;
const hemisphere = new THREE.HemisphereLight(0xdfe8f0, 0x8b8578, 0.2);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff6e2, SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun);

function updateShadowMapResolution() {
  if (csm) return;
  const supportsLargeShadowMap = renderer.capabilities.maxTextureSize >= 4096;
  const isComfortableDisplay = devicePixelRatio <= 1.5 && innerWidth >= 720 && innerHeight >= 600;
  const size = supportsLargeShadowMap && isComfortableDisplay ? 4096 : 2048;
  if (sun.shadow.mapSize.x === size) return;
  sun.shadow.mapSize.set(size, size);
  // Three.js alloue la cible au premier rendu. Après un redimensionnement, il faut libérer
  // l'ancienne pour que la nouvelle résolution soit prise en compte.
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
}

// Le soleil vise le centre de la scène chargée, et son frustum d'ombre en épouse la taille :
// une valeur figée conviendrait à une seule emprise et couperait les ombres de toutes les
// autres. Les valeurs d'attente correspondent à l'emprise 200 m.
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;
const sceneCentre = new THREE.Vector3();
let sceneRadius = 135;
// Trois cascades concentrent les texels près de la caméra sur les postes capables de les
// porter. Les petits écrans conservent le directionnel unique : le repli est moins coûteux
// et reste compatible avec les GPU limités à de petites cartes d'ombre.
const csmEnabled =
  renderer.capabilities.maxTextureSize >= 4096 && innerWidth >= 720 && innerHeight >= 600;
const csm = csmEnabled
  ? new CSM({
      camera,
      parent: scene,
      cascades: 3,
      mode: "practical",
      maxFar: 700,
      shadowMapSize: 2048,
      shadowBias: -0.0005,
      lightNear: 1,
      lightFar: 1400,
      lightMargin: 120,
      lightIntensity: SUN_INTENSITY,
    })
  : null;
if (csm) {
  csm.fade = true;
  for (const light of csm.lights) {
    light.color.set(0xfff6e2);
    light.shadow.normalBias = 0.05;
  }
}
sun.visible = !csm;
updateShadowMapResolution();

function sunDistance() {
  return Math.max(300, sceneRadius * 2.5);
}

function fitSunToModel() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  box.getCenter(sceneCentre);
  const size = box.getSize(new THREE.Vector3());
  sceneRadius = Math.max(size.x, size.z) * 0.5 + 20;
  sunTarget.position.copy(sceneCentre);
  const shadow = sun.shadow.camera;
  shadow.left = -sceneRadius;
  shadow.right = sceneRadius;
  shadow.top = sceneRadius;
  shadow.bottom = -sceneRadius;
  shadow.near = 1;
  shadow.far = sunDistance() + sceneRadius * 2 + size.y;
  shadow.updateProjectionMatrix();
  if (csm) {
    csm.maxFar = Math.min(camera.far, Math.max(400, sceneRadius * 4));
    csm.lightFar = csm.maxFar + size.y + 120;
    for (const light of csm.lights) {
      light.shadow.camera.far = csm.lightFar;
      light.shadow.camera.updateProjectionMatrix();
    }
    csm.updateFrustums();
  }
  updateSun();
}

let terrain = null;
let buildings = null;
let model = null;
let currentMetadata = null;
let currentEntry = null;
let sourcePoints = null;
let sourcePointsMetadata = null;
let sourcePointsToken = 0;
let sourcePointsCloud = null;
let hiddenPointClasses = new Set();
let selectedBuilding = null;
let hoveredBuilding = null;
let renderMode = "ortho";
let comparisonMode = "vegetation";
// Le mode de rendu est un préréglage des bascules de texture : dès qu'on en reprend une à la
// main, l'état réel n'est plus celui du préréglage, et le panneau doit le dire.
let customTextures = false;
let qualityFilter = null;
let buildingIndex = new Map();
let degradedCursor = -1;

// Couches facultatives : une emprise sans cours d'eau, ou une exécution antérieure à leur
// introduction, produit une scène parfaitement valable sans elles. Leur bascule se désactive
// alors plutôt que de rester sans effet.
const optionalLayers = [
  {
    node: "Vegetation",
    toggle: "#vegetationToggle",
    absent: "La scène chargée ne contient pas de couche de végétation.",
    castsShadow: true,
    receivesShadow: false,
    object: null,
  },
  {
    node: "Canopee",
    toggle: "#canopyToggle",
    absent: "La scène chargée ne contient pas de massif de canopée dense.",
    castsShadow: true,
    receivesShadow: false,
    object: null,
  },
  {
    // Contrairement aux houppiers, la strate arbustive reçoit les ombres : c'est sur elle
    // que se projettent celles des arbres qui la couvrent, et c'est ce contact qui rend
    // lisible la continuité verticale entre le sol et la canopée.
    node: "Sousbois",
    toggle: "#understoryToggle",
    absent: "Aucune végétation basse ou moyenne (classes LiDAR 3 et 4) dans cette emprise.",
    castsShadow: true,
    receivesShadow: true,
    object: null,
  },
  {
    node: "Eau",
    toggle: "#waterToggle",
    absent: "Aucun point d’eau (classe LiDAR 9) dans cette emprise.",
    castsShadow: false,
    receivesShadow: false,
    object: null,
  },
  {
    node: "Ponts",
    toggle: "#bridgeToggle",
    absent: "Aucun tablier de pont (classe LiDAR 17) dans cette emprise.",
    castsShadow: true,
    receivesShadow: true,
    object: null,
  },
];

function layer(name) {
  return optionalLayers.find((entry) => entry.node === name)?.object ?? null;
}

// Les houppiers sont mesurés par retombée du profil radial de la canopée, un critère qui
// surestime les couronnes d'un couvert continu — les arbres voisins se touchent et le profil
// ne retombe jamais. Ces facteurs permettent de reprendre la mesure à l'œil, sans regénérer
// la scène ; « Rétablir la mesure » revient toujours à ce que dit la donnée.
let crowns = null;

function readCrowns(vegetation) {
  const step = vegetation?.userData?.crownVertices;
  if (!step) return null;
  let mesh = null;
  vegetation.traverse((object) => {
    if (object.isMesh && object.material?.name === "Feuillage") mesh = object;
  });
  const positions = mesh?.geometry?.getAttribute("position");
  if (!positions || positions.count % step !== 0) return null;
  // Le centre de chaque houppier est la moyenne de ses sommets : c'est autour de lui qu'il
  // faut redimensionner, sinon les arbres se déplaceraient au lieu de changer de taille.
  const centres = new Float32Array((positions.count / step) * 3);
  for (let crown = 0; crown < positions.count / step; crown += 1) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let offset = 0; offset < step; offset += 1) {
      const vertex = crown * step + offset;
      x += positions.getX(vertex);
      y += positions.getY(vertex);
      z += positions.getZ(vertex);
    }
    centres.set([x / step, y / step, z / step], crown * 3);
  }
  return { mesh, step, centres, rest: Float32Array.from(positions.array) };
}

function applyCrownScale() {
  const factors = ["#crownX", "#crownY", "#crownZ"].map(
    (selector) => Number(document.querySelector(selector).value) / 100,
  );
  ["#crownXValue", "#crownYValue", "#crownZValue"].forEach((selector, axis) => {
    document.querySelector(selector).textContent =
      `×${factors[axis].toFixed(2).replace(".", ",")}`;
  });
  if (!crowns) return;
  const positions = crowns.mesh.geometry.getAttribute("position");
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const crown = Math.floor(vertex / crowns.step) * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      const centre = crowns.centres[crown + axis];
      positions.array[vertex * 3 + axis] =
        centre + (crowns.rest[vertex * 3 + axis] - centre) * factors[axis];
    }
  }
  positions.needsUpdate = true;
  applyCrownNormals(positions);
  crowns.mesh.geometry.computeBoundingSphere();
}

// Un redimensionnement inégal déplace les sommets : sans reprise, un houppier aplati garderait
// l'ombrage de sa forme d'origine. Les deux reprises possibles ne diffèrent que par ce qu'elles
// donnent à voir, et la recette a tranché pour la première.
//
// **Schématique** — `computeVertexNormals` sur une primitive non indexée rend une normale par
// face. C'est le rendu retenu : vingt facettes distinctes se lisent comme une représentation,
// au même titre que les volumes LoD2.2 du bâti, et non comme un arbre manqué.
//
// **Lissé** — un houppier étant étoilé autour de son centre (celui-là même qui sert au
// redimensionnement), la normale d'un sommet est la direction qui l'en éloigne. L'intérieur
// devient continu, mais la silhouette d'un solide à douze sommets reste anguleuse : l'écart
// entre les deux se lit comme une bulle. Conservé pour la comparaison, pas par défaut.
function applyCrownNormals(positions) {
  const normals = crowns.mesh.geometry.getAttribute("normal");
  if (!normals) return;
  if (document.querySelector("#foliageShading").value !== "smooth") {
    crowns.mesh.geometry.computeVertexNormals();
    return;
  }
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const crown = Math.floor(vertex / crowns.step) * 3;
    const x = positions.getX(vertex) - crowns.centres[crown];
    const y = positions.getY(vertex) - crowns.centres[crown + 1];
    const z = positions.getZ(vertex) - crowns.centres[crown + 2];
    const length = Math.hypot(x, y, z) || 1;
    normals.setXYZ(vertex, x / length, y / length, z / length);
  }
  normals.needsUpdate = true;
}

const originalMaterials = new WeakMap();
const TERRAIN_FALLBACK_COLOR = new THREE.Color(0xb7b2a2);
const ROOF_FALLBACK_COLOR = new THREE.Color(0xb66f4f);

function materialsOf(object) {
  if (!object.isMesh || !object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function rememberMaterials(root) {
  root?.traverse((object) => {
    materialsOf(object).forEach((material) => {
      if (!originalMaterials.has(material)) {
        originalMaterials.set(material, {
          map: material.map ?? null,
          color: material.color?.clone() ?? null,
        });
      }
    });
  });
}

function materialMatches(root, predicate) {
  let matches = false;
  root?.traverse((object) => {
    materialsOf(object).forEach((material) => {
      if (predicate(material)) matches = true;
    });
  });
  return matches;
}

function setTexture(root, predicate, enabled, fallbackColor) {
  root?.traverse((object) => {
    materialsOf(object).forEach((material) => {
      if (!predicate(material)) return;
      const original = originalMaterials.get(material);
      // Une scène générée avec ROOF_TEXTURE_FROM_ORTHO=0 possède déjà sa propre palette :
      // ne pas l'écraser par la teinte de remplacement d'une texture qui n'existe pas.
      if (!original?.map) return;
      material.map = enabled ? original.map : null;
      if (material.color && original.color) {
        material.color.copy(enabled ? original.color : fallbackColor);
      }
      material.needsUpdate = true;
    });
  });
}

function isTerrainMaterial(material) {
  return material.name === "Orthophoto IGN";
}

function isRoofMaterial(material) {
  return material.name.startsWith("Toitures");
}

function applyTextureState() {
  setTexture(
    terrain,
    isTerrainMaterial,
    document.querySelector("#terrainTextureToggle").checked,
    TERRAIN_FALLBACK_COLOR,
  );
  setTexture(
    buildings,
    isRoofMaterial,
    document.querySelector("#roofTextureToggle").checked,
    ROOF_FALLBACK_COLOR,
  );
}

function configureTextureToggle(selector, root, predicate) {
  const toggle = document.querySelector(selector);
  const available = materialMatches(
    root,
    (material) => predicate(material) && originalMaterials.get(material)?.map,
  );
  toggle.disabled = !available;
  if (!available) toggle.checked = false;
  toggle.closest("label").title = available
    ? ""
    : "Cette texture n’est pas présente dans la scène chargée.";
}

const QUALITY_COLORS = {
  high: new THREE.Color(0x3f9d68),
  medium: new THREE.Color(0xd49a3a),
  low: new THREE.Color(0xc85b4b),
};
const QUALITY_LEVELS = [
  { level: "high", label: "Élevée" },
  { level: "medium", label: "Moyenne" },
  { level: "low", label: "À contrôler" },
];
const qualityMaterialState = new Map();

function numericAttribute(attributes, ...keys) {
  for (const key of keys) {
    const value = Number(attributes?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function reconstructionQuality(attributes) {
  const rmse = numericAttribute(attributes, "rf_rmse_lod22");
  const missing = numericAttribute(attributes, "rf_nodata_frac");
  if (attributes?.rf_lod1_fallback) {
    return {
      level: "low",
      label: "LoD1 de repli",
      detail:
        "Roofer a signalé cette toiture comme dégradée : elle est affichée comme une extrusion horizontale de son emprise.",
    };
  }
  if (attributes?.rf_degraded || attributes?.rf_success === false) {
    return {
      level: "low",
      label: "À contrôler",
      detail: "Roofer signale une reconstruction dégradée ou incomplète.",
    };
  }
  if ((rmse === null || rmse <= 0.15) && (missing === null || missing <= 0.25)) {
    return {
      level: "high",
      label: "Élevée",
      detail: "Géométrie reconstruite sans alerte majeure dans les indicateurs Roofer.",
    };
  }
  const indicators = [
    rmse === null ? null : `écart toiture ${rmse.toFixed(2).replace(".", ",")} m`,
    missing === null ? null : `${Math.round((1 - missing) * 100)} % de couverture LiDAR`,
  ].filter(Boolean);
  return {
    level: "medium",
    label: "Moyenne",
    detail: indicators.length
      ? `Estimation intermédiaire : ${indicators.join(" · ")}.`
      : "Peu d’indicateurs sont disponibles pour qualifier cette reconstruction.",
  };
}

function setQualityColors(enabled) {
  if (!buildings) return;
  if (!enabled) {
    for (const [mesh, state] of qualityMaterialState) {
      mesh.material = state.original;
      state.replacements.forEach((material) => {
        csm?.shaders.delete(material);
        material.dispose();
      });
    }
    qualityMaterialState.clear();
    return;
  }
  for (const building of buildings.children) {
    const color = QUALITY_COLORS[reconstructionQuality(building.userData).level];
    building.traverse((object) => {
      if (!object.isMesh || qualityMaterialState.has(object)) return;
      const original = object.material;
      const source = Array.isArray(original) ? original : [original];
      const replacements = source.map((material) => {
        const replacement = material.clone();
        replacement.map = null;
        replacement.color?.copy(color);
        replacement.roughness = 0.88;
        replacement.needsUpdate = true;
        csm?.setupMaterial(replacement);
        return replacement;
      });
      qualityMaterialState.set(object, { original, replacements });
      object.material = Array.isArray(original) ? replacements : replacements[0];
    });
  }
}

// Isoler un niveau de qualité est la manière la plus courte de vérifier les bâtiments que le
// rapport de validation signale : le décompte devient une sélection, pas une lecture.
function applyQualityFilter() {
  if (!buildings) return;
  for (const building of buildings.children) {
    building.visible =
      !qualityFilter || reconstructionQuality(building.userData).level === qualityFilter;
  }
  if (selectedBuilding && !selectedBuilding.visible) clearBuildingSelection();
}

function updateQualityLegend() {
  const legend = document.querySelector("#qualityLegend");
  if (renderMode !== "quality" || !buildings) {
    legend.hidden = true;
    legend.replaceChildren();
    return;
  }
  const counts = new Map(QUALITY_LEVELS.map(({ level }) => [level, 0]));
  for (const building of buildings.children) {
    const { level } = reconstructionQuality(building.userData);
    counts.set(level, counts.get(level) + 1);
  }
  legend.replaceChildren(
    ...QUALITY_LEVELS.map(({ level, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(qualityFilter === level));
      button.title = qualityFilter === level ? "Afficher tous les bâtiments" : `Isoler : ${label}`;
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = `#${QUALITY_COLORS[level].getHexString()}`;
      const name = document.createElement("span");
      name.textContent = label;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = counts.get(level).toLocaleString("fr-FR");
      button.append(dot, name, count);
      button.addEventListener("click", () => {
        setQualityFilter(qualityFilter === level ? null : level);
      });
      return button;
    }),
  );
  legend.hidden = false;
}

function setQualityFilter(level) {
  qualityFilter = level;
  applyQualityFilter();
  updateQualityLegend();
}

const RENDER_MODE_DESCRIPTIONS = {
  ortho: "Photographie aérienne IGN drapée sur le relief et les toitures.",
  model: "Volumes simplifiés, sans photographie, pour lire clairement la géométrie.",
  quality: "Qualité estimée : vert élevée, orange moyenne, rouge à contrôler.",
};

function describeRenderMode() {
  document.querySelector("#renderModeDescription").textContent = customTextures
    ? "Textures reprises à la main : l’affichage ne suit plus le préréglage."
    : RENDER_MODE_DESCRIPTIONS[renderMode];
  document.querySelector(".render-modes").dataset.custom = String(customTextures);
}

function setRenderMode(mode) {
  if (!(mode in RENDER_MODE_DESCRIPTIONS)) return;
  renderMode = mode;
  customTextures = false;
  setQualityColors(false);
  qualityFilter = null;
  applyQualityFilter();
  const textured = mode === "ortho";
  for (const selector of ["#terrainTextureToggle", "#roofTextureToggle"]) {
    const toggle = document.querySelector(selector);
    toggle.checked = textured && !toggle.disabled;
  }
  applyTextureState();
  if (mode === "quality") setQualityColors(true);
  updateQualityLegend();
  describeRenderMode();
  const radio = document.querySelector(`input[name="renderMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

// Restauration d'une session précédente : les bascules de texture y étaient déjà réglées, il
// ne faut pas les écraser par le préréglage.
function restoreRenderMode(mode, custom) {
  if (!custom) {
    setRenderMode(mode);
    return;
  }
  renderMode = mode in RENDER_MODE_DESCRIPTIONS ? mode : "ortho";
  customTextures = true;
  setQualityColors(false);
  applyTextureState();
  if (renderMode === "quality") setQualityColors(true);
  updateQualityLegend();
  describeRenderMode();
  const radio = document.querySelector(`input[name="renderMode"][value="${renderMode}"]`);
  if (radio) radio.checked = true;
}

const COMPARISON_DESCRIPTIONS = {
  bare: "Sol classé 2 et bâtiments, sans végétation ni photographie aérienne.",
  vegetation: "Même terrain et même caméra, avec végétation LiDAR et orthophotographie.",
  source: "Points du LAZ colorés par classification, sans interprétation géométrique.",
  overlay: "Nuage mesuré posé sur le modèle reconstruit : l'écart entre les deux se lit directement.",
};

function describeComparisonMode(message = null) {
  const description = document.querySelector("#comparisonModeDescription");
  const legend = document.querySelector("#sourcePointLegend");
  const controls = document.querySelector("#sourcePointControls");
  legend.hidden = !showsSourcePoints(comparisonMode) || !sourcePointsMetadata;
  controls.hidden = legend.hidden;
  if (message) {
    description.textContent = message;
    return;
  }
  if (showsSourcePoints(comparisonMode) && sourcePointsMetadata) {
    const rendered = sourcePointsMetadata.renderedPoints.toLocaleString("fr-FR");
    const total = sourcePointsMetadata.sourcePoints.toLocaleString("fr-FR");
    const mode = document.querySelector("#pointColorMode").value;
    const over = comparisonMode === "overlay" ? "Sur le modèle reconstruit : " : "";
    description.textContent =
      `${over}${rendered} points affichés sur ${total} dans le LAZ ; ` +
      `${POINT_COLOR_DESCRIPTIONS[mode] ?? "couleurs par classe"}.`;
    return;
  }
  description.textContent = COMPARISON_DESCRIPTIONS[comparisonMode];
}

function updateSourcePointLegend(metadata) {
  const legend = document.querySelector("#sourcePointLegend");
  const counts = metadata.renderedClassificationCounts ?? {};
  legend.replaceChildren(
    ...Object.entries(counts).map(([code, count]) => {
      const row = document.createElement("label");
      const item = metadata.classificationLegend?.[code] ?? {
        label: `Classe ${code}`,
        color: "rgb(222, 194, 90)",
      };
      // La légende sert aussi de filtre : rien n'est retiré du fichier, seul l'affichage
      // change, ce qui permet d'isoler le sol ou le bâti sans réassembler la scène.
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = !hiddenPointClasses.has(Number(code));
      toggle.addEventListener("change", () => {
        if (toggle.checked) hiddenPointClasses.delete(Number(code));
        else hiddenPointClasses.add(Number(code));
        applyPointClassFilter();
        saveState();
      });
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = item.color;
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = `${item.label} · ${count.toLocaleString("fr-FR")}`;
      label.title = `${label.textContent} — décocher pour masquer cette classe`;
      row.append(toggle, dot, label);
      return row;
    }),
  );
  legend.hidden = !showsSourcePoints(comparisonMode);
}

// Bornes en pixels de la taille d'un point. Sans le plancher, le nuage s'évapore dès qu'on
// prend de la hauteur ; sans le plafond, l'atténuation en fait des disques énormes au ras du
// sol, où la caméra passe le plus clair de son temps.
const pointSizeClamp = { value: new THREE.Vector2(1.2, 26) };

// Le nuage échantillonne l'orthophotographie au shader, à partir de la position Lambert-93
// de chaque point, au lieu de se contenter de la couleur cuite dans `COLOR_0`. C'est ce qui
// met les curseurs de calage au travail sur lui aussi : la photo n'est pas toujours calée sur
// les données bâties, et un recalage qui déplacerait le terrain et les toitures en laissant le
// nuage en place ferait mentir la comparaison des deux représentations.
const pointOrtho = {
  uOrtho: { value: null },
  // Calage total en mètres — celui cuit à la production et celui des curseurs.
  uOrthoOffset: { value: new THREE.Vector2() },
  uOrthoExtent: { value: 1 },
  uOrthoMix: { value: 0 },
  // Contrainte de teinte du feuillage : bornes en degrés, et saturation plancher. Les valeurs
  // viennent de `source-points.json`, pour que le shader et la couleur cuite appliquent la
  // même correction ; celles-ci ne servent que de repli pour un nuage produit avant elle.
  uFoliageGreen: { value: 0 },
  uFoliageHue: { value: new THREE.Vector2(80, 140) },
  uFoliageSaturation: { value: 0.25 },
  // Bornes des codes de classification concernés. Les trois strates végétales sont contiguës
  // (3, 4, 5), un intervalle suffit donc là où un test d'appartenance coûterait une boucle par
  // sommet. `foliageGreenSettings` vérifie cette contiguïté avant de s'y fier.
  uFoliageClasses: { value: new THREE.Vector2(3, 5) },
};

// Repli des seuils, aligné sur les constantes de `source_points.py`.
const FOLIAGE_GREEN_FALLBACK = { hueMin: 80, hueMax: 140, saturationMin: 0.25, classes: [3, 4, 5] };

// Superposé au modèle, le nuage se bat en profondeur avec les surfaces que ses propres points
// ont servi à construire — le terrain est interpolé depuis la classe 2, il coïncide donc avec
// elle à quelques centimètres près, et le rendu se met à grésiller. Un biais rapproche les
// points de la caméra juste assez pour qu'ils gagnent, sans les décoller visiblement : c'est
// une correction d'affichage, pas un déplacement de la mesure.
//
// Il s'exprime en **mètres**, et c'est tout le sujet. Écrit d'abord en profondeur normalisée
// — `gl_Position.z -= biais * gl_Position.w` —, il valait une distance qui croissait comme le
// carré de l'éloignement : à peu près 7 m à cent mètres de la caméra, une trentaine à deux
// cents. Les points passaient alors devant les bâtiments qui auraient dû les masquer, et la
// végétation d'arrière-plan traversait les façades. Appliqué en espace vue, le décalage reste
// celui qu'on a réglé, quelle que soit la distance.
const POINT_DEPTH_BIAS_M = 0.1;
const pointDepthBias = { value: 0 };

// Le nuage LiDAR est le seul objet de la scène rendu en points : son matériau porte donc
// trois besoins qu'aucun matériau standard ne couvre — une taille bornée en pixels, une
// silhouette ronde et un filtre par classe. Tout tient dans un patch de shader ; le
// visualiseur n'a toujours qu'une chaîne de rendu, sans passe de post-traitement.
function patchPointsMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPointSizeClamp = pointSizeClamp;
    shader.uniforms.uDepthBias = pointDepthBias;
    Object.assign(shader.uniforms, pointOrtho);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aVisible;
        attribute vec4 aLidar;
        uniform vec2 uPointSizeClamp;
        uniform vec2 uOrthoOffset;
        uniform float uOrthoExtent;
        uniform float uDepthBias;
        uniform vec2 uFoliageClasses;
        varying float vVisible;
        varying float vShade;
        varying float vFoliage;
        varying vec2 vOrthoUv;`,
      )
      .replace(
        "#include <logdepthbuf_vertex>",
        `gl_PointSize = clamp( gl_PointSize, uPointSizeClamp.x, uPointSizeClamp.y );
        vVisible = aVisible;
        if ( aVisible < 0.5 ) gl_PointSize = 0.0;
        // L'occlusion cuite voyage dans le troisième canal, en octets non normalisés.
        vShade = aLidar.z / 255.0;
        // La classification voyage dans le premier, au même format. Le demi-pas de part et
        // d'autre absorbe l'imprécision du transfert en flottant.
        vFoliage = step( uFoliageClasses.x - 0.5, aLidar.x ) * step( aLidar.x, uFoliageClasses.y + 0.5 );

        // Reprise exacte de \`ortho_uv\` : la scène est recentrée sur le milieu de son
        // emprise, u croît vers l'est et v vers le sud — d'où le signe du calage nord.
        vOrthoUv = vec2(
          0.5 + ( position.x + uOrthoOffset.x ) / uOrthoExtent,
          0.5 + ( position.z - uOrthoOffset.y ) / uOrthoExtent
        );
        #include <logdepthbuf_vertex>`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        // Le biais se pose ici, en espace vue, où il vaut des mètres. La caméra regarde vers
        // les z négatifs : ajouter rapproche. La reprojection est nécessaire, la position
        // écran venant d'être calculée à partir du point non décalé.
        mvPosition.z += uDepthBias;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uOrtho;
        uniform float uOrthoMix;
        uniform float uFoliageGreen;
        uniform vec2 uFoliageHue;
        uniform float uFoliageSaturation;
        varying float vVisible;
        varying float vShade;
        varying float vFoliage;
        varying vec2 vOrthoUv;

        // Un point de végétation prend la couleur de ce qui se trouve à son aplomb dans
        // l'orthophotographie — toiture, route, rocher. Les houppiers se constellent alors de
        // points blancs et roses, comme s'ils poussaient du bâti. Ramener la teinte dans le
        // domaine des verts corrige cela sans toucher à la valeur, qui porte tout le relief.
        vec3 rgbToHsv( vec3 rgb ) {
          float high = max( rgb.r, max( rgb.g, rgb.b ) );
          float low = min( rgb.r, min( rgb.g, rgb.b ) );
          float delta = high - low;
          float hue = 0.0;
          if ( delta > 1e-6 ) {
            if ( high == rgb.r ) hue = mod( ( rgb.g - rgb.b ) / delta, 6.0 );
            else if ( high == rgb.g ) hue = ( rgb.b - rgb.r ) / delta + 2.0;
            else hue = ( rgb.r - rgb.g ) / delta + 4.0;
          }
          return vec3( hue * 60.0, high > 1e-6 ? delta / high : 0.0, high );
        }

        vec3 hsvToRgb( vec3 hsv ) {
          vec3 k = mod( hsv.x / 60.0 + vec3( 5.0, 3.0, 1.0 ), 6.0 );
          return hsv.z - hsv.z * hsv.y * max( vec3( 0.0 ), min( min( k, 4.0 - k ), vec3( 1.0 ) ) );
        }

        // La texture est décodée en linéaire par le matériel, alors que les seuils sont lus sur
        // une palette sRGB : l'aller-retour par la gamma les remet dans leur espace. Une
        // approximation en 2,2 suffit — on contraint une teinte d'affichage, pas une mesure.
        vec3 constrainToGreen( vec3 linear ) {
          vec3 hsv = rgbToHsv( pow( linear, vec3( 1.0 / 2.2 ) ) );
          hsv.x = clamp( hsv.x, uFoliageHue.x, uFoliageHue.y );
          hsv.y = max( hsv.y, uFoliageSaturation );
          return pow( hsvToRgb( hsv ), vec3( 2.2 ) );
        }`,
      )
      .replace(
        "void main() {",
        `void main() {
        // Une taille nulle n'est pas garantie : plusieurs pilotes la ramènent à un pixel.
        if ( vVisible < 0.5 ) discard;
        vec2 fromCentre = gl_PointCoord - vec2( 0.5 );
        if ( dot( fromCentre, fromCentre ) > 0.25 ) discard;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // La texture est déclarée en sRGB : le décodage est fait par le matériel, la valeur
        // lue est donc déjà linéaire et une seconde conversion la délaverait.
        if ( uOrthoMix > 0.5 ) {
          vec3 sampled = texture2D( uOrtho, vOrthoUv ).rgb;
          // La contrainte précède l'occlusion : appliquée après, son plancher de saturation
          // rattraperait l'assombrissement et éclaircirait les points à l'ombre.
          if ( uFoliageGreen > 0.5 && vFoliage > 0.5 ) sampled = constrainToGreen( sampled );
          diffuseColor.rgb = sampled * vShade;
        }`,
      );
  };
  material.customProgramCacheKey = () => "lidar-points";
  return material;
}

// Seuils de la contrainte de teinte, tels que la production les a publiés. Les recopier ici
// aurait créé deux constantes tenues en parallèle, qui divergeraient sans que rien ne le dise :
// le nuage porte les siennes, et le repli ne sert qu'à ceux produits avant leur introduction.
function foliageGreenSettings() {
  const published = sourcePointsMetadata?.foliageGreen;
  if (!published) return FOLIAGE_GREEN_FALLBACK;
  const classes = published.classes ?? FOLIAGE_GREEN_FALLBACK.classes;
  // L'intervalle passé au shader suppose des codes contigus. Ils le sont (3, 4, 5) ; si une
  // évolution les disperse, mieux vaut ne rien corriger que corriger la mauvaise classe.
  const low = Math.min(...classes);
  const high = Math.max(...classes);
  if (high - low + 1 !== classes.length) {
    console.warn("Classes de feuillage non contiguës : contrainte de teinte ignorée.", classes);
    return null;
  }
  return { ...FOLIAGE_GREEN_FALLBACK, ...published, classes };
}

// Le nuage reprend la texture du terrain, celle-là même que les curseurs déplacent. Rien n'est
// recalculé sur les 750 000 points : le calage est un uniform, il suit le curseur au pixel.
function applyPointOrtho() {
  const texture = orthoTexture();
  const extent = orthoExtentM();
  const mode = document.querySelector("#pointColorMode").value;
  const total = totalOrthoOffset();
  pointOrtho.uOrtho.value = texture;
  pointOrtho.uOrthoExtent.value = extent || 1;
  pointOrtho.uOrthoOffset.value.set(total.east, total.north);
  // Sans texture ni emprise connue, le nuage garde la couleur assemblée : c'est le cas d'une
  // scène produite hors couverture, et l'échantillonnage y rendrait du noir.
  pointOrtho.uOrthoMix.value = mode === "ortho" && texture && extent ? 1 : 0;

  const foliage = foliageGreenSettings();
  const wanted = document.querySelector("#foliageGreenToggle")?.checked ?? true;
  pointOrtho.uFoliageGreen.value = foliage && wanted ? 1 : 0;
  if (foliage) {
    pointOrtho.uFoliageHue.value.set(foliage.hueMin, foliage.hueMax);
    pointOrtho.uFoliageSaturation.value = foliage.saturationMin;
    pointOrtho.uFoliageClasses.value.set(
      Math.min(...foliage.classes),
      Math.max(...foliage.classes),
    );
  }
}

function applyPointDepthBias() {
  pointDepthBias.value = comparisonMode === "overlay" ? POINT_DEPTH_BIAS_M : 0;
}

// Le GLB porte la classification, la réflectance et l'occlusion dans un attribut applicatif
// `_LIDAR`, que le chargeur glTF expose en `_lidar`. Le renommer et lui adjoindre la
// visibilité met tout ce que le shader manipule sous des noms qui se lisent.
function prepareSourcePointAttributes(geometry) {
  const lidar = geometry.getAttribute("_lidar");
  if (lidar) geometry.setAttribute("aLidar", lidar);
  else {
    // Nuage produit avant l'introduction de l'attribut : les modes dérivés retombent alors
    // sur la couleur assemblée, sans quoi la scène refuserait de s'afficher.
    const count = geometry.getAttribute("position").count;
    const empty = new Uint8Array(count * 4).fill(255);
    for (let index = 0; index < count; index += 1) empty[index * 4] = 0;
    geometry.setAttribute("aLidar", new THREE.BufferAttribute(empty, 4));
  }
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "aVisible",
    new THREE.BufferAttribute(new Uint8Array(count).fill(1), 1),
  );
  // La couleur assemblée doit survivre au passage par les autres modes : l'attribut `color`
  // est réécrit sur place à chaque bascule, celui-ci reste la référence.
  const color = geometry.getAttribute("color");
  geometry.setAttribute(
    "aBakedColor",
    new THREE.BufferAttribute(color.array.slice(), color.itemSize, color.normalized),
  );
}

function pointSizeFactor() {
  return Number(document.querySelector("#pointSize").value) / 100;
}

// Un disque doit couvrir la maille qui l'a produit, donc valoir plus que son pas : le facteur
// a été calé à l'écran sur l'emprise 200 m, en vue rapprochée — 0,4 m laissait voir le ciel
// entre les tuiles, 0,9 m referme les toitures sans empâter les houppiers.
const POINT_SIZE_TO_SPACING = 2.2;

// Le nuage est dimensionné en mètres, d'après le pas de la décimation qui l'a produit — le
// voxel quand il est actif, l'espacement moyen sinon. Un réglage en pixels était le défaut
// d'origine : constant à toute distance, il donnait un voile uniforme de loin et un nuage
// troué de près, exactement l'inverse du souhaitable.
function applyPointSize() {
  const output = document.querySelector("#pointSizeValue");
  const factor = pointSizeFactor();
  output.textContent = `×${factor.toFixed(1).replace(".", ",")}`;
  if (!sourcePointsCloud) return;
  const spacing = Math.max(
    Number(sourcePointsMetadata?.voxelM) || 0,
    Number(sourcePointsMetadata?.spacingM) || 0.25,
  );
  sourcePointsCloud.material.size = spacing * POINT_SIZE_TO_SPACING * factor;
  sourcePointsCloud.material.needsUpdate = true;
}

function applyPointClassFilter() {
  if (!sourcePointsCloud) return;
  const geometry = sourcePointsCloud.geometry;
  const classes = geometry.getAttribute("aLidar");
  const visible = geometry.getAttribute("aVisible");
  for (let index = 0; index < visible.count; index += 1) {
    visible.array[index] = hiddenPointClasses.has(classes.array[index * 4]) ? 0 : 1;
  }
  visible.needsUpdate = true;
}

const POINT_COLOR_DESCRIPTIONS = {
  ortho: "couleurs de l’orthophotographie IGN",
  classification: "couleurs par classe LiDAR",
  intensity: "réflectance mesurée, cadrée sur ses centiles",
  elevation: "altitude relative au point le plus bas",
};

// Rampe altimétrique : sombre en fond de vallée, claire sur les crêtes. Quatre arrêts
// suffisent à lire un relief, et une rampe plus bavarde se lirait comme une carte. Les
// teintes s'écrivent en entiers : une chaîne « #rrggbb » se confondrait avec un sélecteur
// d'identifiant, que la préparation du visualiseur contrôle par recherche textuelle.
const ELEVATION_RAMP = [0x1d3b58, 0x2f7f6f, 0xc2a75a, 0xf2ece1];
const UNKNOWN_CLASS_COLOR = 0xdec25a;

function rampColor(stops, position) {
  const span = (stops.length - 1) * Math.min(Math.max(position, 0), 1);
  const index = Math.min(Math.floor(span), stops.length - 2);
  const low = new THREE.Color().setHex(stops[index], THREE.SRGBColorSpace);
  const high = new THREE.Color().setHex(stops[index + 1], THREE.SRGBColorSpace);
  return low.lerp(high, span - index);
}

// Le mode photo n'est proposé que si la scène porte une orthophotographie — soit dans sa
// texture, que le nuage échantillonne, soit cuite dans ses couleurs pour les scènes assemblées
// avant cet échantillonnage. Une option muette vaut mieux que silencieusement inopérante.
function configurePointColorModes(metadata) {
  const select = document.querySelector("#pointColorMode");
  const available = Boolean(orthoTexture()) || (metadata?.bakedColorMode ?? "ortho") === "ortho";
  const option = select.querySelector('option[value="ortho"]');
  option.disabled = !available;
  option.title = option.disabled ? "Cette scène a été assemblée sans orthophotographie." : "";
  if (option.disabled && select.value === "ortho") select.value = "classification";
}

function applyPointColorMode() {
  const mode = document.querySelector("#pointColorMode").value;
  if (!sourcePointsCloud) return;
  const geometry = sourcePointsCloud.geometry;
  const baked = geometry.getAttribute("aBakedColor");
  const lidar = geometry.getAttribute("aLidar");
  const color = geometry.getAttribute("color");
  const positions = geometry.getAttribute("position");
  const legend = sourcePointsMetadata?.classificationLegend ?? {};
  applyPointOrtho();
  if (mode === (sourcePointsMetadata?.bakedColorMode ?? "ortho")) {
    color.array.set(baked.array);
    color.needsUpdate = true;
    describeComparisonMode();
    return;
  }
  const palette = new Map();
  for (const [code, item] of Object.entries(legend)) {
    palette.set(Number(code), new THREE.Color().setStyle(item.color, THREE.SRGBColorSpace));
  }
  const fallback = new THREE.Color().setHex(UNKNOWN_CLASS_COLOR, THREE.SRGBColorSpace);
  let lowest = Infinity;
  let highest = -Infinity;
  if (mode === "elevation") {
    for (let index = 0; index < positions.count; index += 1) {
      const height = positions.getY(index);
      if (height < lowest) lowest = height;
      if (height > highest) highest = height;
    }
  }
  const span = highest - lowest || 1;
  const tint = new THREE.Color();
  for (let index = 0; index < color.count; index += 1) {
    const offset = index * 4;
    // L'occlusion cuite voyage dans le troisième canal : elle doit survivre au changement
    // de mode, sans quoi le relief disparaîtrait dès qu'on quitte la couleur assemblée.
    const shade = lidar.array[offset + 2] / 255;
    if (mode === "intensity") {
      const value = lidar.array[offset + 1] / 255;
      tint.setRGB(value, value, value, THREE.SRGBColorSpace);
    } else if (mode === "elevation") {
      tint.copy(rampColor(ELEVATION_RAMP, (positions.getY(index) - lowest) / span));
    } else {
      // Classification, et repli du mode photo quand la scène n'en porte pas : mieux vaut la
      // teinte de classe qu'un nuage noir échantillonné dans une texture absente.
      tint.copy(palette.get(lidar.array[offset]) ?? fallback);
    }
    color.array[offset] = Math.round(tint.r * shade * 255);
    color.array[offset + 1] = Math.round(tint.g * shade * 255);
    color.array[offset + 2] = Math.round(tint.b * shade * 255);
    color.array[offset + 3] = 255;
  }
  color.needsUpdate = true;
  describeComparisonMode();
}

function setLayerChecked(selector, visible) {
  const toggle = document.querySelector(selector);
  if (!toggle || toggle.disabled) return;
  toggle.checked = visible;
}

async function loadSourcePoints() {
  if (sourcePoints) return true;
  if (!currentEntry?.sourcePoints) return false;
  const entry = currentEntry;
  const token = ++sourcePointsToken;
  describeComparisonMode("Chargement du nuage LiDAR témoin…");
  setStatus("loading", "Chargement du nuage LiDAR témoin…");
  try {
    const [gltf, metadata] = await Promise.all([
      loadModel(entry.sourcePoints),
      entry.sourcePointsMetadata
        ? fetch(entry.sourcePointsMetadata).then((response) => {
            if (!response.ok) throw new Error("métadonnées du nuage absentes");
            return response.json();
          })
        : Promise.resolve({}),
    ]);
    if (token !== sourcePointsToken || entry !== currentEntry) {
      disposeObject(gltf.scene);
      return false;
    }
    sourcePoints = gltf.scene;
    sourcePointsMetadata = metadata;
    configurePointColorModes(metadata);
    updateSourcePointLegend(metadata);
    sourcePoints.traverse((object) => {
      if (!object.isPoints) return;
      const previous = object.material;
      object.material = patchPointsMaterial(
        new THREE.PointsMaterial({
          name: "Nuage LiDAR HD",
          // La taille définitive est posée par `applyPointSize`, qui la tire de l'espacement
          // mesuré du nuage. Elle est ici en mètres, jamais en pixels.
          size: 0.25,
          sizeAttenuation: true,
          vertexColors: true,
        }),
      );
      previous?.dispose();
      object.frustumCulled = false;
      prepareSourcePointAttributes(object.geometry);
      sourcePointsCloud = object;
    });
    applyPointSize();
    applyPointClassFilter();
    applyPointColorMode();
    sourcePoints.scale.y = Number(document.querySelector("#verticalScale").value) / 100;
    sourcePoints.visible = showsSourcePoints(comparisonMode);
    scene.add(sourcePoints);
    describeComparisonMode();
    updateDataInformation(currentMetadata, currentEntry);
    setStatus(
      "ready",
      showsSourcePoints(comparisonMode) ? "Nuage LiDAR prêt" : "Scène prête",
    );
    return true;
  } catch (error) {
    if (token === sourcePointsToken) {
      console.error(error);
      setComparisonMode("vegetation");
      describeComparisonMode(`Nuage source indisponible : ${error.message}. Retour au modèle.`);
      setStatus("error", "Nuage LiDAR indisponible — modèle rétabli");
    }
    return false;
  }
}

function showsSourcePoints(mode) {
  return mode === "source" || mode === "overlay";
}

function setComparisonMode(mode) {
  if (!(mode in COMPARISON_DESCRIPTIONS)) return;
  const radioOf = (value) =>
    document.querySelector(`input[name="comparisonMode"][value="${value}"]`);
  if (showsSourcePoints(mode) && radioOf(mode).disabled) return;
  // Un préréglage s'applique quand on choisit un mode, pas quand on le retrouve : la fonction
  // est rappelée à chaque chargement de scène, et écraser alors la couleur des points
  // reviendrait à défaire à chaque changement d'emprise ce que l'utilisateur a réglé.
  const previous = comparisonMode;
  comparisonMode = mode;
  const radio = radioOf(mode);
  if (radio) radio.checked = true;
  // Le modèle disparaît sous le nuage seul, et coexiste avec lui en superposition.
  if (model) model.visible = mode !== "source";
  if (sourcePoints) sourcePoints.visible = showsSourcePoints(mode);
  applyPointDepthBias();

  if (mode === "overlay" && previous !== "overlay") {
    // La superposition ne vaut que si le nuage tranche sur le modèle. Les deux en couleurs
    // d'orthophotographie se confondraient exactement là où il s'agit de les distinguer :
    // le préréglage bascule donc sur la classification, comme les autres modes posent leurs
    // couches. Le sélecteur reste libre ensuite.
    const colorMode = document.querySelector("#pointColorMode");
    if (colorMode.value === "ortho") {
      colorMode.value = "classification";
      applyPointColorMode();
    }
    setRenderMode("ortho");
  }

  if (mode === "bare") {
    setLayerChecked("#terrainToggle", true);
    setLayerChecked("#buildingsToggle", true);
    setLayerChecked("#vegetationToggle", false);
    setLayerChecked("#canopyToggle", false);
    // « Sol nu » veut dire sol nu : la strate arbustive est de la végétation, et la laisser
    // en place masquerait précisément le terrain que ce mode sert à regarder.
    setLayerChecked("#understoryToggle", false);
    setLayerChecked("#waterToggle", true);
    setLayerChecked("#bridgeToggle", true);
    setRenderMode("model");
  } else if (mode === "vegetation") {
    setLayerChecked("#terrainToggle", true);
    setLayerChecked("#buildingsToggle", true);
    setLayerChecked("#vegetationToggle", true);
    setLayerChecked("#canopyToggle", true);
    setLayerChecked("#understoryToggle", true);
    setLayerChecked("#waterToggle", true);
    setLayerChecked("#bridgeToggle", true);
    setRenderMode("ortho");
  }
  if (terrain) terrain.visible = document.querySelector("#terrainToggle").checked;
  if (buildings) buildings.visible = document.querySelector("#buildingsToggle").checked;
  for (const entry of optionalLayers) {
    if (entry.object) entry.object.visible = document.querySelector(entry.toggle).checked;
  }
  describeComparisonMode();
  if (showsSourcePoints(mode)) loadSourcePoints();
}

function configureComparisonModes() {
  const available = Boolean(currentEntry?.sourcePoints && currentEntry?.sourcePointsMetadata);
  for (const value of ["source", "overlay"]) {
    const radio = document.querySelector(`input[name="comparisonMode"][value="${value}"]`);
    radio.disabled = !available;
    radio.closest("label").title = available
      ? ""
      : "Cette scène a été produite sans nuage LiDAR témoin.";
  }
  if (!available && showsSourcePoints(comparisonMode)) comparisonMode = "vegetation";
}

function publishPanelSize() {
  const hidden = controlPanel.classList.contains("panel--hidden");
  const rect = controlPanel.getBoundingClientRect();
  const root = document.documentElement.style;
  root.setProperty("--panel-width", `${hidden ? 0 : Math.round(rect.width)}px`);
  root.setProperty("--panel-height", `${hidden ? 0 : Math.round(rect.height)}px`);
}

function setPanelVisible(visible) {
  controlPanel.classList.toggle("panel--hidden", !visible);
  controlPanel.setAttribute("aria-hidden", String(!visible));
  panelToggle.classList.toggle("panel-toggle--collapsed", !visible);
  panelToggle.setAttribute("aria-expanded", String(visible));
  const action = visible ? "Masquer les réglages" : "Afficher les réglages";
  panelToggle.setAttribute("aria-label", action);
  panelToggle.title = action;
  publishPanelSize();
}

function setStatus(state, message) {
  panelStatus.dataset.state = state;
  status.textContent = message;
}

function setBusy(busy) {
  controlPanel.classList.toggle("panel--busy", busy);
  loadProgress.hidden = !busy;
  if (busy) loadProgress.removeAttribute("value");
}

function sunDirection(height, azimuth) {
  const elevation = THREE.MathUtils.degToRad(height);
  const bearing = THREE.MathUtils.degToRad(azimuth);
  // La scène est orientée X = est, Z = sud : la composante nord d'un azimut géographique
  // se projette donc sur -Z. Sans ce signe, l'azimut est miroité et le soleil passe au nord.
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(bearing),
    Math.sin(elevation),
    Math.cos(elevation) * -Math.cos(bearing),
  );
}

function updateSun() {
  const height = Number(document.querySelector("#sunHeight").value);
  const azimuth = Number(document.querySelector("#sunAzimuth").value);
  const direction = sunDirection(height, azimuth);
  sun.position
    .copy(direction)
    .multiplyScalar(sunDistance())
    .add(sceneCentre);
  if (csm) csm.lightDirection.copy(direction).multiplyScalar(-1);
  document.querySelector("#sunValue").textContent = `${height}°`;
  document.querySelector("#azimuthValue").textContent = `${azimuth}°`;
  // Le soleil a bougé : un « Copié » laissé en place désignerait des valeurs qui ne sont plus
  // celles de l'écran.
  document.querySelector("#sunConfigFeedback").textContent = "";
}

function orthoSunMeasure(metadata = currentMetadata) {
  const source = metadata?.orthoSun;
  if (!source || typeof source !== "object") return null;
  const azimuth = Number(source.azimuthDeg ?? source.azimuth);
  const elevation = Number(source.elevationDeg ?? source.elevation);
  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) return null;
  return { azimuth, elevation, source: source.source || "mesure des ombres" };
}

function applySunMeasureLock(metadata = currentMetadata) {
  const lock = document.querySelector("#sunLockToMeasure");
  const height = document.querySelector("#sunHeight");
  const azimuth = document.querySelector("#sunAzimuth");
  const notice = document.querySelector("#sunMeasureSource");
  const measure = orthoSunMeasure(metadata);
  if (!measure) {
    lock.checked = false;
    lock.disabled = true;
    height.disabled = false;
    azimuth.disabled = false;
    notice.textContent = "Calibration solaire indisponible pour cette scène.";
    return;
  }
  lock.disabled = false;
  height.disabled = lock.checked;
  azimuth.disabled = lock.checked;
  if (lock.checked) {
    height.value = String(measure.elevation);
    azimuth.value = String(measure.azimuth);
    updateSun();
    notice.textContent = `Soleil calé sur l’orthophoto — ${measure.source}.`;
  } else {
    notice.textContent = `Mesure disponible — ${measure.source}.`;
  }
}

function applyLightingIntensities() {
  const sunIntensity = Number(document.querySelector("#sunIntensity").value);
  const environmentIntensity = Number(
    document.querySelector("#environmentIntensity").value,
  );
  const hemisphereIntensity = Number(
    document.querySelector("#hemisphereIntensity").value,
  );
  sun.intensity = sunIntensity;
  if (csm) {
    csm.lightIntensity = sunIntensity;
    for (const light of csm.lights) light.intensity = sunIntensity;
  }
  scene.environmentIntensity = environmentIntensity;
  hemisphere.intensity = hemisphereIntensity;
  document.querySelector("#sunIntensityValue").textContent =
    sunIntensity.toFixed(1).replace(".", ",");
  document.querySelector("#environmentIntensityValue").textContent =
    environmentIntensity.toFixed(2).replace(".", ",");
  document.querySelector("#hemisphereIntensityValue").textContent =
    hemisphereIntensity.toFixed(2).replace(".", ",");
}

// La courbe décide de ce que deviennent les hautes lumières — toitures de zinc, versants au
// soleil. Le préréglage retenu est « Neutre » ; les autres sont là pour le comparer à l'écran
// plutôt que sur parole. Three.js recompile les shaders de lui-même quand la courbe change :
// aucun `needsUpdate` à propager sur les matériaux chargés.
const TONE_MAPPINGS = {
  neutral: THREE.NeutralToneMapping,
  agx: THREE.AgXToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  none: THREE.NoToneMapping,
};
const DEFAULT_TONE_MAPPING = "neutral";

function applyDisplayTuning() {
  const exposure = Number(document.querySelector("#displayExposure").value);
  const contrast = Number(document.querySelector("#displayContrast").value);
  const select = document.querySelector("#toneMapping");
  // Une courbe retirée d'une version à l'autre laisserait le sélecteur vide après restauration :
  // le rendu retomberait sur la référence sans que rien ne l'indique à l'écran.
  if (!(select.value in TONE_MAPPINGS)) select.value = DEFAULT_TONE_MAPPING;
  renderer.toneMapping = TONE_MAPPINGS[select.value];
  renderer.toneMappingExposure = exposure;
  renderer.domElement.style.filter = `contrast(${contrast})`;
  document.querySelector("#displayExposureValue").textContent =
    `×${exposure.toFixed(2).replace(".", ",")}`;
  document.querySelector("#displayContrastValue").textContent =
    `×${contrast.toFixed(2).replace(".", ",")}`;
}

function applyContrastLightingPreset() {
  const values = {
    sunHeight: 35,
    sunAzimuth: 95,
    sunIntensity: 3.2,
    environmentIntensity: 0.08,
    hemisphereIntensity: 0.2,
    // Le préréglage est une référence reproductible : il ramène aussi la courbe de rendu,
    // faute de quoi deux postes annonçant les mêmes réglages n'afficheraient pas la même image.
    toneMapping: DEFAULT_TONE_MAPPING,
    displayExposure: 1.2,
    displayContrast: 1.12,
  };
  for (const [id, value] of Object.entries(values)) {
    document.querySelector(`#${id}`).value = String(value);
  }
  document.querySelector("#sunLockToMeasure").checked = true;
  applySunMeasureLock();
  updateSun();
  applyLightingIntensities();
  applyDisplayTuning();
  saveState();
}

updateSun();
applyLightingIntensities();
applyDisplayTuning();

// Déplacement de caméra interpolé. Un saut instantané fait perdre le repère : on ne sait plus
// si l'on regarde la même scène. L'animation est interrompue à la première prise en main.
const CAMERA_TRANSITION_MS = 550;
let transition = null;

function easeInOut(ratio) {
  return ratio < 0.5 ? 4 * ratio ** 3 : 1 - (-2 * ratio + 2) ** 3 / 2;
}

function moveCamera(position, target, { near, far, immediate = false } = {}) {
  if (near !== undefined) camera.near = near;
  if (far !== undefined) camera.far = far;
  camera.updateProjectionMatrix();
  if (immediate || !model) {
    transition = null;
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    return;
  }
  transition = {
    fromPosition: camera.position.clone(),
    toPosition: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    start: performance.now(),
  };
}

function advanceTransition() {
  if (!transition) return;
  const ratio = Math.min(1, (performance.now() - transition.start) / CAMERA_TRANSITION_MS);
  const eased = easeInOut(ratio);
  camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
  controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
  if (ratio === 1) transition = null;
}

function setActiveView(id) {
  for (const button of document.querySelectorAll(".pov")) {
    button.setAttribute("aria-pressed", String(button.id === id));
  }
}

function fitCamera({ immediate = false } = {}) {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z) * 1.25;
  // Sans cette reprise, la butée d'orbite figée à 900 m ramenait la caméra vers le sol dès
  // qu'on demandait la vue générale d'une emprise plus large que celle du réglage d'origine.
  controls.maxDistance = Math.max(900, distance * 2.5);
  moveCamera(
    new THREE.Vector3(center.x + distance, center.y + distance * 0.72, center.z + distance),
    center,
    { near: Math.max(0.1, distance / 500), far: distance * 20, immediate },
  );
  setActiveView("viewReset");
}

// La mairie est le centre de POC_BBOX, sur lequel load_buildings recentre la scène : elle
// se trouve donc à l'aplomb de l'origine, sans avoir à reprojeter le point d'area.geojson.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const triangleA = new THREE.Vector3();
const triangleB = new THREE.Vector3();
const triangleC = new THREE.Vector3();

// Un contour par bâtiment, construit au premier survol puis conservé. Il est enfant du nœud :
// il suit ainsi l'exagération verticale sans le moindre recalcul, là où une boîte englobante
// devait être reconstruite à chaque pixel de curseur.
const OUTLINE_HOVER_COLOR = new THREE.Color(0x1f7a52);
const OUTLINE_SELECT_COLOR = new THREE.Color(0x0f3f2c);
const outlines = new WeakMap();

function outlineFor(building) {
  const existing = outlines.get(building);
  if (existing !== undefined) return existing;
  building.updateWorldMatrix(true, true);
  const toLocal = new THREE.Matrix4().copy(building.matrixWorld).invert();
  const parts = [];
  building.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    // 18° : assez pour garder les arêtes de toiture, assez pour taire la triangulation
    // interne des pans plans.
    const edges = new THREE.EdgesGeometry(object.geometry, 18);
    edges.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, object.matrixWorld));
    parts.push(edges);
  });
  if (!parts.length) {
    outlines.set(building, null);
    return null;
  }
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (geometry !== parts[0]) parts.forEach((part) => part.dispose());
  const outline = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ transparent: true, depthTest: false }),
  );
  outline.name = "Contour";
  // Sans cela, le contour intercepterait le rayon de sélection du bâtiment qu'il souligne.
  outline.raycast = () => {};
  outline.renderOrder = 10;
  outline.visible = false;
  building.add(outline);
  outlines.set(building, outline);
  return outline;
}

function refreshOutline(building) {
  if (!building) return;
  const selected = building === selectedBuilding;
  const hovered = building === hoveredBuilding;
  if (!selected && !hovered) {
    const existing = outlines.get(building);
    if (existing) existing.visible = false;
    return;
  }
  const outline = outlineFor(building);
  if (!outline) return;
  outline.visible = true;
  outline.material.color.copy(selected ? OUTLINE_SELECT_COLOR : OUTLINE_HOVER_COLOR);
  outline.material.opacity = selected ? 0.95 : 0.5;
}

function setHovered(building) {
  if (hoveredBuilding === building) return;
  const previous = hoveredBuilding;
  hoveredBuilding = building;
  refreshOutline(previous);
  refreshOutline(building);
  renderer.domElement.classList.toggle("is-pickable", Boolean(building));
}

function clearBuildingSelection() {
  const previous = selectedBuilding;
  selectedBuilding = null;
  buildingDetails.hidden = true;
  refreshOutline(previous);
}

function buildingFromObject(object) {
  let candidate = object;
  while (candidate && candidate.parent !== buildings) candidate = candidate.parent;
  return candidate?.parent === buildings ? candidate : null;
}

function roofFootprintArea(building) {
  const stored = numericAttribute(building.userData, "rf_footprint_area_m2");
  if (stored !== null) return stored;
  let area = 0;
  building.updateWorldMatrix(true, true);
  building.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const position = geometry?.getAttribute("position");
    if (!position) return;
    const index = geometry.getIndex();
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }];
    const materialList = Array.isArray(object.material) ? object.material : [object.material];
    for (const group of groups) {
      const material = materialList[group.materialIndex ?? 0];
      if (!material || !isRoofMaterial(material)) continue;
      const end = group.start + group.count;
      for (let offset = group.start; offset + 2 < end; offset += 3) {
        const ia = index ? index.getX(offset) : offset;
        const ib = index ? index.getX(offset + 1) : offset + 1;
        const ic = index ? index.getX(offset + 2) : offset + 2;
        triangleA.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld);
        triangleB.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld);
        triangleC.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld);
        area += Math.abs(
          (triangleB.x - triangleA.x) * (triangleC.z - triangleA.z) -
            (triangleB.z - triangleA.z) * (triangleC.x - triangleA.x),
        ) * 0.5;
      }
    }
  });
  return area || null;
}

function selectBuilding(building) {
  const previous = selectedBuilding;
  selectedBuilding = building;
  refreshOutline(previous);
  refreshOutline(building);
  const attributes = building.userData ?? {};
  const box = new THREE.Box3().setFromObject(building);

  const height =
    numericAttribute(attributes, "hauteur") ??
    (() => {
      const ground = numericAttribute(attributes, "rf_h_ground", "altitude_minimale_sol");
      const roof = numericAttribute(attributes, "rf_h_roof_max", "altitude_maximale_toit");
      return ground !== null && roof !== null ? roof - ground : box.max.y - box.min.y;
    })();
  const altitude = numericAttribute(
    attributes,
    "rf_h_ground",
    "altitude_minimale_sol",
    "altitude_maximale_sol",
  );
  const footprint = roofFootprintArea(building);
  const quality = reconstructionQuality(attributes);
  document.querySelector("#buildingId").textContent =
    String(attributes.cleabs ?? building.name ?? "Sans identifiant");
  document.querySelector("#buildingHeight").textContent =
    height === null ? "Non disponible" : `${height.toFixed(1).replace(".", ",")} m`;
  document.querySelector("#buildingArea").textContent =
    footprint === null ? "Non disponible" : `≈ ${Math.round(footprint).toLocaleString("fr-FR")} m²`;
  document.querySelector("#buildingAltitude").textContent =
    altitude === null ? "Non disponible" : `${altitude.toFixed(1).replace(".", ",")} m NGF`;
  buildingAttributeFields.get("buildingWallMaterial").textContent =
    displayAttribute(attributes.materiaux_des_murs);
  buildingAttributeFields.get("buildingRoofMaterial").textContent =
    displayAttribute(attributes.materiaux_de_la_toiture);
  const rawFloorCount = attributes.nombre_d_etages;
  const parsedFloorCount =
    rawFloorCount === null || rawFloorCount === undefined || rawFloorCount === ""
      ? null
      : Number(rawFloorCount);
  const floorCount = Number.isFinite(parsedFloorCount) ? parsedFloorCount : null;
  buildingAttributeFields.get("buildingFloorCount").textContent =
    floorCount === null
      ? "Non disponible"
      : `${floorCount.toLocaleString("fr-FR")} ${floorCount > 1 ? "étages" : "étage"}`;
  const qualityBadge = document.querySelector("#buildingQuality");
  qualityBadge.textContent = quality.label;
  qualityBadge.dataset.level = quality.level;
  document.querySelector("#buildingQualityDetail").textContent = quality.detail;
  buildingDetails.hidden = false;
}

function pointerToNdc(clientX, clientY) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1,
  );
}

function buildingAt(clientX, clientY) {
  if (!buildings?.visible) return null;
  pointerToNdc(clientX, clientY);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(buildings, true)[0];
  return hit ? buildingFromObject(hit.object) : null;
}

function pickBuilding(event) {
  const building = buildingAt(event.clientX, event.clientY);
  if (building) {
    selectBuilding(building);
    return;
  }
  clearBuildingSelection();
  // Le bâti reste prioritaire : on n'interroge la géologie que là où le clic a traversé
  // jusqu'au terrain. Un clic hors formation ne referme pas la carte affichée, sans quoi
  // toute manipulation de caméra un peu brusque l'effacerait.
  const formation = geologyAt(event.clientX, event.clientY);
  if (formation) showGeologyFormation(formation);
}

// Cadre un bâtiment en conservant l'azimut courant : on veut s'approcher, pas être téléporté
// dans une orientation qu'on n'a pas choisie.
function frameBuilding(building) {
  const box = new THREE.Box3().setFromObject(building);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(28, Math.max(size.x, size.y, size.z) * 2.4);
  const heading = camera.position.clone().sub(controls.target);
  if (heading.lengthSq() < 1e-6) heading.set(1, 0.8, 1);
  heading.setLength(distance);
  if (heading.y < distance * 0.35) heading.y = distance * 0.35;
  moveCamera(center.clone().add(heading), center);
  setActiveView(null);
}

function revealBuilding(building) {
  // Cadrer un bâtiment invisible n'aurait rien montré : la bascule et le filtre cèdent.
  const buildingsToggle = document.querySelector("#buildingsToggle");
  if (!buildingsToggle.checked) {
    buildingsToggle.checked = true;
    if (buildings) buildings.visible = true;
  }
  if (!building.visible && qualityFilter) setQualityFilter(null);
  selectBuilding(building);
  frameBuilding(building);
}

function buildingLabel(building) {
  return String(building.userData?.cleabs ?? building.name ?? "");
}

function updateBuildingIndex() {
  const list = document.querySelector("#buildingIds");
  const section = document.querySelector("#searchControls");
  buildingIndex = new Map();
  degradedCursor = -1;
  document.querySelector("#buildingSearch").value = "";
  document.querySelector("#searchFeedback").textContent = "";
  const labels = [];
  for (const building of buildings?.children ?? []) {
    const label = buildingLabel(building).trim();
    if (!label) continue;
    buildingIndex.set(label.toUpperCase(), building);
    labels.push(label);
  }
  // Les identifiants sont déjà dans les nœuds du GLB : la liste de suggestions se construit
  // sans requête supplémentaire, et rend enfin atteignables les bâtiments que le rapport de
  // validation nomme.
  list.replaceChildren(
    ...labels.sort().map((label) => {
      const option = document.createElement("option");
      option.value = label;
      return option;
    }),
  );
  section.hidden = buildingIndex.size === 0;
}

function focusBuildingById(rawValue) {
  const feedback = document.querySelector("#searchFeedback");
  const key = rawValue.trim().toUpperCase();
  if (!key) {
    feedback.textContent = "";
    return;
  }
  const building = buildingIndex.get(key);
  if (!building) {
    feedback.textContent = "Aucun bâtiment ne porte cet identifiant dans la scène chargée.";
    return;
  }
  feedback.textContent = "";
  revealBuilding(building);
}

function focusNextDegraded() {
  const feedback = document.querySelector("#searchFeedback");
  const degraded = (buildings?.children ?? []).filter(
    (building) => reconstructionQuality(building.userData).level === "low",
  );
  if (!degraded.length) {
    feedback.textContent = "Aucun bâtiment signalé à contrôler dans cette scène.";
    return;
  }
  degradedCursor = (degradedCursor + 1) % degraded.length;
  const building = degraded[degradedCursor];
  feedback.textContent = `Bâtiment ${degradedCursor + 1} sur ${degraded.length} signalé à contrôler.`;
  document.querySelector("#buildingSearch").value = buildingLabel(building);
  revealBuilding(building);
}

function addDataSection(container, title, content, { wide = false, list = false } = {}) {
  const section = document.createElement("section");
  section.className = `data-section${wide ? " data-section--wide" : ""}`;
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement(list ? "ul" : "p");
  if (list) {
    for (const item of content) {
      const entry = document.createElement("li");
      entry.textContent = item;
      body.append(entry);
    }
  } else {
    body.textContent = content;
  }
  section.append(heading, body);
  container.append(section);
}

function readableInstant(value) {
  const moment = value ? new Date(value) : null;
  if (!moment || Number.isNaN(moment.valueOf())) return "date non renseignée";
  return new Intl.DateTimeFormat("fr-FR").format(moment);
}

function readableRun(run) {
  const match = /^run-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(run ?? "");
  if (!match) return run || "non renseignée";
  const [, year, month, day, hour, minute, second] = match;
  return `${day}/${month}/${year} à ${hour}:${minute}:${second}`;
}

function updateDataInformation(metadata, entry) {
  const content = document.querySelector("#dataInfoContent");
  content.replaceChildren();
  const sections = document.createElement("div");
  sections.className = "data-sections";
  const attributes = buildings?.children.map((building) => building.userData ?? {}) ?? [];
  const lidarYears = [
    ...new Set(
      attributes
        .map((item) => numericAttribute(item, "rf_pc_year"))
        .filter((value) => value !== null),
    ),
  ].sort();
  const modificationDates = attributes
    .map((item) => item.date_modification)
    .filter((value) => typeof value === "string")
    .sort();
  const latestBdTopoDate = modificationDates.at(-1);
  const configuration = entry.configuration ?? {};
  const [xmin, ymin, xmax, ymax] = metadata.bbox;
  const width = xmax - xmin;
  const height = ymax - ymin;
  const orthoResolution =
    numericAttribute(metadata, "orthophotoResolutionM") ??
    numericAttribute(configuration, "orthophotoResolutionM");
  const degraded = metadata.roofQuality?.degraded?.length ?? 0;
  const lod1Fallbacks = metadata.lod1Fallbacks ?? 0;
  const total = metadata.roofQuality?.total ?? metadata.buildings ?? 0;
  const sourceDates = [
    `LiDAR HD : ${lidarYears.length ? lidarYears.join(", ") : "millésime non renseigné"}`,
    `BD TOPO : ${
      latestBdTopoDate
        ? `attributs mis à jour jusqu’au ${new Intl.DateTimeFormat("fr-FR").format(new Date(latestBdTopoDate))}`
        : "date non renseignée"
    }`,
    `Orthophotographie : ${configuration.orthophotoDate ?? "date de prise de vue non publiée dans le flux utilisé"}`,
  ];
  addDataSection(
    sections,
    "Sources IGN",
    [
      "LiDAR HD — points sol, bâti, végétation, eau et ponts.",
      "BD TOPO — emprises, identifiants et attributs des bâtiments.",
      `Orthophotographie — ${configuration.orthophotoLayer ?? "ORTHOIMAGERY.ORTHOPHOTOS"}.`,
    ],
    { list: true, wide: true },
  );
  addDataSection(sections, "Dates", sourceDates, { list: true });
  addDataSection(sections, "Exécution", readableRun(entry.run));
  // Le centre en WGS84 est ce qui permet de retrouver le site sur n'importe quelle carte :
  // les coordonnées Lambert-93 seules n'y suffisent pas.
  const centre = Array.isArray(configuration.centreWgs84) ? configuration.centreWgs84 : null;
  addDataSection(
    sections,
    "Emprise",
    `${width.toFixed(0)} × ${height.toFixed(0)} m en Lambert-93 (EPSG:2154) · ${xmin.toFixed(
      0,
    )}, ${ymin.toFixed(0)} → ${xmax.toFixed(0)}, ${ymax.toFixed(0)}${
      centre ? ` · centre ${centre[0].toFixed(6)}, ${centre[1].toFixed(6)} en WGS84` : ""
    }.`,
  );
  addDataSection(
    sections,
    "Résolution",
    `Terrain : ${metadata.terrainResolutionM ?? "—"} m par maille · Orthophoto : ${
      orthoResolution === null
        ? "résolution non renseignée"
        : `≈ ${(orthoResolution * 100).toFixed(0)} cm/pixel`
    }.`,
  );
  addDataSection(
    sections,
    "Méthode de reconstruction",
    "Roofer LoD2.2 reconstruit les volumes depuis le LiDAR HD et les emprises BD TOPO. Le MNT vient de la classe sol 2 ; le MNS ajoute les végétations 3/4/5 et le bâti 6. Le terrain est raccordé sous le bâti, puis l’orthophotographie est drapée sur le sol et projetée sur les toitures.",
    { wide: true },
  );
  addDataSection(
    sections,
    "Limites du modèle",
    [
      `${degraded} bâtiment${degraded > 1 ? "s" : ""} sur ${total} ${
        degraded > 1 ? "sont signalés" : "est signalé"
      } à contrôler par Roofer.`,
      `${lod1Fallbacks} toiture${lod1Fallbacks > 1 ? "s dégradées sont remplacées" : " dégradée est remplacée"} par une extrusion LoD1 explicite.`,
      "Les hauteurs, altitudes et surfaces affichées sont des estimations issues du modèle.",
      "L’orthophoto est rectifiée au sol : un décalage peut subsister sur les toitures hautes.",
      "La végétation est représentée par des volumes simplifiés, sans branches individuelles.",
    ],
    { list: true, wide: true },
  );
  if (sourcePointsMetadata) {
    addDataSection(
      sections,
      "Nuage LiDAR témoin",
      [
        `${sourcePointsMetadata.renderedPoints.toLocaleString("fr-FR")} points affichés sur ${sourcePointsMetadata.sourcePoints.toLocaleString("fr-FR")} dans ${sourcePointsMetadata.sourceFile}.`,
        `Jeu de données : ${sourcePointsMetadata.datasetUrl}.`,
        `Échantillonnage : ${sourcePointsMetadata.sampling}.`,
        `Dimensions : ${sourcePointsMetadata.dimensions.join(", ")}.`,
        `Empreinte SHA-256 du LAZ : ${sourcePointsMetadata.sourceSha256}.`,
        ...(sourcePointsMetadata.copcSources ?? []).map((url) => `Source COPC : ${url}`),
      ],
      { list: true, wide: true },
    );
  }
  // Obligation de la Licence Ouverte 2.0, sous laquelle l'IGN diffuse ces trois jeux : la
  // mention de paternité doit accompagner la réutilisation, donc la publication en ligne.
  // La révision de Three.js est lue dans la bibliothèque et non recopiée : la version servie
  // est celle que `web.py` a téléchargée, pas celle qu'un littéral aurait figée ici.
  // La géologie ne vient pas de l'IGN et n'a pas la même échelle nominale que le reste de la
  // scène : sa provenance et sa limite d'emploi méritent leur propre section, renseignée par
  // `geology.json` plutôt que recopiée ici. Elle n'apparaît qu'une fois la couche chargée.
  if (geologyMetadata) {
    addDataSection(
      sections,
      "Carte géologique",
      [
        `${geologyMetadata.source ?? "BRGM — BD Charm-50 harmonisée"} — département ${
          geologyMetadata.department ?? "non renseigné"
        }.`,
        `Échelle nominale 1:${(geologyMetadata.scale ?? 50000).toLocaleString("fr-FR")} — ces limites ne conviennent pas à une interprétation parcellaire.`,
        `Archive récupérée le ${readableInstant(geologyMetadata.retrievedAt)} depuis ${geologyMetadata.archiveUrl ?? "InfoTerre"}.`,
        `Empreinte SHA-256 de l’archive : ${geologyMetadata.sha256 ?? "non renseignée"}.`,
        "© BRGM — réutilisation libre sous réserve de citer la source et sa date de mise à jour, sans altérer l’information ni l’employer à une échelle plus fine que celle prévue.",
      ],
      { list: true, wide: true },
    );
  }
  addDataSection(
    sections,
    "Licence et attribution",
    [
      "LiDAR HD, BD TOPO® et ORTHOPHOTOS® — © IGN, diffusés sous Licence Ouverte 2.0 (Etalab) : réutilisation libre sous réserve de mentionner la source et sa date de mise à jour.",
      "Reconstruction des volumes de toiture : Roofer, 3D Geoinformation, TU Delft.",
      `Affichage 3D : Three.js r${THREE.REVISION}, licence MIT.`,
    ],
    { list: true, wide: true },
  );
  content.append(sections);
}

function groundHeightAt(x, z) {
  if (!model) return 0;
  const box = new THREE.Box3().setFromObject(model);
  raycaster.set(new THREE.Vector3(x, box.max.y + 50, z), new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObject(model, true)[0];
  return hit ? hit.point.y : box.min.y;
}

// Le GLB est recentré sur le milieu de `POC_BBOX` : l'origine de la scène est le point
// autour duquel l'emprise a été construite, quel qu'il soit.
function focusCentre() {
  if (!model) return;
  const ground = groundHeightAt(0, 0);
  moveCamera(new THREE.Vector3(52, ground + 40, 52), new THREE.Vector3(0, ground + 6, 0), {
    near: 0.1,
    far: 3000,
  });
  setActiveView("viewCentre");
}

function focusRoofs() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const distance = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.72;
  // Une verticale stricte bloque OrbitControls : on conserve une légère inclinaison.
  moveCamera(
    new THREE.Vector3(center.x + distance * 0.04, center.y + distance, center.z + distance * 0.04),
    center,
    { near: 0.1, far: distance * 20 },
  );
  setActiveView("viewRoof");
}

function setSunHeight(degrees) {
  document.querySelector("#sunLockToMeasure").checked = false;
  applySunMeasureLock();
  const slider = document.querySelector("#sunHeight");
  slider.value = String(degrees);
  updateSun();
  saveState();
}

function updateCompass() {
  const angle = Math.atan2(
    camera.position.x - controls.target.x,
    camera.position.z - controls.target.z,
  );
  compass.style.transform = `rotate(${angle}rad)`;
}

// Échelle valable au point visé : en perspective, c'est le seul endroit où elle soit juste.
// Le pas suit la progression 1 / 2 / 5 pour rester lisible à toutes les distances.
const SCALE_TARGET_PX = 108;
let lastScaleWidth = 0;

function updateScaleBar() {
  const distance = camera.position.distanceTo(controls.target);
  const metresPerPixel =
    (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / innerHeight;
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return;
  const raw = SCALE_TARGET_PX * metresPerPixel;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const steps = [1, 2, 5, 10];
  const metres = magnitude * (steps.find((step) => raw / magnitude <= step) ?? 10);
  // La largeur est comparée plutôt que la longueur en mètres : à valeur identique, un
  // redimensionnement de la fenêtre change quand même le nombre de pixels à dessiner.
  const width = Math.round(metres / metresPerPixel);
  if (width === lastScaleWidth) return;
  lastScaleWidth = width;
  scaleBar.style.setProperty("--scale-width", `${width}px`);
  scaleLabel.textContent =
    metres >= 1000
      ? `${(metres / 1000).toLocaleString("fr-FR")} km`
      : `${metres.toLocaleString("fr-FR")} m`;
}

function setWireframe(enabled) {
  buildings?.traverse((object) => {
    materialsOf(object).forEach((material) => {
      material.wireframe = enabled;
      material.needsUpdate = true;
    });
  });
}

// Textes de l'en-tête quand la scène n'en porte pas : une exécution préparée avant que
// `SCENE_TITLE` n'existe ne doit pas afficher un titre vide.
const DEFAULT_IDENTITY = {
  title: "Maquette du village",
  subtitle: "IGN LiDAR HD",
  centreLabel: "Point central",
};

// Le titre appartient à la scène, pas à la page : changer d'entrée dans le sélecteur change
// de commune, et l'onglet du navigateur doit suivre au même titre que l'en-tête.
function applySceneIdentity(entry) {
  const title = entry.title || DEFAULT_IDENTITY.title;
  const subtitle = entry.subtitle || DEFAULT_IDENTITY.subtitle;
  const centreLabel = entry.centreLabel || DEFAULT_IDENTITY.centreLabel;
  document.title = entry.title ? `Maquette 3D — ${title}` : title;
  document.querySelector("#sceneTitle").textContent = title;
  document.querySelector("#sceneSubtitle").textContent = subtitle;
  document.querySelector("#viewport").setAttribute("aria-label", `Scène 3D — ${title}`);
  const centre = document.querySelector("#viewCentre");
  centre.setAttribute("aria-label", centreLabel);
  centre.title = centreLabel;
}

// Deux chargements peuvent se chevaucher si l'on change d'emprise avant la fin du précédent :
// seul le dernier demandé a le droit d'entrer dans la scène.
let loadToken = 0;

function disposeObject(root) {
  root?.traverse((object) => {
    // Les contours de sélection sont des lignes, pas des maillages : les oublier ici faisait
    // fuir une géométrie par bâtiment survolé, à chaque changement d'emprise.
    if (!object.isMesh && !object.isLine && !object.isPoints) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  });
}

function disposeModel() {
  if (!model) return;
  sourcePointsToken += 1;
  if (sourcePoints) {
    scene.remove(sourcePoints);
    disposeObject(sourcePoints);
    sourcePoints = null;
  }
  sourcePointsMetadata = null;
  sourcePointsCloud = null;
  document.querySelector("#sourcePointLegend").replaceChildren();
  clearBuildingSelection();
  setHovered(null);
  setQualityColors(false);
  // Avant `disposeObject` : la carte est enfant du terrain, et sa géométrie lui est
  // empruntée. La détacher d'abord évite de libérer deux fois le même tampon.
  disposeGeology();
  qualityFilter = null;
  csm?.dispose();
  scene.remove(model);
  disposeObject(model);
  model = null;
  terrain = null;
  buildings = null;
  crowns = null;
  currentMetadata = null;
  currentEntry = null;
  for (const entry of optionalLayers) entry.object = null;
}

function setupCsmMaterials(root) {
  if (!csm) return;
  const configured = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials.filter(Boolean)) {
      if (configured.has(material)) continue;
      configured.add(material);
      csm.setupMaterial(material);
    }
  });
}

function applyTerrainOpacity() {
  const slider = document.querySelector("#terrainOpacity");
  const opacity = Number(slider.value) / 100;
  document.querySelector("#opacityValue").textContent = `${slider.value} %`;
  terrain?.traverse((object) => {
    if (!object.isMesh) return;
    materialsOf(object).forEach((material) => {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.95;
    });
  });
}

// ---------------------------------------------------------------------------------------
// Calage manuel de l'orthophotographie. La mesure automatique se refuse là où les toitures
// ne se distinguent pas de leur environnement — toits de tôle sur un causse, par exemple —
// et il reste alors à caler l'image à l'œil. Le terrain et les toitures partagent la même
// texture glTF : décaler celle-ci les déplace ensemble, comme le fait `ortho_uv` à la
// production. La géologie a la sienne et ne bouge pas, ce qui est juste : elle est rastérisée
// depuis des polygones Lambert-93, donc déjà en place.
// ---------------------------------------------------------------------------------------
const ORTHO_OFFSET_INPUTS = ["#orthoEast", "#orthoNorth"];

function orthoTexture() {
  let found = null;
  model?.traverse((object) => {
    if (found) return;
    materialsOf(object).forEach((material) => {
      if (!found && isTerrainMaterial(material)) {
        found = originalMaterials.get(material)?.map ?? material.map ?? null;
      }
    });
  });
  return found;
}

// Côté de l'emprise couverte par la photo, marge comprise. Les scènes produites avant cette
// clé retombent sur la largeur de la bbox : l'écart, celui de la marge, reste sous le
// dixième et ne se voit pas à l'œil — relancer `glb` rétablit l'échelle exacte.
function orthoExtentM() {
  if (Number.isFinite(currentMetadata?.orthoExtentM)) return currentMetadata.orthoExtentM;
  const bbox = currentMetadata?.bbox;
  return Array.isArray(bbox) ? bbox[2] - bbox[0] : null;
}

function manualOrthoOffset() {
  return {
    east: Number(document.querySelector("#orthoEast").value),
    north: Number(document.querySelector("#orthoNorth").value),
  };
}

// Calage total appliqué à la scène : celui cuit dans les coordonnées de texture à la
// production, plus celui des curseurs. C'est ce total qui se reporte dans la configuration.
function totalOrthoOffset() {
  const manual = manualOrthoOffset();
  const measured = currentMetadata?.orthoOffset;
  return {
    east: manual.east + (Number(measured?.eastMetres) || 0),
    north: manual.north + (Number(measured?.northMetres) || 0),
  };
}

function formatMetres(value) {
  return `${value.toFixed(1).replace(".", ",")} m`;
}

function applyOrthoOffset() {
  const manual = manualOrthoOffset();
  document.querySelector("#orthoEastValue").textContent = formatMetres(manual.east);
  document.querySelector("#orthoNorthValue").textContent = formatMetres(manual.north);
  const texture = orthoTexture();
  const extent = orthoExtentM();
  if (!texture || !extent) return;
  // u croît vers l'est, v vers le sud : la composante nord s'y oppose, exactement comme dans
  // `ortho_uv`. Trois conventions d'orientation se croisent ici, un signe divergent ferait
  // glisser la photo dans la mauvaise direction sans que rien ne le dise.
  // `offset` alimente la matrice de texture, que le rendu recalcule seul : lever
  // `needsUpdate` renverrait les 4096 pixels de côté au GPU à chaque cran du curseur.
  texture.offset.set(manual.east / extent, -manual.north / extent);
  // Le nuage n'a pas de coordonnées de texture : il projette la photo depuis la position de
  // chaque point, et suit donc le même calage par un uniform plutôt que par cette matrice.
  applyPointOrtho();
  document.querySelector("#orthoOffsetFeedback").textContent = "";
}

function resetOrthoOffset() {
  // Un calage vaut pour une orthophotographie, donc pour une scène : le reporter d'une scène
  // à la suivante décalerait une image qui n'a pas le même défaut.
  for (const selector of ORTHO_OFFSET_INPUTS) {
    document.querySelector(selector).value = "0";
  }
  applyOrthoOffset();
}

// Les réglages qui ont un équivalent dans le `.conf` se recopient par le même chemin : le
// presse-papiers quand le navigateur l'autorise, et le texte à l'écran sinon — refuser la copie
// sans montrer la valeur laisserait l'utilisateur devant un réglage qu'il ne peut pas reporter.
async function copyForConfiguration(lines, feedbackSelector, commands = "glb") {
  const feedback = document.querySelector(feedbackSelector);
  try {
    await navigator.clipboard.writeText(lines);
    feedback.textContent =
      `Copié — à coller dans le .conf de la scène et dans son .example, puis relancer ${commands}.`;
  } catch (error) {
    feedback.textContent = `Copie refusée par le navigateur : ${lines.replace(/\n/g, "  ")}`;
  }
}

// Deux commandes et non une : `glb` recuit les coordonnées de texture du terrain et des
// toitures, `source` la couleur que le nuage porte dans son `COLOR_0`. Le visualiseur, lui,
// prend le nouveau calage dès `glb`, puisqu'il le relit dans `scene.json` — mais un nuage
// exporté vers un autre moteur garderait l'ancien tant que `source` n'a pas été rejoué.
async function copyOrthoOffset() {
  const total = totalOrthoOffset();
  await copyForConfiguration(
    `ORTHO_OFFSET_EAST=${total.east.toFixed(2)}\n` +
      `ORTHO_OFFSET_NORTH=${total.north.toFixed(2)}\n`,
    "#orthoOffsetFeedback",
    "glb puis source",
  );
}

// L'azimut du visualiseur est déjà géographique — 0° au nord, croissant vers l'est — soit la
// convention de `ORTHO_SUN_AZIMUTH_DEG` : les deux valeurs se reportent sans conversion.
async function copySunSetting() {
  const height = Number(document.querySelector("#sunHeight").value);
  const azimuth = Number(document.querySelector("#sunAzimuth").value);
  await copyForConfiguration(
    `ORTHO_SUN_AZIMUTH_DEG=${azimuth.toFixed(1)}\n` +
      `ORTHO_SUN_ELEVATION_DEG=${height.toFixed(1)}\n`,
    "#sunConfigFeedback",
  );
}

// ---------------------------------------------------------------------------------------
// Carte géologique BRGM (BD Charm-50). Elle n'est pas embarquée dans le GLB : ses trois
// artefacts sont servis à part et chargés à la première activation, pour ne pas alourdir
// l'ouverture d'une scène qu'on regarde le plus souvent sans elle.
// ---------------------------------------------------------------------------------------
let geologyOverlay = null;
let geologyMaterial = null;
let geologyPick = null;
let geologyMetadata = null;
let geologyToken = 0;
let geologySelection = null;

function geologyDescriptor() {
  return currentEntry?.configuration?.geology ?? null;
}

// La nappe du terrain et sa tranche latérale sont deux primitives du même mesh glTF : seule
// la première porte des UV, et c'est la seule sur laquelle draper la géologie.
function terrainSurface() {
  let found = null;
  terrain?.traverse((object) => {
    if (found || !object.isMesh) return;
    const materials = materialsOf(object);
    const index = materials.findIndex(isTerrainMaterial);
    if (index >= 0 && object.geometry?.getAttribute("uv")) {
      found = { mesh: object, index, count: materials.length };
    }
  });
  return found;
}

function attachGeologyOverlay(texture) {
  const surface = terrainSurface();
  if (!surface) return false;
  geologyMaterial = new THREE.MeshStandardMaterial({
    name: "Geologie BRGM",
    map: texture,
    transparent: true,
    // La carte double exactement la nappe : sans décalage de profondeur, les deux surfaces
    // coplanaires clignoteraient d'un pixel à l'autre selon l'angle de vue.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
  });
  // Géométrie partagée avec le terrain : la couche ne coûte pas un octet de sommet. Les
  // autres emplacements de matériau restent invisibles, faute de quoi la géologie
  // descendrait sur la tranche latérale, qui n'a pas d'UV.
  const materials = Array.from({ length: surface.count }, (_, slot) =>
    slot === surface.index
      ? geologyMaterial
      : new THREE.MeshBasicMaterial({ visible: false }),
  );
  geologyOverlay = new THREE.Mesh(
    surface.mesh.geometry,
    surface.count > 1 ? materials : geologyMaterial,
  );
  geologyOverlay.name = "GeologieBRGM";
  geologyOverlay.receiveShadow = true;
  // Un décor ne doit pas s'interposer entre le curseur et les bâtiments.
  geologyOverlay.raycast = () => {};
  surface.mesh.add(geologyOverlay);
  setupCsmMaterials(geologyOverlay);
  applyGeologyOpacity();
  return true;
}

async function loadGeology() {
  const descriptor = geologyDescriptor();
  if (!descriptor || geologyOverlay) return Boolean(geologyOverlay);
  const token = ++geologyToken;
  const notice = document.querySelector("#geologyNotice");
  notice.textContent = "Chargement de la carte géologique…";
  try {
    const [metadata, texture, picking] = await Promise.all([
      fetch(descriptor.metadata).then((response) => {
        if (!response.ok) throw new Error(`métadonnées absentes (${response.status})`);
        return response.json();
      }),
      new THREE.TextureLoader().loadAsync(descriptor.texture),
      fetch(descriptor.pick)
        .then((response) => {
          if (!response.ok) throw new Error(`carte d’identifiants absente (${response.status})`);
          return response.blob();
        })
        .then(createImageBitmap),
    ]);
    // Une autre scène a été demandée entre-temps : ce chargement n'a plus de destinataire.
    if (token !== geologyToken) {
      texture.dispose();
      picking.close();
      return false;
    }
    // `GLTFLoader` pose `flipY = false` sur les textures du GLB, `TextureLoader` non. Sans
    // cet alignement, la carte se draperait à l'envers des UV du terrain — nord au sud —
    // sans que rien ne le signale.
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    geologyPick = readPickImage(picking);
    picking.close();
    geologyMetadata = metadata;
    if (!attachGeologyOverlay(texture)) {
      texture.dispose();
      throw new Error("aucune nappe de terrain à draper");
    }
    updateGeologyLegend();
    // Le dialogue de traçabilité a été rendu à l'ouverture de la scène, avant que la carte
    // ne soit chargée : il faut le reconstruire pour qu'il porte enfin la source BRGM.
    if (currentMetadata && currentEntry) updateDataInformation(currentMetadata, currentEntry);
    notice.textContent = "";
    return true;
  } catch (error) {
    if (token === geologyToken) {
      notice.textContent = `Carte géologique indisponible : ${error.message}`;
      document.querySelector("#geologyToggle").checked = false;
    }
    return false;
  }
}

// L'image d'identifiants se lit une fois pour toutes : chaque clic n'est ensuite qu'un accès
// mémoire. Le PNG est produit sans profil colorimétrique, sans quoi la gestion de couleur du
// canvas altérerait les valeurs qui portent précisément les identifiants.
function readPickImage(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { data, width: bitmap.width, height: bitmap.height };
}

function applyGeologyOpacity() {
  const slider = document.querySelector("#geologyOpacity");
  document.querySelector("#geologyOpacityValue").textContent = `${slider.value} %`;
  if (!geologyMaterial) return;
  // C'est ce curseur qui fait la comparaison avec l'orthophoto : celle-ci est rendue dessous,
  // et la transparence de la géologie la laisse réapparaître progressivement.
  geologyMaterial.opacity = Number(slider.value) / 100;
}

function setGeologyVisible(visible) {
  if (geologyOverlay) geologyOverlay.visible = visible;
  if (!visible) clearGeologySelection();
  document.querySelector("#geologyLegend").hidden = !visible || !geologyMetadata;
}

function geologyFormations() {
  return Array.isArray(geologyMetadata?.formations) ? geologyMetadata.formations : [];
}

function updateGeologyLegend() {
  const legend = document.querySelector("#geologyLegend");
  const formations = geologyFormations();
  if (!formations.length) {
    legend.hidden = true;
    legend.replaceChildren();
    return;
  }
  // La couverture est comptée en pixels par l'étape `geology` : la ramener en pourcentage
  // dit d'un coup d'œil ce qui domine l'emprise.
  const total = formations.reduce((sum, entry) => sum + (entry.coveragePx ?? 0), 0) || 1;
  legend.replaceChildren(
    ...formations.map((formation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(geologySelection === formation.id));
      button.title = formation.label
        ? `${formation.code} — ${formation.label}`
        : formation.code;
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = formation.color;
      const name = document.createElement("span");
      name.className = "label";
      // La notice passe devant la notation : une notation sur dix emploie la police
      // cartographique du BRGM, dont les glyphes grecs ressortent en charabia hors de
      // cette police. Elle reste lisible dans l'infobulle et sur la carte de détail.
      name.textContent = formation.label || formation.code;
      const share = document.createElement("span");
      share.className = "count";
      share.textContent = `${Math.round(((formation.coveragePx ?? 0) / total) * 100)} %`;
      button.append(dot, name, share);
      button.addEventListener("click", () => {
        showGeologyFormation(geologySelection === formation.id ? null : formation);
      });
      return button;
    }),
  );
  legend.hidden = !document.querySelector("#geologyToggle").checked;
}

function showGeologyFormation(formation) {
  const card = document.querySelector("#geologyDetails");
  geologySelection = formation?.id ?? null;
  if (!formation) {
    card.hidden = true;
  } else {
    document.querySelector("#geologyCode").textContent = formation.code || "—";
    document.querySelector("#geologyLabel").textContent = displayAttribute(formation.label);
    document.querySelector("#geologyAge").textContent = displayAttribute(formation.age);
    document.querySelector("#geologyLithology").textContent = displayAttribute(formation.lithology);
    card.hidden = false;
  }
  updateGeologyLegend();
}

function clearGeologySelection() {
  if (geologySelection === null && document.querySelector("#geologyDetails").hidden) return;
  showGeologyFormation(null);
}

// Identifiant de la formation sous le pointeur, lu dans la carte d'identifiants. Les UV du
// terrain sont ceux de l'orthophoto, et la texture géologique couvre exactement la même
// emprise : aucune reprojection n'est nécessaire.
function geologyAt(x, y) {
  if (!geologyPick || !geologyOverlay?.visible) return null;
  const surface = terrainSurface();
  if (!surface) return null;
  pointerToNdc(x, y);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(surface.mesh, false)[0];
  if (!hit?.uv) return null;
  const { data, width, height } = geologyPick;
  const column = Math.min(width - 1, Math.max(0, Math.round(hit.uv.x * (width - 1))));
  const row = Math.min(height - 1, Math.max(0, Math.round(hit.uv.y * (height - 1))));
  const offset = (row * width + column) * 4;
  const identifier = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
  if (!identifier) return null;
  return geologyFormations().find((formation) => formation.id === identifier) ?? null;
}

function configureGeologyControls() {
  const toggle = document.querySelector("#geologyToggle");
  const slider = document.querySelector("#geologyOpacity");
  const available = Boolean(geologyDescriptor());
  toggle.disabled = !available;
  slider.disabled = !available;
  const explanation = available
    ? ""
    : "Cette scène a été produite sans la carte géologique BRGM.";
  toggle.closest("label").title = explanation;
  slider.closest("label").title = explanation;
  document.querySelector("#geologyNotice").textContent = "";
  if (!available) {
    toggle.checked = false;
    return;
  }
  // Le réglage a survécu au changement de scène : la couche doit se recharger d'elle-même.
  if (toggle.checked) loadGeology().then(() => setGeologyVisible(toggle.checked));
}

function disposeGeology() {
  // Invalide un chargement encore en vol : son résultat ne doit pas rejoindre la scène
  // suivante.
  geologyToken += 1;
  if (geologyOverlay) {
    geologyOverlay.removeFromParent();
    for (const material of materialsOf(geologyOverlay)) {
      csm?.shaders.delete(material);
      material.map?.dispose();
      material.dispose();
    }
    // La géométrie appartient au terrain : la libérer ici la retirerait sous ses pieds.
    geologyOverlay = null;
  }
  geologyMaterial = null;
  geologyPick = null;
  geologyMetadata = null;
  geologySelection = null;
  document.querySelector("#geologyDetails").hidden = true;
  document.querySelector("#geologyLegend").hidden = true;
  document.querySelector("#geologyLegend").replaceChildren();
}

function adopt(entry, metadata, gltf) {
  disposeModel();
  currentMetadata = metadata;
  currentEntry = entry;
  configureComparisonModes();
  document.querySelector("#buildingCount").textContent = metadata.buildings.toLocaleString("fr-FR");
  const [xmin, ymin, xmax, ymax] = metadata.bbox;
  document.querySelector("#extent").textContent = `${(xmax - xmin).toFixed(0)} × ${(ymax - ymin).toFixed(0)} m`;
  const relief = metadata.maxElevation - metadata.minElevation;
  document.querySelector("#elevationRange").textContent =
    `${relief.toFixed(1).replace(".", ",")} m`;
  model = gltf.scene;
  terrain = model.getObjectByName("Terrain") || model.children[0];
  buildings = model.getObjectByName("Batiments") || model.children.find((child) => child !== terrain);
  if (!terrain || !buildings) throw new Error("Nœuds Terrain ou Batiments absents de la scène");
  terrain.traverse((object) => {
    if (!object.isMesh) return;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.map) {
        material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        material.map.needsUpdate = true;
      }
    });
  });
  buildings.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  // Les arbres continuent de projeter leur présence au sol mais ne reçoivent plus les ombres
  // très noires de leurs voisins. L'eau ne projette ni ne reçoit d'ombre : sa transparence
  // doit laisser parler l'orthophotographie. Le pont conserve les deux.
  for (const entry of optionalLayers) {
    entry.object = model.getObjectByName(entry.node);
    entry.object?.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = entry.castsShadow;
        object.receiveShadow = entry.receivesShadow;
      }
    });
  }
  setupCsmMaterials(model);
  rememberMaterials(model);
  resetOrthoOffset();
  configureTextureToggle("#terrainTextureToggle", terrain, isTerrainMaterial);
  configureTextureToggle("#roofTextureToggle", buildings, isRoofMaterial);
  for (const entry of optionalLayers) {
    const toggle = document.querySelector(entry.toggle);
    toggle.disabled = !entry.object;
    toggle.closest("label").title = entry.object ? "" : entry.absent;
    if (!entry.object) {
      toggle.checked = false;
    }
  }
  crowns = readCrowns(layer("Vegetation"));
  document.querySelector("#crownControls").hidden = !crowns;
  terrain.visible = document.querySelector("#terrainToggle").checked;
  buildings.visible = document.querySelector("#buildingsToggle").checked;
  for (const entry of optionalLayers) {
    if (entry.object) entry.object.visible = document.querySelector(entry.toggle).checked;
  }
  applyTextureState();
  setWireframe(document.querySelector("#wireframeToggle").checked);
  // Les réglages continus survivent au changement de scène : les matériaux sont neufs, mais
  // les curseurs, eux, sont restés où l'utilisateur les avait laissés.
  applyTerrainOpacity();
  applyGeologyOpacity();
  configureGeologyControls();
  applyCrownScale();
  model.scale.y = Number(document.querySelector("#verticalScale").value) / 100;
  scene.add(model);
  restoreRenderMode(renderMode, customTextures);
  updateBuildingIndex();
  updateDataInformation(metadata, entry);
  fitCamera({ immediate: true });
  applySunMeasureLock(metadata);
  fitSunToModel();
  setStatus("ready", "Scène prête");
  setComparisonMode(comparisonMode);
}

function loadModel(url, onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, onProgress, reject);
  });
}

async function loadScene(entry) {
  const token = ++loadToken;
  // Avant le chargement et non après : la scène demandée pèse une vingtaine de mégaoctets, et
  // laisser le nom de la précédente en tête pendant tout ce temps se lit comme une erreur.
  applySceneIdentity(entry);
  setStatus("loading", `Chargement de ${entry.label}…`);
  setBusy(true);
  errorBox.hidden = true;
  try {
    const [metadata, gltf] = await Promise.all([
      entry.metadata
        ? fetch(entry.metadata).then((response) => {
            if (!response.ok) throw new Error("Métadonnées de scène introuvables");
            return response.json();
          })
        : Promise.resolve(null),
      loadModel(entry.scene, (event) => {
        if (token !== loadToken) return;
        // Une vingtaine de mégaoctets dans un seul fichier : la progression n'a de sens qu'en
        // octets. Sans en-tête de longueur, la barre reste indéterminée plutôt que fausse.
        if (!event.lengthComputable || !event.total) {
          loadProgress.removeAttribute("value");
          return;
        }
        loadProgress.value = event.loaded / event.total;
        const megabytes = (event.total / 1048576).toFixed(1).replace(".", ",");
        setStatus(
          "loading",
          `Chargement de ${entry.label} — ${Math.round((event.loaded / event.total) * 100)} % de ${megabytes} Mo`,
        );
      }),
    ]);
    if (token !== loadToken) {
      // Une autre emprise a été demandée pendant le chargement : celle-ci n'entrera jamais
      // dans la scène, et ses ressources GPU doivent être rendues tout de suite.
      disposeObject(gltf.scene);
      return;
    }
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const bbox = entry.configuration?.terrainBbox ?? [box.min.x, box.min.z, box.max.x, box.max.z];
    const metadataEffectives = metadata ?? {
      buildings: gltf.scene.getObjectByName("Batiments")?.children.length ?? 0,
      bbox,
      minElevation: box.min.y,
      maxElevation: box.max.y,
    };
    if (entry.orthophotoCalage) {
      metadataEffectives.orthoOffset = {
        eastMetres: entry.orthophotoCalage.estM,
        northMetres: entry.orthophotoCalage.nordM,
      };
    }
    adopt(entry, metadataEffectives, gltf);
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    setStatus("error", "Erreur de chargement");
    errorBox.hidden = false;
    errorBox.textContent = `${error.message}. Lancez le visualiseur avec « python poc.py serve ».`;
  } finally {
    if (token === loadToken) {
      setBusy(false);
    }
  }
}

// Le visualiseur se recharge à chaque nouvelle exécution du pipeline : sans mémoire, chaque
// aller-retour imposait de rétablir à la main l'éclairage, les couches et l'opacité.
// La version fait partie du contrat de l'interface : une ancienne session pouvait mémoriser
// les deux textures désactivées, puis masquer silencieusement l'orthophoto après une mise à
// jour du visualiseur. Une nouvelle version repart une fois sur le préréglage Orthophoto.
const STORAGE_KEY = "poc3d.viewer.v3";
const PERSISTED_INPUTS = [
  "terrainToggle",
  "buildingsToggle",
  "vegetationToggle",
  "canopyToggle",
  "understoryToggle",
  "waterToggle",
  "bridgeToggle",
  "terrainTextureToggle",
  "roofTextureToggle",
  "wireframeToggle",
  "terrainOpacity",
  "geologyToggle",
  "geologyOpacity",
  "sunLockToMeasure",
  "sunHeight",
  "sunAzimuth",
  "sunIntensity",
  "environmentIntensity",
  "hemisphereIntensity",
  "toneMapping",
  "displayExposure",
  "displayContrast",
  "verticalScale",
  "foliageShading",
  "crownX",
  "crownY",
  "crownZ",
  "pointColorMode",
  "foliageGreenToggle",
  "pointSize",
];

// Les sections sont repérées par leur identifiant, pas par leur rang : un réglage inséré au
// milieu du panneau aurait sinon décalé tout l'état déjà enregistré.
function panelSections() {
  return [...document.querySelectorAll("#controlPanel .accordion")].filter(
    (section) => section.id,
  );
}

function saveState() {
  const inputs = {};
  for (const id of PERSISTED_INPUTS) {
    const input = document.querySelector(`#${id}`);
    if (input) inputs[id] = input.type === "checkbox" ? input.checked : input.value;
  }
  const sections = {};
  for (const section of panelSections()) sections[section.id] = section.open;
  const state = {
    inputs,
    renderMode,
    comparisonMode,
    customTextures,
    hiddenPointClasses: [...hiddenPointClasses],
    panelVisible: !controlPanel.classList.contains("panel--hidden"),
    expertOpen: expertControls.open,
    sections,
    sceneId: currentEntry?.id ?? null,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Navigation privée ou stockage refusé : la session reste utilisable sans mémoire.
  }
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreState() {
  const state = readState();
  if (!state) return null;
  for (const [id, value] of Object.entries(state.inputs ?? {})) {
    const input = document.querySelector(`#${id}`);
    if (!input || !PERSISTED_INPUTS.includes(id)) continue;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = String(value);
  }
  if (state.renderMode in RENDER_MODE_DESCRIPTIONS) renderMode = state.renderMode;
  if (state.comparisonMode in COMPARISON_DESCRIPTIONS) comparisonMode = state.comparisonMode;
  customTextures = Boolean(state.customTextures);
  hiddenPointClasses = new Set(
    (Array.isArray(state.hiddenPointClasses) ? state.hiddenPointClasses : []).map(Number),
  );
  if (state.panelVisible === false) setPanelVisible(false);
  expertControls.open = Boolean(state.expertOpen);
  for (const section of panelSections()) {
    const remembered = state.sections?.[section.id];
    if (typeof remembered === "boolean") section.open = remembered;
  }
  // Les libellés des curseurs sont écrits par leurs gestionnaires : sans cette reprise, ils
  // afficheraient les valeurs par défaut à côté de curseurs déjà déplacés.
  applyTerrainOpacity();
  applyCrownScale();
  applyPointSize();
  const scale = Number(document.querySelector("#verticalScale").value) / 100;
  document.querySelector("#verticalValue").textContent = `×${scale.toFixed(1).replace(".", ",")}`;
  updateSun();
  applyLightingIntensities();
  applyDisplayTuning();
  describeRenderMode();
  const radio = document.querySelector(`input[name="renderMode"][value="${renderMode}"]`);
  if (radio) radio.checked = true;
  const comparisonRadio = document.querySelector(
    `input[name="comparisonMode"][value="${comparisonMode}"]`,
  );
  if (comparisonRadio) comparisonRadio.checked = true;
  describeComparisonMode();
  return state;
}

function afficherAucuneScene(entry) {
  applySceneIdentity(entry);
  setStatus("ready", "Aucune scène 3D rattachée");
  loadProgress.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = "Aucune scène 3D rattachée pour l'instant.";
}

async function start() {
  restoreState();
  const bloc = document.querySelector("#manifeste-dalle");
  if (!bloc) throw new Error("Manifeste de dalle absent de la page");
  const manifeste = JSON.parse(bloc.textContent);
  const entry = entreeDepuisManifeste(manifeste);
  if (!entry.scene) afficherAucuneScene(entry);
  else await loadScene(entry);
  construirePanneau(manifeste);
}

document.querySelector("#terrainToggle").addEventListener("change", (event) => {
  if (terrain) terrain.visible = event.target.checked;
});

document.querySelector("#buildingsToggle").addEventListener("change", (event) => {
  if (buildings) buildings.visible = event.target.checked;
  if (!event.target.checked) {
    clearBuildingSelection();
    setHovered(null);
  }
});

for (const entry of optionalLayers) {
  document.querySelector(entry.toggle).addEventListener("change", (event) => {
    if (entry.object) entry.object.visible = event.target.checked;
  });
}

// Reprendre une texture à la main sort du préréglage : le mode de rendu cesse de prétendre
// décrire ce qui est affiché.
for (const selector of ["#terrainTextureToggle", "#roofTextureToggle"]) {
  document.querySelector(selector).addEventListener("change", () => {
    applyTextureState();
    customTextures = true;
    describeRenderMode();
  });
}

for (const input of document.querySelectorAll('input[name="renderMode"]')) {
  input.addEventListener("change", (event) => {
    if (event.target.checked) setRenderMode(event.target.value);
  });
}

for (const input of document.querySelectorAll('input[name="comparisonMode"]')) {
  input.addEventListener("change", (event) => {
    if (event.target.checked) setComparisonMode(event.target.value);
  });
}

for (const selector of ["#crownX", "#crownY", "#crownZ"]) {
  document.querySelector(selector).addEventListener("input", applyCrownScale);
}
// L'ombrage se reprend par le même chemin que les facteurs : il se règle sur les mêmes sommets.
document.querySelector("#foliageShading").addEventListener("change", applyCrownScale);
document.querySelector("#crownReset").addEventListener("click", () => {
  for (const selector of ["#crownX", "#crownY", "#crownZ"]) {
    document.querySelector(selector).value = "100";
  }
  applyCrownScale();
  saveState();
});

document.querySelector("#wireframeToggle").addEventListener("change", (event) => {
  setWireframe(event.target.checked);
});

document.querySelector("#terrainOpacity").addEventListener("input", applyTerrainOpacity);

for (const selector of ORTHO_OFFSET_INPUTS) {
  document.querySelector(selector).addEventListener("input", applyOrthoOffset);
}
document.querySelector("#orthoOffsetCopy").addEventListener("click", copyOrthoOffset);
document.querySelector("#sunConfigCopy").addEventListener("click", copySunSetting);

document.querySelector("#geologyToggle").addEventListener("change", async (event) => {
  const wanted = event.target.checked;
  if (wanted && !(await loadGeology())) return;
  setGeologyVisible(wanted);
});
document.querySelector("#geologyOpacity").addEventListener("input", applyGeologyOpacity);
document.querySelector("#geologyClose").addEventListener("click", clearGeologySelection);

document.querySelector("#buildingSearch").addEventListener("change", (event) => {
  focusBuildingById(event.target.value);
});
document.querySelector("#buildingSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    focusBuildingById(event.target.value);
  }
});
document.querySelector("#searchDegraded").addEventListener("click", focusNextDegraded);

for (const id of ["#sunHeight", "#sunAzimuth"]) {
  document.querySelector(id).addEventListener("input", () => {
    document.querySelector("#sunLockToMeasure").checked = false;
    applySunMeasureLock();
    updateSun();
  });
}
document.querySelector("#sunLockToMeasure").addEventListener("change", () => {
  applySunMeasureLock();
  updateSun();
});
for (const id of ["#sunIntensity", "#environmentIntensity", "#hemisphereIntensity"]) {
  document.querySelector(id).addEventListener("input", applyLightingIntensities);
}
for (const id of ["#displayExposure", "#displayContrast"]) {
  document.querySelector(id).addEventListener("input", applyDisplayTuning);
}
// L'enregistrement est pris en charge par l'écouteur unique du panneau, plus bas.
document.querySelector("#toneMapping").addEventListener("change", applyDisplayTuning);
document.querySelector("#contrastLighting").addEventListener("click", applyContrastLightingPreset);

document.querySelector("#pointColorMode").addEventListener("change", applyPointColorMode);
// La contrainte vit dans le shader : rien à réassembler, la bascule est immédiate. C'est ce
// qui permet de la comparer à l'orthophotographie brute, qui reste la mesure.
document.querySelector("#foliageGreenToggle").addEventListener("change", applyPointOrtho);
document.querySelector("#pointSize").addEventListener("input", applyPointSize);

document.querySelector("#verticalScale").addEventListener("input", (event) => {
  const scale = Number(event.target.value) / 100;
  document.querySelector("#verticalValue").textContent = `×${scale.toFixed(1).replace(".", ",")}`;
  if (model) model.scale.y = scale;
  if (sourcePoints) sourcePoints.scale.y = scale;
});
// L'exagération verticale grandit la scène : le frustum d'ombre doit suivre, mais au
// relâchement seulement — le recalculer à chaque pixel de curseur ne servirait à rien.
document.querySelector("#verticalScale").addEventListener("change", fitSunToModel);

document.querySelector("#viewReset").addEventListener("click", () => {
  clearBuildingSelection();
  fitCamera();
});
document.querySelector("#viewCentre").addEventListener("click", focusCentre);
document.querySelector("#viewRoof").addEventListener("click", focusRoofs);
document.querySelector("#grazingLight").addEventListener("click", () => setSunHeight(12));
document.querySelector("#exportPng").addEventListener("click", exportPng);
document.querySelector("#buildingClose").addEventListener("click", clearBuildingSelection);

panelToggle.addEventListener("click", () => {
  setPanelVisible(controlPanel.classList.contains("panel--hidden"));
  saveState();
});

// Un seul enregistrement pour tout le panneau : chaque contrôle qui change son état le
// consigne, sans avoir à s'en souvenir individuellement.
controlPanel.addEventListener("change", saveState);
expertControls.addEventListener("toggle", saveState);
for (const section of panelSections()) section.addEventListener("toggle", saveState);

document.querySelector("#dataInfoOpen").addEventListener("click", () => dataInfoDialog.showModal());
document.querySelector("#helpOpen").addEventListener("click", () => helpDialog.showModal());
for (const dialog of [dataInfoDialog, helpDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

let pointerDown = null;
let hoverPoint = null;
let hoverNeedsTest = false;
const lastHoverPosition = new THREE.Vector3();

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (
    event.button === 0 &&
    pointerDown &&
    Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 5
  ) {
    pickBuilding(event);
  }
  pointerDown = null;
});
// Le survol n'enregistre que la position : le lancer de rayon a lieu une fois par image, dans
// la boucle. Un test par événement de souris coûterait plus cher que le rendu lui-même.
renderer.domElement.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  hoverPoint = { x: event.clientX, y: event.clientY };
  hoverNeedsTest = true;
});
renderer.domElement.addEventListener("pointerleave", () => {
  hoverPoint = null;
  setHovered(null);
});
// Reprendre la souris annule le déplacement en cours : une animation qu'on ne peut pas
// interrompre est plus déroutante qu'un saut.
controls.addEventListener("start", () => {
  transition = null;
  setActiveView(null);
});

function updateHover() {
  // Pendant un glissement, la caméra bouge sans que le pointeur désigne quoi que ce soit : on
  // ne consomme pas le besoin de test, il sera honoré au relâchement.
  if (!hoverPoint || pointerDown) return;
  lastHoverPosition.copy(camera.position);
  hoverNeedsTest = false;
  setHovered(buildingAt(hoverPoint.x, hoverPoint.y));
}

function showLayers(terrainVisible, buildingsVisible, sceneryVisible) {
  document.querySelector("#terrainToggle").checked = terrainVisible;
  document.querySelector("#buildingsToggle").checked = buildingsVisible;
  if (terrain) terrain.visible = terrainVisible;
  if (buildings) buildings.visible = buildingsVisible;
  // Végétation, eau et ponts suivent le même sort : ils décrivent le décor, pas le bâti,
  // et c'est le bâti qu'on cherche à isoler avec ces raccourcis.
  for (const entry of optionalLayers) {
    const toggle = document.querySelector(entry.toggle);
    if (toggle.disabled) continue;
    toggle.checked = sceneryVisible;
    if (entry.object) entry.object.visible = sceneryVisible;
  }
  saveState();
}

function displayAttribute(value) {
  if (value === null || value === undefined || value === "") return "Non disponible";
  return String(value);
}

let cameraPoseToastTimer = null;

function showCameraPoseToast(message) {
  clearTimeout(cameraPoseToastTimer);
  cameraPoseToast.textContent = message;
  cameraPoseToast.hidden = false;
  cameraPoseToastTimer = setTimeout(() => {
    cameraPoseToast.hidden = true;
  }, 2800);
}

function exportPng() {
  if (!model) {
    showCameraPoseToast("Aucune scène à exporter.");
    return;
  }
  // Le tampon de dessin n'est pas conservé entre les images : la capture doit suivre ce
  // rendu dans le même gestionnaire, sans attendre la boucle d'animation.
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) {
      showCameraPoseToast("L’export PNG a échoué.");
      return;
    }
    const sceneId = String(currentEntry?.id ?? "scene").replace(/[^a-z0-9_-]+/gi, "-");
    const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${sceneId}-${timestamp}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showCameraPoseToast(`Vue exportée · ${link.download}`);
  }, "image/png");
}

async function logCameraPose() {
  const rounded = (vector) => vector.toArray().map((value) => Number(value.toFixed(3)));
  const pose = {
    scene: currentEntry?.id ?? null,
    position: rounded(camera.position),
    target: rounded(controls.target),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
  const json = JSON.stringify(pose, null, 2);
  console.info("Pose caméra reproductible :\n", json);
  try {
    await navigator.clipboard.writeText(json);
    showCameraPoseToast(`Pose caméra copiée · ${pose.position.join(", ")}`);
  } catch {
    showCameraPoseToast(`Pose caméra affichée dans la console · ${pose.position.join(", ")}`);
  }
}

function poseVector(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((coordinate) => !Number.isFinite(Number(coordinate)))
  ) {
    return null;
  }
  return new THREE.Vector3(...value.map(Number));
}

async function restoreCameraPose() {
  try {
    const text = await navigator.clipboard.readText();
    const pose = JSON.parse(text);
    const position = poseVector(pose?.position);
    const target = poseVector(pose?.target);
    if (!position || !target) {
      showCameraPoseToast("Pose caméra invalide dans le presse-papiers.");
      return;
    }
    if (pose.scene && pose.scene !== currentEntry?.id) {
      showCameraPoseToast(`Pose ignorée : elle appartient à la scène « ${pose.scene} ».`);
      return;
    }
    if (Number.isFinite(Number(pose.fov)) && Number(pose.fov) > 0) {
      camera.fov = Number(pose.fov);
    }
    const near = Number.isFinite(Number(pose.near)) && Number(pose.near) > 0
      ? Number(pose.near)
      : undefined;
    const far = Number.isFinite(Number(pose.far)) && Number(pose.far) > (near ?? 0)
      ? Number(pose.far)
      : undefined;
    moveCamera(position, target, { near, far });
    setActiveView(null);
    showCameraPoseToast("Pose caméra restaurée depuis le presse-papiers.");
  } catch {
    showCameraPoseToast("Presse-papiers inaccessible ou pose caméra invalide.");
  }
}

// 1/2/3 : alterner rapidement terrain seul, bâtiments seuls et scène complète pour
// isoler l'origine d'un défaut de contact au sol. P copie la pose, Maj+P la rejoue.
addEventListener("keydown", (event) => {
  const poseShortcutBlocked =
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target?.isContentEditable ||
    (event.target instanceof HTMLInputElement &&
      !["checkbox", "range"].includes(event.target.type));
  if (event.key.toLowerCase() === "p" && !poseShortcutBlocked) {
    event.preventDefault();
    if (event.shiftKey) restoreCameraPose();
    else logCameraPose();
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === "1") showLayers(true, false, false);
  if (event.key === "2") showLayers(false, true, false);
  if (event.key === "3") showLayers(true, true, true);
  if (event.key === "Escape") clearBuildingSelection();
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  updateShadowMapResolution();
  csm?.updateFrustums();
  publishPanelSize();
});

// Le panneau change de hauteur à chaque section dépliée : les repères du bas s'y ancrent, donc
// ils doivent en être avertis.
new ResizeObserver(publishPanelSize).observe(controlPanel);
publishPanelSize();

renderer.setAnimationLoop(() => {
  advanceTransition();
  controls.update();
  if (hoverPoint && (hoverNeedsTest || !lastHoverPosition.equals(camera.position))) {
    updateHover();
  }
  updateCompass();
  updateScaleBar();
  if (csm) {
    camera.updateMatrixWorld();
    csm.update();
  }
  renderer.render(scene, camera);
});

start();
