import * as THREE from "three";

/**
 * Hull detail enhancements: normal map for plating seams, roughness variation,
 * per-ship livery decals (Britannic hospital markings, etc.), and a wet sheen
 * overlay near the dynamic waterline.
 *
 * All of this is layered on top of an existing ship root (built by shipMesh.js).
 * The function `applyHullDetail(root, ship)` mutates the root in-place.
 */

// --- Procedural hull textures (canvas-generated) ---

function makeHullNormalMap() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // Base: flat normal (rgb = 128, 128, 255)
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, size, size);

  // Horizontal plating seams — slight bump
  ctx.strokeStyle = "rgba(100,100,200,1)";
  ctx.lineWidth = 1.4;
  for (let y = 4; y < size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + Math.sin(y * 0.13) * 0.8);
    ctx.stroke();
    // soft shadow below seam
    ctx.strokeStyle = "rgba(160,160,220,0.6)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(size, y + 2 + Math.sin(y * 0.13) * 0.8);
    ctx.stroke();
    ctx.strokeStyle = "rgba(100,100,200,1)";
    ctx.lineWidth = 1.4;
  }

  // Vertical rivet bands every 64 px
  ctx.fillStyle = "rgba(90,90,210,1)";
  for (let x = 8; x < size; x += 64) {
    for (let y = 8; y < size; y += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,160,220,1)";
      ctx.beginPath();
      ctx.arc(x - 0.6, y - 0.6, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(90,90,210,1)";
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeHullRoughnessMap() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // Base roughness around 0.62
  ctx.fillStyle = "rgb(158,158,158)";
  ctx.fillRect(0, 0, size, size);

  // Vertical streaks: rust streaks run downward
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const w = 1 + Math.random() * 3;
    const v = 130 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.3 + Math.random() * 0.3})`;
    ctx.fillRect(x, 0, w, size);
  }
  // Horizontal bands of weathering
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = `rgba(180,180,180,0.25)`;
    ctx.fillRect(0, y, size, 8 + Math.random() * 6);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeBootStripeTexture() {
  // Subtle weathering streaks along boot-top stripe
  const w = 256;
  const h = 32;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgb(120,120,120)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * w;
    const v = 100 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
    ctx.fillRect(x, 0, 1 + Math.random() * 2, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(8, 1);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

let _hullNormal = null;
let _hullRough = null;
let _bootRough = null;
function hullNormal() { return (_hullNormal ||= makeHullNormalMap()); }
function hullRough() { return (_hullRough ||= makeHullRoughnessMap()); }
function bootRough() { return (_bootRough ||= makeBootStripeTexture()); }

// --- Wet sheen overlay ---

function buildWetSheen(ship) {
  const L = ship.length;
  const B = ship.beam;
  const draft = ship.draft;
  // Vertical band from -draft-0.1 to +0.5 above waterline
  const h = draft + 0.6;
  const geo = new THREE.PlaneGeometry(L * 0.95, h, 1, 1);
  // gradient: top transparent, bottom semi-opaque dark
  const c = document.createElement("canvas");
  c.width = 4; c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.55, "rgba(0,0,0,0.04)");
  g.addColorStop(0.78, "rgba(0,0,0,0.32)");
  g.addColorStop(1.0, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.MultiplyBlending,
  });
  const port = new THREE.Mesh(geo, mat);
  port.position.set(0, -draft * 0.45, -B * 0.502);
  const starboard = new THREE.Mesh(geo, mat);
  starboard.position.set(0, -draft * 0.45, B * 0.502);
  starboard.rotation.y = Math.PI;
  return [port, starboard];
}

// --- Per-ship liveries ---

function applyBritannicLivery(root, ship) {
  // Green stripe + red cross on white superstructure
  const L = ship.length;
  const B = ship.beam;
  const deckY = approxDeckY(ship);
  // Approximate shipStyle for britannic (same family as titanic):
  const decks = 5;
  const deckH = ship.height * 0.16;
  const superLen = L * 0.78;
  const baseX = L * 0.06;

  const green = new THREE.MeshStandardMaterial({
    color: 0x4a8a48, roughness: 0.55, metalness: 0.05, emissive: 0x0a1a08, emissiveIntensity: 0.4,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xd02828, roughness: 0.5, metalness: 0.05, emissive: 0x401010, emissiveIntensity: 0.4,
  });

  // Green stripe per deck on each side — push out so they don't z-fight
  for (let d = 0; d < decks; d++) {
    const shrink = 1 - d * 0.06;
    const len = superLen * shrink * 0.94;
    const beam = B * (0.72 - d * 0.04);
    const y = deckY + deckH * 0.5 + d * deckH;
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(len, deckH * 0.32),
        green,
      );
      stripe.position.set(baseX + d * L * 0.01, y, side * (beam / 2 + 0.08));
      stripe.rotation.y = side > 0 ? 0 : Math.PI;
      root.add(stripe);
    }
  }

  // Red cross on bridge wing — large enough to read at distance
  const bridgeX = baseX - L * 0.06;
  const bridgeY = deckY + decks * deckH + ship.height * 0.08;
  const crossArm = ship.height * 0.45;
  for (const side of [-1, 1]) {
    const crossH = new THREE.Mesh(
      new THREE.PlaneGeometry(crossArm, crossArm * 0.3),
      red,
    );
    crossH.position.set(bridgeX, bridgeY, side * (B * 0.49));
    crossH.rotation.y = side > 0 ? 0 : Math.PI;
    root.add(crossH);
    const crossV = new THREE.Mesh(
      new THREE.PlaneGeometry(crossArm * 0.3, crossArm),
      red,
    );
    crossV.position.set(bridgeX, bridgeY, side * (B * 0.491));
    crossV.rotation.y = side > 0 ? 0 : Math.PI;
    root.add(crossV);
  }
}

function applyQELivery(root, ship) {
  // Art Deco styling: rake the funnels slightly, add a flagstaff on top
  const mats = root.userData?.mats;
  if (!mats) return;
  // Find funnels and add a thin black tip band + chrome ring
  const funnels = [];
  root.traverse((c) => {
    if (
      c.geometry?.type === "CylinderGeometry" &&
      c.geometry.parameters?.radiusTop > 0.2 &&
      c.geometry.parameters?.height > 0.4
    ) {
      funnels.push(c);
    }
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xd0d4d8, roughness: 0.25, metalness: 0.85,
  });
  for (const f of funnels) {
    const r = f.geometry.parameters.radiusTop;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.08, 24),
      chrome,
    );
    ring.position.set(f.position.x, f.position.y + f.geometry.parameters.height * 0.35, f.position.z);
    (f.parent ?? root).add(ring);
  }
}

function applyLusitaniaLivery(root, ship) {
  // Lusitania's four buff funnels were slightly raked — close to default,
  // but historically had a thin yellow ochre line at boot-top. Add a thin
  // ochre line above the boot stripe.
  const L = ship.length;
  const B = ship.beam;
  const draft = ship.draft;
  const ochre = new THREE.MeshStandardMaterial({
    color: 0xb8842a, roughness: 0.6, metalness: 0.1,
  });
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.9, 0.04, B * 0.012),
    ochre,
  );
  stripe.position.set(0, draft * 0.95, 0);
  root.add(stripe);
}

function applyAndreaDoriaLivery(root, ship) {
  // Two-tone: dark hull upper, lighter boot-top, prominent white sheer line.
  const L = ship.length;
  const B = ship.beam;
  const sheerMat = new THREE.MeshStandardMaterial({
    color: 0xfaefe0, roughness: 0.45, metalness: 0.15,
  });
  const sheer = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.92, 0.05, B * 0.014),
    sheerMat,
  );
  sheer.position.set(0, ship.draft * 0.7, 0);
  root.add(sheer);
}

// Approximate ship-internal helpers — keep hullDetail.js independent of
// shipMesh.js internals. The values are close enough for decal placement.
function approxDeckY(ship) {
  // Mirrors stationShape(0.5).deckY formula: freeboard = height * 0.38
  return ship.height * 0.38;
}
function approxSuperBase(ship) {
  return ship.height * 0.16 * ship.height * 0.16; // unused, see buildSuperstructure
}

// --- Entry point ---

const LIVERIES = {
  britannic: applyBritannicLivery,
  "queen-elizabeth": applyQELivery,
  lusitania: applyLusitaniaLivery,
  "andrea-doria": applyAndreaDoriaLivery,
};

export function applyHullDetail(root, ship) {
  // 1. Normal map + roughness on hull material(s)
  const normalMap = hullNormal();
  const roughMap = hullRough();
  const bootRoughMap = bootRough();

  // Hull meshes use mats.hull / mats.antifoul / mats.boot — we tagged them
  // via the userData we set up in shipMesh. Re-fetch from the root's
  // userData.mats (set there) if available, else walk children.
  const mats = root.userData?.mats;
  if (mats) {
    mats.hull.normalMap = normalMap;
    mats.hull.normalScale = new THREE.Vector2(0.6, 0.6);
    mats.hull.roughnessMap = roughMap;
    mats.hull.envMapIntensity = 1.0;
    mats.antifoul.roughnessMap = roughMap;
    mats.antifoul.normalMap = normalMap;
    mats.antifoul.normalScale = new THREE.Vector2(0.4, 0.4);
    mats.boot.roughnessMap = bootRoughMap;
    mats.superstructure.envMapIntensity = 1.1;
  }

  // 2. Wet sheen overlay
  const sheen = buildWetSheen(ship);
  for (const s of sheen) root.add(s);

  // 3. Per-ship livery
  const livery = LIVERIES[ship.id];
  if (livery) livery(root, ship);
}
