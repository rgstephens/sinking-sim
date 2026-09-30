import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WARSHIP_STYLES, CATEGORY_STYLES, buildWarship } from "./warshipMesh.js";

/**
 * High-detail procedural ships: ocean liners here, warship topsides in
 * warshipMesh.js on the same lofted hull.
 * Hull is a lofted station mesh (bow → stern) with ship-specific profiles.
 * Paint (antifouling, boot-top, sheer line, hospital livery), portholes,
 * hawse pipes and weathering are drawn by a hull shader in the ship's own
 * coordinates, so the waterline stays crisp at any distance.
 * Superstructure, funnels, lifeboats, davits, rails and rigging are built on
 * top; small repeated parts are merged into one mesh per material.
 */

const STATIONS = 72;
const HALF_SECTIONS = 20; // points around half-breadth (keel → deck → centerline)
export const BREAK_FRACTION = 0.06; // hull parts at x = L * BREAK_FRACTION
const PAINT_WATERLINE = 0.025;
const BOW_ENTRANCE_POWER = {
  blunt: 0.58,
  modern: 0.9,
  edwardian: 0.93,
  olympic: 1.07,
  raked: 1.22,
  fine: 1.4,
};

export function buildShipMesh(ship) {
  const root = new THREE.Group();
  root.name = ship.id;

  const style = shipStyle(ship);
  const mats = makeMaterials(ship, style);

  // --- Hull (high-res loft, painted in the shader) ---
  const hullGeo = buildHullGeometry(ship, style);
  const hull = new THREE.Mesh(hullGeo, mats.hull);
  hull.castShadow = true;
  hull.receiveShadow = true;
  hull.userData.sliceHull = true;
  root.add(hull);

  // Deck surface
  const deck = buildDeck(ship, style, mats.deck);
  root.add(deck);

  if (isWarship(ship)) {
    // Turrets, towers, flight decks and conning towers
    buildWarship(root, ship, style, mats, warshipKit(ship, style, mats));
  } else {
    // Superstructure blocks (multi-deck)
    buildSuperstructure(root, ship, style, mats);

    // Funnels
    buildFunnels(root, ship, style, mats);

    // Masts + rigging
    buildMasts(root, ship, style, mats);

    // Lifeboats along boat deck
    buildLifeboats(root, ship, style, mats);
  }

  // Railings (a submarine's casing has none)
  if (style.hullForm !== "submarine") buildRailings(root, ship, style, mats);

  // Propellers / rudder under stern
  buildSternGear(root, ship, style, mats);

  // Internal flood volumes
  const waterVolumes = buildWaterVolumes(ship, mats.waterInside);
  for (const w of waterVolumes) root.add(w);

  const damageGroup = new THREE.Group();
  damageGroup.name = "damage";
  root.add(damageGroup);

  // Hull geometry is built with y=0 at the design waterline.
  root.position.y = 0;

  root.userData = {
    ...root.userData, // boatDeck, set by the topside builders
    ship,
    waterVolumes,
    damageGroup,
    mats,
  };

  return root;
}

/** Window and porthole glow, 0 (daylight) … 1 (dusk). */
export function setShipLights(root, amount) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m) continue;
      if (m.hullUniforms) m.hullUniforms.uGlow.value = amount;
      if (m.userData.glow != null) m.emissiveIntensity = m.userData.glow * amount;
    }
  });
}

function isWarship(ship) {
  return Boolean(ship.category) && ship.category !== "liner";
}

/**
 * Silhouette knobs: category defaults overlaid with the ship's own entry.
 * `own` is false only for a ship nobody has drawn yet (it gets the defaults).
 */
export function shipStyle(ship) {
  const own = LINER_STYLES[ship.id] ?? WARSHIP_STYLES[ship.id];
  const base = isWarship(ship) ? CATEGORY_STYLES[ship.category] : LINER_STYLES.titanic;
  return { funnelEllipse: 0.88, funnelRake: 0.08, ...base, ...own, own: Boolean(own) };
}

// Per-liner silhouette knobs
const LINER_STYLES = {
  titanic: {
    bowFine: 0.94,
    bowRake: 0.062,
    sternFine: 0.55,
    sheer: 0.08,
    camber: 0.04,
    flare: 0.35,
    funnelSpread: 0.32,
    funnelStart: -0.06,
    funnelRake: 0.1,
    funnelEllipse: 0.78,
    superLen: 0.58,
    superOffset: 0.0,
    decks: 3,
    boatDeckY: 0.72,
    bowType: "olympic",
    portholeRows: 3,
  },
  britannic: {
    bowFine: 0.93,
    bowRake: 0.06,
    sternFine: 0.55,
    sheer: 0.08,
    camber: 0.04,
    flare: 0.34,
    funnelSpread: 0.33,
    funnelStart: -0.05,
    funnelRake: 0.1,
    funnelEllipse: 0.78,
    superLen: 0.58,
    superOffset: 0.0,
    decks: 3,
    boatDeckY: 0.72,
    bowType: "olympic",
    portholeRows: 3,
  },
  nomadic: {
    bowFine: 0.72,
    bowRake: 0.028,
    sternFine: 0.65,
    sheer: 0.05,
    camber: 0.03,
    flare: 0.2,
    funnelSpread: 0.0,
    funnelStart: 0.05,
    funnelRake: 0.06,
    superLen: 0.45,
    superOffset: -0.02,
    decks: 2,
    boatDeckY: 0.55,
    bowType: "blunt",
    portholeRows: 2,
  },
  "queen-elizabeth": {
    bowFine: 0.9,
    bowRake: 0.078,
    sternFine: 0.5,
    sheer: 0.1,
    camber: 0.05,
    flare: 0.4,
    funnelSpread: 0.18,
    funnelStart: 0.02,
    funnelRake: 0.05,
    superLen: 0.62,
    superOffset: -0.02,
    decks: 4,
    boatDeckY: 0.78,
    bowType: "raked",
    portholeRows: 4,
  },
  lusitania: {
    bowFine: 0.97,
    bowRake: 0.072,
    sternFine: 0.5,
    sheer: 0.09,
    camber: 0.04,
    flare: 0.38,
    funnelSpread: 0.3,
    funnelStart: -0.08,
    funnelRake: 0.1,
    superLen: 0.56,
    superOffset: 0.0,
    decks: 3,
    boatDeckY: 0.7,
    bowType: "fine",
    portholeRows: 3,
  },
  "andrea-doria": {
    bowFine: 0.93,
    bowRake: 0.09,
    sternFine: 0.45,
    sheer: 0.07,
    camber: 0.045,
    flare: 0.42,
    funnelSpread: 0.0,
    funnelStart: 0.12,
    funnelRake: 0.14,
    superLen: 0.55,
    superOffset: 0.02,
    decks: 4,
    boatDeckY: 0.75,
    bowType: "modern",
    portholeRows: 4,
  },
  empress: {
    bowFine: 0.88,
    bowRake: 0.05,
    sternFine: 0.55,
    sheer: 0.07,
    camber: 0.035,
    flare: 0.3,
    funnelSpread: 0.2,
    funnelStart: -0.02,
    funnelRake: 0.08,
    superLen: 0.52,
    superOffset: 0.0,
    decks: 2,
    boatDeckY: 0.65,
    bowType: "edwardian",
    portholeRows: 2,
  },
};

// --- Procedural textures (browser only; the node tests build meshes too) ---

const hasDOM = typeof document !== "undefined";
const texCache = new Map();

function cachedTexture(key, make) {
  if (!hasDOM) return null;
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function finishTexture(c, color = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// One texture = 4 window bays wide × one deck tall. Albedo is near-white so
// the material colour sets the paint.
const BAYS = 4;
function windowTextures(modern) {
  return cachedTexture(`windows-${modern}`, () => {
    const W = 512;
    const H = 128;
    const [c, g] = canvas(W, H);
    const [e, ge] = canvas(W, H);
    const [r, gr] = canvas(W, H);
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, W, H);
    ge.fillStyle = "#000";
    ge.fillRect(0, 0, W, H);
    gr.fillStyle = "rgb(0,130,0)"; // roughness in G
    gr.fillRect(0, 0, W, H);
    // Deck edge plating line and grime run-off at the base of each deck.
    const grime = g.createLinearGradient(0, H * 0.78, 0, H);
    grime.addColorStop(0, "rgba(120,110,95,0)");
    grime.addColorStop(1, "rgba(120,110,95,0.35)");
    g.fillStyle = grime;
    g.fillRect(0, H * 0.78, W, H * 0.22);
    g.fillStyle = "rgba(90,85,78,0.6)";
    g.fillRect(0, H - 5, W, 3);
    const bay = W / BAYS;
    let seed = modern ? 5 : 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < BAYS; i++) {
      const x0 = i * bay;
      const n = modern ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const ww = modern ? bay * 0.72 : bay * 0.28;
        const wx = modern ? x0 + bay * 0.14 : x0 + bay * (0.14 + k * 0.44);
        const wy = modern ? H * 0.22 : H * 0.2;
        const wh = modern ? H * 0.42 : H * 0.46;
        // Frame
        g.fillStyle = "#b8b2a6";
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        // Glass: sky reflected at the top, dark interior below
        const glass = g.createLinearGradient(0, wy, 0, wy + wh);
        glass.addColorStop(0, "#56687a");
        glass.addColorStop(0.45, "#1d2630");
        glass.addColorStop(1, "#11161c");
        g.fillStyle = glass;
        g.fillRect(wx, wy, ww, wh);
        // Mullion
        if (!modern) {
          g.fillStyle = "#c9c3b7";
          g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        }
        // Rust weep under the sill
        g.fillStyle = `rgba(120,80,50,${0.08 + rnd() * 0.12})`;
        g.fillRect(wx + ww * rnd(), wy + wh + 3, 2, H * 0.25);
        gr.fillStyle = "rgb(0,20,0)";
        gr.fillRect(wx, wy, ww, wh);
        // Interior light: warm, not every cabin occupied
        if (rnd() > 0.3) {
          const warm = 150 + Math.round(rnd() * 105);
          ge.fillStyle = `rgb(255,${Math.round(warm * 0.8)},${Math.round(warm * 0.45)})`;
          ge.fillRect(wx, wy + wh * 0.1, ww, wh * 0.9);
        }
      }
    }
    return { map: finishTexture(c), emissive: finishTexture(e), rough: finishTexture(r, false) };
  });
}

/** Teak planking; `painted` is a neutral grey version for a tinted deck. */
/**
 * Warship bulkheads: grey plating with a few scuttles and weathering, one
 * texture = BAYS bays wide × one deck tall. Darkened ship — nothing glows.
 */
function navalTexture() {
  return cachedTexture("naval", () => {
    const W = 512;
    const H = 128;
    const [c, g] = canvas(W, H);
    g.fillStyle = "#eef0f0";
    g.fillRect(0, 0, W, H);
    // Plate seams and a darker splash line at the deck
    g.fillStyle = "rgba(60,64,66,0.18)";
    for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 1.5, H);
    g.fillRect(0, H * 0.5, W, 1);
    const grime = g.createLinearGradient(0, H * 0.75, 0, H);
    grime.addColorStop(0, "rgba(70,70,68,0)");
    grime.addColorStop(1, "rgba(70,70,68,0.3)");
    g.fillStyle = grime;
    g.fillRect(0, H * 0.75, W, H * 0.25);
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < BAYS; i++) {
      const x = (i + 0.5) * (W / BAYS);
      if (rnd() < 0.35) {
        // Watertight door
        g.fillStyle = "rgba(40,44,46,0.55)";
        g.fillRect(x - 12, H * 0.28, 24, H * 0.66);
        g.fillStyle = "rgba(230,232,232,0.35)";
        g.fillRect(x - 12, H * 0.28, 24, 2);
        continue;
      }
      for (const dx of [-26, 26]) {
        if (rnd() < 0.4) continue;
        g.fillStyle = "#5c6164";
        g.beginPath();
        g.arc(x + dx, H * 0.4, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1a1e22";
        g.beginPath();
        g.arc(x + dx, H * 0.4, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgba(110,75,50,${0.1 + rnd() * 0.15})`;
        g.fillRect(x + dx - 1, H * 0.46, 2, H * 0.3);
      }
    }
    return finishTexture(c);
  });
}

/**
 * Flight deck, u along the ship (one tile = FLIGHT_TILE units), v across the
 * full width: planks, tie-down strips, edge lines and a dashed centreline.
 */
export const FLIGHT_TILE = 6;
function flightDeckTexture(base, centreline) {
  return cachedTexture(`flight-${base}-${centreline}`, () => {
    const W = 1024;
    const H = 256;
    const [c, g] = canvas(W, H);
    const col = new THREE.Color(base);
    const rgb = (k) => `rgb(${[col.r, col.g, col.b].map((v) => Math.round(Math.min(1, v * k) * 255)).join(",")})`;
    g.fillStyle = rgb(1);
    g.fillRect(0, 0, W, H);
    let seed = 41;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Planks run fore and aft
    for (let y = 0; y < H; y += 4) {
      let x = -rnd() * 200;
      while (x < W) {
        const len = 120 + rnd() * 200;
        g.fillStyle = rgb(0.9 + rnd() * 0.2);
        g.fillRect(x, y, len, 4);
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(x, y, 1, 4);
        x += len;
      }
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(0, y, W, 0.7);
    }
    // Steel tie-down strips across the deck
    g.fillStyle = "rgba(40,40,40,0.35)";
    for (let x = 0; x < W; x += W / 5) g.fillRect(x, 0, 2, H);
    // Tyre marks and oil down the middle
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(20,20,20,${0.04 + rnd() * 0.06})`;
      g.fillRect(rnd() * W, H * (0.3 + rnd() * 0.4), 60 + rnd() * 200, 2 + rnd() * 3);
    }
    g.fillStyle = "rgba(235,235,225,0.9)";
    g.fillRect(0, H * 0.035, W, 3);
    g.fillRect(0, H * 0.965 - 3, W, 3);
    if (centreline) {
      for (let x = 0; x < W; x += W / 4) g.fillRect(x, H * 0.5 - 2, W / 8, 4);
    }
    const tex = finishTexture(c);
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

function plankTexture(painted = false) {
  return cachedTexture(`planks-${painted}`, () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const tone = painted ? [218, 218, 218] : [168, 138, 98];
    g.fillStyle = `rgb(${tone.join(",")})`;
    g.fillRect(0, 0, S, S);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows = 16;
    const h = S / rows;
    for (let j = 0; j < rows; j++) {
      let x = -rnd() * S * 0.5;
      while (x < S) {
        const len = S * (0.35 + rnd() * 0.4);
        const v = painted ? 0.93 + rnd() * 0.1 : 0.85 + rnd() * 0.3;
        g.fillStyle = `rgb(${tone.map((t) => Math.min(255, Math.round(t * v))).join(",")})`;
        g.fillRect(x, j * h, len, h);
        g.fillStyle = "rgba(40,30,20,0.55)";
        g.fillRect(x, j * h, 1.5, h);
        x += len;
      }
      g.fillStyle = "rgba(35,28,20,0.75)"; // caulking
      g.fillRect(0, j * h, S, 1.2);
    }
    return finishTexture(c);
  });
}

function funnelTexture() {
  return cachedTexture("funnel", () => {
    const W = 64;
    const H = 256;
    const [c, g] = canvas(W, H);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    // Soot builds toward the top (v = 1 is the top; canvas y = 0 is the top)
    const soot = g.createLinearGradient(0, 0, 0, H);
    soot.addColorStop(0, "rgba(40,36,32,0.55)");
    soot.addColorStop(0.3, "rgba(60,55,50,0.12)");
    soot.addColorStop(1, "rgba(60,55,50,0)");
    g.fillStyle = soot;
    g.fillRect(0, 0, W, H);
    // Rivet seams
    g.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = 18; y < H; y += 26) g.fillRect(0, y, W, 1.5);
    for (let x = 4; x < W; x += 16) g.fillRect(x, 0, 1, H);
    // Streaks running down
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % W;
      g.fillStyle = `rgba(50,45,40,${0.05 + (i % 3) * 0.04})`;
      g.fillRect(x, 0, 1 + (i % 2), H * (0.2 + (i % 5) * 0.08));
    }
    const tex = finishTexture(c);
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/**
 * BoxGeometry with UVs in world units. Sides: u = length / uScale,
 * v = height / vScale. Top and bottom: both axes / topScale.
 */
function worldUVBox(w, h, d, uScale, vScale, topScale = uScale) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // Face order px, nx, py, ny, pz, nz — four vertices each (no segments).
  const dims = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const flat = f === 2 || f === 3;
      uv.setXY(
        i,
        (uv.getX(i) * fu) / (flat ? topScale : uScale),
        flat ? (uv.getY(i) * fv) / topScale : (uv.getY(i) * fv) / vScale
      );
    }
  }
  return geo;
}

function makeMaterials(ship, style) {
  const hull = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0.15,
  });
  paintHull(hull, ship, style);

  const steelDeck = ship.deck === "steel";
  const deck = new THREE.MeshStandardMaterial({
    color: ship.deckColor ?? (steelDeck ? 0x5c6166 : 0xffffff),
    map: steelDeck ? null : plankTexture(ship.deckColor != null),
    roughness: steelDeck ? 0.8 : 0.85,
    metalness: steelDeck ? 0.25 : 0.0,
  });
  const warship = isWarship(ship);
  const modern = style.bowType === "modern" || style.bowType === "raked";
  const win = warship ? null : windowTextures(modern);
  const superstructure = new THREE.MeshStandardMaterial({
    color: ship.superstructureColor,
    map: warship ? navalTexture() : (win?.map ?? null),
    roughnessMap: win?.rough ?? null,
    emissiveMap: win?.emissive ?? null,
    emissive: win ? 0xffc890 : 0x000000,
    emissiveIntensity: 0,
    roughness: warship ? 0.62 : 1,
    metalness: 0.05,
  });
  // Liners light up at dusk; warships steam darkened.
  if (!warship) superstructure.userData.glow = 2.2;
  const paint = new THREE.MeshStandardMaterial({
    color: ship.superstructureColor,
    roughness: 0.55,
    metalness: 0.05,
  });
  const funnel = new THREE.MeshStandardMaterial({
    color: ship.funnelColor,
    map: funnelTexture(),
    roughness: 0.55,
    metalness: 0.1,
  });
  // Masts were buff on almost every liner of the period.
  const mast = new THREE.MeshStandardMaterial({
    color: 0xb89660,
    roughness: 0.6,
    metalness: 0.05,
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x121212,
    roughness: 0.6,
    metalness: 0.2,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x6a6e72,
    roughness: 0.45,
    metalness: 0.7,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xa0783a,
    roughness: 0.35,
    metalness: 1.0,
  });
  const boatHull = new THREE.MeshStandardMaterial({
    color: 0xeeeae0,
    roughness: 0.5,
    metalness: 0.0,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x6b4a2c,
    roughness: 0.75,
    metalness: 0.0,
  });
  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0xcfc6b0,
    roughness: 0.95,
    metalness: 0.0,
  });
  const rope = new THREE.LineBasicMaterial({
    color: 0x1c1a18,
    transparent: true,
    opacity: 0.75,
  });
  const waterInside = new THREE.MeshStandardMaterial({
    color: 0x1a4a6e,
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0.0,
    depthWrite: false,
  });
  // Topside plating above the hull proper (hangar sides, conning towers)
  const topside = new THREE.MeshStandardMaterial({
    color: ship.hullColor,
    roughness: 0.6,
    metalness: 0.15,
  });
  const gun = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ship.superstructureColor).multiplyScalar(0.72),
    roughness: 0.5,
    metalness: 0.35,
  });
  const flightDeck = style.flightDeck
    ? new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: flightDeckTexture(ship.deckColor ?? 0x5c6166, ship.navy !== "IJN"),
        roughness: 0.82,
        metalness: 0.05,
      })
    : null;
  return {
    hull,
    deck,
    topside,
    gun,
    flightDeck,
    superstructure,
    paint,
    funnel,
    mast,
    black,
    metal,
    bronze,
    boatHull,
    wood,
    canvas: canvasMat,
    rope,
    waterInside,
  };
}

/**
 * Hull paint in ship-local space: antifouling below the waterline, optional
 * boot-top, sheer line, hospital band and crosses, portholes that glow at
 * dusk, hawse pipes with rust weeping, plate-to-plate tone and streaking.
 */
function paintHull(mat, ship, style) {
  const L = ship.length;
  const mid = stationShape(0.5, ship, style);
  const bow = stationShape(0.05, ship, style);
  const rows = style.portholeRows;
  const top = mid.deckY - 0.1;
  const limber = style.hullForm === "submarine";
  const y0 = 0.12;
  const dy = rows > 1 ? (top - y0) / (rows - 1) : 0;
  const bandLo = mid.deckY * 0.34;
  const bandHi = bandLo + ship.height * 0.06;

  const uniforms = {
    uTopside: { value: new THREE.Color(ship.hullColor) },
    uAntifoul: { value: new THREE.Color(ship.antifoulColor ?? 0x6e1e19) },
    uBoot: { value: new THREE.Color(ship.bootTop ?? 0xffffff) },
    uBootW: { value: ship.bootTop ? 0.06 : 0 },
    uSheer: { value: new THREE.Color(ship.sheerLine ?? 0x000000) },
    uSheerOn: { value: ship.sheerLine ? 1 : 0 },
    uHospital: { value: ship.hospital ? 1 : 0 },
    uBand: { value: new THREE.Color(ship.hospital?.band ?? 0x000000) },
    uCross: { value: new THREE.Color(ship.hospital?.cross ?? 0x000000) },
    uBandY: { value: new THREE.Vector2(bandLo, bandHi) },
    uCrossX: { value: new THREE.Vector3(-0.22 * L, 0.02 * L, 0.26 * L) },
    uCrossSize: { value: Math.max(0.12, mid.deckY * 0.42) },
    uPort: { value: new THREE.Vector4(rows, y0, dy, 0.018 + ship.beam * 0.002) },
    uPortSpacing: { value: style.portSpacing ?? 0.15 },
    uPortSpan: { value: L * 0.38 },
    uHawse: { value: new THREE.Vector3(bow.x - L * 0.005, bow.deckY - 0.14, 0.045) },
    uGlow: { value: 0 },
    // Warships steam darkened: scuttles never light up.
    uPortLit: { value: isWarship(ship) ? 0 : 1 },
    // USN Measure 22: navy blue from the waterline to the lowest deck line.
    uCamo: { value: new THREE.Color(ship.measure22 ?? 0x000000) },
    uCamoTop: { value: ship.measure22 ? mid.deckY * 0.86 : -1e3 },
    // Submarine free-flooding slots along the casing: (on, y, height, pitch)
    uLimber: { value: new THREE.Vector4(limber ? 1 : 0, mid.deckY * 0.62, mid.deckY * 0.22, 0.09) },
    uLimberSpan: { value: L * 0.36 },
  };
  mat.hullUniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vHullPos;
        varying vec3 vHullN;
        varying vec2 vHullUv;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vHullPos = position;
        vHullN = normal;
        vHullUv = uv;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vHullPos;
        varying vec3 vHullN;
        varying vec2 vHullUv;
        uniform vec3 uTopside, uAntifoul, uBoot, uSheer, uBand, uCross, uCrossX, uHawse;
        uniform float uBootW, uSheerOn, uHospital, uCrossSize, uPortSpacing, uPortSpan, uGlow, uPortLit, uCamoTop, uLimberSpan;
        uniform vec3 uCamo;
        uniform vec4 uLimber;
        uniform vec2 uBandY;
        uniform vec4 uPort;
        float hullHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float crossAt(vec2 d, float s) {
          d = abs(d);
          float t = s * 0.32;
          return max(step(d.x, t) * step(d.y, s), step(d.x, s) * step(d.y, t));
        }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 hp = vHullPos;
        float sideFace = 1.0 - smoothstep(0.7, 0.85, abs(vHullN.y));
        float aa = max(max(fwidth(hp.x), fwidth(hp.y)), 1e-4);
        float wl = ${PAINT_WATERLINE.toFixed(3)};
        float anti = 1.0 - smoothstep(wl - aa, wl + aa, hp.y);

        vec3 paint = uTopside;
        float plate = hullHash(floor(vec2(hp.x / 0.9, hp.y / 0.2)) + (hp.z > 0.0 ? 17.0 : 0.0));
        paint *= 0.95 + plate * 0.09;

        if (uCamoTop > -100.0) {
          float camo = 1.0 - smoothstep(uCamoTop - aa, uCamoTop + aa, hp.y);
          paint = mix(paint, uCamo * (0.95 + plate * 0.09), camo);
        }
        if (uBootW > 0.0) {
          float boot = smoothstep(wl - aa, wl + aa, hp.y) * (1.0 - smoothstep(wl + uBootW - aa, wl + uBootW + aa, hp.y));
          paint = mix(paint, uBoot, boot);
        }
        if (uHospital > 0.5) {
          float band = smoothstep(uBandY.x - aa, uBandY.x + aa, hp.y) * (1.0 - smoothstep(uBandY.y - aa, uBandY.y + aa, hp.y));
          paint = mix(paint, uBand, band * sideFace);
          float cy = (uBandY.x + uBandY.y) * 0.5;
          float cr = crossAt(vec2(hp.x - uCrossX.x, hp.y - cy), uCrossSize);
          cr = max(cr, crossAt(vec2(hp.x - uCrossX.y, hp.y - cy), uCrossSize));
          cr = max(cr, crossAt(vec2(hp.x - uCrossX.z, hp.y - cy), uCrossSize));
          paint = mix(paint, uCross, cr * sideFace);
        }
        if (uSheerOn > 0.5) {
          float sh = smoothstep(0.925, 0.93, vHullUv.y) * (1.0 - smoothstep(0.945, 0.95, vHullUv.y));
          paint = mix(paint, uSheer, sh * sideFace);
        }

        // Rust weeping from scuppers and plate seams
        float col = floor(hp.x / 0.06);
        float weep = step(0.88, hullHash(vec2(col, 3.0))) * (0.4 + 0.6 * hullHash(vec2(col, 9.0)));
        weep *= smoothstep(-0.2, 0.25, hp.y) * smoothstep(uPort.y + uPort.z * uPort.x, uPort.y, hp.y);
        paint = mix(paint, vec3(0.32, 0.17, 0.09), weep * 0.35 * sideFace);

        // Portholes
        float hullGlass = 0.0;
        float hullRim = 0.0;
        float hullLit = 0.0;
        if (abs(hp.x) < uPortSpan && sideFace > 0.5) {
          float cx = floor(hp.x / uPortSpacing);
          float fx = (fract(hp.x / uPortSpacing) - 0.5) * uPortSpacing;
          for (int r = 0; r < 5; r++) {
            if (float(r) >= uPort.x) break;
            float ry = uPort.y + float(r) * uPort.z;
            float h = hullHash(vec2(cx, float(r) * 13.0 + (hp.z > 0.0 ? 5.0 : 0.0)));
            float present = step(0.18, h);
            float d = length(vec2(fx, hp.y - ry));
            float g = (1.0 - smoothstep(uPort.w - aa, uPort.w + aa, d)) * present;
            hullGlass = max(hullGlass, g);
            hullRim = max(hullRim, (1.0 - smoothstep(uPort.w * 1.4 - aa, uPort.w * 1.4 + aa, d)) * present);
            hullLit = max(hullLit, g * step(0.62, h));
          }
        }
        // Hawse pipes, with rust running down from them
        {
          vec2 hd = vec2(hp.x - uHawse.x, hp.y - uHawse.y);
          float hw = (1.0 - smoothstep(uHawse.z - aa, uHawse.z + aa, length(hd * vec2(0.8, 1.0)))) * sideFace;
          float run = step(abs(hd.x), uHawse.z * 0.6) * step(hd.y, 0.0) * smoothstep(-0.5, 0.0, hd.y);
          paint = mix(paint, vec3(0.3, 0.15, 0.08), run * 0.5 * sideFace);
          hullRim = max(hullRim, hw);
          paint = mix(paint, vec3(0.02), hw * 0.9);
        }
        if (uLimber.x > 0.5 && abs(hp.x) < uLimberSpan && sideFace > 0.5) {
          float lx = abs(fract(hp.x / uLimber.w) - 0.5) * uLimber.w;
          float slot = (1.0 - smoothstep(uLimber.w * 0.3 - aa, uLimber.w * 0.3 + aa, lx))
            * (1.0 - smoothstep(uLimber.z * 0.5 - aa, uLimber.z * 0.5 + aa, abs(hp.y - uLimber.y)));
          paint = mix(paint, vec3(0.015), slot);
        }
        paint = mix(paint, vec3(0.3, 0.27, 0.22), hullRim * (1.0 - hullGlass) * 0.5);
        paint = mix(paint, vec3(0.02, 0.025, 0.03), hullGlass);

        // Green-brown growth and wet darkening along the waterline
        float wetBand = smoothstep(wl + 0.16, wl, hp.y) * smoothstep(wl - 0.4, wl, hp.y);
        vec3 bottom = uAntifoul * (0.85 + plate * 0.2);
        bottom = mix(bottom, vec3(0.1, 0.12, 0.06), smoothstep(wl - 0.25, wl, hp.y) * 0.45);
        paint = mix(paint, bottom, anti);
        paint *= 1.0 - wetBand * 0.18;

        diffuseColor.rgb *= paint;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, hullGlass);
        roughnessFactor *= 1.0 - wetBand * 0.45;
        roughnessFactor = mix(roughnessFactor, 0.8, anti * 0.6);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * hullLit * uGlow * uPortLit * 0.9;`
      );
  };
  mat.customProgramCacheKey = () => "hull-paint-v2";
}

/**
 * Station half-breadth profile.
 * u in [0,1] bow→stern. v in [0,1] from keel up the side to deck edge,
 * then across deck to centerline is handled separately for full mesh.
 *
 * Coordinates: x along length (0 mid, -bow, +stern), y up (0 waterline), z to starboard.
 */
function stationShape(u, ship, style) {
  const L = ship.length;
  const B = ship.beam;
  const draft = ship.draft;
  const freeboard = ship.height * 0.38;

  // Longitudinal position
  const x = (u - 0.5) * L;

  // Beam envelope: fine ends, full midbody
  const mid = 1 - Math.pow(Math.abs(u - 0.5) * 2, 2.4) * 0.08;
  let beamScale;
  if (u < 0.2) {
    // Elliptical entrance: breadth recovers quickly abaft the stem instead of
    // tapering to a needle across the entire forward fifth. Bow type supplies
    // the broad silhouette while bowFine remains a small continuous trim.
    const t = u / 0.2;
    const ellipse = Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2)));
    const typePower = BOW_ENTRANCE_POWER[style.bowType] ?? BOW_ENTRANCE_POWER.olympic;
    const fineTrim = ((style.bowFine ?? 0.9) - 0.9) * 0.35;
    beamScale = Math.pow(ellipse, typePower + fineTrim) * mid;
  } else if (u > 0.8 && style.sternType === "pointed") {
    // Submarine tail: tapers to the screws instead of ending in a counter
    const s = (u - 0.8) / 0.2;
    beamScale = Math.pow(Math.max(0, 1 - Math.pow(s, 1.5)), 0.9) * mid;
  } else if (u > 0.8) {
    // Counter stern: round in plan, so the deck ends in a full ellipse
    const s = (u - 0.8) / 0.2;
    beamScale = Math.sqrt(Math.max(0, 1 - Math.pow(s, 2.2 + style.sternFine))) * mid;
  } else {
    beamScale = mid;
  }

  // Sheer (deck rises toward ends), with a raised forecastle at the bow
  let sheerY =
    style.sheer * ship.height * (Math.pow(Math.abs(u - 0.5) * 2, 2)) * (u > 0.5 ? style.sheerAft ?? 1 : 1);
  if (u < 0.2) sheerY += ship.height * 0.07 * Math.pow(1 - u / 0.2, 1.35);
  // Raised forecastle: the weather deck steps down at `to`
  if (style.forecastle) {
    const { to, rise } = style.forecastle;
    sheerY += rise * (1 - THREE.MathUtils.smoothstep(u, to - 0.007, to + 0.007));
  }

  // Keel depth slightly less at ends
  // The counter overhangs: the keel sweeps up toward the waterline aft.
  const counter = THREE.MathUtils.smoothstep(u, 0.88, 1.0) * (style.sternType === "pointed" ? 0.55 : 0.85);
  const keelDepth = draft * (0.75 + 0.25 * Math.sin(Math.PI * u)) * (1 - counter);

  // Deck half-breadth
  const deckHalf = (B * 0.5) * beamScale;

  return {
    x,
    keelY: -keelDepth,
    deckY: freeboard * 0.75 + sheerY,
    deckHalf,
    waterHalf: deckHalf * (0.92 + style.flare * 0.05),
    flare: style.flare,
  };
}

/**
 * Point on half-section at station u, parameter s in [0,1]:
 * 0 = keel centerline, ~0.45 = waterline bilge, ~0.75 = deck edge, 1 = deck centerline
 */
function sectionPoint(u, s, ship, style) {
  const st = stationShape(u, ship, style);
  const B = ship.beam;

  if (s <= 0.72) {
    // Hull side: keel → deck edge
    const t = s / 0.72; // 0..1
    // Rounded bilge profile. A submarine's saddle-tank section is widest
    // below the waterline and pulls in to a narrow casing on top.
    const bilge =
      style.hullForm === "submarine"
        ? Math.pow(Math.sin(t * Math.PI * 0.82), 0.7)
        : Math.pow(Math.sin((t * Math.PI) / 2), 0.85);
    const z = st.deckHalf * bilge;
    // y: keel to deck with slight tumblehome near top
    const y = THREE.MathUtils.lerp(st.keelY, st.deckY, t);
    // Flare above the waterline, strongest just aft of the stem
    const above = Math.max(0, y);
    let flareAmt = style.flare * 0.22 * (above / Math.max(0.01, st.deckY));
    if (u < 0.18) flareAmt += style.flare * 0.95 * (1 - u / 0.18) * (above / Math.max(0.01, st.deckY));
    const flareZ = z * (1 + flareAmt);
    // Keep a modestly fine submerged forefoot without pinching the complete
    // section a second time. The longitudinal envelope already closes it.
    let pinch = 1;
    if (u < 0.06 && y < 0) {
      const below = THREE.MathUtils.clamp(-y / Math.max(0.01, -st.keelY), 0, 1);
      const nearStem = 1 - THREE.MathUtils.smoothstep(u, 0, 0.06);
      pinch -= nearStem * Math.pow(below, 1.2) * 0.16;
    }
    // Run aft: fine below the waterline toward the sternpost, full above it
    if (u > 0.74) {
      const r = (u - 0.74) / 0.26;
      const below = THREE.MathUtils.clamp(-y / Math.max(0.01, -st.keelY), 0, 1);
      pinch *= 1 - r * r * Math.pow(below, 0.7) * 0.8;
    }
    return finishBow(new THREE.Vector3(st.x, y, flareZ * pinch), u, ship, style, st);
  }

  // Deck surface: edge → centerline
  const t = (s - 0.72) / 0.28;
  const camber = style.camber * B * Math.sin(t * Math.PI);
  const z = st.deckHalf * (1 - t);
  const y = st.deckY + camber * (1 - Math.abs(1 - 2 * t) * 0.2);
  return finishBow(new THREE.Vector3(st.x, y, z), u, ship, style, st);
}

/** Raked stem: the deck overhangs the forefoot. */
function finishBow(p, u, ship, style, st) {
  if (u < 0.24) {
    const stem = 1 - u / 0.24;
    const span = Math.max(0.01, st.deckY - st.keelY);
    const height01 = THREE.MathUtils.clamp((p.y - st.keelY) / span, 0, 1);
    const rake = (style.bowRake ?? 0.06) * ship.length;
    p.x -= rake * stem * stem * Math.pow(height01, 1.1);
  }
  return p;
}

function buildHullGeometry(ship, style) {

  const stations = STATIONS;
  const segs = HALF_SECTIONS; // along half-section (keel→deck edge only for sides)

  // Full closed hull: port + starboard sides and deck.
  // We build both halves + bottom + transom-ish ends.
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Sample grid: u stations × s section points for starboard, then mirror
  // Section s from 0 (keel) to 1 (deck edge) for side shell only
  const sCount = segs + 1;
  const grid = [];

  for (let i = 0; i <= stations; i++) {
    const u = i / stations;
    const row = [];
    for (let j = 0; j <= segs; j++) {
      const s = (j / segs) * 0.72; // hull side only
      row.push(sectionPoint(u, s, ship, style));
    }
    grid.push(row);
  }

  function addVertex(p, u, s) {
    positions.push(p.x, p.y, p.z);
    uvs.push(u, s);
    normals.push(0, 0, 0); // filled later
    return positions.length / 3 - 1;
  }

  // Starboard indices grid
  const sb = [];
  for (let i = 0; i <= stations; i++) {
    sb[i] = [];
    for (let j = 0; j <= segs; j++) {
      const u = i / stations;
      const s = j / segs;
      sb[i][j] = addVertex(grid[i][j].clone(), u, s);
    }
  }

  // Port (mirror Z)
  const pt = [];
  for (let i = 0; i <= stations; i++) {
    pt[i] = [];
    for (let j = 0; j <= segs; j++) {
      const p = grid[i][j].clone();
      p.z *= -1;
      const u = i / stations;
      const s = j / segs;
      pt[i][j] = addVertex(p, u, s);
    }
  }

  function quad(a, b, c, d) {
    indices.push(a, b, c, a, c, d);
  }

  // Starboard faces
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < segs; j++) {
      quad(sb[i][j], sb[i + 1][j], sb[i + 1][j + 1], sb[i][j + 1]);
    }
  }
  // Port faces (winding flipped)
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < segs; j++) {
      quad(pt[i][j], pt[i][j + 1], pt[i + 1][j + 1], pt[i + 1][j]);
    }
  }

  // Close keel strip between port/starboard lowest points
  for (let i = 0; i < stations; i++) {
    quad(sb[i][0], pt[i][0], pt[i + 1][0], sb[i + 1][0]);
  }

  // Deck plate
  {
    const deckSb = [];
    const deckPt = [];
    for (let i = 0; i <= stations; i++) {
      const u = i / stations;
      const edge = sectionPoint(u, 0.72, ship, style);
      const center = sectionPoint(u, 1.0, ship, style);
      center.z = 0;
      deckSb[i] = addVertex(edge, u, 0.85);
      // intermediate camber point
      const mid = edge.clone().lerp(center, 0.5);
      mid.y = center.y;
      const midIdx = addVertex(mid, u, 0.92);
      const cIdx = addVertex(center, u, 1.0);
      const edgeP = edge.clone();
      edgeP.z *= -1;
      const midP = mid.clone();
      midP.z *= -1;
      deckPt[i] = {
        edge: addVertex(edgeP, u, 0.85),
        mid: addVertex(midP, u, 0.92),
        center: cIdx,
        midSb: midIdx,
      };
    }
    for (let i = 0; i < stations; i++) {
      const a = deckSb[i];
      const b = deckSb[i + 1];
      const am = deckPt[i].midSb;
      const bm = deckPt[i + 1].midSb;
      const ac = deckPt[i].center;
      const bc = deckPt[i + 1].center;
      quad(a, b, bm, am);
      quad(am, bm, bc, ac);
      const ae = deckPt[i].edge;
      const be = deckPt[i + 1].edge;
      const apm = deckPt[i].mid;
      const bpm = deckPt[i + 1].mid;
      quad(ae, apm, bpm, be);
      quad(apm, ac, bc, bpm);
    }
  }

  // Stern cap. The bow closes at its zero-breadth stem station; a fan there
  // would flatten the cutwater into a spoon.
  {
    const i = stations;
    const keel = sb[i][0];
    for (let j = 0; j < segs; j++) {
      indices.push(keel, sb[i][j], sb[i][j + 1]);
      indices.push(keel, pt[i][j + 1], pt[i][j]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildDeck(ship, style, mat) {
  // Teak overlay that follows the hull plan, including the fine raked bow.
  const steps = 48;
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * 0.965;
    const edge = sectionPoint(u, 0.72, ship, style);
    const center = sectionPoint(u, 1, ship, style);
    const y = Math.max(edge.y, center.y) + 0.025;
    const z = edge.z * 0.98;
    if (i === 0) {
      const stem = positions.length / 3;
      positions.push(edge.x, y, 0);
      uvs.push(edge.x / 2.4, 0);
      rows.push([stem, stem]);
    } else {
      const starboard = positions.length / 3;
      positions.push(edge.x, y, z, edge.x, y, -z);
      uvs.push(edge.x / 2.4, z / 1.2, edge.x / 2.4, -z / 1.2);
      rows.push([starboard, starboard + 1]);
    }
  }
  for (let i = 0; i < steps; i++) {
    const [a, b] = rows[i];
    const [c, d] = rows[i + 1];
    if (a === b) indices.push(a, c, d);
    else indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "deck-overlay";
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.sliceHull = true;
  return mesh;
}

/** Shrink [x0, x1] until the hull is at least halfBeam wide at both ends. */
function fitToHull(x0, x1, halfBeam, ship, style) {
  const L = ship.length;
  const wide = (x) => stationShape(x / L + 0.5, ship, style).deckHalf >= halfBeam;
  const step = L * 0.005;
  while (x0 < x1 && !wide(x0)) x0 += step;
  while (x1 > x0 && !wide(x1)) x1 -= step;
  return [x0, x1];
}

const BAY = 0.34;

function buildSuperstructure(root, ship, style, mats) {
  const L = ship.length;
  const B = ship.beam;
  const deckY = stationShape(0.5, ship, style).deckY;
  const superLen = L * style.superLen;
  const baseX = L * style.superOffset;
  const decks = style.decks;
  const deckH = ship.height * 0.16;
  const breakX = L * BREAK_FRACTION;
  const faces = [
    mats.superstructure, mats.superstructure,
    mats.deck, mats.paint,
    mats.superstructure, mats.superstructure,
  ];

  const addBlock = (x0, x1, y, h, beam) => {
    const pieces = x0 < breakX && x1 > breakX ? [[x0, breakX], [breakX, x1]] : [[x0, x1]];
    for (const [a, b] of pieces) {
      const block = new THREE.Mesh(
        worldUVBox(b - a, h, beam, BAY * BAYS, deckH, 2.4),
        faces
      );
      block.position.set((a + b) / 2, y, 0);
      block.castShadow = true;
      block.receiveShadow = true;
      root.add(block);
    }
  };

  let topBeam = B;
  let topRange = [0, 0];
  for (let d = 0; d < decks; d++) {
    const shrink = 1 - d * 0.07;
    const len = superLen * shrink;
    const beam = B * (0.9 - d * 0.08);
    const cx = baseX + d * L * 0.012;
    const y = deckY + deckH * 0.5 + d * deckH;
    const [x0, x1] = fitToHull(cx - len / 2, cx + len / 2, beam / 2, ship, style);
    addBlock(x0, x1, y, deckH, beam);
    topBeam = beam;
    topRange = [x0, x1];
  }

  // Wheelhouse and bridge wings at the forward end of the top deck
  const bridgeH = ship.height * 0.13;
  const bridgeY = deckY + decks * deckH + bridgeH * 0.5;
  const bx0 = topRange[0] + L * 0.01;
  addBlock(bx0, bx0 + L * 0.045, bridgeY, bridgeH, topBeam * 0.55);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(L * 0.018, bridgeH * 0.2, B * 0.2), mats.paint);
    wing.position.set(bx0 + L * 0.01, bridgeY - bridgeH * 0.25, side * (topBeam * 0.275 + B * 0.1));
    wing.castShadow = true;
    root.add(wing);
  }
  root.userData.boatDeck = { y: deckY + decks * deckH, beam: topBeam, x0: topRange[0], x1: topRange[1] };
}

function buildFunnels(root, ship, style, mats) {
  const n = ship.funnels;
  const L = ship.length;
  const B = ship.beam;
  const H = ship.height;
  const deckY = stationShape(0.5, ship, style).deckY;
  const topBase = deckY + style.decks * H * 0.16 - 0.02;
  const boatBeam = B * (0.9 - (style.decks - 1) * 0.08);

  const start = L * style.funnelStart;
  const span = L * style.funnelSpread;

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const rBot = B * (n >= 3 ? 0.11 : 0.13);
    root.add(
      makeFunnel(ship, style, mats, {
        x: start + t * span,
        y: topBase,
        h: H * (n === 1 ? 0.72 : 0.64),
        rBot,
        index: i,
        stayBeam: boatBeam,
        pipes: true,
      })
    );
  }
}

/**
 * One funnel as a group named "funnel" (smoke source, and it can fall).
 * Local +Y is the funnel axis; userData.topY is its mouth.
 */
function makeFunnel(ship, style, mats, { x, y, z = 0, h, rBot, rTop = rBot * 0.95, index = 0, stayBeam = 0, pipes = false, rake = style.funnelRake, ell = style.funnelEllipse, cap = 0.15 }) {
  const stack = new THREE.Group();
  stack.name = "funnel";
  stack.position.set(x, y, z);
  stack.rotation.z = -rake;
  stack.userData.topY = h * 1.02;
  stack.userData.stackIndex = index;
  stack.userData.dummy = Boolean(ship.dummyFunnels?.includes(index));

  const add = (geo, mat, y, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.scale.z = ell;
    m.castShadow = shadow;
    stack.add(m);
    return m;
  };

  add(new THREE.CylinderGeometry(rTop, rBot, h, 40, 1, true), mats.funnel, h / 2);
  add(new THREE.CylinderGeometry(rBot * 1.06, rBot * 1.1, h * 0.05, 40), mats.funnel, h * 0.025);
  add(new THREE.CylinderGeometry(rTop * 1.008, rTop * 1.012, h * cap, 40, 1, true), mats.black, h * (1 - cap / 2));
  // Rolled rim and a dark throat so the open top reads from above
  const rim = add(new THREE.TorusGeometry(rTop * 1.005, Math.min(0.018, rTop * 0.08), 8, 40), mats.black, h, false);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, ell, 1);
  const throat = add(new THREE.CircleGeometry(rTop * 0.98, 40), mats.black, h * 0.93, false);
  throat.rotation.x = -Math.PI / 2;
  throat.scale.set(1, ell, 1);

  for (const frac of ship.funnelBands ?? []) {
    add(new THREE.CylinderGeometry(rTop * 1.01, rTop * 1.01, h * 0.025, 40, 1, true), mats.black, h * frac, false);
  }
  (ship.funnelBandColors ?? []).forEach((color, k) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
    add(new THREE.CylinderGeometry(rTop * 1.01, rTop * 1.01, h * 0.05, 40, 1, true), mat, h * (0.82 - k * 0.05), false);
  });

  if (pipes) {
    // Steam and whistle pipes on the forward face
    for (const dz of [-0.35, 0.35]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, h * 1.02, 6), mats.funnel);
      pipe.position.set(-rBot * 1.02, h * 0.51, dz * rBot * ell);
      pipe.castShadow = true;
      stack.add(pipe);
    }
  }

  if (stayBeam > 0) {
    // Guy wires to the deck (they go with the funnel if it falls)
    const stays = [];
    for (const side of [-1, 1]) {
      for (const dx of [-0.6, 0.6]) {
        stays.push(0, h * 0.78, side * rTop * ell, dx, -0.02, side * stayBeam * 0.45);
      }
    }
    const stayGeo = new THREE.BufferGeometry();
    stayGeo.setAttribute("position", new THREE.Float32BufferAttribute(stays, 3));
    stack.add(new THREE.LineSegments(stayGeo, mats.rope));
  }
  return stack;
}

/** Hull helpers the warship builders share with the liners. */
function warshipKit(ship, style, mats) {
  const L = ship.length;
  const breakX = L * BREAK_FRACTION;
  return {
    breakX,
    station: (u) => stationShape(u, ship, style),
    section: (u, s) => sectionPoint(u, s, ship, style),
    /** Top of the teak/steel deck overlay at station u. */
    deckAt: (u) => stationShape(u, ship, style).deckY + 0.025,
    fitToHull: (x0, x1, halfBeam) => fitToHull(x0, x1, halfBeam, ship, style),
    worldUVBox,
    transformed,
    mergedMesh,
    makeFunnel: (opts) => makeFunnel(ship, style, mats, opts),
    /**
     * Box from x0 to x1 centred at (y, z), cut in two at the break so each
     * half of a broken ship keeps its own piece. `faces` is one material or
     * the six BoxGeometry face materials; UVs are in world units.
     */
    block(parent, x0, x1, y, h, width, faces, { z = 0, uTile = BAY * BAYS, vTile = h, topTile = 2.4, shadow = true } = {}) {
      const pieces = x0 < breakX && x1 > breakX ? [[x0, breakX], [breakX, x1]] : [[x0, x1]];
      const out = [];
      for (const [a, b] of pieces) {
        const m = new THREE.Mesh(worldUVBox(b - a, h, width, uTile, vTile, topTile), faces);
        m.position.set((a + b) / 2, y, z);
        m.castShadow = shadow;
        m.receiveShadow = true;
        parent.add(m);
        out.push(m);
      }
      return out;
    },
  };
}

function buildMasts(root, ship, style, mats) {
  const L = ship.length;
  const H = ship.height;
  const xs =
    ship.funnels >= 3
      ? [-L * 0.32, L * 0.3]
      : ship.funnels === 1
        ? [-L * 0.22, L * 0.28]
        : [-L * 0.28, L * 0.32];
  const rake = style.funnelRake * 0.8;
  const tops = [];

  xs.forEach((mx, k) => {
    const st = stationShape(mx / L + 0.5, ship, style);
    const h = H * 1.25;
    const mast = new THREE.Group();
    mast.position.set(mx, st.deckY, 0);
    mast.rotation.z = -rake;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, h, 10), mats.mast);
    pole.position.y = h / 2;
    pole.castShadow = true;
    mast.add(pole);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, H * 0.4, 6), mats.black);
    yard.rotation.x = Math.PI / 2;
    yard.position.y = h * 0.72;
    mast.add(yard);
    if (k === 0) {
      const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 12), mats.black);
      nest.position.y = h * 0.55;
      nest.castShadow = true;
      mast.add(nest);
    }
    root.add(mast);
    tops.push({
      x: mx + Math.sin(rake) * h,
      y: st.deckY + Math.cos(rake) * h,
      mx,
      base: st,
    });
  });

  // Rigging: forestay, backstay, shrouds, and the wireless aerial between mastheads
  const seg = [];
  const line = (a, b) => seg.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const stem = sectionPoint(0.004, 1, ship, style);
  const stern = stationShape(0.99, ship, style);
  const [fore, main] = tops;
  line([stem.x + 0.05, stem.y + 0.1, 0], [fore.x, fore.y, 0]);
  line([stern.x, stern.deckY + 0.1, 0], [main.x, main.y, 0]);
  for (const dz of [-0.08, 0.08]) line([fore.x, fore.y - 0.05, dz], [main.x, main.y - 0.05, dz]);
  for (const t of tops) {
    for (const side of [-1, 1]) {
      for (const dx of [-0.35, 0, 0.35]) {
        line([t.x, t.y * 0.97, 0], [t.mx + dx, t.base.deckY + 0.02, side * t.base.deckHalf * 0.94]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
  const rigging = new THREE.LineSegments(geo, mats.rope);
  rigging.name = "rigging";
  root.add(rigging);
}

function transformed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
  return geo.applyMatrix4(m);
}

function mergedMesh(list, mat, { shadow = true } = {}) {
  if (!list.length) return null;
  const geo = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.userData.sliceHull = true;
  return mesh;
}

function buildLifeboats(root, ship, style, mats) {
  const L = ship.length;
  const deck = root.userData.boatDeck;
  if (!deck) return;
  const boatLen = THREE.MathUtils.clamp(L * 0.03, 0.3, 0.8);
  const r = boatLen * 0.13;
  const perSide = THREE.MathUtils.clamp(Math.round(L * 0.3), 3, 9);
  const x0 = deck.x0 + L * 0.07;
  const x1 = deck.x1 - L * 0.03;
  const funnelXs = [];
  root.traverse((o) => {
    if (o.name === "funnel") funnelXs.push(o.position.x);
  });

  const hulls = [];
  const covers = [];
  const davits = [];
  for (let i = 0; i < perSide; i++) {
    const x = x0 + ((i + 0.5) / perSide) * (x1 - x0);
    for (const side of [-1, 1]) {
      const zb = side * (deck.beam / 2 + r * 0.6);
      const y = deck.y + r * 1.6;
      hulls.push(transformed(new THREE.CapsuleGeometry(r, boatLen - 2 * r, 4, 12), x, y, zb, 0, 0, Math.PI / 2, 1, 1, 0.62));
      covers.push(transformed(new THREE.CapsuleGeometry(r * 0.82, boatLen - 2 * r, 4, 10), x, y + r * 0.35, zb, 0, 0, Math.PI / 2, 0.55, 1, 0.55));
      for (const end of [-1, 1]) {
        const dx = x + end * boatLen * 0.42;
        const zPost = side * (deck.beam / 2 - 0.04);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dx, deck.y, zPost),
          new THREE.Vector3(dx, deck.y + r * 3.2, zPost),
          new THREE.Vector3(dx, deck.y + r * 4.2, zPost + side * r * 1.2),
          new THREE.Vector3(dx, deck.y + r * 3.4, zb),
        ]);
        davits.push(new THREE.TubeGeometry(curve, 10, 0.012, 5, false));
      }
    }
  }
  for (const m of [
    mergedMesh(hulls, mats.boatHull),
    mergedMesh(covers, mats.canvas),
    mergedMesh(davits, mats.black),
  ]) {
    if (m) root.add(m);
  }
}

function buildRailings(root, ship, style, mats) {
  const posts = 64;
  const parts = [];
  const stations = [];
  for (let i = 0; i <= posts; i++) {
    const u = 0.02 + (i / posts) * 0.97;
    const st = stationShape(u, ship, style);
    const edge = sectionPoint(u, 0.72, ship, style);
    stations.push({ x: edge.x, y: st.deckY, z: edge.z * 0.97, ok: edge.z > 0.04 });
  }
  const railH = 0.11;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (!s.ok) continue;
    for (const side of [-1, 1]) {
      parts.push(new THREE.CylinderGeometry(0.008, 0.008, railH, 4).translate(s.x, s.y + railH / 2, side * s.z));
    }
    const n = stations[i + 1];
    if (!n || !n.ok) continue;
    for (const side of [-1, 1]) {
      for (const hy of [railH, railH * 0.5]) {
        const a = new THREE.Vector3(s.x, s.y + hy, side * s.z);
        const b = new THREE.Vector3(n.x, n.y + hy, side * n.z);
        const len = a.distanceTo(b);
        const rail = new THREE.CylinderGeometry(hy === railH ? 0.012 : 0.006, hy === railH ? 0.012 : 0.006, len, 4, 1, true);
        rail.rotateZ(Math.PI / 2);
        const dir = b.clone().sub(a).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        rail.applyQuaternion(q);
        rail.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        parts.push(rail);
      }
    }
  }
  const mesh = mergedMesh(parts, mats.paint, { shadow: false });
  if (mesh) root.add(mesh);
}

function buildSternGear(root, ship, style, mats) {
  const L = ship.length;
  const draft = ship.draft;
  // Rudder
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.28, draft * 0.62, 0.05), mats.hull);
  rudder.geometry.translate(0.14, 0, 0);
  rudder.position.set(L * 0.475, -draft * 0.42, 0);
  rudder.name = "rudder";
  root.add(rudder);

  // Wing screws, plus a centre screw or an inner pair, bronze, three blades each
  const count = ship.screws ?? (ship.length > 20 ? 3 : 2);
  const screws = [
    [L * 0.44, -draft * 0.58, ship.beam * 0.24],
    [L * 0.44, -draft * 0.58, -ship.beam * 0.24],
  ];
  if (count === 3) screws.push([L * 0.465, -draft * 0.6, 0]);
  if (count >= 4) {
    screws.push([L * 0.4, -draft * 0.68, ship.beam * 0.11], [L * 0.4, -draft * 0.68, -ship.beam * 0.11]);
  }
  const blade = Math.min(1, ship.beam / 1.4);
  const bladeGeo = new THREE.SphereGeometry(0.1, 10, 8);
  for (const [x, y, z] of screws) {
    const screw = new THREE.Group();
    screw.position.set(x, y, z);
    screw.scale.setScalar(blade);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mats.bronze);
    hub.scale.set(1.6, 1, 1);
    screw.add(hub);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(bladeGeo, mats.bronze);
      const ang = (b / 3) * Math.PI * 2;
      blade.scale.set(0.25, 1.1, 0.6);
      blade.position.set(0, Math.cos(ang) * 0.1, Math.sin(ang) * 0.1);
      blade.rotation.set(ang, 0.5, 0);
      screw.add(blade);
    }
    screw.name = "screw";
    root.add(screw);
  }
}

function buildWaterVolumes(ship, mat) {
  const volumes = [];
  const n = ship.compartments;
  const L = ship.length;
  const B = ship.beam;
  const draft = ship.draft;
  const freeboard = ship.height * 0.35;
  const compLen = (L * 0.86) / n;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.BoxGeometry(
      compLen * 0.9,
      draft + freeboard * 0.5,
      B * 0.75
    );
    const mesh = new THREE.Mesh(geo, mat.clone());
    const along = (i + 0.5) / n;
    mesh.position.set((along - 0.5) * L * 0.86, -draft * 0.2, 0);
    mesh.scale.y = 0.001;
    mesh.visible = false;
    mesh.userData.isFlood = true;
    mesh.userData.compartment = i;
    volumes.push(mesh);
  }
  return volumes;
}

export function updateShipFloodVisuals(root, state) {
  const volumes = root.userData.waterVolumes;
  if (!volumes || !state) return;
  const draft = state.ship.draft;
  const freeboard = state.ship.height * 0.35;
  const fullH = draft + freeboard * 0.5;

  // Once the hull is open to the sea or under it, there is no separate
  // "inside water" to show.
  const drowned = state.broken || state.position.y < -state.ship.height * 0.35;

  for (let i = 0; i < volumes.length; i++) {
    const mesh = volumes[i];
    const ci = mesh.userData.compartment ?? i;
    const fill = state.compartments[ci]?.fill ?? 0;
    if (fill < 0.01 || drowned) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.scale.y = Math.max(0.02, fill);
    // Water rises from bilge toward deck
    const h = fill * fullH;
    mesh.position.y = -draft + h * 0.5;
    mesh.material.opacity = 0.35 + fill * 0.4;
  }
}

function jaggedShape(w, h, seed, points = 18) {
  const shape = new THREE.Shape();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 0.6 + rnd() * 0.55;
    const x = Math.cos(a) * w * 0.5 * k;
    const y = Math.sin(a) * h * 0.5 * k;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/** Point on the hull surface at station u, height y, on the given side. */
function hullSurface(u, y, side, ship, style) {
  const st = stationShape(u, ship, style);
  const t = THREE.MathUtils.clamp((y - st.keelY) / (st.deckY - st.keelY), 0, 1);
  const p = sectionPoint(u, t * 0.72, ship, style);
  p.z *= side;
  return p;
}

export function applyDamageVisuals(root, disaster, ship) {
  const group = root.userData.damageGroup;
  const style = shipStyle(ship);
  while (group.children.length) {
    const c = group.children.pop();
    c.geometry?.dispose?.();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose?.();
    }
  }

  const hole = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.95,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  const torn = new THREE.MeshStandardMaterial({
    color: 0x3a2a20,
    roughness: 0.7,
    metalness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  });

  disaster.breaches.forEach((b, k) => {
    const u = THREE.MathUtils.clamp(b.along, 0.04, 0.96);
    const y = -ship.draft * (disaster.gash ? 0.35 : 0.45);
    if (!b.side) {
      // Internal blast: no hull opening, just the origin for fire and smoke.
      const marker = new THREE.Object3D();
      marker.name = "breach";
      marker.position.set((u - 0.5) * ship.length, ship.height * 0.1, 0);
      group.add(marker);
      return;
    }
    const p = hullSurface(u, y, b.side, ship, style);
    const w = disaster.gash ? ship.length * 0.075 : 0.35 + b.size * 0.35;
    const h = disaster.gash ? ship.draft * 0.12 : 0.28 + b.size * 0.25;
    const holder = new THREE.Group();
    holder.name = "breach";
    holder.position.set(p.x, p.y, p.z + b.side * 0.012);
    holder.rotation.y = b.side > 0 ? 0 : Math.PI;
    const rim = new THREE.Mesh(new THREE.ShapeGeometry(jaggedShape(w * 1.25, h * 1.35, 97 + k * 31, 26)), torn);
    const gap = new THREE.Mesh(new THREE.ShapeGeometry(jaggedShape(w, h, 13 + k * 17, 22)), hole);
    gap.position.z = 0.004;
    holder.add(rim, gap);
    group.add(holder);
  });
}

export function updateDamageEffects() {
  // Blast visuals (fireball, light, spray) are particles in effects.js.
}

/**
 * Cut the ship into a bow half and a stern half in local ship space.
 * Each half owns its own geometries so the pieces can separate.
 */
export function splitShip(root) {
  const ship = root.userData.ship;
  const breakX = ship.length * BREAK_FRACTION;
  const bow = filterHalf(root, (x) => x <= breakX + 0.05, breakX, (x) => x <= breakX);
  const stern = filterHalf(root, (x) => x >= breakX - 0.05, breakX, (x) => x > breakX);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x1c140f,
    roughness: 0.92,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });
  // Torn bulkhead face: a ragged outline instead of a clean slab
  const style = shipStyle(ship);
  const st = stationShape(0.5 + BREAK_FRACTION, ship, style);
  const outline = new THREE.Shape();
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = sectionPoint(0.5 + BREAK_FRACTION, t * 0.72, ship, style);
    const jag = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    if (i === 0) outline.moveTo(p.z * 0.98, p.y);
    else outline.lineTo(p.z * 0.98 - Math.abs(jag) * 0.08, p.y);
  }
  outline.lineTo(0, st.deckY + ship.height * 0.3);
  for (let i = steps; i >= 0; i--) {
    const p = sectionPoint(0.5 + BREAK_FRACTION, (i / steps) * 0.72, ship, style);
    outline.lineTo(-p.z * 0.98, p.y);
  }
  const capGeo = new THREE.ShapeGeometry(outline);
  capGeo.rotateY(Math.PI / 2);
  for (const half of [bow, stern]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(breakX, 0, 0);
    cap.castShadow = true;
    half.add(cap);
  }
  return { bow, stern, breakX };
}

function cloneMaterial(m) {
  const c = m.clone();
  if (m.hullUniforms) {
    c.hullUniforms = m.hullUniforms;
    c.onBeforeCompile = m.onBeforeCompile;
    c.customProgramCacheKey = m.customProgramCacheKey;
  }
  return c;
}

function filterHalf(root, keepX, breakX, keepWholeX) {
  const saved = root.userData;
  root.userData = {};
  const clone = root.clone(true);
  root.userData = saved;
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.quaternion.identity();
  clone.scale.set(1, 1, 1);
  clone.updateMatrixWorld(true);

  const toRoot = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const drop = [];
  const inverseRoot = new THREE.Matrix4().copy(clone.matrixWorld).invert();

  // Turrets, towers and islands go to one half whole, by where they stand.
  const whole = new Set();
  const wholeGroups = [];
  clone.traverse((obj) => {
    if (obj !== clone && obj.userData.keepWhole) wholeGroups.push(obj);
  });
  for (const g of wholeGroups) {
    if (!keepWholeX(g.getWorldPosition(p).applyMatrix4(inverseRoot).x)) {
      g.parent?.remove(g);
      continue;
    }
    g.traverse((o) => whole.add(o));
  }

  clone.traverse((obj) => {
    if (whole.has(obj)) {
      if (obj.isMesh) {
        obj.geometry = obj.geometry.clone();
        obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMaterial) : cloneMaterial(obj.material);
      }
      return;
    }
    // Rigging parts when the hull does; funnel stays go with their funnel.
    if (obj.isLine) {
      if (obj.name === "rigging") drop.push(obj);
      else if (!keepX(obj.getWorldPosition(p).applyMatrix4(toRoot.copy(clone.matrixWorld).invert()).x)) drop.push(obj);
      return;
    }
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    obj.geometry = obj.geometry.clone();
    if (Array.isArray(obj.material)) obj.material = obj.material.map(cloneMaterial);
    else if (obj.material) obj.material = cloneMaterial(obj.material);
    const geo = obj.geometry;
    const pos = geo.attributes.position;
    const index = geo.index;
    toRoot.copy(clone.matrixWorld).invert().multiply(obj.matrixWorld);

    let minX = Infinity;
    let maxX = -Infinity;
    const rootXAt = (idx) => {
      p.fromBufferAttribute(pos, idx).applyMatrix4(toRoot);
      return p.x;
    };
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 24))) {
      const x = rootXAt(i);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }

    const spans = minX < breakX - 0.2 && maxX > breakX + 0.2;
    if (!spans || !obj.userData.sliceHull) {
      const mid = (minX + maxX) / 2;
      if (!keepX(mid)) drop.push(obj);
      return;
    }

    // Keep whole triangles on this side, with every attribute (uv, normal…)
    const triCount = index ? index.count / 3 : pos.count / 3;
    const keep = [];
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const mid = (rootXAt(a) + rootXAt(b) + rootXAt(c)) / 3;
      if (keepX(mid)) keep.push(a, b, c);
    }
    const sliced = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) {
      const size = attr.itemSize;
      const out = new Float32Array(keep.length * size);
      for (let i = 0; i < keep.length; i++) {
        for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(keep[i], k);
      }
      sliced.setAttribute(name, new THREE.BufferAttribute(out, size));
    }
    if (!sliced.attributes.normal) sliced.computeVertexNormals();
    geo.dispose();
    obj.geometry = sliced;
  });

  for (const obj of drop) {
    obj.geometry?.dispose();
    if (obj.material && obj.isMesh) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
    obj.parent?.remove(obj);
  }

  // Funnels, screws and breach markers are groups: keep each on one side only.
  const inverse = new THREE.Matrix4().copy(clone.matrixWorld).invert();
  const groups = [];
  clone.traverse((obj) => {
    if (obj !== clone && ["funnel", "screw", "breach"].includes(obj.name)) groups.push(obj);
  });
  for (const g of groups) {
    let meshes = 0;
    g.traverse((o) => {
      if (o.isMesh) meshes++;
    });
    const x = g.getWorldPosition(p).applyMatrix4(inverse).x;
    if ((g.children.length && meshes === 0) || (!g.children.length && !keepX(x))) g.parent?.remove(g);
  }

  const volumes = [];
  clone.traverse((obj) => {
    if (obj.userData?.isFlood) volumes.push(obj);
  });
  volumes.sort((a, b) => a.userData.compartment - b.userData.compartment);
  clone.userData = {
    ...root.userData,
    waterVolumes: volumes,
    ship: root.userData.ship,
  };
  return clone;
}
