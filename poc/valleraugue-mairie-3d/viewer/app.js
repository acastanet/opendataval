import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const errorBox = document.querySelector("#error");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101815);
scene.fog = new THREE.FogExp2(0x101815, 0.0024);

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
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 15;
controls.maxDistance = 900;

scene.add(new THREE.HemisphereLight(0xdce9ff, 0x3a3328, 1.2));
const sun = new THREE.DirectionalLight(0xfff1d5, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -110;
sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110;
sun.shadow.camera.bottom = -110;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun);

let terrain = null;
let buildings = null;
let model = null;

function updateSun() {
  const height = Number(document.querySelector("#sunHeight").value);
  const azimuth = Number(document.querySelector("#sunAzimuth").value);
  const radius = 300;
  const elevation = THREE.MathUtils.degToRad(height);
  const bearing = THREE.MathUtils.degToRad(azimuth);
  sun.position.set(
    radius * Math.cos(elevation) * Math.sin(bearing),
    radius * Math.sin(elevation),
    radius * Math.cos(elevation) * Math.cos(bearing),
  );
  document.querySelector("#sunValue").textContent = `${height}°`;
  document.querySelector("#azimuthValue").textContent = `${azimuth}°`;
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
  controls.update();
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
    scene.add(model);
    fitCamera();
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

document.querySelector("#sunHeight").addEventListener("input", updateSun);
document.querySelector("#sunAzimuth").addEventListener("input", updateSun);
document.querySelector("#verticalScale").addEventListener("input", (event) => {
  const scale = Number(event.target.value) / 100;
  document.querySelector("#verticalValue").textContent = `×${scale.toFixed(1).replace(".", ",")}`;
  if (model) model.scale.y = scale;
});

document.querySelector("#resetCamera").addEventListener("click", fitCamera);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

start();
