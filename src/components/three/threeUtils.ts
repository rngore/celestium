import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Vector3D } from '../../shared/types.ts';

/**
 * Detects software WebGL rasterizers (SwiftShader, llvmpipe, WARP)
 * from GPU renderer string without modifying scene objects or layout.
 */
export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createStudioRenderer(container: HTMLElement, isSoftwareGl: boolean) {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 800, container.clientHeight || 500);
  renderer.setClearColor(0x050811, 1);

  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050811);
  scene.fog = new THREE.FogExp2(0x050811, 0.0012);

  // Studio environment reflections for metallic spacecraft buses & solar arrays
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();

  return { renderer, scene, envTex };
}

/**
 * Maps heliocentric J2000 coordinates (X, Y ecliptic plane, Z north ecliptic pole)
 * into Three.js right-handed world space (X right, Y up, Z toward viewer)
 * using a documented non-linear radial compression so inner and outer planets
 * can be inspected simultaneously.
 */
export function eclipticAuToSceneVec(v: Vector3D, target = new THREE.Vector3()): THREE.Vector3 {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (r < 1e-8) {
    return target.set(0, 0, 0);
  }
  const scaledR = r < 0.05 ? r * 220 : 11 + Math.pow(r, 0.44) * 23;
  const s = scaledR / r;
  // Ecliptic (X, Y, Z) -> Three.js (X, Z, -Y) so +Z ecliptic pole points up (+Y)
  return target.set(v.x * s, v.z * s, -v.y * s);
}

/**
 * Generates procedural planetary albedo CanvasTexture (100% zero external URL / 404).
 */
export function createProceduralPlanetTexture(
  id: string,
  baseColorHex: string,
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, 256, 128);

  if (id === 'sun') {
    const grad = ctx.createRadialGradient(128, 64, 10, 128, 64, 128);
    grad.addColorStop(0, '#fff7ed');
    grad.addColorStop(0.5, '#fbbf24');
    grad.addColorStop(1, '#ea580c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(180,83,9,0.2)';
      ctx.beginPath();
      ctx.arc((i * 53) % 256, (i * 37) % 128, 2 + (i % 6), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === 'earth') {
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#15803d';
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.ellipse(
        (i * 41 + 20) % 256,
        30 + ((i * 29) % 68),
        14 + (i % 16),
        8 + (i % 10),
        (i * 0.4) % Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    // Polar caps + subtle clouds
    ctx.fillStyle = 'rgba(248,250,252,0.85)';
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillRect(0, 118, 256, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect((i * 37) % 220, 18 + ((i * 17) % 85), 34, 3);
    }
  } else if (id === 'jupiter' || id === 'saturn') {
    const bands =
      id === 'jupiter'
        ? ['#d97706', '#f59e0b', '#fef3c7', '#b45309', '#e5e7eb', '#d97706']
        : ['#fde68a', '#fcd34d', '#d97706', '#fef3c7', '#eab308'];
    for (let y = 0; y < 128; y += 8) {
      ctx.fillStyle = bands[(y / 8) % bands.length];
      ctx.fillRect(0, y, 256, 8);
    }
    if (id === 'jupiter') {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.ellipse(160, 82, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === 'mars') {
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(251, 146, 60, 0.35)';
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      ctx.arc((i * 47) % 256, 16 + ((i * 31) % 96), 8 + (i % 12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 7);
    ctx.fillRect(0, 121, 256, 7);
  } else {
    // Cratered / banded procedural surface
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.18)';
      ctx.beginPath();
      ctx.arc((i * 43) % 256, (i * 29) % 128, 3 + (i % 9), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * Builds a composite 5-part procedural 3D spacecraft THREE.Group:
 * (1) Octagonal metallic bus + gold thermal foil cap
 * (2) High-gain parabolic dish (LatheGeometry) + feed horn
 * (3) Dual solar wing arrays (or RTG magnetometer boom for deep-space probes)
 */
export function buildProceduralSpacecraftMesh(
  accentHex: number,
  isDeepSpaceRtg = false,
  scale = 1
): THREE.Group {
  const group = new THREE.Group();

  const busMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // Gold MLI thermal blanket
    metalness: 0.88,
    roughness: 0.24,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.8,
    roughness: 0.32,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    emissive: accentHex,
    emissiveIntensity: 0.28,
    metalness: 0.45,
    roughness: 0.65,
  });

  // 1. Primary hexagonal/octagonal bus
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.45, 8), busMat);
  group.add(bus);

  // 2. Parabolic High-Gain Dish (LatheGeometry)
  const dishPoints = [
    new THREE.Vector2(0.02, 0.22),
    new THREE.Vector2(0.22, 0.28),
    new THREE.Vector2(0.45, 0.42),
    new THREE.Vector2(0.55, 0.52),
  ];
  const dish = new THREE.Mesh(
    new THREE.LatheGeometry(dishPoints, 20),
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.35,
      roughness: 0.62,
      side: THREE.DoubleSide,
    })
  );
  group.add(dish);

  // 3. Feed horn mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.36, 8), frameMat);
  mast.position.y = 0.4;
  group.add(mast);

  // 4. Solar wings or RTG magnetometer booms
  if (isDeepSpaceRtg) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), frameMat);
    boom.rotation.z = Math.PI / 2;
    group.add(boom);

    const rtg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.48, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 })
    );
    rtg.position.set(0.62, -0.05, 0);
    rtg.rotation.z = Math.PI / 2;
    group.add(rtg);
  } else {
    const wingGeo = new THREE.BoxGeometry(0.95, 0.03, 0.36);
    const leftWing = new THREE.Mesh(wingGeo, solarMat);
    leftWing.position.set(-0.85, 0, 0);
    const rightWing = new THREE.Mesh(wingGeo, solarMat);
    rightWing.position.set(0.85, 0, 0);
    group.add(leftWing, rightWing);
  }

  // 5. Beacon core ring
  const beacon = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.022, 8, 24),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  beacon.rotation.x = Math.PI / 2;
  beacon.position.y = -0.18;
  group.add(beacon);

  group.scale.setScalar(scale);
  return group;
}

export function createStarfield(count = 1400, radius = 380): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = ((i * 7919) % 1000) / 1000;
    const v = ((i * 104729) % 1000) / 1000;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = radius + (i % 70);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const tint = 0.65 + (i % 35) / 100;
    colors[i * 3] = tint;
    colors[i * 3 + 1] = tint + 0.05;
    colors[i * 3 + 2] = Math.min(1, tint + 0.15);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}
