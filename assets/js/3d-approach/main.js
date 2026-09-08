// CRS Net — "How We Work" 3D mini-scene (approach section).
//
// Four floating platforms (01 → 04) climb along an animated data path with
// travelling pulses — a quiet echo of the hero's network globe. Reuses the
// self-hosted three.js vendor module and adds exactly ONE WebGL context to
// the page (hero + this = 2; the team section stays pure CSS 3D).
//
// Constraints honoured:
// - render loop pauses when off-screen (IntersectionObserver) or tab hidden
// - prefers-reduced-motion -> single static frame, no loop
// - the mount is a reserved-space box (aspect-ratio), so CLS stays 0

import * as THREE from '../3d-hero/vendor/three.module.min.js';

const BRAND_COBALT = 0x1f5eff;
const BRAND_ELECTRIC = 0x4d82ff;
const BRAND_AQUA = 0x00c2e0;

const CAMERA_FOV_DEG = 38;
const FIT_MARGIN = 1.06;
const TARGET_FPS = 45;
const FRAME_MIN_MS = 1000 / TARGET_FPS;
const MAX_DELTA_S = 0.1;
const MAX_PIXEL_RATIO = 2;
const STATIC_U_TIME = 1.25;

const TALL_ASPECT = 0.9; // mount aspect below this -> vertical composition
const PULSES_WIDE = 3;
const PULSES_TALL = 2;
const PULSE_SPEED = 0.11; // full-path trips per second

const SLAB_W = 1.5;
const SLAB_H = 0.14;
const SLAB_D = 1.5;
const CORE_RISE = 0.55;
const CORE_R = 0.15;
const BOB_AMPLITUDE = 0.075;
const BOB_SPEED = 0.8;

// Ascending 01→04 compositions: staircase for wide mounts,
// zig-zag climb for narrow (portrait) mounts.
const LAYOUT_WIDE = [
  { x: -2.45, y: -1.3, z: 0.95 },
  { x: -0.82, y: -0.44, z: -0.55 },
  { x: 0.82, y: 0.44, z: 0.55 },
  { x: 2.45, y: 1.3, z: -0.95 },
];
const LAYOUT_TALL = [
  { x: -0.8, y: -2.5, z: 0.55 },
  { x: 0.55, y: -0.85, z: -0.6 },
  { x: -0.55, y: 0.85, z: 0.6 },
  { x: 0.8, y: 2.5, z: -0.55 },
];

const THEME_OPACITY = {
  dark: {
    slab: 0.05, slabEdge: 0.45, core: 0.7, glow: 0.85,
    path: 0.26, dash: 0.8, pulse: 0.9, connector: 0.2, ground: 0.16,
  },
  light: {
    slab: 0.08, slabEdge: 0.6, core: 0.85, glow: 0.95,
    path: 0.4, dash: 0.95, pulse: 1.0, connector: 0.28, ground: 0.1,
  },
};

const DASH_VERT = `
attribute float aT;
varying float vT;
void main() {
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DASH_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying float vT;
void main() {
  float d = fract(vT * 22.0 - uTime * 0.55);
  float dash = smoothstep(0.0, 0.09, d) * (1.0 - smoothstep(0.46, 0.58, d));
  gl_FragColor = vec4(uColor, uOpacity * dash);
}`;

const GLOW_VERT = `
uniform float uScale;
uniform float uSize;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (uScale / max(-mvPosition.z, 0.001));
  gl_Position = projectionMatrix * mvPosition;
}`;

const GLOW_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  vec2 offsets = gl_PointCoord - vec2(0.5);
  float d = length(offsets);
  if (d > 0.5) discard;
  float core = 1.0 - smoothstep(0.12, 0.5, d);
  gl_FragColor = vec4(uColor, uOpacity * core);
}`;

function srgbColor(hex) {
  return new THREE.Vector3(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
}

function webglSupported() {
  const canvas = document.createElement('canvas');
  return !!(
    window.WebGLRenderingContext &&
    (canvas.getContext('webgl2') || canvas.getContext('webgl'))
  );
}

export function initApproach3D(mount) {
  if (!mount || mount.dataset.approach3dInit === 'true') return null;
  mount.dataset.approach3dInit = 'true';

  if (!webglSupported()) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch (err) {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 80);
  const rig = new THREE.Group();
  const content = new THREE.Group();
  rig.add(content);
  scene.add(rig);

  const slabGeometry = new THREE.BoxGeometry(SLAB_W, SLAB_H, SLAB_D);
  const slabEdgeGeometry = new THREE.EdgesGeometry(slabGeometry);
  const coreGeometry = new THREE.WireframeGeometry(
    new THREE.IcosahedronGeometry(CORE_R, 0)
  );
  const groundGeometry = new THREE.CircleGeometry(0.62, 40);
  const connectorGeometry = new THREE.BufferGeometry();
  connectorGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, CORE_RISE, 0]), 3)
  );

  const slabMaterial = new THREE.MeshBasicMaterial({
    color: BRAND_COBALT, transparent: true, depthWrite: false,
  });
  const slabEdgeMaterial = new THREE.LineBasicMaterial({
    color: BRAND_COBALT, transparent: true,
  });
  const coreMaterial = new THREE.LineBasicMaterial({
    color: BRAND_ELECTRIC, transparent: true,
  });
  const connectorMaterial = new THREE.LineBasicMaterial({
    color: BRAND_ELECTRIC, transparent: true,
  });
  const groundMaterial = new THREE.MeshBasicMaterial({
    color: 0x05070c, transparent: true, depthWrite: false,
  });
  const pathMaterial = new THREE.LineBasicMaterial({
    color: BRAND_ELECTRIC, transparent: true,
  });
  const dashMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uColor: { value: srgbColor(BRAND_ELECTRIC) },
      uOpacity: { value: THEME_OPACITY.dark.dash },
      uTime: { value: 0 },
    },
    vertexShader: DASH_VERT, fragmentShader: DASH_FRAG,
  });
  const glowMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uColor: { value: srgbColor(BRAND_ELECTRIC) },
      uOpacity: { value: THEME_OPACITY.dark.glow },
      uScale: { value: 1 },
      uSize: { value: 0.16 },
    },
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
  });
  const pulseMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uColor: { value: srgbColor(BRAND_AQUA) },
      uOpacity: { value: THEME_OPACITY.dark.pulse },
      uScale: { value: 1 },
      uSize: { value: 0.3 },
    },
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
  });

  const sharedGeometries = [
    slabGeometry, slabEdgeGeometry, coreGeometry, groundGeometry,
    connectorGeometry,
  ];
  const materials = [
    slabMaterial, slabEdgeMaterial, coreMaterial, connectorMaterial,
    groundMaterial, pathMaterial, dashMaterial, glowMaterial, pulseMaterial,
  ];
  const disposables = sharedGeometries.concat(materials);

  let layout = null;
  let curve = null;
  let slabGroups = [];
  let groundMeshes = [];
  let pulsePoints = null;
  let pulsePositions = null;
  let pulseCount = 0;
  let contentRadius = 3;

  function build(nextLayout) {
    // Dispose the previous build (shared geometry/materials are kept).
    for (const item of content.children.slice()) {
      content.remove(item);
      if (item.geometry && sharedGeometries.indexOf(item.geometry) === -1) {
        const idx = disposables.indexOf(item.geometry);
        if (idx !== -1) disposables.splice(idx, 1);
        item.geometry.dispose();
      }
    }
    slabGroups = [];
    groundMeshes = [];
    layout = nextLayout;

    const coreAnchors = [];
    for (let i = 0; i < layout.length; i++) {
      const p = layout[i];

      const group = new THREE.Group();
      group.position.set(p.x, p.y, p.z);
      const slab = new THREE.Mesh(slabGeometry, slabMaterial);
      const edges = new THREE.LineSegments(slabEdgeGeometry, slabEdgeMaterial);
      group.add(slab, edges);
      group.userData.baseY = p.y;
      group.userData.phase = i * 1.9;
      content.add(group);
      slabGroups.push(group);

      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(p.x, p.y - 1.05, p.z);
      content.add(ground);
      groundMeshes.push(ground);

      const connector = new THREE.LineSegments(
        connectorGeometry, connectorMaterial
      );
      connector.position.set(p.x, p.y, p.z);
      content.add(connector);

      const core = new THREE.LineSegments(coreGeometry, coreMaterial);
      core.position.set(p.x, p.y + CORE_RISE, p.z);
      content.add(core);

      coreAnchors.push(new THREE.Vector3(p.x, p.y + CORE_RISE, p.z));
    }

    curve = new THREE.CatmullRomCurve3(coreAnchors, false, 'catmullrom', 0.6);

    const pathPoints = curve.getPoints(90);
    const pathPositions = new Float32Array(pathPoints.length * 3);
    const pathT = new Float32Array(pathPoints.length);
    for (let i = 0; i < pathPoints.length; i++) {
      pathPositions[i * 3] = pathPoints[i].x;
      pathPositions[i * 3 + 1] = pathPoints[i].y;
      pathPositions[i * 3 + 2] = pathPoints[i].z;
      pathT[i] = i / (pathPoints.length - 1);
    }
    const pathGeometry = new THREE.BufferGeometry();
    pathGeometry.setAttribute(
      'position', new THREE.BufferAttribute(pathPositions, 3)
    );
    const baseline = new THREE.Line(pathGeometry, pathMaterial);
    content.add(baseline);
    disposables.push(pathGeometry);

    const dashGeometry = new THREE.BufferGeometry();
    dashGeometry.setAttribute('position', new THREE.BufferAttribute(pathPositions.slice(), 3));
    dashGeometry.setAttribute('aT', new THREE.BufferAttribute(pathT, 1));
    const dashes = new THREE.Line(dashGeometry, dashMaterial);
    content.add(dashes);
    disposables.push(dashGeometry);

    // Soft glow dots at the four step cores (01–04).
    const coreGlowPositions = new Float32Array(coreAnchors.length * 3);
    for (let i = 0; i < coreAnchors.length; i++) {
      coreGlowPositions[i * 3] = coreAnchors[i].x;
      coreGlowPositions[i * 3 + 1] = coreAnchors[i].y;
      coreGlowPositions[i * 3 + 2] = coreAnchors[i].z;
    }
    const coreGlowGeometry = new THREE.BufferGeometry();
    coreGlowGeometry.setAttribute(
      'position', new THREE.BufferAttribute(coreGlowPositions, 3)
    );
    const coreGlow = new THREE.Points(coreGlowGeometry, glowMaterial);
    content.add(coreGlow);
    disposables.push(coreGlowGeometry);

    pulseCount = layout === LAYOUT_TALL ? PULSES_TALL : PULSES_WIDE;
    pulsePositions = new Float32Array(pulseCount * 3);
    const pulseGeometry = new THREE.BufferGeometry();
    pulseGeometry.setAttribute(
      'position', new THREE.BufferAttribute(pulsePositions, 3)
    );
    pulsePoints = new THREE.Points(pulseGeometry, pulseMaterial);
    content.add(pulsePoints);
    disposables.push(pulseGeometry);

    let radius = 0;
    for (const p of layout) {
      radius = Math.max(radius, Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z));
    }
    contentRadius = radius + 1.15;
  }

  let rafId = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let inView = true;
  let reducedMotion = false;

  const motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  reducedMotion = motionQuery ? motionQuery.matches : false;

  const tmpVec = new THREE.Vector3();

  function updatePulses(t) {
    if (!pulsePoints || !curve) return;
    for (let i = 0; i < pulseCount; i++) {
      const u = (t * PULSE_SPEED + i / pulseCount) % 1;
      curve.getPointAt(u, tmpVec);
      pulsePositions[i * 3] = tmpVec.x;
      pulsePositions[i * 3 + 1] = tmpVec.y;
      pulsePositions[i * 3 + 2] = tmpVec.z;
    }
    pulsePoints.geometry.attributes.position.needsUpdate = true;
  }

  function animate(t) {
    dashMaterial.uniforms.uTime.value = t;
    for (let i = 0; i < slabGroups.length; i++) {
      const bob = Math.sin(t * BOB_SPEED + slabGroups[i].userData.phase) * BOB_AMPLITUDE;
      slabGroups[i].position.y = slabGroups[i].userData.baseY + bob;
      const s = 1 - (bob + BOB_AMPLITUDE) * 0.9;
      groundMeshes[i].scale.setScalar(s);
    }
    rig.rotation.y = Math.sin(t * 0.14) * 0.05;
    rig.rotation.x = Math.sin(t * 0.1) * 0.02;
    updatePulses(t);
  }

  function renderStatic() {
    animate(STATIC_U_TIME);
    renderer.render(scene, camera);
  }

  function renderStaticIfIdle() {
    if (!rafId && inView && !document.hidden) renderStatic();
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (lastFrame && now - lastFrame < FRAME_MIN_MS) return;
    const delta = lastFrame
      ? Math.min((now - lastFrame) / 1000, MAX_DELTA_S)
      : 1 / TARGET_FPS;
    lastFrame = now;
    elapsed += delta;
    animate(elapsed);
    renderer.render(scene, camera);
  }

  function startLoop() {
    if (rafId || document.hidden || !inView || reducedMotion) return;
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function updateMode() {
    mount.dataset.approach3dMode = reducedMotion
      ? 'static'
      : inView && !document.hidden ? 'animated' : 'paused';
  }

  function applyThemeOpacities() {
    const theme =
      document.documentElement.getAttribute('data-theme') === 'light'
        ? THEME_OPACITY.light
        : THEME_OPACITY.dark;
    slabMaterial.opacity = theme.slab;
    slabEdgeMaterial.opacity = theme.slabEdge;
    coreMaterial.opacity = theme.core;
    connectorMaterial.opacity = theme.connector;
    groundMaterial.opacity = theme.ground;
    pathMaterial.opacity = theme.path;
    dashMaterial.uniforms.uOpacity.value = theme.dash;
    glowMaterial.uniforms.uOpacity.value = theme.glow;
    pulseMaterial.uniforms.uOpacity.value = theme.pulse;
    renderStaticIfIdle();
    updateMode();
  }

  const themeObserver = new MutationObserver(applyThemeOpacities);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function onVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
    updateMode();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  const viewObserver = new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      if (inView) startLoop();
      else stopLoop();
      updateMode();
    },
    { threshold: 0 }
  );
  viewObserver.observe(mount);

  function onMotionChange(event) {
    reducedMotion = event.matches;
    if (reducedMotion) {
      stopLoop();
      renderStaticIfIdle();
    } else {
      startLoop();
    }
    updateMode();
  }
  if (motionQuery) {
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', onMotionChange);
    } else if (motionQuery.addListener) {
      motionQuery.addListener(onMotionChange);
    }
  }

  let resizeTimer = 0;

  function handleResize() {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    const nextLayout = width / height < TALL_ASPECT ? LAYOUT_TALL : LAYOUT_WIDE;
    if (nextLayout !== layout) build(nextLayout);
    fit(width, height);
    renderStaticIfIdle();
  }

  function fit(width, height) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const vHalf = THREE.MathUtils.degToRad(CAMERA_FOV_DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = Math.max(
      (contentRadius * FIT_MARGIN) / Math.tan(vHalf),
      (contentRadius * FIT_MARGIN) / Math.tan(hHalf)
    );
    camera.position.set(0, dist * 0.42, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const scale = (height * renderer.getPixelRatio()) / (2 * Math.tan(vHalf));
    glowMaterial.uniforms.uScale.value = scale;
    pulseMaterial.uniforms.uScale.value = scale;
  }

  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 150);
  });
  resizeObserver.observe(mount);

  function onContextLost(event) {
    event.preventDefault();
    teardown();
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  function teardown() {
    stopLoop();
    clearTimeout(resizeTimer);
    viewObserver.disconnect();
    themeObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (motionQuery && motionQuery.removeEventListener) {
      motionQuery.removeEventListener('change', onMotionChange);
    }
    disposables.forEach((item) => item.dispose());
    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
    renderer.dispose();
  }

  const width = Math.max(1, mount.clientWidth);
  const height = Math.max(1, mount.clientHeight);
  build(width / height < TALL_ASPECT ? LAYOUT_TALL : LAYOUT_WIDE);
  fit(width, height);
  applyThemeOpacities();

  mount.appendChild(renderer.domElement);

  if (reducedMotion) renderStatic();
  else startLoop();
  updateMode();

  return { teardown };
}

function autoInit() {
  const mount = document.querySelector('.approach-3d');
  if (mount) initApproach3D(mount);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit, { once: true });
} else {
  autoInit();
}
