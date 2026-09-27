import * as THREE from "three";

/**
 * Hull surface detail: a procedural normal map for plating seams and rivet
 * rows, and a roughness map with weathering streaks. Paint, liveries,
 * portholes and waterline wetness live in the hull shader (shipMesh.js).
 *
 * `applyHullDetail(root, ship)` mutates the root in place.
 */

function makeHullNormalMap() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // Flat normal (rgb = 128, 128, 255)
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, size, size);

  // Horizontal strakes: a lapped edge (bright above, dark below)
  for (let y = 4; y < size; y += 32) {
    ctx.fillStyle = "rgba(128,160,240,1)";
    ctx.fillRect(0, y - 1, size, 1.2);
    ctx.fillStyle = "rgba(128,100,240,1)";
    ctx.fillRect(0, y + 0.5, size, 1.4);
  }
  // Butt joints between plates, staggered per strake
  for (let row = 0, y = 4; y < size; y += 32, row++) {
    for (let x = (row % 2) * 48; x < size; x += 96) {
      ctx.fillStyle = "rgba(100,128,240,1)";
      ctx.fillRect(x, y, 1.2, 32);
    }
  }
  // Rivet rows along each strake
  for (let y = 4; y < size; y += 32) {
    for (let x = 2; x < size; x += 6) {
      for (const dy of [-3, 4]) {
        ctx.fillStyle = "rgba(128,150,250,1)";
        ctx.fillRect(x, y + dy - 0.6, 1.2, 0.8);
        ctx.fillStyle = "rgba(128,108,250,1)";
        ctx.fillRect(x, y + dy + 0.4, 1.2, 0.8);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 0.5);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeHullRoughnessMap() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // Base roughness around 0.55 (G channel is what three reads)
  ctx.fillStyle = "rgb(140,140,140)";
  ctx.fillRect(0, 0, size, size);

  // Vertical streaks: salt and rust run downward
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const w = 0.5 + Math.random() * 2.5;
    const v = 120 + Math.random() * 90;
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, `rgba(${v},${v},${v},0)`);
    g.addColorStop(0.3 + Math.random() * 0.4, `rgba(${v},${v},${v},${0.25 + Math.random() * 0.3})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0.05)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, size);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

let _hullNormal = null;
let _hullRough = null;
function hullNormal() { return (_hullNormal ||= makeHullNormalMap()); }
function hullRough() { return (_hullRough ||= makeHullRoughnessMap()); }

export function applyHullDetail(root) {
  const mats = root.userData?.mats;
  if (!mats) return;
  mats.hull.normalMap = hullNormal();
  mats.hull.normalScale = new THREE.Vector2(0.45, 0.45);
  mats.hull.roughnessMap = hullRough();
  mats.hull.needsUpdate = true;
}
