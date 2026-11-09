import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const isPhone = matchMedia('(max-width: 768px)').matches;

const stage = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isPhone ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const keyLight = new THREE.DirectionalLight(0xffe2c4, 2.6);
keyLight.position.set(3, 4, 2);
const rimLight = new THREE.DirectionalLight(0xff9a5a, 3);
rimLight.position.set(-4, 2.5, -3);
scene.add(keyLight, rimLight);

export const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
export const cameraTarget = new THREE.Vector3();

// A soft white dot, used for the dust motes and the pool of light under each model.
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffff');
  gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
const glow = glowTexture();

// Dust drifting through the gallery light.
const dustCount = isPhone ? 260 : 520;
const dustPositions = new Float32Array(dustCount * 3).map((_, i) => {
  const axis = i % 3;
  return axis === 1 ? Math.random() * 4 : (Math.random() - 0.5) * (axis === 0 ? 10 : 6);
});
const dustGeometry = new THREE.BufferGeometry();
dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
  size: isPhone ? 0.05 : 0.035, map: glow, transparent: true, opacity: 0.55,
  depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(dust);

export const loadingManager = new THREE.LoadingManager();
const loader = new GLTFLoader(loadingManager).setMeshoptDecoder(MeshoptDecoder);

// Every model is turned upright, centered on the origin, resting on y = 0, and scaled to
// `size`, so shots in main.js can place them in one shared set of units.
// `rotation` is the upright quaternion from the model's Smithsonian Voyager scene.
export async function loadModel(url, size, rotation) {
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.quaternion.set(...rotation);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const dimensions = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);

  const fitted = new THREE.Group();
  fitted.add(model);
  fitted.scale.setScalar(size / Math.max(dimensions.x, dimensions.y, dimensions.z));

  model.traverse((node) => {
    if (!node.isMesh) return;
    node.material.transparent = true;
    // Some scans ship untextured; give them a bone tone instead of bright white.
    if (!node.material.map) node.material.color.set(0xb89c7a);
  });

  const lightPool = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.4, 48),
    new THREE.MeshBasicMaterial({ map: glow, color: 0xffc89a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  lightPool.rotation.x = -Math.PI / 2;
  lightPool.scale.x = 1.3;
  lightPool.userData.maxOpacity = 0.25;

  const holder = new THREE.Group();
  holder.add(fitted, lightPool);
  holder.visible = false;
  scene.add(holder);
  return holder;
}

export function setOpacity(holder, opacity) {
  holder.visible = opacity > 0.01;
  holder.traverse((node) => {
    if (!node.isMesh) return;
    const { maxOpacity } = node.userData;
    node.material.opacity = opacity * (maxOpacity ?? 1);
    if (!maxOpacity) node.material.depthWrite = opacity > 0.99;
  });
}

// Each era has its own light: the rim light and the dust take on its color.
export function setMood(color) {
  rimLight.color.copy(color);
  dust.material.color.copy(color).lerp(new THREE.Color(0xffffff), 0.5);
}

export function render(time) {
  dust.rotation.y = time * 0.015;
  dust.position.y = Math.sin(time * 0.3) * 0.15;
  camera.lookAt(cameraTarget);
  renderer.render(scene, camera);
}

// The stage is sized in CSS to the large viewport, so the canvas doesn't resize every time a
// phone's address bar slides in or out.
new ResizeObserver(([{ contentRect }]) => {
  camera.aspect = contentRect.width / contentRect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(contentRect.width, contentRect.height);
}).observe(stage);
