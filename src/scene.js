import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const isPhone = matchMedia('(max-width: 768px)').matches;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isPhone ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.querySelector('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const keyLight = new THREE.DirectionalLight(0xffe2c4, 2.4);
keyLight.position.set(3, 4, 2);
const rimLight = new THREE.DirectionalLight(0x9fd8d0, 1.4);
rimLight.position.set(-4, 2, -3);
scene.add(keyLight, rimLight);

export const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
export const cameraTarget = new THREE.Vector3();

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

  const holder = new THREE.Group();
  holder.add(fitted);
  holder.visible = false;
  scene.add(holder);
  return holder;
}

export function setOpacity(holder, opacity) {
  holder.visible = opacity > 0.01;
  holder.traverse((node) => {
    if (node.isMesh) {
      node.material.opacity = opacity;
      node.material.depthWrite = opacity > 0.99;
    }
  });
}

export function render() {
  camera.lookAt(cameraTarget);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
