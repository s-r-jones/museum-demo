import Lenis from 'lenis';
import { Color } from 'three';
import { camera, cameraTarget, loadingManager, loadModel, setOpacity, setMood, render } from './scene.js';
import './style.css';

const isPhone = matchMedia('(max-width: 768px)').matches;
const hasPointer = matchMedia('(hover: hover)').matches;

// A shot is where the camera and every model sit when the scroll reaches `at`:
// [section id, how far through that section]. Between two shots everything blends.
// A model missing from one side of a blend rises in or sinks away. x offsets move models
// beside the text on desktop; phones center them above the text card.
// `mood` colors the rim light, dust and background glow for each era.
const shots = [
  {
    at: ['hero', 0], mood: '#ff9a5a',
    camera: [0, 1.6, 7.5], target: [0, 0.7, 0],
    models: { triceratops: { x: 1.1, rotY: -0.7 } },
  },
  {
    at: ['triceratops', 0], mood: '#ff9a5a',
    camera: [0, 1.2, 6], target: [0, 0.6, 0],
    models: { triceratops: { x: 1.1, rotY: 0.2 } },
  },
  {
    at: ['triceratops', 0.55], mood: '#ffb36b',
    camera: [0, 2.2, 5.5], target: [0, 0.6, 0],
    models: { triceratops: { x: 1.1, rotY: 2.4 } },
  },
  {
    at: ['triceratops', 1], mood: '#ff8a4c',
    camera: [0.9, 0.9, 2.6], target: [1.2, 0.5, 0.2],
    phone: { camera: [0.4, 1.6, 3.6], target: [0.7, 1, 0.2] },
    models: { triceratops: { x: 1.3, rotY: 2.5 } },
  },
  {
    at: ['mammoth', 0], mood: '#8ec5ff',
    camera: [0, 1.4, 7], target: [0, 1, 0],
    models: { mammoth: { x: -1.1, rotY: 0.9 } },
  },
  {
    at: ['mammoth', 1], mood: '#a8d4ff',
    camera: [0, 1.6, 7.8], target: [0, 1, 0],
    models: { mammoth: { x: -1.1, rotY: 2.6 } },
  },
  {
    at: ['diplocaulus', 0], mood: '#5fd3a8',
    camera: [0, 1.5, 6], target: [0, 0.4, 0],
    models: { diplocaulus: { x: 1.1, rotY: 0.4 } },
  },
  {
    at: ['diplocaulus', 1], mood: '#5fd3a8',
    camera: [0, 2.2, 5.2], target: [0, 0.5, 0],
    models: { diplocaulus: { x: 1.1, rotY: 2.2 } },
  },
  {
    at: ['timeline', 0], mood: '#c58f63',
    camera: [0, 2.2, 5.2], target: [0, 0.5, 0],
    models: {},
  },
];

const onstage = (state) => ({ x: 0, y: 0, z: 0, rotY: 0, scale: 1, opacity: 1, ...state });
// Models travel upward with the scroll: they rise in from below and drift up and away.
const entering = (state) => ({ ...state, y: state.y - 1.2, rotY: state.rotY - 1.2, scale: 0.7, opacity: 0 });
const leaving = (state) => ({ ...state, y: state.y + 1.5, rotY: state.rotY + 1.2, scale: 0.8, opacity: 0 });

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => t * t * (3 - 2 * t);
// Frame-rate independent easing toward a target; higher speed catches up faster.
const damp = (current, target, speed, dt) => lerp(current, target, 1 - Math.exp(-speed * dt));

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

function shotBlend(scroll) {
  let i = 0;
  while (i < anchors.length - 2 && scroll > anchors[i + 1]) i++;
  const t = ease(clamp01((scroll - anchors[i]) / (anchors[i + 1] - anchors[i])));
  return [shots[i], shots[i + 1], t];
}

// Phones center the model and pull back to fit the narrow screen,
// unless a shot gives its own `phone` framing.
function framing(shot) {
  if (!isPhone) return shot;
  if (shot.phone) return shot.phone;
  const [, ty, tz] = shot.target;
  const [, cy, cz] = shot.camera;
  return { target: [0, ty, tz], camera: [0, ty + (cy - ty) * 1.55, tz + (cz - tz) * 1.55] };
}

const mood = new Color();
const moodTo = new Color();
let glowColor = '';

function updateScene(models, scroll, time, parallax) {
  const [from, to, t] = shotBlend(scroll);

  mood.set(from.mood).lerp(moodTo.set(to.mood), t);
  setMood(mood);
  const glow = `#${mood.clone().multiplyScalar(0.2).getHexString()}`;
  if (glow !== glowColor) document.body.style.setProperty('--glow', (glowColor = glow));

  for (const [name, holder] of Object.entries(models)) {
    const [inFrom, inTo] = [from.models[name], to.models[name]];
    if (!inFrom && !inTo) {
      setOpacity(holder, 0);
      continue;
    }
    const a = inFrom ? onstage(inFrom) : entering(onstage(inTo));
    const b = inTo ? onstage(inTo) : leaving(onstage(inFrom));
    const x = lerp(a.x, b.x, t);
    const opacity = lerp(a.opacity, b.opacity, t);

    const float = Math.sin(time * 0.8 + a.rotY) * 0.04;
    holder.position.set(isPhone ? 0 : x, lerp(a.y, b.y, t) + float + (isPhone ? 0.6 : 0), lerp(a.z, b.z, t));
    holder.rotation.y = lerp(a.rotY, b.rotY, t) + Math.sin(time * 0.4) * 0.05;
    holder.scale.setScalar(lerp(a.scale, b.scale, t));
    setOpacity(holder, opacity);
  }

  const [viewFrom, viewTo] = [framing(from), framing(to)];
  cameraTarget.set(...viewFrom.target.map((v, k) => lerp(v, viewTo.target[k], t)));
  camera.position.set(...viewFrom.camera.map((v, k) => lerp(v, viewTo.camera[k], t)));
  camera.position.x += parallax.x + Math.sin(time * 0.23) * 0.12;
  camera.position.y += parallax.y + Math.sin(time * 0.17) * 0.06;
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
new ResizeObserver(measure).observe(document.body);

// On desktop the camera leans gently toward the pointer.
const pointer = { x: 0, y: 0 };
const parallax = { x: 0, y: 0 };
if (hasPointer) {
  addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / innerWidth - 0.5) * 0.5;
    pointer.y = (0.5 - event.clientY / innerHeight) * 0.3;
  });
}

// The scene follows the scroll with a little weight, so motion eases in and settles.
let scroll = scrollY;
let lastTime = 0;

function frame(ms) {
  const time = ms / 1000;
  const dt = Math.min(0.1, time - lastTime);
  lastTime = time;

  scroll = damp(scroll, scrollY, 6, dt);
  parallax.x = damp(parallax.x, pointer.x, 3, dt);
  parallax.y = damp(parallax.y, pointer.y, 3, dt);

  updateScene(models, scroll, time, parallax);
  updatePanels();
  render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
