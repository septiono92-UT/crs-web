import * as THREE from './vendor/three.module.js';

const BRAND_COBALT = 0x1f5eff;
const BRAND_ELECTRIC = 0x4d82ff;

const NODES_DESKTOP = 120;
const NODES_MOBILE = 40;
const MOBILE_BREAKPOINT_PX = 768;
const TARGET_FPS = 45;
const FRAME_MIN_MS = 1000 / TARGET_FPS;
const MAX_DELTA_S = 0.1;
const MAX_PIXEL_RATIO = 2;
const CAMERA_FOV_DEG = 42;
const GLOBE_RADIUS = 2.3;
const GLOBE_SPIN_RAD_S = 0.042;
const NETWORK_SPIN_RAD_S = 0.056;
const FIT_MARGIN = 1.45;
const NODE_SIZE_DESKTOP = 0.062;
const NODE_SIZE_MOBILE = 0.078;
const STATIC_U_TIME = 0.87;

const THEME_OPACITY = {
  dark: { globe: 0.2, links: 0.35, nodes: 0.9 },
  light: { globe: 0.32, links: 0.52, nodes: 0.95 },
};

const LINE_VERT = `
uniform float uFogNear;
uniform float uFogFar;
varying float vFog;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}`;

const LINE_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFog;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * (1.0 - vFog));
}`;

const POINT_VERT = `
uniform float uFogNear;
uniform float uFogFar;
uniform float uScale;
uniform float uSize;
varying float vFog;
varying float vPhase;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, -mvPosition.z);
  vPhase = position.y * 2.2;
  gl_PointSize = uSize * (uScale / max(-mvPosition.z, 0.001));
  gl_Position = projectionMatrix * mvPosition;
}`;

const POINT_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying float vFog;
varying float vPhase;
void main() {
  vec2 offsets = gl_PointCoord - vec2(0.5);
  float d = length(offsets);
  if (d > 0.5) discard;
  float core = 1.0 - smoothstep(0.16, 0.5, d);
  float pulse = 0.8 + 0.2 * sin(uTime * 1.8 + vPhase);
  gl_FragColor = vec4(uColor, uOpacity * core * pulse * (1.0 - vFog));
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

function fibonacciSphere(count, radius) {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

function nearestNeighborPairs(positions, count, neighbors) {
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    const xi = positions[i * 3];
    const yi = positions[i * 3 + 1];
    const zi = positions[i * 3 + 2];
    const candidates = [];
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const dx = positions[j * 3] - xi;
      const dy = positions[j * 3 + 1] - yi;
      const dz = positions[j * 3 + 2] - zi;
      candidates.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (let k = 0; k < neighbors && k < candidates.length; k++) {
      const j = candidates[k].j;
      const key = i < j ? i * count + j : j * count + i;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(i, j);
    }
  }
  return pairs;
}

export function initHero3D(mount) {
  if (!mount || mount.dataset.hero3dInit === 'true') return null;
  mount.dataset.hero3dInit = 'true';

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
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 60);
  const rig = new THREE.Group();
  const globeGroup = new THREE.Group();
  const networkGroup = new THREE.Group();
  rig.rotation.x = 0.14;
  rig.add(globeGroup, networkGroup);
  scene.add(rig);

  const shared = {
    uFogNear: { value: 9 },
    uFogFar: { value: 14 },
    uScale: { value: 1 },
    uTime: { value: 0 },
  };

  const globeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: srgbColor(BRAND_COBALT) },
      uOpacity: { value: THEME_OPACITY.dark.globe },
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
    },
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
  });

  const linkMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: srgbColor(BRAND_ELECTRIC) },
      uOpacity: { value: THEME_OPACITY.dark.links },
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
    },
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
  });

  const nodeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: srgbColor(BRAND_ELECTRIC) },
      uOpacity: { value: THEME_OPACITY.dark.nodes },
      uTime: shared.uTime,
      uScale: shared.uScale,
      uSize: { value: NODE_SIZE_DESKTOP },
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
  });

  const globeGeometry = new THREE.WireframeGeometry(
    new THREE.IcosahedronGeometry(GLOBE_RADIUS, 2)
  );
  const globe = new THREE.LineSegments(globeGeometry, globeMaterial);
  globe.renderOrder = 0;
  globeGroup.add(globe);
  globeGroup.rotation.y = 0.9;

  const disposables = [globeGeometry, globeMaterial, linkMaterial, nodeMaterial];

  let nodePoints = null;
  let nodeLinks = null;

  function buildNetwork(count) {
    if (nodePoints) {
      networkGroup.remove(nodePoints, nodeLinks);
      nodePoints.geometry.dispose();
      nodeLinks.geometry.dispose();
    }
    const nodePositions = fibonacciSphere(count, GLOBE_RADIUS * 1.045);
    const pairs = nearestNeighborPairs(nodePositions, count, 2);

    const linkPositions = new Float32Array(pairs.length * 3);
    for (let s = 0; s < pairs.length; s += 2) {
      const a = pairs[s] * 3;
      const b = pairs[s + 1] * 3;
      linkPositions.set(nodePositions.subarray(a, a + 3), s * 3);
      linkPositions.set(nodePositions.subarray(b, b + 3), s * 3 + 3);
    }

    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(linkPositions, 3)
    );
    nodeLinks = new THREE.LineSegments(linkGeometry, linkMaterial);
    nodeLinks.renderOrder = 1;

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(nodePositions.slice(), 3)
    );
    nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
    nodePoints.renderOrder = 2;

    networkGroup.add(nodeLinks, nodePoints);
    disposables.push(linkGeometry, nodeGeometry);
    nodeMaterial.uniforms.uSize.value =
      count <= NODES_MOBILE ? NODE_SIZE_MOBILE : NODE_SIZE_DESKTOP;
  }

  let rafId = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let heroInView = true;
  let isMobile = false;

  const motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let reducedMotion = motionQuery ? motionQuery.matches : false;

  function fit(width, height) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const vHalf = THREE.MathUtils.degToRad(CAMERA_FOV_DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = Math.max(
      (GLOBE_RADIUS * FIT_MARGIN) / Math.tan(vHalf),
      (GLOBE_RADIUS * FIT_MARGIN) / Math.tan(hHalf)
    );
    camera.position.set(0, dist * 0.18, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const camDist = camera.position.length();
    shared.uFogNear.value = camDist - GLOBE_RADIUS * 0.55;
    shared.uFogFar.value = camDist + GLOBE_RADIUS * 1.45;
    shared.uScale.value =
      (height * renderer.getPixelRatio()) / (2 * Math.tan(vHalf));
  }

  function renderStatic() {
    shared.uTime.value = STATIC_U_TIME;
    renderer.render(scene, camera);
  }

  function renderStaticIfIdle() {
    if (!rafId && heroInView && !document.hidden) renderStatic();
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (lastFrame && now - lastFrame < FRAME_MIN_MS) return;
    const delta = lastFrame
      ? Math.min((now - lastFrame) / 1000, MAX_DELTA_S)
      : 1 / TARGET_FPS;
    lastFrame = now;
    elapsed += delta;
    shared.uTime.value = elapsed;
    globeGroup.rotation.y += delta * GLOBE_SPIN_RAD_S;
    networkGroup.rotation.y += delta * NETWORK_SPIN_RAD_S;
    renderer.render(scene, camera);
  }

  function startLoop() {
    if (rafId || document.hidden || !heroInView || reducedMotion) return;
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function applyThemeOpacities() {
    const theme =
      document.documentElement.getAttribute('data-theme') === 'light'
        ? THEME_OPACITY.light
        : THEME_OPACITY.dark;
    globeMaterial.uniforms.uOpacity.value = theme.globe;
    linkMaterial.uniforms.uOpacity.value = theme.links;
    nodeMaterial.uniforms.uOpacity.value = theme.nodes;
    renderStaticIfIdle();
  }

  const themeObserver = new MutationObserver(applyThemeOpacities);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function onVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  const viewObserver = new IntersectionObserver(
    (entries) => {
      heroInView = entries[entries.length - 1].isIntersecting;
      if (heroInView) startLoop();
      else stopLoop();
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
    const mobile = width < MOBILE_BREAKPOINT_PX;
    if (mobile !== isMobile) {
      isMobile = mobile;
      buildNetwork(mobile ? NODES_MOBILE : NODES_DESKTOP);
    }
    fit(width, height);
    renderStaticIfIdle();
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
  isMobile = width < MOBILE_BREAKPOINT_PX;
  buildNetwork(isMobile ? NODES_MOBILE : NODES_DESKTOP);
  fit(width, height);
  networkGroup.rotation.y = 1.2;
  applyThemeOpacities();

  mount.appendChild(renderer.domElement);

  if (reducedMotion) renderStatic();
  else startLoop();

  return { teardown };
}

function autoInit() {
  const mount = document.querySelector('.hero-3d');
  if (mount) initHero3D(mount);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit, { once: true });
} else {
  autoInit();
}
