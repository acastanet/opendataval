import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const panelStatus = document.querySelector(".panel__status");
const loadProgress = document.querySelector("#loadProgress");
const errorBox = document.querySelector("#error");
const compass = document.querySelector(".north");
const scaleBar = document.querySelector("#scaleBar");
const scaleLabel = document.querySelector("#scaleLabel");
const buildingDetails = document.querySelector("#buildingDetails");
const dataInfoDialog = document.querySelector("#dataInfoDialog");
const helpDialog = document.querySelector("#helpDialog");
const controlPanel = document.querySelector("#controlPanel");
const panelToggle = document.querySelector("#panelToggle");
const expertControls = document.querySelector("#expertControls");

// Mode diagnostic : fond clair neutre et brouillard quasi nul, pour ne masquer aucun défaut
// géométrique. Le mode réaliste lui substitue un ciel physique (voir setRealistic).
const DIAGNOSTIC_SKY = 0xc8d2d8;

const scene = new THREE.Scene();
scene.background = new THREE.Color(DIAGNOSTIC_SKY);
scene.fog = new THREE.FogExp2(DIAGNOSTIC_SKY, 0.0002);

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
// RoomEnvironment est une boîte de studio d'intérieur : correcte pour lire une géométrie,
// fausse pour de l'extérieur. Le mode réaliste lui substitue l'éclairement du ciel.
const roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnvironment;
// À pleine intensité, elle s'ajoutait à l'hémisphérique et au directionnel : trois sources
// ambiantes cumulées noyaient les ombres portées et le bâti ne posait plus. Réduite, elle
// ne sert plus qu'aux reflets rasants.
const DIAGNOSTIC_ENVIRONMENT_INTENSITY = 0.35;
scene.environmentIntensity = DIAGNOSTIC_ENVIRONMENT_INTENSITY;

const sky = new Sky();
const skyScene = new THREE.Scene();
// La caméra cube du PMREM porte un plan éloigné de 100 : la boîte du ciel doit y tenir,
// sinon elle est détourée et l'environnement ressort vide.
const SKY_ENVIRONMENT_SCALE = 10;
let skyTarget = null;
let realistic = false;
let orthoSun = null;

// L'occlusion ambiante est ce qui fait *poser* les bâtiments au sol. Elle n'est appliquée
// qu'en rendu réaliste : le mode diagnostic doit rester direct, lisible et fluide.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ambientOcclusion = new GTAOPass(scene, camera, innerWidth, innerHeight);
// Le rayon se mesure en unités de scène, ici en mètres : une ruelle étroite fait 3 à 5 m.
ambientOcclusion.updateGtaoMaterial({ radius: 4, distanceExponent: 1, thickness: 1 });
ambientOcclusion.blendIntensity = 0.85;
composer.addPass(ambientOcclusion);
// La conversion colorimétrique et le tone mapping n'ont plus lieu à l'écriture du canevas
// quand on rend dans une cible : c'est OutputPass qui s'en charge.
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 15;
controls.maxDistance = 900;

// L'ambiant ayant baissé, le contraste vient du directionnel : c'est lui qui fait lire les
// décrochements de toiture et les ombres portées sur le terrain.
const DIAGNOSTIC_SUN_INTENSITY = 2.2;
const hemisphere = new THREE.HemisphereLight(0xdfe8f0, 0x8b8578, 0.85);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff6e2, DIAGNOSTIC_SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun);
// Le soleil vise le centre de la scène chargée, et son frustum d'ombre en épouse la taille :
// une valeur figée conviendrait à une seule emprise et couperait les ombres de toutes les
// autres. Les valeurs d'attente correspondent à l'emprise 200 m.
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;
const sceneCentre = new THREE.Vector3();
let sceneRadius = 135;

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
  updateSun();
}

let terrain = null;
let buildings = null;
let model = null;
let currentMetadata = null;
let currentEntry = null;
let selectedBuilding = null;
let hoveredBuilding = null;
let renderMode = "ortho";
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
    object: null,
  },
  {
    node: "Eau",
    toggle: "#waterToggle",
    absent: "Aucun point d’eau (classe LiDAR 9) dans cette emprise.",
    object: null,
  },
  {
    node: "Ponts",
    toggle: "#bridgeToggle",
    absent: "Aucun tablier de pont (classe LiDAR 17) dans cette emprise.",
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
  // Un redimensionnement inégal fausse les normales : sans ce recalcul, un houppier aplati
  // continuerait de s'éclairer comme une sphère.
  crowns.mesh.geometry.computeVertexNormals();
  crowns.mesh.geometry.computeBoundingSphere();
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
      state.replacements.forEach((material) => material.dispose());
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

function applyAtmosphere(direction, height) {
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 4;
  uniforms.rayleigh.value = 2;
  uniforms.mieCoefficient.value = 0.005;
  uniforms.mieDirectionalG.value = 0.8;
  uniforms.sunPosition.value.copy(direction);
  // Extinction atmosphérique : un soleil bas traverse plus d'air, il s'affaiblit et se réchauffe.
  const altitude = THREE.MathUtils.clamp(height / 45, 0, 1);
  sun.color.setHSL(0.09 + 0.03 * altitude, 0.62 - 0.46 * altitude, 0.55 + 0.4 * altitude);
  sun.intensity = THREE.MathUtils.lerp(0.9, 3.4, altitude);
  scene.fog.color.setHSL(0.58, 0.22, THREE.MathUtils.lerp(0.62, 0.82, altitude));
}

function fitSkyToCamera() {
  // La boîte du ciel doit envelopper la caméra sans dépasser son plan éloigné : trop grande,
  // elle est détourée et le fond retombe sur la couleur d'effacement — une image toute grise.
  sky.scale.setScalar(camera.far * 0.5);
}

function refreshSkyEnvironment() {
  if (!realistic) return;
  // Coûteux : à ne déclencher qu'au relâchement d'un curseur, jamais à chaque pixel.
  skyTarget?.dispose();
  skyScene.add(sky);
  sky.scale.setScalar(SKY_ENVIRONMENT_SCALE);
  skyTarget = pmrem.fromScene(skyScene);
  scene.add(sky);
  fitSkyToCamera();
  scene.environment = skyTarget.texture;
}

function describeCalibration(height, azimuth) {
  const notice = document.querySelector("#sunNotice");
  if (!realistic || !orthoSun) {
    notice.textContent = "";
    return;
  }
  const drift = Math.abs(((azimuth - orthoSun.azimuthDeg + 540) % 360) - 180);
  notice.textContent =
    drift < 3 && Math.abs(height - orthoSun.elevationDeg) < 3
      ? "Soleil calé sur les ombres de l’orthophotographie."
      : `Écart de ${drift.toFixed(0)}° avec les ombres de l’orthophotographie : le terrain et les bâtiments s’éclairent différemment.`;
}

function updateSun() {
  const height = Number(document.querySelector("#sunHeight").value);
  const azimuth = Number(document.querySelector("#sunAzimuth").value);
  sun.position
    .copy(sunDirection(height, azimuth))
    .multiplyScalar(sunDistance())
    .add(sceneCentre);
  document.querySelector("#sunValue").textContent = `${height}°`;
  document.querySelector("#azimuthValue").textContent = `${azimuth}°`;
  if (realistic) {
    applyAtmosphere(sunDirection(height, azimuth), height);
    describeCalibration(height, azimuth);
  }
}

function setRealistic(enabled) {
  realistic = enabled;
  hemisphere.visible = !enabled;
  // Le ciel de Preetham rend en grandes valeurs : l'appairage ACES + exposition 0,5 est celui
  // des exemples Three.js pour ce modèle, plus sûr qu'une exposition devinée.
  renderer.toneMapping = enabled ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = enabled ? 0.5 : 1.0;
  if (enabled) {
    if (orthoSun) {
      // Les ombres cuites dans l'orthophotographie commandent : s'en écarter fait diverger
      // l'éclairement du terrain de celui des bâtiments.
      document.querySelector("#sunHeight").value = String(Math.round(orthoSun.elevationDeg));
      document.querySelector("#sunAzimuth").value = String(Math.round(orthoSun.azimuthDeg));
    }
    scene.background = null;
    scene.fog = new THREE.FogExp2(0xa8bfd0, 0.0016);
    // Le ciel de Preetham *est* l'éclairement ambiant du mode réaliste : contrairement à
    // RoomEnvironment il n'a pas à être atténué.
    scene.environmentIntensity = 1.0;
    scene.add(sky);
    updateSun();
    refreshSkyEnvironment();
  } else {
    sky.removeFromParent();
    scene.background = new THREE.Color(DIAGNOSTIC_SKY);
    scene.fog = new THREE.FogExp2(DIAGNOSTIC_SKY, 0.0002);
    scene.environment = roomEnvironment;
    scene.environmentIntensity = DIAGNOSTIC_ENVIRONMENT_INTENSITY;
    sun.color.set(0xfff6e2);
    sun.intensity = DIAGNOSTIC_SUN_INTENSITY;
    updateSun();
  }
  document.querySelector("#realisticToggle").checked = enabled;
  describeCalibration(
    Number(document.querySelector("#sunHeight").value),
    Number(document.querySelector("#sunAzimuth").value),
  );
}

updateSun();

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
  fitSkyToCamera();
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
  if (building) selectBuilding(building);
  else clearBuildingSelection();
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
  addDataSection(
    sections,
    "Emprise",
    `${width.toFixed(0)} × ${height.toFixed(0)} m en Lambert-93 (EPSG:2154) · ${xmin.toFixed(
      0,
    )}, ${ymin.toFixed(0)} → ${xmax.toFixed(0)}, ${ymax.toFixed(0)}.`,
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
    "Roofer LoD2.2 reconstruit les volumes depuis le LiDAR HD et les emprises BD TOPO. Le terrain est rasterisé, raccordé sous le bâti, puis l’orthophotographie est drapée sur le sol et projetée sur les toitures.",
    { wide: true },
  );
  addDataSection(
    sections,
    "Limites du modèle",
    [
      `${degraded} bâtiment${degraded > 1 ? "s" : ""} sur ${total} ${
        degraded > 1 ? "sont signalés" : "est signalé"
      } à contrôler par Roofer.`,
      "Les hauteurs, altitudes et surfaces affichées sont des estimations issues du modèle.",
      "L’orthophoto est rectifiée au sol : un décalage peut subsister sur les toitures hautes.",
      "La végétation est représentée par des volumes simplifiés, sans branches individuelles.",
    ],
    { list: true, wide: true },
  );
  // Obligation de la Licence Ouverte 2.0, sous laquelle l'IGN diffuse ces trois jeux : la
  // mention de paternité doit accompagner la réutilisation, donc la publication en ligne.
  // La révision de Three.js est lue dans la bibliothèque et non recopiée : la version servie
  // est celle que `web.py` a téléchargée, pas celle qu'un littéral aurait figée ici.
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

function focusMairie() {
  if (!model) return;
  const ground = groundHeightAt(0, 0);
  moveCamera(new THREE.Vector3(52, ground + 40, 52), new THREE.Vector3(0, ground + 6, 0), {
    near: 0.1,
    far: 3000,
  });
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
}

function setSunHeight(degrees) {
  const slider = document.querySelector("#sunHeight");
  slider.value = String(degrees);
  updateSun();
  refreshSkyEnvironment();
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

// Une exécution préparée avant le sélecteur n'a pas de `scenes.json` : son unique scène reste
// atteignable aux chemins historiques.
const IMPLICIT_SCENE = {
  id: "courante",
  label: "Scène préparée",
  run: null,
  scene: "assets/scene.glb",
  metadata: "assets/scene.json",
};

let sceneEntries = [IMPLICIT_SCENE];
// Deux chargements peuvent se chevaucher si l'on change d'emprise avant la fin du précédent :
// seul le dernier demandé a le droit d'entrer dans la scène.
let loadToken = 0;

function disposeObject(root) {
  root?.traverse((object) => {
    // Les contours de sélection sont des lignes, pas des maillages : les oublier ici faisait
    // fuir une géométrie par bâtiment survolé, à chaque changement d'emprise.
    if (!object.isMesh && !object.isLine) return;
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
  clearBuildingSelection();
  setHovered(null);
  setQualityColors(false);
  qualityFilter = null;
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

function adopt(entry, metadata, gltf) {
  disposeModel();
  currentMetadata = metadata;
  currentEntry = entry;
  document.querySelector("#buildingCount").textContent = metadata.buildings.toLocaleString("fr-FR");
  const [xmin, ymin, xmax, ymax] = metadata.bbox;
  document.querySelector("#extent").textContent = `${(xmax - xmin).toFixed(0)} × ${(ymax - ymin).toFixed(0)} m`;
  const relief = metadata.maxElevation - metadata.minElevation;
  document.querySelector("#elevationRange").textContent =
    `${relief.toFixed(1).replace(".", ",")} m`;
  document.querySelector("#sceneSource").textContent = [
    entry.run,
    metadata.terrainResolutionM ? `maille ${metadata.terrainResolutionM} m` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Position solaire retrouvée sur les ombres de l'orthophotographie par `poc.py sun`.
  orthoSun = metadata.orthoSun ?? null;

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
  // Sans ombre portée, les arbres flottent au-dessus du terrain et le tablier de pont ne
  // se distingue plus de la rive qu'il enjambe.
  for (const entry of optionalLayers) {
    entry.object = model.getObjectByName(entry.node);
    entry.object?.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }
  rememberMaterials(model);
  configureTextureToggle("#terrainTextureToggle", terrain, isTerrainMaterial);
  configureTextureToggle("#roofTextureToggle", buildings, isRoofMaterial);
  for (const entry of optionalLayers) {
    const toggle = document.querySelector(entry.toggle);
    toggle.disabled = !entry.object;
    if (!entry.object) {
      toggle.checked = false;
      toggle.closest("label").title = entry.absent;
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
  applyCrownScale();
  model.scale.y = Number(document.querySelector("#verticalScale").value) / 100;
  scene.add(model);
  restoreRenderMode(renderMode, customTextures);
  updateBuildingIndex();
  updateDataInformation(metadata, entry);
  fitCamera({ immediate: true });
  fitSunToModel();
  // La calibration solaire n'arrive qu'avec les métadonnées : réappliquer le mode si
  // l'utilisateur l'a activé avant la fin du chargement.
  if (realistic) setRealistic(true);
  setStatus("ready", "Scène prête");
}

function loadModel(url, onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, onProgress, reject);
  });
}

async function loadScene(entry) {
  const token = ++loadToken;
  const select = document.querySelector("#sceneSelect");
  select.disabled = true;
  setStatus("loading", `Chargement de ${entry.label}…`);
  setBusy(true);
  errorBox.hidden = true;
  try {
    const [metadata, gltf] = await Promise.all([
      fetch(`./${entry.metadata}`).then((response) => {
        if (!response.ok) throw new Error("Métadonnées de scène introuvables");
        return response.json();
      }),
      loadModel(`./${entry.scene}`, (event) => {
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
    adopt(entry, metadata, gltf);
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    setStatus("error", "Erreur de chargement");
    errorBox.hidden = false;
    errorBox.textContent = `${error.message}. Lancez le visualiseur avec « python poc.py serve ».`;
  } finally {
    if (token === loadToken) {
      select.disabled = false;
      setBusy(false);
    }
  }
}

function populateScenes(entries) {
  const select = document.querySelector("#sceneSelect");
  select.replaceChildren(
    ...entries.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      return option;
    }),
  );
  // Une seule scène disponible : le sélecteur n'aurait rien à sélectionner.
  document.querySelector("#sceneControls").hidden = entries.length < 2;
}

// Le visualiseur se recharge à chaque nouvelle exécution du pipeline : sans mémoire, chaque
// aller-retour imposait de rétablir à la main l'éclairage, les couches et l'opacité.
const STORAGE_KEY = "poc3d.viewer";
const PERSISTED_INPUTS = [
  "terrainToggle",
  "buildingsToggle",
  "vegetationToggle",
  "waterToggle",
  "bridgeToggle",
  "terrainTextureToggle",
  "roofTextureToggle",
  "wireframeToggle",
  "terrainOpacity",
  "realisticToggle",
  "sunHeight",
  "sunAzimuth",
  "verticalScale",
  "crownX",
  "crownY",
  "crownZ",
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
    customTextures,
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
  customTextures = Boolean(state.customTextures);
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
  const scale = Number(document.querySelector("#verticalScale").value) / 100;
  document.querySelector("#verticalValue").textContent = `×${scale.toFixed(1).replace(".", ",")}`;
  updateSun();
  describeRenderMode();
  const radio = document.querySelector(`input[name="renderMode"][value="${renderMode}"]`);
  if (radio) radio.checked = true;
  return state;
}

async function start() {
  const state = restoreState();
  const manifest = await fetch("./assets/scenes.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (Array.isArray(manifest) && manifest.length > 0) sceneEntries = manifest;
  populateScenes(sceneEntries);
  const restored = sceneEntries.find((entry) => entry.id === state?.sceneId);
  const entry = restored ?? sceneEntries[0];
  document.querySelector("#sceneSelect").value = entry.id;
  if (document.querySelector("#realisticToggle").checked) setRealistic(true);
  await loadScene(entry);
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

for (const selector of ["#crownX", "#crownY", "#crownZ"]) {
  document.querySelector(selector).addEventListener("input", applyCrownScale);
}
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

document.querySelector("#sceneSelect").addEventListener("change", (event) => {
  const entry = sceneEntries.find((candidate) => candidate.id === event.target.value);
  if (entry) loadScene(entry);
});

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
  document.querySelector(id).addEventListener("input", updateSun);
  // Le PMREM du ciel ne se recalcule qu'au relâchement : le faire à chaque pixel de
  // curseur écroulerait la fréquence d'images.
  document.querySelector(id).addEventListener("change", refreshSkyEnvironment);
}

document.querySelector("#realisticToggle").addEventListener("change", (event) => {
  setRealistic(event.target.checked);
});
document.querySelector("#verticalScale").addEventListener("input", (event) => {
  const scale = Number(event.target.value) / 100;
  document.querySelector("#verticalValue").textContent = `×${scale.toFixed(1).replace(".", ",")}`;
  if (model) model.scale.y = scale;
});
// L'exagération verticale grandit la scène : le frustum d'ombre doit suivre, mais au
// relâchement seulement — le recalculer à chaque pixel de curseur ne servirait à rien.
document.querySelector("#verticalScale").addEventListener("change", fitSunToModel);

document.querySelector("#viewReset").addEventListener("click", () => {
  clearBuildingSelection();
  fitCamera();
});
document.querySelector("#viewMairie").addEventListener("click", focusMairie);
document.querySelector("#viewRoof").addEventListener("click", focusRoofs);
document.querySelector("#grazingLight").addEventListener("click", () => setSunHeight(12));
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

// 1/2/3 : alterner rapidement terrain seul, bâtiments seuls et scène complète pour
// isoler l'origine d'un défaut de contact au sol.
addEventListener("keydown", (event) => {
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
  composer.setSize(innerWidth, innerHeight);
  ambientOcclusion.setSize(innerWidth, innerHeight);
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
  if (realistic) composer.render();
  else renderer.render(scene, camera);
});

start();
