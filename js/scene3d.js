// The 3D world: board, tokens with faces, physics dice, camera and effects.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import * as CANNON from '../vendor/cannon-es.js';
import { COLORS, HEX, TRACK, HOME_COL, YARD, SLOTS, START, STARS } from './rules.js';

const TILE_TOP = 0.14;
const YARD_TOP = 0.39;
const PYR_H = 0.95;
const TABLE_Y = -0.7;
const TRAY_Y = -0.6;                 // top of the felt the dice lands on
const TRAY = { x: 4.4, z0: 8.8, z1: 13.4 };
const DICE = 1.5;
const DICE_VALUES = [2, 5, 1, 6, 3, 4]; // value on the +x, -x, +y, -y, +z, -z faces
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** Height of the board surface at grid point (gx, gy). */
function surfaceY(gx, gy) {
  if (gx > 6 && gx < 9 && gy > 6 && gy < 9) {
    const d = Math.max(Math.abs(gx - 7.5), Math.abs(gy - 7.5));
    return Math.max(TILE_TOP, PYR_H * (1 - d / 1.5)) - 0.05;
  }
  const inYard = (gx < 6 || gx > 9) && (gy < 6 || gy > 9);
  return inYard ? YARD_TOP : TILE_TOP;
}

// ---------------------------------------------------------------------------
// Face drawing (one small canvas per token, redrawn when its mood changes)
// ---------------------------------------------------------------------------
const INK = '#1d1a33';
function drawFace(g, mood, blink, look, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 256, 160);
  g.translate(128, 84); g.scale(1.12, 1.12); g.translate(-128, -84);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const L = [94, 74], R = [162, 74];
  const lx = look[0] * 6, ly = look[1] * 6;

  const openEye = ([x, y], rx = 17, ry = 21, pr = 9.5, sparkle = true) => {
    g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 4;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = INK;
    g.beginPath(); g.arc(x + lx, y + ly + 2, pr, 0, Math.PI * 2); g.fill();
    if (sparkle) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + lx + pr * 0.35, y + ly - pr * 0.3, pr * 0.32, 0, Math.PI * 2); g.fill(); }
  };
  const closedEye = ([x, y], up = false) => {
    g.strokeStyle = INK; g.lineWidth = 7;
    g.beginPath();
    if (up) g.arc(x, y + 8, 15, Math.PI * 1.1, Math.PI * 1.9);
    else g.arc(x, y - 6, 15, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  };
  const blush = () => {
    g.fillStyle = 'rgba(255, 90, 140, 0.45)';
    g.beginPath(); g.ellipse(58, 104, 15, 9, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(198, 104, 15, 9, 0, 0, Math.PI * 2); g.fill();
  };
  const smile = (w = 22, y = 100) => { g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.arc(128, y, w, Math.PI * 0.18, Math.PI * 0.82); g.stroke(); };
  const bigMouth = (r = 25, y = 98) => {
    g.fillStyle = '#6d1029'; g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); g.arc(128, y, r, 0, Math.PI); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff7a9a'; g.beginPath(); g.arc(128, y + r * 0.6, r * 0.45, Math.PI, 0); g.fill();
  };
  const brows = (inner, outer, w = 8) => {
    g.strokeStyle = INK; g.lineWidth = w;
    g.beginPath(); g.moveTo(L[0] - 18, L[1] - 30 + outer); g.lineTo(L[0] + 14, L[1] - 30 + inner); g.stroke();
    g.beginPath(); g.moveTo(R[0] + 18, R[1] - 30 + outer); g.lineTo(R[0] - 14, R[1] - 30 + inner); g.stroke();
  };

  switch (mood) {
    case 'sleepy':
      closedEye(L); closedEye(R);
      g.fillStyle = INK; g.beginPath(); g.ellipse(128, 110, 6, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.font = 'bold 26px sans-serif'; g.fillText('z', 196 + Math.sin(t * 2) * 3, 40); g.font = 'bold 18px sans-serif'; g.fillText('z', 214, 22);
      break;
    case 'happy':
      closedEye(L, true); closedEye(R, true); bigMouth(); blush();
      break;
    case 'excited':
      if (blink) { closedEye(L); closedEye(R); } else { openEye(L, 19, 23, 11); openEye(R, 19, 23, 11); }
      bigMouth(22, 102); blush();
      break;
    case 'scared': {
      const j = () => rand(-1.5, 1.5);
      brows(-8, 4, 6);
      g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 4;
      [L, R].forEach(([x, y]) => {
        g.beginPath(); g.ellipse(x, y, 20, 25, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = INK; g.beginPath(); g.arc(x + j(), y + j(), 5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff';
      });
      g.strokeStyle = INK; g.lineWidth = 5; g.beginPath();
      for (let k = 0; k <= 6; k++) g.lineTo(104 + k * 8, 112 + (k % 2 ? -5 : 5));
      g.stroke();
      g.fillStyle = '#7fd3ff'; g.beginPath(); g.moveTo(206, 26); g.quadraticCurveTo(218, 48, 206, 54); g.quadraticCurveTo(194, 48, 206, 26); g.fill();
      break;
    }
    case 'sad':
      brows(-10, 6, 6);
      openEye(L, 16, 18, 8, false); openEye(R, 16, 18, 8, false);
      g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.arc(128, 130, 22, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
      g.fillStyle = '#6fcbff';
      [L, R].forEach(([x, y]) => { const s = (t * 60) % 40; g.beginPath(); g.ellipse(x - 6, y + 26 + s, 5, 8, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x - 9, y + 18, 6, s + 6); });
      break;
    case 'angry':
      brows(12, -4, 10);
      openEye(L, 16, 15, 9, false); openEye(R, 16, 15, 9, false);
      g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 4;
      g.beginPath(); g.roundRect(100, 100, 56, 22, 6); g.fill(); g.stroke();
      g.lineWidth = 3; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(100 + k * 14, 100); g.lineTo(100 + k * 14, 122); g.stroke(); }
      g.beginPath(); g.moveTo(100, 111); g.lineTo(156, 111); g.stroke();
      break;
    case 'proud':
      closedEye(L, true); closedEye(R, true); blush();
      g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.moveTo(104, 104); g.quadraticCurveTo(130, 120, 156, 96); g.stroke();
      break;
    case 'ko':
      g.strokeStyle = INK; g.lineWidth = 7;
      [L, R].forEach(([x, y]) => { g.beginPath(); g.moveTo(x - 12, y - 12); g.lineTo(x + 12, y + 12); g.moveTo(x + 12, y - 12); g.lineTo(x - 12, y + 12); g.stroke(); });
      g.fillStyle = '#6d1029'; g.beginPath(); g.ellipse(128, 110, 14, 17, 0, 0, Math.PI * 2); g.fill();
      break;
    default: // idle
      if (blink) { closedEye(L); closedEye(R); } else { openEye(L); openEye(R); }
      smile();
  }
}

// ---------------------------------------------------------------------------
export function createScene(canvas, opts = {}) {
  const SPEED = opts.speed || 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#110c2c');
  scene.fog = new THREE.Fog('#110c2c', 120, 260);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);

  // ----- lights -----
  scene.add(new THREE.HemisphereLight(0xc9c0ff, 0x1a1030, 0.45));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(-8, 20, 10);
  key.target.position.set(0, 0, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff6fb5, 1.1);
  rim.position.set(10, 7, -14);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x6fa8ff, 0.7);
  rim2.position.set(-12, 6, -8);
  scene.add(rim2);

  // ----- table -----
  const tableTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    gr.addColorStop(0, '#4a3a9a'); gr.addColorStop(0.5, '#251c5c'); gr.addColorStop(1, '#110c2c');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const table = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.9 }));
  table.rotation.x = -Math.PI / 2; table.position.set(0, TABLE_Y, 3); table.receiveShadow = true;
  scene.add(table);

  // ----- board -----
  const slab = new THREE.Mesh(
    new RoundedBoxGeometry(16.3, 0.7, 16.3, 4, 0.3),
    new THREE.MeshPhysicalMaterial({ color: '#161038', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 })
  );
  slab.position.y = -0.35; slab.castShadow = true; slab.receiveShadow = true;
  scene.add(slab);

  const gold = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 1, roughness: 0.25 });
  [[0, -7.62, 15.35, 0.12], [0, 7.62, 15.35, 0.12], [-7.62, 0, 0.12, 15.35], [7.62, 0, 0.12, 15.35]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), gold);
    m.position.set(x, 0.03, z); scene.add(m);
  });

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshPhysicalMaterial({ color: '#2a1f63', roughness: 0.35, clearcoat: 0.6 }));
  surface.rotation.x = -Math.PI / 2; surface.position.y = 0.005; surface.receiveShadow = true;
  scene.add(surface);

  // track tiles (instanced)
  const tileCells = [];
  TRACK.forEach(([x, y], i) => {
    const startColor = COLORS.find((c) => START[c] === i);
    tileCells.push([x, y, startColor ? HEX[startColor] : '#fdfbff']);
  });
  COLORS.forEach((c) => HOME_COL[c].forEach(([x, y]) => tileCells.push([x, y, HEX[c]])));
  const tiles = new THREE.InstancedMesh(
    new RoundedBoxGeometry(0.9, TILE_TOP, 0.9, 2, 0.06),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    tileCells.length
  );
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  tileCells.forEach(([x, y, c], i) => {
    m4.makeTranslation(x - 7, TILE_TOP / 2, y - 7);
    tiles.setMatrixAt(i, m4);
    tiles.setColorAt(i, col.set(c));
  });
  tiles.castShadow = true; tiles.receiveShadow = true;
  scene.add(tiles);

  // stars on safe squares
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.14 : 0.33, a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    k ? starShape.lineTo(px, py) : starShape.moveTo(px, py);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.03, bevelEnabled: false });
  starGeo.rotateX(-Math.PI / 2);
  const starMat = new THREE.MeshStandardMaterial({ color: '#b49cff', emissive: '#6b4fd8', emissiveIntensity: 0.35, roughness: 0.4 });
  STARS.forEach((i) => {
    const [x, y] = TRACK[i];
    const s = new THREE.Mesh(starGeo, starMat);
    s.position.set(x - 7, TILE_TOP, y - 7); scene.add(s);
  });

  // arrows on start squares
  const arrowShape = new THREE.Shape();
  [[-0.28, 0.08], [0.06, 0.08], [0.06, 0.22], [0.3, 0], [0.06, -0.22], [0.06, -0.08], [-0.28, -0.08]].forEach(([px, py], k) => (k ? arrowShape.lineTo(px, py) : arrowShape.moveTo(px, py)));
  const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, { depth: 0.03, bevelEnabled: false });
  arrowGeo.rotateX(-Math.PI / 2);
  const arrowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const ARROW_ROT = { red: 0, green: -Math.PI / 2, yellow: Math.PI, blue: Math.PI / 2 };
  COLORS.forEach((c) => {
    const [x, y] = TRACK[START[c]];
    const a = new THREE.Mesh(arrowGeo, arrowMat);
    a.position.set(x - 7, TILE_TOP, y - 7); a.rotation.y = ARROW_ROT[c]; scene.add(a);
  });

  // yards
  const yardMats = {};
  COLORS.forEach((c) => {
    const [ox, oy] = YARD[c];
    const mat = new THREE.MeshPhysicalMaterial({ color: HEX[c], roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, emissive: HEX[c], emissiveIntensity: 0 });
    yardMats[c] = mat;
    const plat = new THREE.Mesh(new RoundedBoxGeometry(5.86, 0.3, 5.86, 3, 0.14), mat);
    plat.position.set(ox + 3 - 7.5, 0.15, oy + 3 - 7.5);
    plat.castShadow = true; plat.receiveShadow = true; scene.add(plat);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(4.6, 0.08, 4.6, 3, 0.04), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(HEX[c]).lerp(new THREE.Color('#ffffff'), 0.72), roughness: 0.4, clearcoat: 0.5 }));
    pad.position.set(ox + 3 - 7.5, 0.33, oy + 3 - 7.5); pad.receiveShadow = true; scene.add(pad);
    const slotMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(HEX[c]).multiplyScalar(0.8), roughness: 0.35 });
    SLOTS.forEach(([sx, sy]) => {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 40), slotMat);
      d.position.set(ox + sx - 7.5, 0.375, oy + sy - 7.5); d.receiveShadow = true; scene.add(d);
    });
  });

  // centre pyramid
  const H = PYR_H, b = 1.5;
  const faces = { red: [[-b, -b], [-b, b]], green: [[-b, -b], [b, -b]], yellow: [[b, -b], [b, b]], blue: [[-b, b], [b, b]] };
  COLORS.forEach((c) => {
    const [[x1, z1], [x2, z2]] = faces[c];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x1, 0.02, z1, x2, 0.02, z2, 0, H, 0], 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: HEX[c], roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide, flatShading: true }));
    m.receiveShadow = true; m.castShadow = true; scene.add(m);
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), gold);
  orb.position.y = H + 0.1; orb.castShadow = true; scene.add(orb);

  // dice tray
  const felt = new THREE.MeshStandardMaterial({ color: '#2d2068', roughness: 1 });
  const trayMesh = new THREE.Mesh(new RoundedBoxGeometry(TRAY.x * 2 + 0.6, 0.1, TRAY.z1 - TRAY.z0 + 0.6, 3, 0.05), felt);
  trayMesh.position.set(0, TRAY_Y - 0.05, (TRAY.z0 + TRAY.z1) / 2); trayMesh.receiveShadow = true; scene.add(trayMesh);
  const rimMat = new THREE.MeshPhysicalMaterial({ color: '#3d2f8f', roughness: 0.3, clearcoat: 1 });
  const tw = TRAY.x * 2 + 1.0, td = TRAY.z1 - TRAY.z0 + 1.0, tz = (TRAY.z0 + TRAY.z1) / 2;
  [[0, TRAY.z1 + 0.35, tw, 0.3], [0, TRAY.z0 - 0.35, tw, 0.3], [-TRAY.x - 0.35, tz, 0.3, td], [TRAY.x + 0.35, tz, 0.3, td]].forEach(([x, z, w, d]) => {
    const r = new THREE.Mesh(new RoundedBoxGeometry(w, 0.32, d, 2, 0.1), rimMat);
    r.position.set(x, TRAY_Y + 0.06, z); r.castShadow = true; r.receiveShadow = true; scene.add(r);
  });

  // ---------------------------------------------------------------------------
  // Dice: mesh + physics body
  // ---------------------------------------------------------------------------
  const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  const diceMats = DICE_VALUES.map((v) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(110, 100, 10, 128, 128, 190);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#e9e2f2');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
    PIPS[v].forEach(([px, py]) => {
      const x = 58 + px * 70, y = 58 + py * 70, r = v === 1 ? 34 : 22;
      const pg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
      if (v === 1) { pg.addColorStop(0, '#ff5d8f'); pg.addColorStop(1, '#b0124a'); } else { pg.addColorStop(0, '#4a4170'); pg.addColorStop(1, '#141028'); }
      g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  });
  const dice = new THREE.Mesh(new RoundedBoxGeometry(DICE, DICE, DICE, 5, 0.22), diceMats);
  dice.castShadow = true;
  scene.add(dice);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
  const mDice = new CANNON.Material('dice'), mFloor = new CANNON.Material('floor'), mWall = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(mDice, mFloor, { friction: 0.3, restitution: 0.38 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mDice, mWall, { friction: 0.05, restitution: 0.55 }));
  const floor = new CANNON.Body({ mass: 0, material: mFloor, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); floor.position.y = TRAY_Y;
  world.addBody(floor);
  const wall = (x, z, hx, hz) => { const w = new CANNON.Body({ mass: 0, material: mWall, shape: new CANNON.Box(new CANNON.Vec3(hx, 6, hz)) }); w.position.set(x, TRAY_Y + 6, z); world.addBody(w); };
  wall(0, TRAY.z0 - 0.5, 8, 0.5); wall(0, TRAY.z1 + 0.5, 8, 0.5); wall(-TRAY.x - 0.5, 11, 0.5, 7); wall(TRAY.x + 0.5, 11, 0.5, 7);
  const ceiling = new CANNON.Body({ mass: 0, material: mWall, shape: new CANNON.Plane() });
  ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0); ceiling.position.y = TRAY_Y + 5; world.addBody(ceiling);

  const diceBody = new CANNON.Body({ mass: 1, material: mDice, shape: new CANNON.Box(new CANNON.Vec3(DICE / 2, DICE / 2, DICE / 2)) });
  diceBody.linearDamping = 0.05; diceBody.angularDamping = 0.06;
  diceBody.position.set(0, TRAY_Y + DICE / 2, (TRAY.z0 + TRAY.z1) / 2);
  world.addBody(diceBody);
  let lastHit = 0;
  diceBody.addEventListener('collide', (e) => {
    const now = performance.now();
    if (now - lastHit < 35) return;
    lastHit = now;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    opts.onDiceHit && opts.onDiceHit(v / 14, e.body === floor);
  });

  let roll = null; // { resolve, still, time, nudges }
  const syncDice = () => { dice.position.copy(diceBody.position); dice.quaternion.copy(diceBody.quaternion); };
  syncDice();

  function topValue() {
    let best = 0, bestDot = -2;
    const v = new THREE.Vector3();
    FACE_NORMALS.forEach((n, k) => {
      v.copy(n).applyQuaternion(dice.quaternion);
      if (v.y > bestDot) { bestDot = v.y; best = k; }
    });
    return { value: DICE_VALUES[best], dot: bestDot };
  }

  function rollDice(swipe, forced) {
    if (SPEED > 1) { // instant roll for automated tests
      const v = forced || 1 + Math.floor(Math.random() * 6);
      const q = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[DICE_VALUES.indexOf(v)], new THREE.Vector3(0, 1, 0));
      diceBody.quaternion.set(q.x, q.y, q.z, q.w); syncDice();
      return Promise.resolve(v);
    }
    return new Promise((resolve) => {
      // 1) pick the dice up: it lifts out of the tray, spinning, to the throw point
      const from = dice.position.clone();
      const to = new THREE.Vector3(rand(-2.2, 2.2), TRAY_Y + 2.6, TRAY.z1 - 0.9);
      const spin = new THREE.Vector3(rand(-14, 14), rand(-10, 10), rand(-14, 14));
      // 2) then throw it towards the board with a visible tumble
      let vx = rand(-4, 4), vz = rand(-12, -8);
      if (swipe) {
        vx = clamp(swipe.dx * 0.035, -9, 9) + rand(-1, 1);
        vz = -clamp(Math.abs(swipe.dy) * 0.05, 8, 16);
      }
      roll = {
        resolve, still: 0, time: 0, nudges: 0,
        lift: { t: 0, dur: 0.32, from, to, spin },
        launch: { v: [vx, rand(1.5, 3.5), vz], w: [rand(-15, 15), rand(-10, 10), rand(-15, 15)].map((a) => a + Math.sign(a || 1) * 6) },
      };
    });
  }

  function updateDice(dt) {
    if (!roll) return;
    if (roll.lift) {
      const L = roll.lift;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      dice.position.lerpVectors(L.from, L.to, easeOut(k));
      dice.position.y += Math.sin(Math.PI * k) * 0.6;
      dice.rotation.x += L.spin.x * dt; dice.rotation.y += L.spin.y * dt; dice.rotation.z += L.spin.z * dt;
      if (k >= 1) {
        roll.lift = null;
        diceBody.position.set(dice.position.x, dice.position.y, dice.position.z);
        diceBody.quaternion.set(dice.quaternion.x, dice.quaternion.y, dice.quaternion.z, dice.quaternion.w);
        diceBody.velocity.set(...roll.launch.v);
        diceBody.angularVelocity.set(...roll.launch.w);
        diceBody.wakeUp();
      }
      return;
    }
    world.step(1 / 120, dt, 10);
    syncDice();
    roll.time += dt;
    const moving = diceBody.velocity.length() > 0.08 || diceBody.angularVelocity.length() > 0.12;
    roll.still = moving ? 0 : roll.still + 1;
    if ((roll.still > 10 && roll.time > 0.8) || roll.time > 6) {
      const top = topValue();
      if (top.dot < 0.92 && roll.nudges < 3) { // leaning on a wall: give it a nudge
        roll.nudges++;
        diceBody.velocity.set(rand(-1, 1), 4, rand(-1, 1));
        diceBody.angularVelocity.set(rand(-6, 6), 0, rand(-6, 6));
        roll.still = 0;
        return;
      }
      const r = roll; roll = null;
      r.resolve(top.value);
    }
  }

  // ---------------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------------
  const tokens = {}; // key -> token object
  const tokenRoot = new THREE.Group(); scene.add(tokenRoot);
  const bodyGeo = new THREE.SphereGeometry(0.35, 32, 24);
  const faceGeo = new THREE.SphereGeometry(0.362, 32, 16, Math.PI / 2 - 1.2, 2.4, Math.PI * 0.14, Math.PI * 0.5);
  const baseGeo = new THREE.CylinderGeometry(0.31, 0.38, 0.1, 32);
  const ringGeo = new THREE.TorusGeometry(0.42, 0.04, 8, 48); ringGeo.rotateX(Math.PI / 2);
  const crownGeo = new THREE.CylinderGeometry(0.15, 0.19, 0.13, 10, 1, true);

  function makeToken(color, i) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: HEX[color], roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
    const base = new THREE.Mesh(baseGeo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(HEX[color]).multiplyScalar(0.6), roughness: 0.3, clearcoat: 1 }));
    base.position.y = 0.05; base.castShadow = true;
    const bodyG = new THREE.Group(); bodyG.position.y = 0.1;
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.scale.y = 1.12; body.position.y = 0.38; body.castShadow = true;
    const c = document.createElement('canvas'); c.width = 256; c.height = 160;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
    face.scale.y = 1.12; face.position.y = 0.38;
    const crown = new THREE.Group();
    crown.add(new THREE.Mesh(crownGeo, gold));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), gold);
      s.position.set(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15); crown.add(s);
    }
    crown.position.y = 0.38 + 0.35 * 1.12 + 0.03; crown.rotation.z = 0.15; crown.visible = false;
    bodyG.add(body, face, crown);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, toneMapped: false }));
    ring.position.y = 0.04; ring.visible = false;
    group.add(base, bodyG, ring);
    tokenRoot.add(group);
    const tk = {
      key: color + i, color, group, bodyG, ring, crown, canvas: c, g: c.getContext('2d'), tex,
      mood: null, blink: false, nextBlink: performance.now() + rand(1000, 5000), look: [0, 0], lookTimer: 0,
      target: new THREE.Vector3(), targetScale: 1, scale: 1, animating: false, squash: 0, selectable: false,
      phase: rand(0, 6.3), spin: 0,
    };
    tokens[tk.key] = tk;
    return tk;
  }

  function redrawFace(tk, t = performance.now() / 1000) {
    drawFace(tk.g, tk.mood, tk.blink, tk.look, t);
    tk.tex.needsUpdate = true;
  }

  function setPlayers(players) {
    Object.values(tokens).forEach((tk) => tokenRoot.remove(tk.group));
    for (const k in tokens) delete tokens[k];
    players.forEach((p) => p.tokens.forEach((pos, i) => makeToken(p.color, i)));
  }

  function setMood(key, mood) {
    const tk = tokens[key];
    if (!tk || tk.mood === mood) return;
    tk.mood = mood;
    tk.crown.visible = mood === 'proud';
    redrawFace(tk);
  }

  /** Set each token's resting spot. `spots` is [{key, gx, gy, scale}]. Snap = no animation. */
  function setTargets(spots, snap) {
    spots.forEach(({ key, gx, gy, scale }) => {
      const tk = tokens[key];
      if (!tk) return;
      tk.target.set(gx - 7.5, surfaceY(gx, gy), gy - 7.5);
      tk.targetScale = scale;
      if (snap) { tk.group.position.copy(tk.target); tk.scale = scale; }
    });
  }

  function setSelectable(keys) {
    Object.values(tokens).forEach((tk) => { tk.selectable = keys.includes(tk.key); tk.ring.visible = tk.selectable; });
  }

  // ----- tweens -----
  const tweens = [];
  const tween = (dur, fn) => new Promise((res) => tweens.push({ t: 0, dur: dur / SPEED, fn, res }));

  async function hopTo(key, gx, gy, { height = 0.55, dur = 0.2 } = {}) {
    const tk = tokens[key];
    tk.animating = true;
    const from = tk.group.position.clone();
    const to = new THREE.Vector3(gx - 7.5, surfaceY(gx, gy), gy - 7.5);
    const s0 = tk.scale;
    await tween(dur, (k) => {
      tk.group.position.lerpVectors(from, to, easeInOut(k));
      tk.group.position.y += Math.sin(Math.PI * k) * height;
      tk.scale = s0 + (1 - s0) * k;
      const st = Math.sin(Math.PI * k);
      tk.bodyG.scale.set(1 - st * 0.12, 1 + st * 0.2, 1 - st * 0.12);
    });
    tk.squash = height > 1 ? 1.6 : 1;
    tk.animating = false;
  }

  async function flyTo(key, gx, gy, { height = 4, dur = 1, spin = false } = {}) {
    const tk = tokens[key];
    tk.animating = true;
    const from = tk.group.position.clone();
    const to = new THREE.Vector3(gx - 7.5, surfaceY(gx, gy), gy - 7.5);
    const ax = rand(-1, 1), az = rand(-1, 1);
    await tween(dur, (k) => {
      tk.group.position.lerpVectors(from, to, easeOut(k));
      tk.group.position.y += Math.sin(Math.PI * k) * height;
      if (spin) { tk.group.rotation.x = ax * k * Math.PI * 4; tk.group.rotation.z = az * k * Math.PI * 4; }
    });
    tk.group.rotation.x = 0; tk.group.rotation.z = 0;
    tk.squash = 1.3;
    tk.animating = false;
  }

  // ----- particles -----
  const particles = [];
  const partGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  function burst(gx, gy, color, count = 24, power = 1, up = 0.3) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 });
    const base = new THREE.Vector3(gx - 7.5, surfaceY(gx, gy) + up, gy - 7.5);
    for (let k = 0; k < count; k++) {
      const m = new THREE.Mesh(partGeo, mat);
      m.position.copy(base);
      const a = rand(0, Math.PI * 2), sp = rand(2, 6) * power;
      m.userData = { v: new THREE.Vector3(Math.cos(a) * sp, rand(4, 9) * power, Math.sin(a) * sp), life: rand(0.8, 1.4), r: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)) };
      scene.add(m); particles.push(m);
    }
  }

  // ----- camera -----
  const camDir = new THREE.Vector3(0, 1, 0.92).normalize();
  const camTarget = new THREE.Vector3(0, 0, 2.0);
  const camBase = new THREE.Vector3();
  let margins = { top: 64, bottom: 110 };
  let menuMode = false, shakeAmt = 0, timeScale = 1, slowUntil = 0;

  function fit() {
    const W = canvas.clientWidth || innerWidth, Hh = canvas.clientHeight || innerHeight;
    renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    if (menuMode) return;
    const pts = [];
    [-8.15, 8.15].forEach((x) => [-8.15, 8.15].forEach((z) => { pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, -0.7, z)); }));
    [-TRAY.x - 0.5, TRAY.x + 0.5].forEach((x) => pts.push(new THREE.Vector3(x, TRAY_Y, TRAY.z1 + 0.5)));
    pts.push(new THREE.Vector3(0, PYR_H + 0.3, 0), new THREE.Vector3(-5, 1.5, -5), new THREE.Vector3(5, 1.5, -5));
    const yMin = -1 + (2 * margins.bottom) / Hh, yMax = 1 - (2 * margins.top) / Hh;
    const maxW = 1.94, maxH = yMax - yMin;
    const bbox = (d) => {
      camera.position.copy(camTarget).addScaledVector(camDir, d);
      camera.lookAt(camTarget); camera.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      const v = new THREE.Vector3();
      pts.forEach((p) => { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
      return { x0, x1, y0, y1 };
    };
    let lo = 5, hi = 300;
    for (let k = 0; k < 40; k++) {
      const d = (lo + hi) / 2, bb = bbox(d);
      if (bb.x1 - bb.x0 <= maxW && bb.y1 - bb.y0 <= maxH) hi = d; else lo = d;
    }
    const bb = bbox(hi);
    camBase.copy(camera.position);
    const dx = 0 - (bb.x0 + bb.x1) / 2, dy = (yMin + yMax) / 2 - (bb.y0 + bb.y1) / 2;
    camera.setViewOffset(W, Hh, (-dx * W) / 2, (dy * Hh) / 2, W, Hh);
    camera.updateProjectionMatrix();
  }

  function setMenuMode(on) {
    menuMode = on;
    fit();
  }

  const project = (() => {
    const v = new THREE.Vector3();
    return (x, y, z) => {
      v.set(x, y, z).project(camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    };
  })();
  const projectGrid = (gx, gy, up = 0) => project(gx - 7.5, surfaceY(gx, gy) + up, gy - 7.5);
  const diceScreen = () => project(dice.position.x, dice.position.y + 0.8, dice.position.z);
  const trayScreen = (x, front = true) => project(x, TRAY_Y + 0.2, front ? TRAY.z1 + 0.7 : TRAY.z0);
  const tokenScreen = (key) => { const p = tokens[key].group.position; return project(p.x, p.y + 0.5, p.z); };

  function pick(clientX, clientY, keys) {
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    let best = null, bestD = 52;
    keys.forEach((k) => {
      const s = tokenScreen(k);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  }

  let activeColor = null;
  const setActive = (c) => { activeColor = c; };
  const shake = (a) => { shakeAmt = Math.max(shakeAmt, a); };
  const slowmo = (scale, ms) => { timeScale = scale; slowUntil = performance.now() + ms; };

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  const tmp = new THREE.Vector3();
  renderer.setAnimationLoop((now) => {
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (slowUntil && now > slowUntil) { timeScale += (1 - timeScale) * 0.15; if (timeScale > 0.98) { timeScale = 1; slowUntil = 0; } }
    const dt = rdt * timeScale;
    const t = now / 1000;

    for (let k = tweens.length - 1; k >= 0; k--) {
      const tw = tweens[k];
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(p);
      if (p >= 1) { tweens.splice(k, 1); tw.res(); }
    }
    updateDice(dt * SPEED);

    // tokens
    const rolling = !!roll;
    Object.values(tokens).forEach((tk) => {
      const gp = tk.group.position;
      if (!tk.animating) {
        const f = 1 - Math.exp(-rdt * 12);
        gp.lerp(tk.target, f);
        tk.scale += (tk.targetScale - tk.scale) * f;
      }
      // face the camera
      tk.group.rotation.y = Math.atan2(camera.position.x - gp.x, camera.position.z - gp.z);
      // body squash / idle motion
      let sy = 1, sx = 1, oy = 0, ox = 0;
      if (tk.squash > 0) { sy -= 0.28 * tk.squash; sx += 0.18 * tk.squash; tk.squash = Math.max(0, tk.squash - rdt * 7); }
      if (!tk.animating) {
        if (tk.mood === 'scared') ox = Math.sin(t * 60 + tk.phase) * 0.025;
        else if (tk.mood === 'sleepy') sy += Math.sin(t * 1.6 + tk.phase) * 0.03;
        else if (tk.mood === 'happy' || tk.mood === 'proud') oy = Math.abs(Math.sin(t * 6 + tk.phase)) * 0.12;
        else sy += Math.sin(t * 2.4 + tk.phase) * 0.025;
        if (tk.selectable) oy = Math.abs(Math.sin(t * 7)) * 0.28;
        tk.bodyG.scale.set(sx, sy, sx);
      }
      tk.bodyG.position.set(ox, 0.1 + oy, 0);
      tk.group.scale.setScalar(tk.scale);
      if (tk.selectable) { tk.ring.material.opacity = 0.55 + Math.sin(t * 7) * 0.35; tk.ring.scale.setScalar(1 + Math.sin(t * 7) * 0.08); }

      // blinking, eyes following the dice
      let dirty = false;
      if (now > tk.nextBlink) { tk.blink = !tk.blink; tk.nextBlink = now + (tk.blink ? 130 : rand(2000, 5500)); dirty = true; }
      tk.lookTimer -= rdt;
      if (tk.lookTimer <= 0) {
        tk.lookTimer = 0.12;
        let lx = 0, ly = 0;
        if (rolling) { lx = clamp((dice.position.x - gp.x) / 6, -1, 1); ly = 0.9; }
        if (Math.abs(lx - tk.look[0]) > 0.05 || Math.abs(ly - tk.look[1]) > 0.05) { tk.look = [lx, ly]; dirty = true; }
        if (tk.mood === 'scared' || tk.mood === 'sad' || tk.mood === 'sleepy') dirty = true;
      }
      if (dirty) redrawFace(tk, t);
    });

    // particles
    for (let k = particles.length - 1; k >= 0; k--) {
      const m = particles[k], u = m.userData;
      u.v.y -= 22 * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += u.r.x * dt; m.rotation.y += u.r.y * dt;
      if (m.position.y < 0.08) { m.position.y = 0.08; u.v.multiplyScalar(0.5); u.v.y = Math.abs(u.v.y) * 0.4; }
      u.life -= dt;
      m.scale.setScalar(Math.max(0.01, Math.min(1, u.life * 2)));
      if (u.life <= 0) { scene.remove(m); particles.splice(k, 1); }
    }

    // yard glow for the active player
    COLORS.forEach((c) => { yardMats[c].emissiveIntensity = c === activeColor ? 0.18 + Math.sin(t * 4) * 0.12 : 0; });
    orb.position.y = PYR_H + 0.12 + Math.sin(t * 2) * 0.05;
    orb.rotation.y = t;

    // camera
    if (menuMode) {
      const a = t * 0.12;
      camera.position.set(Math.sin(a) * 24, 17, Math.cos(a) * 24);
      camera.lookAt(0, -1, 0);
    } else {
      tmp.set(Math.sin(t * 0.35) * 0.18, Math.sin(t * 0.5) * 0.08, 0);
      if (shakeAmt > 0.001) { tmp.x += rand(-1, 1) * shakeAmt * 0.5; tmp.y += rand(-1, 1) * shakeAmt * 0.5; tmp.z += rand(-1, 1) * shakeAmt * 0.3; shakeAmt *= Math.pow(0.02, rdt); }
      camera.position.copy(camBase).add(tmp);
    }

    renderer.render(scene, camera);
    opts.onFrame && opts.onFrame();
  });

  addEventListener('resize', fit);
  fit();

  return {
    setPlayers, setMood, setTargets, setSelectable, hopTo, flyTo, burst, rollDice,
    pick, projectGrid, diceScreen, trayScreen, tokenScreen, setActive, shake, slowmo, setMenuMode, fit,
    setMargins: (m) => { margins = m; fit(); },
    isRolling: () => !!roll,
  };
}
