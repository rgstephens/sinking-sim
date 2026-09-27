import * as THREE from "three";

/**
 * High-detail procedural ocean liners.
 * Hull is a lofted station mesh (bow → stern) with ship-specific profiles,
 * multi-deck superstructure, portholes, lifeboats, funnels, masts, rails.
 */

const STATIONS = 72;
const HALF_SECTIONS = 20; // points around half-breadth (keel → deck → centerline)

export function buildShipMesh(ship) {
  const root = new THREE.Group();
  root.name = ship.id;

  const L = ship.length;
  const B = ship.beam;
  const H = ship.height;
  const draft = ship.draft;
  const style = shipStyle(ship);

  const mats = makeMaterials(ship);

  // --- Hull (high-res loft) ---
  const hullGeo = buildHullGeometry(ship, style);
  const hull = new THREE.Mesh(hullGeo, mats.hull);
  hull.castShadow = true;
  hull.receiveShadow = true;
  hull.userData.sliceHull = true;
  root.add(hull);

  // Red anti-fouling below waterline (slightly expanded shell)
  const antifoulGeo = buildHullGeometry(ship, style, {
    onlyBelowWaterline: true,
    inflate: 0.012,
  });
  const antifoul = new THREE.Mesh(antifoulGeo, mats.antifoul);
  antifoul.castShadow = false;
  antifoul.receiveShadow = true;
  antifoul.userData.sliceHull = true;
  root.add(antifoul);

  // White boot-top stripe at waterline
  const boot = buildBootStripe(ship, style, mats.boot);
  if (boot) root.add(boot);

  // Deck surface
  const deck = buildDeck(ship, style, mats.deck);
  root.add(deck);

  // Superstructure blocks (multi-deck)
  buildSuperstructure(root, ship, style, mats);

  // Funnels
  buildFunnels(root, ship, style, mats);

  // Masts + rigging stubs
  buildMasts(root, ship, style, mats);

  // Portholes / window rows
  buildPortholes(root, ship, style, mats);

  // Lifeboats along boat deck
  buildLifeboats(root, ship, style, mats);

  // Railings
  buildRailings(root, ship, style, mats);

  // Propellers / rudder under stern
  buildSternGear(root, ship, style, mats);

  // Internal flood volumes
  const waterVolumes = buildWaterVolumes(ship, mats.waterInside);
  for (const w of waterVolumes) root.add(w);

  const damageGroup = new THREE.Group();
  damageGroup.name = "damage";
  root.add(damageGroup);

  // Place so design waterline is at y=0 (draft below, freeboard above)
  // Hull geometry is built with y=0 at waterline already.
  root.position.y = 0;

  root.userData = {
    ship,
    waterVolumes,
    damageGroup,
    mats,
  };

  return root;
}

function shipStyle(ship) {
  // Per-ship silhouette knobs
  const map = {
    titanic: {
      bowFine: 0.94,
      bowRake: 0.062,
      sternFine: 0.55,
      sheer: 0.08,
      camber: 0.04,
      flare: 0.35,
      funnelSpread: 0.32,
      funnelStart: -0.06,
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
      superLen: 0.52,
      superOffset: 0.0,
      decks: 2,
      boatDeckY: 0.65,
      bowType: "edwardian",
      portholeRows: 2,
    },
  };
  return map[ship.id] ?? map.titanic;
}

function makeMaterials(ship) {
  const hull = new THREE.MeshStandardMaterial({
    color: ship.hullColor,
    roughness: 0.62,
    metalness: 0.28,
    flatShading: false,
  });
  const antifoul = new THREE.MeshStandardMaterial({
    color: 0x8a1f1c,
    roughness: 0.78,
    metalness: 0.12,
    flatShading: false,
  });
  const boot = new THREE.MeshStandardMaterial({
    color: 0xf2f0ea,
    roughness: 0.55,
    metalness: 0.1,
  });
  const deck = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    roughness: 0.88,
    metalness: 0.05,
  });
  const superstructure = new THREE.MeshStandardMaterial({
    color: ship.superstructureColor,
    roughness: 0.48,
    metalness: 0.08,
  });
  const funnel = new THREE.MeshStandardMaterial({
    color: ship.funnelColor,
    roughness: 0.45,
    metalness: 0.22,
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.7,
    metalness: 0.25,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x6a727a,
    roughness: 0.4,
    metalness: 0.65,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x6ec0e0,
    roughness: 0.15,
    metalness: 0.55,
    emissive: 0x0a3048,
    emissiveIntensity: 0.35,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x5c3a21,
    roughness: 0.85,
    metalness: 0.05,
  });
  const canvas = new THREE.MeshStandardMaterial({
    color: 0xd9d2c5,
    roughness: 0.9,
    metalness: 0.0,
  });
  const waterInside = new THREE.MeshStandardMaterial({
    color: 0x1a4a6e,
    transparent: true,
    opacity: 0.55,
    roughness: 0.2,
    metalness: 0.1,
    depthWrite: false,
  });
  return {
    hull,
    antifoul,
    boot,
    deck,
    superstructure,
    funnel,
    black,
    metal,
    glass,
    wood,
    canvas,
    waterInside,
  };
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
    // Hollow entrance: a sharp stem, not a spoon bow
    const t = u / 0.2;
    const pow = 1.45 + style.bowFine * 1.05;
    beamScale = Math.pow(t, pow) * (0.9 + 0.1 * t);
  } else if (u > 0.82) {
    // stern run
    const t = (1 - u) / 0.18;
    beamScale = Math.pow(Math.max(0, t), 0.7) * mid * (0.75 + style.sternFine * 0.25);
  } else {
    beamScale = mid;
  }

  // Sheer (deck rises toward ends), with a raised forecastle at the bow
  let sheerY =
    style.sheer * ship.height * (Math.pow(Math.abs(u - 0.5) * 2, 2));
  if (u < 0.2) sheerY += ship.height * 0.07 * Math.pow(1 - u / 0.2, 1.35);

  // Keel depth slightly less at ends
  const keelDepth = draft * (0.75 + 0.25 * Math.sin(Math.PI * u));

  // Deck half-breadth
  const deckHalf = (B * 0.5) * beamScale;

  return {
    x,
    keelY: -keelDepth,
    deckY: freeboard * 0.55 + sheerY,
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
    // Rounded bilge profile
    const bilge = Math.pow(Math.sin((t * Math.PI) / 2), 0.85);
    const z = st.deckHalf * bilge;
    // y: keel to deck with slight tumblehome near top
    const y = THREE.MathUtils.lerp(st.keelY, st.deckY, t);
    // Flare above the waterline, strongest just aft of the stem
    const above = Math.max(0, y);
    let flareAmt = style.flare * 0.22 * (above / Math.max(0.01, st.deckY));
    if (u < 0.18) flareAmt += style.flare * 0.95 * (1 - u / 0.18) * (above / Math.max(0.01, st.deckY));
    const flareZ = z * (1 + flareAmt);
    // Cutwater: the stem itself is a line, the forefoot is even finer
    let pinch = 1;
    if (u < 0.14) {
      pinch = Math.pow(u / 0.14, 0.85);
      if (t < 0.4) pinch *= 0.25 + 0.75 * (t / 0.4);
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

/** Raked stem: the deck overhangs the forefoot. The tip itself has no breadth. */
function finishBow(p, u, ship, style, st) {
  if (u < 0.24) {
    const stem = 1 - u / 0.24;
    const span = Math.max(0.01, st.deckY - st.keelY);
    const height01 = THREE.MathUtils.clamp((p.y - st.keelY) / span, 0, 1);
    const rake = (style.bowRake ?? 0.06) * ship.length;
    p.x -= rake * stem * stem * Math.pow(height01, 1.1);
  }
  if (u < 0.01) p.z = 0;
  return p;
}

function buildHullGeometry(ship, style, opts = {}) {
  const onlyBelow = opts.onlyBelowWaterline ?? false;
  const inflate = opts.inflate ?? 0;

  const stations = STATIONS;
  const segs = HALF_SECTIONS; // along half-section (keel→deck edge only for sides)

  // Full closed hull: port + starboard sides (no deck top for antifoul shell)
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
      const p = sectionPoint(u, s, ship, style);
      if (inflate) {
        // crude outward expand on Z and slight Y
        p.z += Math.sign(p.z || 1) * inflate;
        if (p.y < 0) p.y -= inflate * 0.3;
      }
      row.push(p);
    }
    grid.push(row);
  }

  function addVertex(p, u, s) {
    if (onlyBelow && p.y > 0.04) {
      // clamp to waterline for antifoul mesh
      positions.push(p.x, Math.min(p.y, 0.02), p.z);
    } else {
      positions.push(p.x, p.y, p.z);
    }
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

  // Deck plate (not for antifoul)
  if (!onlyBelow) {
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

  // Stern cap. The bow is already closed by the pinched stem — a fan
  // there flattens the cutwater into a spoon.
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

function buildBootStripe(ship, style, mat) {
  // Thin white boot-top near the waterline
  const stations = 48;
  const g = new THREE.Group();
  for (let i = 0; i < stations; i++) {
    const u0 = i / stations;
    const u1 = (i + 1) / stations;
    const a = stationShape(u0, ship, style);
    const b = stationShape(u1, ship, style);
    const len = Math.abs(b.x - a.x);
    const midX = (a.x + b.x) / 2;
    const half = (a.waterHalf + b.waterHalf) / 2;
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(len * 1.02, 0.09, 0.03),
        mat
      );
      m.position.set(midX, 0.01, side * half);
      g.add(m);
    }
  }
  return g;
}

function buildDeck(ship, style, mat) {
  // Teak overlay that follows the hull plan, including the fine raked bow.
  const steps = 48;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const u = 0.015 + (i / steps) * 0.95;
    const edge = sectionPoint(u, 0.72, ship, style);
    const center = sectionPoint(u, 1, ship, style);
    const y = Math.max(edge.y, center.y) + 0.025;
    positions.push(edge.x, y, edge.z * 0.98, edge.x, y, -edge.z * 0.98);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.sliceHull = true;
  return mesh;
}

function buildSuperstructure(root, ship, style, mats) {
  const L = ship.length;
  const B = ship.beam;
  const deckY = stationShape(0.5, ship, style).deckY;
  const superLen = L * style.superLen;
  const baseX = L * style.superOffset;
  const decks = style.decks;
  const deckH = ship.height * 0.16;

  for (let d = 0; d < decks; d++) {
    const shrink = 1 - d * 0.06;
    const len = superLen * shrink;
    const beam = B * (0.72 - d * 0.04);
    const y = deckY + deckH * 0.5 + d * deckH;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(len, deckH * 0.92, beam),
      mats.superstructure
    );
    block.position.set(baseX + d * L * 0.01, y, 0);
    block.castShadow = true;
    block.receiveShadow = true;
    root.add(block);

    // Window band per deck
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.94, deckH * 0.28, beam * 1.01),
      mats.glass
    );
    win.position.set(block.position.x, y - deckH * 0.05, 0);
    root.add(win);
  }

  // Bridge wing house
  const bridgeH = ship.height * 0.18;
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.09, bridgeH, B * 0.92),
    mats.superstructure
  );
  bridge.position.set(
    -L * 0.14,
    deckY + decks * deckH + bridgeH * 0.35,
    0
  );
  bridge.castShadow = true;
  root.add(bridge);

  // Bridge windows
  const bw = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.02, bridgeH * 0.4, B * 0.88),
    mats.glass
  );
  bw.position.set(bridge.position.x - L * 0.04, bridge.position.y, 0);
  root.add(bw);

  // Bridge wings
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.05, bridgeH * 0.35, B * 0.12),
      mats.superstructure
    );
    wing.position.set(
      bridge.position.x,
      bridge.position.y - bridgeH * 0.1,
      side * B * 0.48
    );
    root.add(wing);
  }
}

function buildFunnels(root, ship, style, mats) {
  const n = ship.funnels;
  const L = ship.length;
  const B = ship.beam;
  const H = ship.height;
  const deckY = stationShape(0.5, ship, style).deckY;
  const topBase = deckY + style.decks * H * 0.16 + H * 0.05;

  const start = L * style.funnelStart;
  const span = L * style.funnelSpread;

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const fx = start + t * span;
    const rBot = B * (n >= 3 ? 0.11 : 0.13);
    const rTop = rBot * 0.88;
    const h = H * (n === 1 ? 0.7 : 0.62);

    const stack = new THREE.Group();
    stack.name = "funnel";
    stack.position.set(fx, 0, 0);
    stack.userData.topY = topBase + h * 1.05;
    stack.userData.stackIndex = i;

    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 24, 1),
      mats.funnel
    );
    funnel.position.set(0, topBase + h * 0.5, 0);
    funnel.castShadow = true;
    stack.add(funnel);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop * 1.03, rTop * 1.03, h * 0.12, 24),
      mats.black
    );
    band.position.set(0, topBase + h * 0.92, 0);
    stack.add(band);

    const grate = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop * 0.7, rTop * 0.7, h * 0.04, 16),
      mats.black
    );
    grate.position.set(0, topBase + h * 1.02, 0);
    stack.add(grate);

    for (const side of [-1, 1]) {
      const stay = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, h * 0.85, 4),
        mats.metal
      );
      stay.position.set(0, topBase + h * 0.4, side * rBot * 1.6);
      stay.rotation.x = side * 0.25;
      stack.add(stay);
    }

    root.add(stack);
  }
}

function buildMasts(root, ship, style, mats) {
  const L = ship.length;
  const H = ship.height;
  const deckY = stationShape(0.5, ship, style).deckY;
  const positions =
    ship.funnels >= 3
      ? [-L * 0.32, L * 0.3]
      : ship.funnels === 1
        ? [-L * 0.22, L * 0.28]
        : [-L * 0.28, L * 0.32];

  for (const mx of positions) {
    const h = H * 1.15;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, h, 10),
      mats.black
    );
    mast.position.set(mx, deckY + h * 0.45, 0);
    mast.castShadow = true;
    root.add(mast);

    // Cross-tree
    const yard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, H * 0.35, 6),
      mats.black
    );
    yard.rotation.z = Math.PI / 2;
    yard.position.set(mx, deckY + h * 0.75, 0);
    root.add(yard);
  }
}

function buildPortholes(root, ship, style, mats) {
  const L = ship.length;
  const B = ship.beam;
  const rows = style.portholeRows;
  const freeboard = ship.height * 0.38;

  for (let row = 0; row < rows; row++) {
    const y = 0.12 + row * (freeboard * 0.28);
    const count = Math.floor(L * 1.6);
    for (let i = 0; i < count; i++) {
      const u = 0.1 + (i / (count - 1)) * 0.8;
      const st = stationShape(u, ship, style);
      // skip very fine bow where half-breadth tiny
      if (st.deckHalf < B * 0.15) continue;
      const r = 0.04 + ship.beam * 0.008;
      for (const side of [-1, 1]) {
        const hole = new THREE.Mesh(
          new THREE.CircleGeometry(r, 10),
          mats.glass
        );
        hole.position.set(st.x, y, side * (st.deckHalf * 0.97));
        hole.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        root.add(hole);
      }
    }
  }
}

function buildLifeboats(root, ship, style, mats) {
  const L = ship.length;
  const B = ship.beam;
  const deckY = stationShape(0.5, ship, style).deckY;
  const boatY = deckY + style.decks * ship.height * 0.16 + 0.08;
  const count = Math.max(4, Math.floor(L * 0.45));
  const span = L * style.superLen * 0.85;
  const start = -span * 0.4 + L * style.superOffset;

  for (let i = 0; i < count; i++) {
    const x = start + (i / Math.max(1, count - 1)) * span;
    for (const side of [-1, 1]) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.35, 4, 8),
        mats.wood
      );
      hull.rotation.z = Math.PI / 2;
      boat.add(hull);
      const cover = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.05, 0.28, 4, 8),
        mats.canvas
      );
      cover.rotation.z = Math.PI / 2;
      cover.position.y = 0.05;
      boat.add(cover);
      // davit
      const davit = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.015, 6, 12, Math.PI),
        mats.metal
      );
      davit.rotation.y = Math.PI / 2;
      davit.position.set(0, 0.1, 0);
      boat.add(davit);

      boat.position.set(x, boatY, side * B * 0.42);
      boat.scale.set(1.1, 1.1, 1.1);
      root.add(boat);
    }
  }
}

function buildRailings(root, ship, style, mats) {
  const L = ship.length;
  const deckY = stationShape(0.5, ship, style).deckY + 0.02;
  const posts = 40;
  for (let i = 0; i <= posts; i++) {
    const u = i / posts;
    const st = stationShape(u, ship, style);
    if (st.deckHalf < ship.beam * 0.12) continue;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5),
        mats.metal
      );
      post.position.set(st.x, deckY + 0.08, side * st.deckHalf * 0.98);
      root.add(post);
    }
  }
  // Top rail as thin boxes along sides
  for (let i = 0; i < posts; i++) {
    const u0 = i / posts;
    const u1 = (i + 1) / posts;
    const a = stationShape(u0, ship, style);
    const b = stationShape(u1, ship, style);
    if (a.deckHalf < ship.beam * 0.12 || b.deckHalf < ship.beam * 0.12) continue;
    const len = Math.hypot(b.x - a.x, b.deckHalf - a.deckHalf);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.02, 0.02),
        mats.metal
      );
      rail.position.set(
        (a.x + b.x) / 2,
        deckY + 0.16,
        side * (a.deckHalf + b.deckHalf) * 0.49
      );
      root.add(rail);
    }
  }
}

function buildSternGear(root, ship, style, mats) {
  const L = ship.length;
  const draft = ship.draft;
  // Rudder
  const rudder = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, draft * 0.55, 0.35),
    mats.metal
  );
  rudder.position.set(L * 0.48, -draft * 0.35, 0);
  rudder.name = "rudder";
  root.add(rudder);

  // Twin screws
  for (const side of [-1, 1]) {
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10),
      mats.metal
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(L * 0.45, -draft * 0.55, side * ship.beam * 0.22);
    root.add(hub);

    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.28, 0.1),
        mats.metal
      );
      blade.position.copy(hub.position);
      const ang = (b / 3) * Math.PI * 2;
      blade.rotation.x = ang;
      blade.position.y += Math.cos(ang) * 0.12;
      blade.position.z += Math.sin(ang) * 0.12;
      root.add(blade);
    }
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

  for (let i = 0; i < volumes.length; i++) {
    const mesh = volumes[i];
    const ci = mesh.userData.compartment ?? i;
    const fill = state.compartments[ci]?.fill ?? 0;
    if (fill < 0.01) {
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

export function applyDamageVisuals(root, disaster, ship) {
  const group = root.userData.damageGroup;
  while (group.children.length) {
    const c = group.children.pop();
    c.geometry?.dispose?.();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose?.();
    }
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    roughness: 0.92,
    metalness: 0.1,
  });
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff6622,
    emissive: 0xff3300,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.85,
  });

  for (const b of disaster.breaches) {
    const u = b.along;
    const st = stationShape(u, ship, shipStyle(ship));
    const x = st.x;
    const z = b.side * st.deckHalf * 0.95;
    const y = -ship.draft * 0.45;

    if (disaster.gash) {
      const gash = new THREE.Mesh(
        new THREE.BoxGeometry(ship.length * 0.07, ship.draft * 0.22, 0.06),
        mat
      );
      gash.position.set(x, y, z);
      group.add(gash);
    } else {
      const hole = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + b.size * 0.12, 14, 12),
        mat
      );
      hole.position.set(x, y, z * 0.92);
      hole.scale.set(1.2 + b.size * 0.3, 0.75, 0.55);
      group.add(hole);
    }
  }

  if (disaster.explosion) {
    const blast = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), fireMat);
    const mid = disaster.breaches[0]?.along ?? 0.5;
    blast.position.set((mid - 0.5) * ship.length * 0.5, ship.height * 0.25, 0);
    blast.name = "explosionFlash";
    group.add(blast);
  }
}

export function updateDamageEffects(root, state) {
  const flash = root.getObjectByName?.("explosionFlash");
  if (!flash) return;
  const f = state.explosionFlash;
  flash.visible = f > 0.02;
  flash.scale.setScalar(0.5 + (1 - f) * 2.5);
  flash.material.opacity = f;
  flash.material.emissiveIntensity = f * 2;
}

/**
 * Cut the ship into a bow half and a stern half in local ship space.
 * Each half owns its own geometries so the pieces can separate.
 */
export function splitShip(root) {
  const ship = root.userData.ship;
  const breakX = ship.length * 0.06;
  const bow = filterHalf(root, (x) => x <= breakX + 0.05, breakX);
  const stern = filterHalf(root, (x) => x >= breakX - 0.05, breakX);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x1c140f,
    roughness: 0.92,
    metalness: 0.18,
  });
  const capGeo = new THREE.BoxGeometry(0.18, ship.height * 0.95, ship.beam * 0.82);
  for (const half of [bow, stern]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(breakX, ship.height * 0.05, 0);
    cap.castShadow = true;
    half.add(cap);
  }
  return { bow, stern, breakX };
}

function filterHalf(root, keepX, breakX) {
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

  clone.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    obj.geometry = obj.geometry.clone();
    if (Array.isArray(obj.material)) obj.material = obj.material.map((m) => m.clone());
    else if (obj.material) obj.material = obj.material.clone();
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

    const triCount = index ? index.count / 3 : pos.count / 3;
    const next = [];
    const vert = (idx) => {
      next.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
    };
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const mid = (rootXAt(a) + rootXAt(b) + rootXAt(c)) / 3;
      if (!keepX(mid)) continue;
      vert(a);
      vert(b);
      vert(c);
    }
    const sliced = new THREE.BufferGeometry();
    sliced.setAttribute("position", new THREE.Float32BufferAttribute(next, 3));
    sliced.computeVertexNormals();
    obj.geometry = sliced;
  });

  for (const obj of drop) {
    obj.geometry?.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
    obj.parent?.remove(obj);
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
