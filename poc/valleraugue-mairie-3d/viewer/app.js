import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const errorBox = document.querySelector("#error");
const compass = document.querySelector(".north");

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

const hemisphere = new THREE.HemisphereLight(0xdfe8f0, 0x8b8578, 1.4);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff6e2, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// Le terrain couvre POC_BBOX plus TERRAIN_MARGIN_M de chaque côté, soit ±115 m pour
// l'emprise 200 m : le frustum doit le déborder sinon les ombres sont coupées aux bords.
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun);

let terrain = null;
let buildings = null;
let vegetation = null;
let model = null;

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
  sun.position.copy(sunDirection(height, azimuth)).multiplyScalar(300);
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
    scene.add(sky);
    updateSun();
    refreshSkyEnvironment();
  } else {
    sky.removeFromParent();
    scene.background = new THREE.Color(DIAGNOSTIC_SKY);
    scene.fog = new THREE.FogExp2(DIAGNOSTIC_SKY, 0.0002);
    scene.environment = roomEnvironment;
    sun.color.set(0xfff6e2);
    sun.intensity = 2.8;
    updateSun();
  }
  document.querySelector("#realisticToggle").checked = enabled;
  describeCalibration(
    Number(document.querySelector("#sunHeight").value),
    Number(document.querySelector("#sunAzimuth").value),
  );
}

updateSun();

function fitCamera() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z) * 1.25;
  controls.target.copy(center);
  camera.position.set(center.x + distance, center.y + distance * 0.72, center.z + distance);
  camera.near = Math.max(0.1, distance / 500);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  fitSkyToCamera();
  controls.update();
}

// La mairie est le centre de POC_BBOX, sur lequel load_buildings recentre la scène : elle
// se trouve donc à l'aplomb de l'origine, sans avoir à reprojeter le point d'area.geojson.
const raycaster = new THREE.Raycaster();

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
  controls.target.set(0, ground + 6, 0);
  camera.position.set(52, ground + 40, 52);
  camera.near = 0.1;
  camera.far = 3000;
  camera.updateProjectionMatrix();
  fitSkyToCamera();
  controls.update();
}

function focusRoofs() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const distance = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.72;
  controls.target.copy(center);
  // Une verticale stricte bloque OrbitControls : on conserve une légère inclinaison.
  camera.position.set(center.x + distance * 0.04, center.y + distance, center.z + distance * 0.04);
  camera.near = 0.1;
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  fitSkyToCamera();
  controls.update();
}

function setSunHeight(degrees) {
  const slider = document.querySelector("#sunHeight");
  slider.value = String(degrees);
  updateSun();
}

function updateCompass() {
  const angle = Math.atan2(
    camera.position.x - controls.target.x,
    camera.position.z - controls.target.z,
  );
  compass.style.transform = `rotate(${angle}rad)`;
}

function setWireframe(enabled) {
  buildings?.traverse((object) => {
    if (object.isMesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.wireframe = enabled;
        material.needsUpdate = true;
      });
    }
  });
}

async function start() {
  try {
    const metadata = await fetch("./assets/scene.json").then((response) => {
      if (!response.ok) throw new Error("Métadonnées de scène introuvables");
      return response.json();
    });
    document.querySelector("#buildingCount").textContent = metadata.buildings.toLocaleString("fr-FR");
    const [xmin, ymin, xmax, ymax] = metadata.bbox;
    document.querySelector("#extent").textContent = `${(xmax - xmin).toFixed(0)} × ${(ymax - ymin).toFixed(0)} m`;
    const relief = metadata.maxElevation - metadata.minElevation;
    document.querySelector("#elevationRange").textContent = `${relief.toFixed(1)} m`;
    // Position solaire retrouvée sur les ombres de l'orthophotographie par `poc.py sun`.
    orthoSun = metadata.orthoSun ?? null;

    const gltf = await new GLTFLoader().loadAsync("./assets/scene.glb");
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
    // Proxys de végétation : sans ombre portée, les arbres flottent au-dessus du terrain.
    vegetation = model.getObjectByName("Vegetation");
    vegetation?.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    scene.add(model);
    fitCamera();
    // La calibration solaire n'arrive qu'avec les métadonnées : réappliquer le mode si
    // l'utilisateur l'a activé avant la fin du chargement.
    if (realistic) setRealistic(true);
    status.textContent = "Scène prête";
  } catch (error) {
    console.error(error);
    status.textContent = "Erreur de chargement";
    errorBox.hidden = false;
    errorBox.textContent = `${error.message}. Lancez le visualiseur avec « python poc.py serve ».`;
  }
}

document.querySelector("#terrainToggle").addEventListener("change", (event) => {
  if (terrain) terrain.visible = event.target.checked;
});

document.querySelector("#buildingsToggle").addEventListener("change", (event) => {
  if (buildings) buildings.visible = event.target.checked;
});

document.querySelector("#wireframeToggle").addEventListener("change", (event) => {
  setWireframe(event.target.checked);
});

document.querySelector("#terrainOpacity").addEventListener("input", (event) => {
  const opacity = Number(event.target.value) / 100;
  document.querySelector("#opacityValue").textContent = `${event.target.value} %`;
  terrain?.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.95;
    });
  });
});

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

document.querySelector("#viewOverview").addEventListener("click", fitCamera);
document.querySelector("#viewMairie").addEventListener("click", focusMairie);
document.querySelector("#viewRoof").addEventListener("click", focusRoofs);
document.querySelector("#grazingLight").addEventListener("click", () => setSunHeight(12));

function showLayers(terrainVisible, buildingsVisible) {
  const terrainToggle = document.querySelector("#terrainToggle");
  const buildingsToggle = document.querySelector("#buildingsToggle");
  terrainToggle.checked = terrainVisible;
  buildingsToggle.checked = buildingsVisible;
  if (terrain) terrain.visible = terrainVisible;
  if (buildings) buildings.visible = buildingsVisible;
}

// 1/2/3 : alterner rapidement orthophoto seule, bâtiments seuls et scène complète pour
// isoler l'origine d'un défaut de contact au sol.
addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === "1") showLayers(true, false);
  if (event.key === "2") showLayers(false, true);
  if (event.key === "3") showLayers(true, true);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  ambientOcclusion.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  updateCompass();
  if (realistic) composer.render();
  else renderer.render(scene, camera);
});

start();
