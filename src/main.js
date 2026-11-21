import * as THREE from 'three';

// Feature-detect native Popover API; load polyfill only when missing.
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('@oddbird/popover-polyfill');
}
import { createLayerMaterial, TERRACE_BEAT_SECONDS } from './shaders/layerShaders.js';
import {
  createSteamMaterial,
  createMistVeilMaterial,
  createRainSheetMaterial,
  createFirefliesMaterial,
  createGlowHaloMaterial,
} from './shaders/fxShaders.js';
import { TeahouseSoundscape } from './audio/soundscape.js';
import { YouTubeRadio } from './audio/youtubeRadio.js';
import { HindiLofiPlayer } from './audio/hindiLofi.js';

const CAM_Z = 6.2;
const FOV_DEG = 36;
const OVERSCAN = 1.04;
// How far past "contain" the artwork may grow to fill the screen (1.12 = crop at most ~11%).
const MAX_FILL = 1.12;
const PREFS_KEY = 'lofi-serene.prefs';

function loadPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function savePrefs(patch) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage unavailable: preferences last for this visit only */
  }
}

const MOOD_LABELS = ['Mood: Default', 'Mood: Deep Night', 'Mood: Warm Glow'];

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionQuery.matches ? 1.0 : 0.0;
reducedMotionQuery.addEventListener('change', (e) => {
  reducedMotion = e.matches ? 1.0 : 0.0;
});

const canvas = document.getElementById('diorama-canvas');
const loadingEl = document.getElementById('loading');
const toastEl = document.getElementById('toast');
const titleNativeEl = document.getElementById('title-native');
const titleEnEl = document.getElementById('title-en');
const titleSubEl = document.getElementById('title-sub');
const titleCardEl = document.querySelector('.title-card');
const sceneSwitcherEl = document.getElementById('scene-switcher');
const stage = document.getElementById('stage');
const portraitLayout = window.matchMedia('(max-width: 820px) and (orientation: portrait)');

const btnAmbience = document.getElementById('btn-ambience');
const btnRadio = document.getElementById('btn-radio');
const btnEnableSound = document.getElementById('btn-enable-sound');
const radioVolumeEl = document.getElementById('radio-volume');
const ytSourceLinkEl = document.getElementById('yt-source-link');
const ytUrlForm = document.getElementById('yt-url-form');
const ytUrlInput = document.getElementById('yt-url-input');
const btnYtMini = document.getElementById('btn-yt-mini');
const ytRadioWrap = document.getElementById('yt-radio-wrap');
const btnMood = document.getElementById('btn-mood');
const btnDrift = document.getElementById('btn-drift');
const btnPause = document.getElementById('btn-pause');
const btnQuickPause = document.getElementById('btn-quick-pause');
const btnControlsTrigger = document.getElementById('btn-controls-trigger');
const controlsPopover = document.getElementById('controls-popover');
const btnTorch = document.getElementById('btn-torch');
const terraceControls = document.getElementById('terrace-controls');
const btnTerraceLamp = document.getElementById('btn-terrace-lamp');
const btnNextStars = document.getElementById('btn-next-stars');
const btnFullscreen = document.getElementById('btn-fullscreen');

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('visible'), 2200);
}

/**
 * Toolbar roving-tabindex fallback — installed ONLY when native `focusgroup`
 * is unsupported (`!('focusGroup' in HTMLElement.prototype)`).
 */
function setupToolbarAccessibility(bar, prefix = 'hud-tip') {
  if (!bar) return;
  const items = Array.from(bar.querySelectorAll('button'));

  if (!('focusGroup' in HTMLElement.prototype) && items.length > 0) {
    items.forEach((b, i) => {
      b.tabIndex = i === 0 ? 0 : -1;
    });

    bar.addEventListener('focusin', ({ target }) => {
      if (items.includes(target)) {
        items.forEach((b) => {
          b.tabIndex = b === target ? 0 : -1;
        });
      }
    });

    bar.addEventListener('keydown', (e) => {
      const idx = items.indexOf(document.activeElement);
      if (idx === -1) return;

      const vertical = bar.getAttribute('aria-orientation') === 'vertical';
      const rtl = getComputedStyle(bar).direction === 'rtl';
      const steps = vertical
        ? { ArrowDown: 1, ArrowUp: -1 }
        : { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };

      let nextIdx = -1;
      if (e.key in steps) {
        nextIdx = (idx + steps[e.key] + items.length) % items.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = items.length - 1;
      }

      if (nextIdx !== -1) {
        e.preventDefault();
        items[nextIdx].focus();
      }
    });
  }

  // Upgrade native `title` tooltips to `popover="hint"` + `interestfor` ONLY when
  // both interest invokers and CSS anchor positioning are natively supported.
  if (
    'interestForElement' in HTMLButtonElement.prototype &&
    CSS.supports('position-area', 'block-start') &&
    window.matchMedia('(hover: hover)').matches
  ) {
    items.forEach((btn, i) => {
      const text = btn.getAttribute('title')?.trim();
      if (!text) return;

      const tip = document.createElement('div');
      tip.id = `${prefix}-${i}`;
      tip.className = 'hud-tip';
      tip.setAttribute('popover', 'hint');
      tip.textContent = text;
      document.body.append(tip);

      btn.setAttribute('interestfor', tip.id);
      btn.removeAttribute('title');

      const name = (btn.getAttribute('aria-label') || btn.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name.toLowerCase() !== text.toLowerCase()) {
        tip.setAttribute('role', 'tooltip');
        if (!btn.hasAttribute('aria-describedby')) {
          btn.setAttribute('aria-describedby', tip.id);
        }
      }
    });
  }
}

// Sync aria-expanded on the Controls popover trigger from the popover's toggle event
if (controlsPopover && btnControlsTrigger) {
  controlsPopover.addEventListener('toggle', ({ newState }) => {
    btnControlsTrigger.setAttribute('aria-expanded', String(newState === 'open'));
    if (newState === 'closed') {
      btnControlsTrigger.focus();
    }
  });
}

function uvToWorld(u, v, z, baseW, baseH) {
  const scale = ((CAM_Z - z) / CAM_Z) * OVERSCAN;
  const x = (u - 0.5) * baseW * scale;
  const y = (0.5 - v) * baseH * scale;
  return new THREE.Vector3(x, y, z);
}

async function init() {
  const catalogRes = await fetch('./assets/scenes.json', { cache: 'no-cache' });
  const catalog = await catalogRes.json();
  const scenesList = catalog.scenes || [];
  const savedScene = loadPrefs().scene;
  const initialScene =
    scenesList.find((scene) => scene.id === savedScene) ??
    scenesList.find((scene) => scene.id === 'summer-terrace') ??
    scenesList[0];

  function revealSelectedScene() {
    if (portraitLayout.matches) {
      sceneSwitcherEl.querySelector('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  portraitLayout.addEventListener('change', revealSelectedScene);

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;

  // --- Scene & Camera ---
  const scene = new THREE.Scene();
  // Transparent: on unusual screen shapes the blurred scene backdrop shows around the art.
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(FOV_DEG, window.innerWidth / window.innerHeight, 0.1, 30);
  camera.position.set(0, 0, CAM_Z);

  const loader = new THREE.TextureLoader();
  const loadTex = (url, isColor = true) =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          resolve(tex);
        },
        undefined,
        reject
      );
    });

  // Shared geometries
  const planeGeo = new THREE.PlaneGeometry(1, 1, 48, 27);
  const quadGeo = new THREE.PlaneGeometry(1, 1);

  // Shared FX meshes (repositioned & re-themed on scene switch)
  const mistMat = createMistVeilMaterial();
  const mistMesh = new THREE.Mesh(quadGeo, mistMat);
  mistMesh.renderOrder = 3;
  scene.add(mistMesh);

  const fogBankMat = createMistVeilMaterial();
  fogBankMat.uniforms.uSpeed.value = 0.015;
  const fogBankMesh = new THREE.Mesh(quadGeo, fogBankMat);
  fogBankMesh.renderOrder = 5;
  scene.add(fogBankMesh);

  const rainMat = createRainSheetMaterial(null);
  const rainMesh = new THREE.Mesh(quadGeo, rainMat);
  // z = 0.08 puts rain BEHIND indoor veranda/window foreground (z = 0.45, 1.10)
  // and IN FRONT of outdoor palms/firs/water (z = -2.1..-0.3)!
  rainMesh.position.z = 0.08;
  rainMesh.renderOrder = 6;
  scene.add(rainMesh);

  const cupSteamMat = createSteamMaterial();
  const cupSteamMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.72), cupSteamMat);
  cupSteamMesh.renderOrder = 12;
  scene.add(cupSteamMesh);

  const potSteamMat = createSteamMaterial();
  potSteamMat.uniforms.uOpacity.value = 0.28;
  const potSteamMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.56), potSteamMat);
  potSteamMesh.renderOrder = 12;
  scene.add(potSteamMesh);

  const hangingHaloMat = createGlowHaloMaterial(0xffaa4c, 0.24);
  const hangingHaloMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.05), hangingHaloMat);
  hangingHaloMesh.renderOrder = 11;
  scene.add(hangingHaloMesh);

  const stoneHaloMat = createGlowHaloMaterial(0xffcf6b, 0.20);
  const stoneHaloMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), stoneHaloMat);
  stoneHaloMesh.renderOrder = 7;
  scene.add(stoneHaloMesh);

  // Fireflies
  const FIREFLY_COUNT = 64;
  const ffPositions = new Float32Array(FIREFLY_COUNT * 3);
  const ffPhases = new Float32Array(FIREFLY_COUNT);
  const ffScales = new Float32Array(FIREFLY_COUNT);
  const ffSpeeds = new Float32Array(FIREFLY_COUNT);
  const ffSeeds = [];
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    ffSeeds.push({
      u: 0.08 + Math.random() * 0.84,
      v: 0.26 + Math.random() * 0.56,
      z: -1.2 + Math.random() * 1.9,
    });
    ffPhases[i] = Math.random();
    ffScales[i] = 0.45 + Math.random() * 0.95;
    ffSpeeds[i] = 0.35 + Math.random() * 0.65;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPositions, 3));
  ffGeo.setAttribute('aPhase', new THREE.BufferAttribute(ffPhases, 1));
  ffGeo.setAttribute('aScale', new THREE.BufferAttribute(ffScales, 1));
  ffGeo.setAttribute('aSpeed', new THREE.BufferAttribute(ffSpeeds, 1));
  const ffMat = createFirefliesMaterial();
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.renderOrder = 10;
  scene.add(fireflies);

  // Active scene state
  let currentManifest = null;
  let imgAspect = 16 / 9;
  let baseH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV_DEG * 0.5)) * CAM_Z;
  let baseW = baseH * imgAspect;
  let frustumW = baseW;
  let frustumH = baseH;
  let layerGroup = new THREE.Group();
  scene.add(layerGroup);
  let layerMaterials = [];
  let layerMeshes = [];
  const sceneCache = new Map();

  const sound = new TeahouseSoundscape();
  let autoDrift = true;
  let paused = false;
  let simTime = 0;
  let sceneStartTime = 0;
  let moodIndex = 0;
  let inspectIndex = 0;

  const targetPointer = new THREE.Vector2(0, 0);
  const smoothPointer = new THREE.Vector2(0, 0);
  const torchWorld = new THREE.Vector3();
  const torchScreen = new THREE.Vector3();
  const torchCanvas = { left: 0, top: 0, width: 0, height: 0 };
  let torchOn = false;
  let terraceLampOn = true;
  let constellationOffset = 0;

  function terraceTime() {
    return reducedMotion ? 1.7 : simTime - sceneStartTime;
  }

  function setTorch(on) {
    torchOn = on;
    btnTorch.setAttribute('aria-pressed', String(on));
  }

  function setTerraceLamp(on) {
    terraceLampOn = on;
    btnTerraceLamp.setAttribute('aria-pressed', String(on));
  }

  function toggleTerraceLamp() {
    setTerraceLamp(!terraceLampOn);
    showToast(terraceLampOn ? 'Wall lamp on' : 'Wall lamp dimmed');
  }

  function nextConstellation() {
    const baseTime = terraceTime();
    const nextBeat = Math.floor((baseTime + constellationOffset) / TERRACE_BEAT_SECONDS) + 1;
    const visiblePhase = paused || reducedMotion ? TERRACE_BEAT_SECONDS * 0.33 : 0;
    constellationOffset = nextBeat * TERRACE_BEAT_SECONDS + visiblePhase - baseTime;
    showToast('Next constellation');
  }

  let lanternAngle = 0;
  let lanternVel = 0;
  let lanternPulse = 0;
  let stonePulse = 0;
  let teaSwirl = 0;
  let rippleCursor = 0;

  function applyVisibility() {
    if (!currentManifest) return;
    const fx = currentManifest.effects || {};
    const showFx = inspectIndex === 0;
    fireflies.visible = showFx && Boolean(fx.fireflies);
    rainMesh.visible = showFx && (fx.rain || 0) > 0.01;
    fogBankMesh.visible = showFx && (fx.fog || 0) > 0.05;
    mistMesh.visible = showFx && (fx.mist || 0) > 0.02;
    cupSteamMesh.visible = showFx && fx.cupSteam !== false;
    potSteamMesh.visible = showFx && Boolean(fx.potSteam ?? (currentManifest.id !== 'pnw'));
    hangingHaloMesh.visible = showFx;
    stoneHaloMesh.visible = showFx && currentManifest.id !== 'pnw' && fx.secondaryGlow !== false;
  }

  function placeSteamAtSurface(mesh, [u, v], [width, height], z) {
    const source = uvToWorld(u, v, z, baseW, baseH);
    const end = uvToWorld(u + width, v - height, z, baseW, baseH);
    const worldHeight = end.y - source.y;
    mesh.scale.set(
      (end.x - source.x) / mesh.geometry.parameters.width,
      worldHeight / mesh.geometry.parameters.height,
      1,
    );
    mesh.position.copy(source);
    mesh.position.y += worldHeight * 0.48;
  }

  function updateLayout(width, height) {
    renderer.setSize(width, height, false);
    const vpAspect = width / Math.max(1, height);
    camera.aspect = vpAspect;
    camera.updateProjectionMatrix();

    frustumH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV_DEG * 0.5)) * CAM_Z;
    frustumW = frustumH * vpAspect;

    // Fill the screen: start from contain-fit, then grow toward cover, cropping at most
    // (MAX_FILL - 1) of the artwork. Wider gaps show the blurred backdrop instead of black bars.
    if (vpAspect <= imgAspect) {
      baseW = frustumW;
      baseH = baseW / imgAspect;
    } else {
      baseH = frustumH;
      baseW = baseH * imgAspect;
    }
    const coverScale = Math.max(frustumW / baseW, frustumH / baseH);
    const fill = Math.min(coverScale, MAX_FILL);
    baseW *= fill;
    baseH *= fill;

    layerMeshes.forEach(({ mesh, z }) => {
      const s = ((CAM_Z - z) / CAM_Z) * OVERSCAN;
      mesh.scale.set(baseW * s, baseH * s, 1);
    });

    const rainScale = ((CAM_Z - rainMesh.position.z) / CAM_Z) * OVERSCAN;
    rainMesh.scale.set(baseW * rainScale, baseH * rainScale, 1);

    if (!currentManifest) return;
    const a = currentManifest.anchors;
    const reg = currentManifest.regions;
    const torchProp = currentManifest.effects?.torchProp;
    if (torchProp) {
      torchWorld.copy(uvToWorld(...torchProp.center, currentManifest.layers[4].z, baseW, baseH));
      torchCanvas.left = canvas.offsetLeft;
      torchCanvas.top = canvas.offsetTop;
      torchCanvas.width = width;
      torchCanvas.height = height;
    }

    // Valley mist veil
    const [mx0, mx1, my0, my1] = reg.mistBand;
    mistMesh.position.copy(uvToWorld((mx0 + mx1) * 0.5, (my0 + my1) * 0.5, -0.75, baseW, baseH));
    mistMesh.scale.set(baseW * (mx1 - mx0) * 1.15, baseH * (my1 - my0) * 1.25, 1);

    // Dense rolling forest fog / Himalayan cloud sea bank
    fogBankMesh.position.copy(uvToWorld((mx0 + mx1) * 0.5, (my0 + my1) * 0.5 + 0.04, -0.45, baseW, baseH));
    fogBankMesh.scale.set(baseW * (mx1 - mx0) * 1.25, baseH * (my1 - my0) * 1.35, 1);

    // Tea / chai / coffee steam (placed just in front of foreground table layer so mug/cup never clips it)
    const steamZ = currentManifest.id === 'teahouse' ? 0.52 : 1.12;
    const [cu, cv] = a.teacupSteam;
    const cupSteam = currentManifest.effects?.cupSteam;
    const potSteam = currentManifest.effects?.potSteam;
    const surfaceZ = currentManifest.layers.at(-1).z + 0.035;
    if (cupSteam?.size) {
      placeSteamAtSurface(cupSteamMesh, a.teacupSteam, cupSteam.size, surfaceZ);
    } else {
      cupSteamMesh.scale.set(1, 1, 1);
      cupSteamMesh.position.copy(uvToWorld(cu, cv - 0.065, steamZ, baseW, baseH));
    }

    const [pu, pv] = a.teapotSpout;
    if (potSteam?.size) {
      placeSteamAtSurface(potSteamMesh, a.teapotSpout, potSteam.size, surfaceZ);
    } else {
      potSteamMesh.scale.set(1, 1, 1);
      potSteamMesh.position.copy(uvToWorld(pu - 0.006, pv - 0.055, steamZ, baseW, baseH));
    }

    // Warm halos
    const [lu, lv] = a.hangingLanternCenter;
    hangingHaloMesh.position.copy(uvToWorld(lu, lv, 1.14, baseW, baseH));

    const [su, sv] = a.stoneLanternCenter;
    stoneHaloMesh.position.copy(uvToWorld(su, sv, currentManifest.id === 'teahouse' ? -0.24 : 0.65, baseW, baseH));

    // Fireflies
    const posAttr = ffGeo.getAttribute('position');
    ffSeeds.forEach((s, i) => {
      const p = uvToWorld(s.u, s.v, s.z, baseW, baseH);
      posAttr.setXYZ(i, p.x, p.y, p.z);
    });
    posAttr.needsUpdate = true;
    ffMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  async function loadSceneById(sceneId, isInitial = false) {
    const entry = scenesList.find((s) => s.id === sceneId) || scenesList[0];
    if (!entry) return;

    if (!isInitial) {
      // soft dip to dark instead of the full loading screen
      stage.classList.add('is-switching');
      await new Promise((r) => setTimeout(r, reducedMotion ? 60 : 380));
    }

    let bundle = sceneCache.get(entry.id);
    if (!bundle) {
      const res = await fetch(`./${entry.manifest}`, { cache: 'no-cache' });
      const manifest = await res.json();
      const torchFile = manifest.effects?.torchProp?.file;
      const [depthTex, maskEnvTex, maskGlowTex, torchPropTex, ...layerTextures] = await Promise.all([
        loadTex(`./${manifest.depthMap}`, false),
        loadTex(`./${manifest.masks.env}`, false),
        loadTex(`./${manifest.masks.glow}`, false),
        torchFile ? loadTex(`./${torchFile}`) : null,
        ...manifest.layers.map((l) => loadTex(`./${l.file}`, true)),
      ]);
      bundle = { manifest, depthTex, maskEnvTex, maskGlowTex, torchPropTex, layerTextures };
      sceneCache.set(entry.id, bundle);
    }

    // Clear previous layer meshes cleanly
    while (layerGroup.children.length > 0) {
      const child = layerGroup.children.pop();
      if (child.material) child.material.dispose();
    }
    layerMaterials = [];
    layerMeshes = [];

    const { manifest, depthTex, maskEnvTex, maskGlowTex, torchPropTex, layerTextures } = bundle;
    currentManifest = manifest;
    sceneStartTime = simTime;
    imgAspect = manifest.aspect || 16 / 9;
    stage.style.setProperty('--scene-backdrop', `url("${layerTextures[0].image.src}")`);
    const interactiveTerrace = Boolean(manifest.effects?.terraceInteractions);
    btnTorch.hidden = !torchPropTex;
    terraceControls.hidden = !interactiveTerrace;
    setTorch(false);
    setTerraceLamp(true);
    constellationOffset = 0;

    manifest.layers.forEach((layerMeta, idx) => {
      const mat = createLayerMaterial({
        layerTexture: layerTextures[idx],
        depthTexture: depthTex,
        maskEnvTexture: maskEnvTex,
        maskGlowTexture: maskGlowTex,
        torchPropTexture: torchPropTex,
        layerIndex: idx,
        depthRelief: manifest.effects?.depthRelief ?? (idx === 0 ? 0.10 : 0.06),
        manifest,
      });
      mat.uniforms.uMood.value = moodIndex;
      mat.uniforms.uInspectMode.value = inspectIndex;

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.z = layerMeta.z;
      mesh.renderOrder = idx * 2;
      layerGroup.add(mesh);
      layerMaterials.push(mat);
      layerMeshes.push({ mesh, z: layerMeta.z });
    });

    // Configure weather & atmosphere FX for this scene
    const fx = manifest.effects || {};
    cupSteamMat.uniforms.uOpacity.value = fx.cupSteam?.opacity ?? 0.42;
    cupSteamMat.uniforms.uSurfaceSource.value = fx.cupSteam ? 1 : 0;
    potSteamMat.uniforms.uOpacity.value = fx.potSteam?.opacity ?? 0.28;
    potSteamMat.uniforms.uSurfaceSource.value = fx.potSteam?.size ? 1 : 0;
    rainMesh.renderOrder = fx.rainRenderOrder ?? 6;
    rainMat.uniforms.uDepthMap.value = depthTex;
    rainMat.uniforms.uIntensity.value = fx.rain || 0.0;
    rainMat.uniforms.uTint.value.setHex(manifest.id === 'kerala' ? 0x9fd0dd : 0xdbe6ef);

    mistMat.uniforms.uColor.value.setHex(Number(fx.mistColor || 0x9cb4d4));
    mistMat.uniforms.uOpacity.value = (fx.mist || 0.16) * 0.9;

    fogBankMat.uniforms.uColor.value.setHex(Number(fx.mistColor || 0xc6d5e0));
    fogBankMat.uniforms.uOpacity.value = (fx.fog || 0.0) * 0.42;

    // Reset lantern pendulum & pulses
    lanternAngle = 0;
    lanternVel = 0;
    lanternPulse = 0;
    stonePulse = 0;
    teaSwirl = 0;

    // Update UI headers & active pill state
    titleNativeEl.textContent = manifest.nativeTitle || manifest.region;
    titleEnEl.textContent = manifest.title;
    titleSubEl.textContent = manifest.subtitle;
    sceneSwitcherEl.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.sceneId === manifest.id));
    });
    revealSelectedScene();

    // Switch regional spatial ambience profile
    sound.setProfile(manifest.soundProfile || 'japan');

    applyVisibility();
    const rect = canvas.getBoundingClientRect();
    updateLayout(rect.width || window.innerWidth, rect.height || window.innerHeight);

    loadingEl.classList.add('hidden');
    document.title = `${manifest.title} · Lo-Fi Serene`;
    savePrefs({ scene: manifest.id });
    // replay the title card entrance
    titleCardEl.classList.remove('is-entering');
    void titleCardEl.offsetWidth;
    titleCardEl.classList.add('is-entering');
    requestAnimationFrame(() => stage.classList.remove('is-switching'));
  }

  // Build Scene Switcher Pills
  scenesList.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scene-pill';
    btn.dataset.sceneId = s.id;
    btn.setAttribute('aria-pressed', String(s.id === initialScene?.id));
    const thumb = document.createElement('img');
    thumb.className = 'scene-thumb';
    thumb.src = `./assets/thumbs/${s.id}.jpg`;
    thumb.alt = '';
    thumb.decoding = 'async';
    thumb.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = s.badge;
    btn.append(thumb, label);
    btn.setAttribute('aria-label', `${s.badge}: ${s.title}`);
    btn.addEventListener('click', () => {
      if (currentManifest?.id !== s.id) {
        loadSceneById(s.id, false);
      }
    });
    sceneSwitcherEl.appendChild(btn);
  });
  setupToolbarAccessibility(sceneSwitcherEl, 'scene-tip');

  // Resize observer on the 16:9 canvas so layout always matches its exact dimensions
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) updateLayout(width, height);
    }
  });
  resizeObserver.observe(canvas);

  /** Map a screen point to artwork UV (0..1 from the top-left), accounting for fill and crop. */
  function screenToImageUv(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const imgW = rect.width * (baseW / frustumW);
    const imgH = rect.height * (baseH / frustumH);
    const u = 0.5 + (clientX - (rect.left + rect.width / 2)) / imgW;
    const v = 0.5 + (clientY - (rect.top + rect.height / 2)) / imgH;
    return { u, v };
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    targetPointer.set(nx, ny);

    if (!currentManifest) return;
    const { u, v } = screenToImageUv(e.clientX, e.clientY);
    const [cu, cv] = currentManifest.anchors.teacupSteam;
    if (currentManifest.effects?.cupSteam !== false && Math.hypot(u - cu, v - cv) < 0.09) {
      teaSwirl = Math.min(1.0, teaSwirl + 0.14);
    }
  });

  canvas.addEventListener('pointerleave', () => {
    targetPointer.set(0, 0);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!currentManifest) return;
    const { u, v } = screenToImageUv(e.clientX, e.clientY);
    const t = simTime;
    const a = currentManifest.anchors;
    const fx = currentManifest.effects || {};

    // 1. Primary lantern / banker's lamp
    const [lu, lv] = a.hangingLanternCenter;
    if (fx.terraceInteractions) {
      if (Math.hypot((u - lu) * imgAspect, v - lv) < 0.055) {
        toggleTerraceLamp();
      } else if (v < currentManifest.regions.skyMaxV) {
        nextConstellation();
      }
      return;
    }

    if (Math.hypot((u - lu) * 1.4, v - lv) < 0.14) {
      if (fx.pendulumLantern) {
        const dir = u >= lu ? -1 : 1;
        lanternVel += dir * 0.28;
      }
      lanternPulse = 1.0;
      sound.playLanternChime();
      showToast(fx.pendulumLantern ? 'Lantern swayed gently in the breeze' : 'Warm light glowed brighter');
      return;
    }

    // 2. Secondary diya / storm lantern / stone lantern
    const [su, sv] = a.stoneLanternCenter;
    if (fx.secondaryGlow !== false && Math.hypot(u - su, v - sv) < 0.085) {
      stonePulse = 1.0;
      sound.playCandleFlare();
      showToast('Warm flame flickered softly');
      return;
    }

    // 3. Tea / chai / coffee cup
    const [cu, cv] = a.teacupSteam;
    if (fx.cupSteam !== false && Math.hypot(u - cu, v - cv) < 0.11) {
      teaSwirl = 1.0;
      sound.playCandleFlare();
      showToast('Warm steam curled upward');
      return;
    }

    // 4. Water / backwater lagoon / mountain lake click ripple
    const [wx0, wx1, wy0, wy1] = currentManifest.regions.water;
    if (wx1 > wx0 && u > wx0 && u < wx1 && v > wy0 && v < wy1) {
      const webglV = 1.0 - v;
      layerMaterials.forEach((mat) => {
        mat.uniforms.uRipples.value[rippleCursor].set(u, webglV, t, 1.0);
      });
      rippleCursor = (rippleCursor + 1) % 4;
      sound.playWaterDrop();
      showToast('Ripples drifted across the calm water');
    }
  });

  // --- HUD Controls ---
  btnTorch.addEventListener('click', () => {
    setTorch(!torchOn);
    showToast(torchOn ? 'Flashlight on' : 'Flashlight off');
  });
  btnTerraceLamp.addEventListener('click', toggleTerraceLamp);
  btnNextStars.addEventListener('click', nextConstellation);

  btnAmbience.addEventListener('click', () => {
    const on = sound.toggleAmbience();
    btnAmbience.setAttribute('aria-pressed', String(on));
    showToast(on ? 'Spatial ambience enabled' : 'Ambience muted');
  });

  const hindiLofi = new HindiLofiPlayer({ onStateChange: syncBuiltinAudioControls });
  const ytRadio = new YouTubeRadio('yt-radio-host', {
    onError: (msg) => {
      showToast(msg);
    },
  });
  let musicMode = 'builtin'; // 'builtin' (Night Hindi Lo-Fi, default) | 'youtube' (user custom URL)
  if (ytSourceLinkEl) ytSourceLinkEl.href = ytRadio.getVideoUrl();

  function syncBuiltinAudioControls() {
    btnEnableSound.hidden = musicMode !== 'builtin' || !hindiLofi.enabled || hindiLofi.playing;
    if (musicMode === 'builtin') btnRadio.setAttribute('aria-pressed', String(hindiLofi.playing));
  }

  async function startBuiltinAudio() {
    if (await hindiLofi.start()) showToast('Playing: Night Hindi Lo-Fi');
  }

  btnEnableSound.addEventListener('click', startBuiltinAudio);

  btnRadio.addEventListener('click', () => {
    if (musicMode === 'youtube') {
      const on = ytRadio.toggle();
      btnRadio.setAttribute('aria-pressed', String(on));
      showToast(on ? 'Lo-Fi Radio playing (YouTube)' : 'Lo-Fi Radio paused');
    } else if (hindiLofi.playing) {
      hindiLofi.stop();
      showToast('Lo-Fi Radio paused');
    } else {
      startBuiltinAudio();
    }
  });

  radioVolumeEl?.addEventListener('input', (e) => {
    hindiLofi.setVolume(e.target.value);
    ytRadio.setVolume(e.target.value);
  });

  btnYtMini?.addEventListener('click', () => {
    if (musicMode === 'builtin') {
      // Switch to built-in toggle vs YouTube mini-player
      const shown = ytRadioWrap?.classList.toggle('visible');
      btnYtMini.textContent = shown ? 'Hide Player' : 'Show Player';
      ytRadioWrap?.setAttribute('aria-hidden', String(!shown));
      return;
    }
    const shown = ytRadioWrap?.classList.toggle('visible');
    btnYtMini.textContent = shown ? 'Hide Player' : 'Show Player';
    ytRadioWrap?.setAttribute('aria-hidden', String(!shown));
  });

  ytUrlForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = (ytUrlInput?.value || '').trim();
    if (!raw) {
      // Empty submit switches back to built-in Night Hindi Lo-Fi
      if (musicMode === 'youtube' && ytRadio.enabled) ytRadio.toggle();
      musicMode = 'builtin';
      hindiLofi.start();
      showToast('Switched back to Night Hindi Lo-Fi');
      return;
    }
    const loadedId = ytRadio.loadVideo(raw);
    if (!loadedId) {
      showToast('Please paste a valid YouTube link or video ID');
      return;
    }
    musicMode = 'youtube';
    hindiLofi.stop();
    btnRadio.setAttribute('aria-pressed', 'true');
    if (ytSourceLinkEl) ytSourceLinkEl.href = ytRadio.getVideoUrl();
    ytUrlInput.value = '';
    showToast('Now playing your YouTube link');
  });

  btnMood.addEventListener('click', () => {
    moodIndex = (moodIndex + 1) % MOOD_LABELS.length;
    btnMood.querySelector('span').textContent = MOOD_LABELS[moodIndex];
    layerMaterials.forEach((m) => (m.uniforms.uMood.value = moodIndex));
  });

  btnDrift.addEventListener('click', () => {
    autoDrift = !autoDrift;
    btnDrift.setAttribute('aria-pressed', String(autoDrift));
  });

  function togglePause() {
    paused = !paused;
    btnPause.querySelector('span').textContent = paused ? 'Play' : 'Pause';
    if (btnQuickPause) {
      btnQuickPause.querySelector('span').textContent = paused ? '▶' : '❚❚';
      btnQuickPause.setAttribute(
        'aria-label',
        paused ? 'Resume scene animation' : 'Pause scene animation'
      );
    }
    showToast(paused ? 'Scene animation paused' : 'Scene animation resumed');
  }

  btnPause.addEventListener('click', togglePause);
  btnQuickPause?.addEventListener('click', togglePause);

  // --- Fullscreen ---
  const canFullscreen = Boolean(document.fullscreenEnabled && stage.requestFullscreen);
  if (btnFullscreen) btnFullscreen.hidden = !canFullscreen;
  function toggleFullscreen() {
    if (!canFullscreen) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  btnFullscreen?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const on = Boolean(document.fullscreenElement);
    btnFullscreen?.setAttribute('aria-pressed', String(on));
    btnFullscreen?.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  });

  // --- Keyboard shortcuts (F full screen, Space pause animation, S next scene) ---
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === 's' || e.key === 'S') {
      const i = scenesList.findIndex((x) => x.id === currentManifest?.id);
      const next = scenesList[(i + 1) % scenesList.length];
      if (next) loadSceneById(next.id, false);
    } else if (e.key === ' ' && !e.target.closest?.('button, a')) {
      e.preventDefault();
      togglePause();
    }
  });

  // --- Calm mode: fade the interface after a few still seconds so only the scene remains ---
  let idleTimer = null;
  const IDLE_MS = 4500;
  function wake() {
    stage.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      let popoverOpen = false;
      try {
        popoverOpen = Boolean(controlsPopover?.matches(':popover-open'));
      } catch {
        popoverOpen = Boolean(controlsPopover?.classList.contains(':popover-open'));
      }
      // stay visible while someone is using the keyboard on a control
      let focusInUi = false;
      try {
        focusInUi = Boolean(document.activeElement?.matches(':focus-visible'));
      } catch {
        /* :focus-visible unsupported */
      }
      if (popoverOpen || focusInUi) {
        wake();
        return;
      }
      stage.classList.add('is-idle');
    }, IDLE_MS);
  }
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, wake, { passive: true })
  );
  wake();

  // Load initial scene
  if (initialScene) await loadSceneById(initialScene.id, true);

  // Try autoplay, then allow retries on touch release, click, and keyboard input.
  hindiLofi.start();
  const unlockAudio = (event) => {
    if (btnEnableSound.contains(event.target) || btnRadio.contains(event.target)) return;
    if (musicMode === 'youtube') {
      ytRadio.unlockIfPending();
    } else if (hindiLofi.enabled && !hindiLofi.playing) {
      hindiLofi.unlockIfPending();
    }
  };
  window.addEventListener('pointerup', unlockAudio, true);
  window.addEventListener('click', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!paused) {
      simTime += dt;
    }
    const t = simTime;
    const m = paused ? 0.0 : 1.0 - reducedMotion;

    const driftX = autoDrift ? Math.sin(t * 0.24) * 0.28 * m : 0;
    const driftY = autoDrift ? Math.cos(t * 0.19) * 0.16 * m : 0;

    smoothPointer.x += (targetPointer.x - smoothPointer.x) * Math.min(1, dt * 3.8);
    smoothPointer.y += (targetPointer.y - smoothPointer.y) * Math.min(1, dt * 3.8);

    const parallaxStrength = currentManifest?.effects?.parallaxStrength ?? 1;
    const camX = (smoothPointer.x * 0.34 + driftX) * m * parallaxStrength;
    const camY = (smoothPointer.y * 0.20 + driftY) * m * parallaxStrength;

    camera.position.x = camX;
    camera.position.y = camY;
    camera.lookAt(camX * 0.22, camY * 0.22, -0.4);

    sound.setParallaxPan(smoothPointer.x + driftX);

    const breezeTorque = (Math.sin(t * 1.15) * 0.022 + Math.sin(t * 2.3 + 0.7) * 0.01) * m;
    const springAcc = -7.5 * lanternAngle - 1.35 * lanternVel + breezeTorque * 7.5;
    lanternVel += springAcc * dt;
    lanternAngle += lanternVel * dt;

    lanternPulse = Math.max(0, lanternPulse - dt * 0.85);
    stonePulse = Math.max(0, stonePulse - dt * 0.75);
    teaSwirl = Math.max(0, teaSwirl - dt * 0.65);

    if (!btnTorch.hidden) {
      camera.updateMatrixWorld();
      torchScreen.copy(torchWorld).project(camera);
      const x = torchCanvas.left + (torchScreen.x + 1) * torchCanvas.width * 0.5;
      const y = torchCanvas.top + (1 - torchScreen.y) * torchCanvas.height * 0.5;
      btnTorch.style.left = `${x}px`;
      btnTorch.style.top = `${y}px`;
    }
    const elapsed = terraceTime();
    for (let i = 0; i < layerMaterials.length; i++) {
      const u = layerMaterials[i].uniforms;
      u.uTime.value = t;
      u.uTerraceTime.value = elapsed;
      u.uConstellationTime.value = elapsed + constellationOffset;
      u.uTorchOn.value = torchOn ? 1 : 0;
      u.uTerraceLampOn.value = terraceLampOn ? 1 : 0;
      u.uReducedMotion.value = paused ? 1.0 : reducedMotion;
      u.uLanternSwing.value = lanternAngle;
      u.uLanternPulse.value = lanternPulse;
      u.uStonePulse.value = stonePulse;
    }

    cupSteamMat.uniforms.uTime.value = t * m;
    cupSteamMat.uniforms.uSwirl.value = teaSwirl;
    potSteamMat.uniforms.uTime.value = t * m + 3.1;
    potSteamMat.uniforms.uSwirl.value = teaSwirl * 0.7;

    mistMat.uniforms.uTime.value = t * m;
    fogBankMat.uniforms.uTime.value = t * m + 7.5;
    rainMat.uniforms.uTime.value = t * m;

    const lanternHalo = currentManifest?.effects?.lanternHalo ?? 1;
    hangingHaloMat.uniforms.uOpacity.value = (terraceLampOn ? lanternHalo : 0) *
      (0.21 + 0.03 * Math.sin(t * 2.3) * m + lanternPulse * 0.14) *
      (moodIndex === 1 ? 1.25 : 1.0);
    stoneHaloMat.uniforms.uOpacity.value = lanternHalo *
      (0.17 + 0.035 * Math.sin(t * 3.9) * m + stonePulse * 0.18) *
      (moodIndex === 1 ? 1.25 : 1.0);

    ffMat.uniforms.uTime.value = t;
    ffMat.uniforms.uReducedMotion.value = paused ? 1.0 : reducedMotion;
    ffMat.uniforms.uPointer.value.set(
      smoothPointer.x * (baseW * 0.45),
      smoothPointer.y * (baseH * 0.45)
    );

    renderer.render(scene, camera);
  }

  animate();
}

init().catch((err) => {
  console.error(err);
  loadingEl.querySelector('p').textContent = 'Failed to load diorama assets. Run the Python pipeline first.';
});
