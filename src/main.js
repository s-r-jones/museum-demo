import Lenis from 'lenis';
import { camera, cameraTarget, loadingManager, loadModel, setOpacity, render } from './scene.js';
import './style.css';

const isPhone = matchMedia('(max-width: 768px)').matches;

// A shot is where the camera and every model sit when the scroll reaches `at`:
// [section id, how far through that section]. Between two shots everything blends.
// Models left out of a shot are hidden. x offsets move models beside the text on desktop.
const shots = [
  {
    at: ['hero', 0],
    camera: [0, 1.6, 7.5], target: [0, 0.7, 0],
    models: { triceratops: { x: 1.1, rotY: -0.7 } },
  },
  {
    at: ['triceratops', 0],
    camera: [0, 1.2, 6], target: [0, 0.6, 0],
    models: { triceratops: { x: 1.1, rotY: 0.2 } },
  },
  {
    at: ['triceratops', 0.55],
    camera: [0, 2.2, 5.5], target: [0, 0.6, 0],
    models: { triceratops: { x: 1.1, rotY: 2.4 } },
  },
  {
    at: ['triceratops', 1],
    camera: [0.9, 0.9, 2.6], target: [1.2, 0.5, 0.2],
    models: { triceratops: { x: 1.3, rotY: 2.5 } },
  },
  {
    at: ['mammoth', 0],
    camera: [0, 1.4, 7], target: [0, 1, 0],
    models: { triceratops: { x: 2, y: -2, rotY: 4.4, opacity: 0 }, mammoth: { x: -1.1, rotY: 0.9 } },
  },
  {
    at: ['mammoth', 1],
    camera: [0, 1.6, 7.8], target: [0, 1, 0],
    models: { mammoth: { x: -1.1, rotY: 2.6 } },
  },
  {
    at: ['diplocaulus', 0],
    camera: [0, 1.5, 6], target: [0, 0.4, 0],
    models: { mammoth: { x: -2, y: -2, rotY: 3.2, opacity: 0 }, diplocaulus: { x: 1.1, rotY: 0.4 } },
  },
  {
    at: ['diplocaulus', 1],
    camera: [0, 2.2, 5.2], target: [0, 0.5, 0],
    models: { diplocaulus: { x: 1.1, rotY: 2.2 } },
  },
  {
    at: ['timeline', 0],
    camera: [0, 2.2, 5.2], target: [0, 0.5, 0],
    models: { diplocaulus: { x: 1.1, y: 2, rotY: 3, opacity: 0 } },
  },
];

const hidden = { x: 0, y: 0, z: 0, rotY: 0, scale: 1, opacity: 0 };
const modelState = (shot, name) => (shot.models[name] ? { ...hidden, opacity: 1, ...shot.models[name] } : hidden);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => t * t * (3 - 2 * t);

const sections = [...document.querySelectorAll('[data-chapter]')];
const timeline = document.querySelector('#timeline');
const track = timeline.querySelector('.timeline-track');

let anchors = [];

function sectionProgress(section) {
  const scrollable = section.offsetHeight - innerHeight;
  return scrollable > 0 ? clamp01((scrollY - section.offsetTop) / scrollable) : 0;
}

function measure() {
  timeline.style.height = `${track.scrollWidth - innerWidth + innerHeight}px`;
  anchors = shots.map(({ at: [id, fraction] }) => {
    const section = document.getElementById(id);
    return section.offsetTop + fraction * Math.max(0, section.offsetHeight - innerHeight);
  });
}

function shotBlend() {
  let i = 0;
  while (i < anchors.length - 2 && scrollY > anchors[i + 1]) i++;
  const t = ease(clamp01((scrollY - anchors[i]) / (anchors[i + 1] - anchors[i])));
  return [shots[i], shots[i + 1], t];
}

function updateScene(models, time) {
  const [from, to, t] = shotBlend();
  const portraitZoom = isPhone ? 1.6 : 1;

  cameraTarget.set(...from.target.map((v, k) => lerp(v, to.target[k], t)));
  camera.position.set(...from.camera.map((v, k) => lerp(v, to.camera[k], t)));
  camera.position.sub(cameraTarget).multiplyScalar(portraitZoom).add(cameraTarget);

  for (const [name, holder] of Object.entries(models)) {
    const a = modelState(from, name);
    const b = modelState(to, name);
    const sideways = isPhone ? 0 : 1;
    holder.position.set(lerp(a.x, b.x, t) * sideways, lerp(a.y, b.y, t) + (isPhone ? 0.6 : 0), lerp(a.z, b.z, t));
    holder.rotation.y = lerp(a.rotY, b.rotY, t) + Math.sin(time * 0.4) * 0.04;
    holder.scale.setScalar(lerp(a.scale, b.scale, t));
    setOpacity(holder, lerp(a.opacity, b.opacity, t));
  }
}

// Sticky chapters show one text panel at a time, chosen by how far you've scrolled through.
function updatePanels() {
  for (const section of sections) {
    const panels = section.querySelectorAll('.panel');
    const active = Math.min(panels.length - 1, Math.floor(sectionProgress(section) * panels.length));
    panels.forEach((panel, i) => panel.classList.toggle('is-active', i === active));
  }
  track.style.transform = `translateX(${-sectionProgress(timeline) * (track.scrollWidth - innerWidth)}px)`;
  document.body.classList.toggle('past-hero', scrollY > innerHeight * 0.5);
}

const progressBar = document.querySelector('.loader-bar');
loadingManager.onProgress = (url, loaded, total) => {
  progressBar.style.transform = `scaleX(${loaded / total})`;
};

const [triceratops, mammoth, diplocaulus] = await Promise.all([
  loadModel('/models/triceratops.glb', 3.2, [-0.7018562, 0, 0, 0.7123187]),
  loadModel('/models/mammoth.glb', 3, [-0.7068252, 0, 0, 0.7073883]),
  loadModel('/models/diplocaulus.glb', 2.2, [-0.0259331, -0.0188446, -0.5360385, 0.8435846]),
]);
const models = { triceratops, mammoth, diplocaulus };

document.body.classList.add('is-loaded');
new Lenis({ autoRaf: true });
measure();
addEventListener('resize', measure);

function frame(ms) {
  updateScene(models, ms / 1000);
  updatePanels();
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
