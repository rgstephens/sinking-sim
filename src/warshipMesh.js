import * as THREE from "three";

/**
 * WWII warship topsides on the shared lofted hull (shipMesh.js):
 *   surface combatants — deckhouses, bridge towers (tower, pagoda, compact),
 *     tripod and pole masts, funnels, turrets, secondaries, torpedo tubes;
 *   carriers — hangar, flight deck, island, elevators, parked aircraft;
 *   submarines — conning tower, periscopes, deck gun, planes, jumping wires.
 *
 * Positions along the hull use `along` (0 = bow, 1 = stern) like the ship
 * data; x = (along − 0.5) × length, bow toward −X. Heights are world units
 * (≈ metres / 10). Turrets, towers and islands are groups flagged keepWhole
 * so a breaking ship hands each one to a single half.
 */

// Category defaults. Every ship also has its own entry in WARSHIP_STYLES.
export const CATEGORY_STYLES = {
  battleship: {
    bowType: "raked",
    bowFine: 0.95,
    bowRake: 0.06,
    sternFine: 0.5,
    sheer: 0.09,
    camber: 0.03,
    flare: 0.4,
    portholeRows: 1,
    portSpacing: 0.3,
    levelH: 0.26,
    funnelEllipse: 0.8,
    funnelRake: 0.03,
    decks: 2,
    superLen: 0.4,
    superOffset: 0,
    boatDeckY: 0.7,
    funnelStart: 0,
    funnelSpread: 0,
  },
  cruiser: {
    bowType: "raked",
    bowFine: 0.95,
    bowRake: 0.07,
    sternFine: 0.5,
    sheer: 0.08,
    camber: 0.03,
    flare: 0.4,
    portholeRows: 1,
    portSpacing: 0.26,
    levelH: 0.23,
    funnelEllipse: 0.8,
    funnelRake: 0.04,
    decks: 2,
    superLen: 0.4,
    superOffset: 0,
    boatDeckY: 0.7,
    funnelStart: 0,
    funnelSpread: 0,
  },
  destroyer: {
    bowType: "fine",
    bowFine: 0.96,
    bowRake: 0.06,
    sternFine: 0.45,
    sheer: 0.07,
    camber: 0.03,
    flare: 0.42,
    portholeRows: 1,
    portSpacing: 0.22,
    levelH: 0.2,
    funnelEllipse: 0.75,
    funnelRake: 0.06,
    decks: 1,
    superLen: 0.3,
    superOffset: 0,
    boatDeckY: 0.6,
    funnelStart: 0,
    funnelSpread: 0,
  },
  carrier: {
    bowType: "raked",
    bowFine: 0.93,
    bowRake: 0.07,
    sternFine: 0.5,
    sheer: 0.05,
    camber: 0.02,
    flare: 0.45,
    portholeRows: 1,
    portSpacing: 0.3,
    levelH: 0.24,
    funnelEllipse: 0.8,
    funnelRake: 0.05,
    decks: 1,
    superLen: 0.1,
    superOffset: 0,
    boatDeckY: 0.7,
    funnelStart: 0,
    funnelSpread: 0,
    flightDeck: true,
  },
  submarine: {
    hullForm: "submarine",
    sternType: "pointed",
    bowType: "olympic",
    bowFine: 0.96,
    bowRake: 0.035,
    sternFine: 0.5,
    sheer: 0.3,
    sheerAft: 0.15,
    camber: 0.01,
    flare: 0,
    portholeRows: 0,
    levelH: 0.1,
    funnelEllipse: 0.8,
    funnelRake: 0,
    decks: 1,
    superLen: 0.1,
    superOffset: 0,
    boatDeckY: 0.3,
    funnelStart: 0,
    funnelSpread: 0,
  },
};

/*
 * Per-ship layout:
 *   houses   [{ from, to, levels, beam }] deckhouse blocks (beam = × ship beam)
 *   bridge   { at, type: tower | pagoda | compact, levels, beam, len }
 *   funnels  [{ at, h, r }]   fore / main  { type: tripod | pole, h, at }
 *   aftDirector along         boats [along…]
 * Carriers: hangar, flightDeck, island, elevators, aircraft, downturned.
 * Submarines: tower, periscopes, shears, wintergarten, hangar, catapult.
 */
export const WARSHIP_STYLES = {
  iowa: {
    sheer: 0.12,
    bowRake: 0.07,
    houses: [{ from: 0.33, to: 0.71, levels: 2, beam: 0.6 }],
    bridge: { at: 0.34, type: "tower", levels: 4, beam: 0.34, len: 0.07 },
    funnels: [
      { at: 0.46, h: 1.0, r: 0.3 },
      { at: 0.56, h: 0.92, r: 0.3 },
    ],
    funnelEllipse: 0.72,
    fore: { type: "tripod", h: 1.4 },
    main: { at: 0.6, type: "pole", h: 1.2 },
    aftDirector: 0.66,
  },
  "king-george-v": {
    sheer: 0.05,
    bowType: "fine",
    houses: [{ from: 0.33, to: 0.72, levels: 2, beam: 0.58 }],
    bridge: { at: 0.335, type: "tower", levels: 3, beam: 0.42, len: 0.08 },
    funnels: [
      { at: 0.45, h: 0.9, r: 0.26 },
      { at: 0.565, h: 0.85, r: 0.26 },
    ],
    funnelRake: 0,
    fore: { type: "tripod", h: 1.3 },
    main: { at: 0.61, type: "tripod", h: 1.3 },
    aftDirector: 0.68,
    boats: [0.5, 0.52],
  },
  hood: {
    sheer: 0.06,
    bowType: "fine",
    bowRake: 0.065,
    forecastle: { to: 0.64, rise: 0.22 },
    houses: [{ from: 0.3, to: 0.7, levels: 1, beam: 0.52 }],
    bridge: { at: 0.305, type: "tower", levels: 4, beam: 0.34, len: 0.085 },
    funnels: [
      { at: 0.43, h: 1.0, r: 0.25 },
      { at: 0.52, h: 1.0, r: 0.25 },
    ],
    fore: { type: "tripod", h: 1.8 },
    main: { at: 0.6, type: "pole", h: 1.4 },
    aftDirector: 0.69,
    boats: [0.47, 0.49],
  },
  bismarck: {
    sheer: 0.1,
    bowRake: 0.075,
    houses: [{ from: 0.32, to: 0.69, levels: 2, beam: 0.55 }],
    bridge: { at: 0.33, type: "tower", levels: 4, beam: 0.32, len: 0.075 },
    funnels: [{ at: 0.48, h: 0.8, r: 0.34 }],
    fore: { type: "pole", h: 1.0 },
    main: { at: 0.58, type: "pole", h: 1.4 },
    aftDirector: 0.645,
    boats: [0.53, 0.555],
  },
  littorio: {
    sheer: 0.11,
    bowRake: 0.075,
    houses: [{ from: 0.32, to: 0.72, levels: 2, beam: 0.55 }],
    bridge: { at: 0.33, type: "tower", levels: 5, beam: 0.28, len: 0.065 },
    funnels: [
      { at: 0.44, h: 0.75, r: 0.28 },
      { at: 0.505, h: 0.7, r: 0.26 },
    ],
    funnelRake: 0.06,
    fore: { type: "pole", h: 0.9 },
    main: { at: 0.6, type: "pole", h: 1.2 },
    aftDirector: 0.665,
  },
  yamato: {
    sheer: 0.14,
    bowRake: 0.08,
    flare: 0.55,
    houses: [{ from: 0.35, to: 0.745, levels: 2, beam: 0.58 }],
    bridge: { at: 0.41, type: "pagoda", levels: 7, beam: 0.26, len: 0.055 },
    funnels: [{ at: 0.535, h: 0.95, r: 0.36 }],
    funnelRake: 0.4,
    main: { at: 0.625, type: "tripod", h: 1.3 },
    aftDirector: 0.69,
  },
  richelieu: {
    sheer: 0.1,
    bowRake: 0.075,
    houses: [{ from: 0.345, to: 0.76, levels: 2, beam: 0.55 }],
    bridge: { at: 0.355, type: "tower", levels: 5, beam: 0.3, len: 0.07 },
    funnels: [{ at: 0.5, h: 0.75, r: 0.3 }],
    funnelRake: 0.45,
    aftDirector: 0.64,
  },
  dunkerque: {
    sheer: 0.1,
    bowRake: 0.075,
    houses: [{ from: 0.36, to: 0.77, levels: 2, beam: 0.55 }],
    bridge: { at: 0.37, type: "tower", levels: 5, beam: 0.3, len: 0.07 },
    funnels: [{ at: 0.52, h: 0.75, r: 0.28 }],
    funnelRake: 0.12,
    main: { at: 0.6, type: "pole", h: 1.0 },
  },
  "prinz-eugen": {
    bowRake: 0.085,
    houses: [{ from: 0.3, to: 0.7, levels: 2, beam: 0.55 }],
    bridge: { at: 0.31, type: "tower", levels: 4, beam: 0.38, len: 0.075 },
    funnels: [{ at: 0.47, h: 0.75, r: 0.22 }],
    fore: { type: "pole", h: 0.9 },
    main: { at: 0.6, type: "pole", h: 1.0 },
    aftDirector: 0.665,
    boats: [0.52, 0.545],
  },
  zara: {
    forecastle: { to: 0.56, rise: 0.2 },
    houses: [{ from: 0.28, to: 0.69, levels: 1, beam: 0.52 }],
    bridge: { at: 0.285, type: "tower", levels: 3, beam: 0.4, len: 0.07 },
    funnels: [
      { at: 0.42, h: 0.7, r: 0.18 },
      { at: 0.52, h: 0.7, r: 0.18 },
    ],
    fore: { type: "tripod", h: 1.2 },
    main: { at: 0.63, type: "pole", h: 1.0 },
    aftDirector: 0.675,
  },
  kirov: {
    forecastle: { to: 0.6, rise: 0.18 },
    houses: [{ from: 0.3, to: 0.7, levels: 1, beam: 0.55 }],
    bridge: { at: 0.305, type: "tower", levels: 4, beam: 0.38, len: 0.065 },
    funnels: [{ at: 0.45, h: 0.75, r: 0.22 }],
    funnelRake: 0.07,
    fore: { type: "tripod", h: 1.2 },
    main: { at: 0.62, type: "pole", h: 0.9 },
    aftDirector: 0.675,
  },
  fletcher: {
    houses: [
      { from: 0.28, to: 0.56, levels: 1, beam: 0.6 },
      { from: 0.62, to: 0.715, levels: 1, beam: 0.5 },
    ],
    bridge: { at: 0.285, type: "compact", levels: 3, beam: 0.5, len: 0.075 },
    funnels: [
      { at: 0.385, h: 0.55, r: 0.12 },
      { at: 0.505, h: 0.5, r: 0.12 },
    ],
    funnelEllipse: 0.7,
    fore: { type: "pole", h: 0.9 },
  },
  cossack: {
    forecastle: { to: 0.38, rise: 0.12 },
    houses: [
      { from: 0.265, to: 0.56, levels: 1, beam: 0.55 },
      { from: 0.665, to: 0.715, levels: 1, beam: 0.45 },
    ],
    bridge: { at: 0.27, type: "compact", levels: 3, beam: 0.5, len: 0.08 },
    funnels: [
      { at: 0.385, h: 0.5, r: 0.12 },
      { at: 0.49, h: 0.45, r: 0.11 },
    ],
    funnelEllipse: 0.7,
    fore: { type: "tripod", h: 0.9 },
    main: { at: 0.56, type: "pole", h: 0.7 },
  },
  fubuki: {
    bowType: "raked",
    flare: 0.5,
    forecastle: { to: 0.3, rise: 0.16 },
    houses: [
      { from: 0.2, to: 0.29, levels: 1, beam: 0.5 },
      { from: 0.36, to: 0.51, levels: 1, beam: 0.4 },
      { from: 0.66, to: 0.74, levels: 1, beam: 0.45 },
    ],
    bridge: { at: 0.205, type: "compact", levels: 3, beam: 0.55, len: 0.075 },
    funnels: [
      { at: 0.335, h: 0.55, r: 0.1 },
      { at: 0.47, h: 0.5, r: 0.13 },
    ],
    funnelRake: 0.12,
    funnelEllipse: 0.7,
    fore: { type: "tripod", h: 0.9 },
    main: { at: 0.6, type: "pole", h: 0.8 },
  },
  essex: {
    hangar: { from: 0.1, to: 0.95, h: 0.95, beam: 0.9, open: true },
    flightDeck: { from: 0.045, to: 0.995, width: 3.1, bow: 0.45 },
    island: { from: 0.42, to: 0.53, side: 1, width: 0.36, levels: 3, funnel: { at: 0.5, h: 0.55, r: 0.2 } },
    elevators: [
      { at: 0.22, len: 1.4, w: 1.4 },
      { at: 0.66, len: 1.4, w: 1.4 },
      { at: 0.45, len: 1.2, w: 0.9, edge: -1 },
    ],
    aircraft: { count: 12, color: 0x3b4e66 },
  },
  "ark-royal": {
    hangar: { from: 0.03, to: 0.96, h: 1.35, beam: 0.93 },
    flightDeck: { from: 0.01, to: 0.985, width: 2.9, bow: 0.75 },
    island: { from: 0.4, to: 0.52, side: 1, width: 0.3, levels: 3, funnel: { at: 0.47, h: 0.5, r: 0.24 } },
    elevators: [
      { at: 0.23, len: 1.0, w: 1.1 },
      { at: 0.36, len: 1.0, w: 1.1 },
      { at: 0.78, len: 1.0, w: 1.1 },
    ],
    aircraft: { count: 9, color: 0x5d6752 },
  },
  akagi: {
    sheer: 0.04,
    hangar: { from: 0.12, to: 0.93, h: 1.1, beam: 0.88 },
    flightDeck: { from: 0.09, to: 0.99, width: 3.22, bow: 0.8 },
    island: { from: 0.41, to: 0.46, side: -1, width: 0.28, levels: 3 },
    downturned: { at: 0.46, side: 1, h: 0.9, r: 0.3 },
    elevators: [
      { at: 0.19, len: 1.2, w: 1.3 },
      { at: 0.46, len: 1.2, w: 1.1 },
      { at: 0.76, len: 1.1, w: 1.1 },
    ],
    aircraft: { count: 12, color: 0x7b8768 },
  },
  "u-boat": {
    sheer: 0.4,
    tower: { from: 0.425, to: 0.53, h: 0.36, beam: 0.42 },
    periscopes: [0.34, 0.26],
    wintergarten: true,
    dfLoop: true,
  },
  gato: {
    sheer: 0.3,
    tower: { from: 0.37, to: 0.49, h: 0.4, beam: 0.36 },
    periscopes: [0.42, 0.36],
    shears: true,
  },
  "i-15": {
    sheer: 0.34,
    tower: { from: 0.405, to: 0.5, h: 0.44, beam: 0.36 },
    periscopes: [0.38, 0.3],
    subHangar: { from: 0.29, to: 0.405, r: 0.15 },
    catapult: { from: 0.07, to: 0.29 },
  },
};

export function buildWarship(root, ship, style, mats, kit) {
  const ctx = { root, ship, style, mats, kit, L: ship.length, B: ship.beam, rigging: [] };
  if (ship.category === "submarine") buildSubmarine(ctx);
  else if (ship.category === "carrier") buildCarrier(ctx);
  else buildSurface(ctx);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(ctx.rigging, 3));
  const rigging = new THREE.LineSegments(geo, mats.rope);
  rigging.name = "rigging";
  root.add(rigging);
}

const xAt = (ctx, along) => (along - 0.5) * ctx.L;

function line(ctx, a, b) {
  ctx.rigging.push(a[0], a[1], a[2], b[0], b[1], b[2]);
}

/** Forestay/jumping wire start: just above the stem head. */
function stemHead(ctx) {
  const stem = ctx.kit.section(0.004, 1);
  return [stem.x + 0.05, stem.y + 0.1, 0];
}

function mesh(geo, mat, { shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function wholeGroup(name) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.keepWhole = true;
  return g;
}

// --- Surface combatants ---------------------------------------------------

function houseFaces(mats) {
  return [mats.superstructure, mats.superstructure, mats.paint, mats.paint, mats.superstructure, mats.superstructure];
}

/** Deck height at `along`, on top of any deckhouse standing there. */
function baseHeight(ctx, along) {
  const { kit, style } = ctx;
  let y = kit.deckAt(along);
  for (const h of style.houses ?? []) {
    if (along >= h.from && along <= h.to) y = Math.max(y, kit.deckAt(h.from + (h.to - h.from) / 2) + h.levels * style.levelH);
  }
  return y;
}

/** Width of deckhouse level k: upper levels step well inboard. */
function houseWidth(ctx, house, k) {
  return ctx.B * Math.max(0.2, house.beam - k * 0.25);
}

function buildSurface(ctx) {
  const { root, style, mats, kit, B } = ctx;
  const faces = houseFaces(mats);
  const H = style.levelH;

  // Deckhouses, each level shorter and narrower than the one below
  let first = null;
  for (const h of style.houses ?? []) {
    const deck = kit.deckAt(h.from + (h.to - h.from) / 2);
    // The lowest level reaches down past a forecastle break under it.
    const low = Math.min(deck, kit.deckAt(h.from), kit.deckAt(h.to)) - 0.02;
    const len = xAt(ctx, h.to) - xAt(ctx, h.from);
    for (let k = 0; k < h.levels; k++) {
      const trim = len * 0.06 * k;
      const width = houseWidth(ctx, h, k);
      const [x0, x1] = kit.fitToHull(xAt(ctx, h.from) + trim, xAt(ctx, h.to) - trim, width / 2);
      const y0 = k === 0 ? low : deck + H * k - 0.01;
      const y1 = deck + H * (k + 1) - 0.01;
      kit.block(root, x0, x1, (y0 + y1) / 2, y1 - y0, width, faces, { vTile: H });
    }
    const top = deck + h.levels * H;
    if (!first) first = { y: top, beam: houseWidth(ctx, h, 0), x0: xAt(ctx, h.from), x1: xAt(ctx, h.to) };
    addAATubs(ctx, h, top);
  }
  root.userData.boatDeck = first ?? { y: kit.deckAt(0.5), beam: B * 0.5, x0: 0, x1: 0 };

  const tops = [];
  if (style.bridge) tops.push(buildBridge(ctx));
  buildFunnelsFor(ctx);
  if (style.main) tops.push(buildMast(ctx, style.main.type, xAt(ctx, style.main.at), baseHeight(ctx, style.main.at), style.main.h));
  if (style.aftDirector != null) {
    const d = director(ctx, B * 0.16);
    d.position.set(xAt(ctx, style.aftDirector), baseHeight(ctx, style.aftDirector), 0);
    root.add(d);
  }
  buildTurrets(ctx);
  buildSecondaries(ctx);
  buildTorpedoes(ctx);
  buildBoats(ctx);

  // Forestay to the foremast, aerials between the masts, backstay to the stern
  const stern = kit.station(0.99);
  const masts = tops.filter(Boolean);
  if (masts.length) {
    line(ctx, stemHead(ctx), masts[0]);
    const last = masts[masts.length - 1];
    line(ctx, [stern.x, stern.deckY + 0.1, 0], last);
    if (masts.length > 1) {
      for (const dz of [-0.06, 0.06]) line(ctx, [masts[0][0], masts[0][1] - 0.05, dz], [last[0], last[1] - 0.05, dz]);
    }
  }
}

/** Bridge tower at the front of the first deckhouse; returns the foremast head. */
function buildBridge(ctx) {
  const { style, mats, kit, B, L, root } = ctx;
  const br = style.bridge;
  const H = style.levelH;
  const group = wholeGroup("bridge");
  const x0 = xAt(ctx, br.at);
  const base = baseHeight(ctx, br.at);
  group.position.set(x0, base, 0);
  const faces = houseFaces(mats);
  const len = L * br.len;
  let y = 0;
  let width = B * br.beam;
  let top = { y: 0, len, width };

  const box = (x, y, l, h, w, mat = faces) => {
    const m = mesh(kit.worldUVBox(l, h, w, kit.BAY_TILE, h, 2.4), mat);
    m.position.set(x, y, 0);
    group.add(m);
    return m;
  };
  const windows = (x, y, l, w) => {
    // Dark band of bridge windows all the way round
    const m = mesh(new THREE.BoxGeometry(l + 0.012, H * 0.18, w + 0.012), mats.black, { shadow: false });
    m.position.set(x, y, 0);
    group.add(m);
  };

  if (br.type === "pagoda") {
    // Slender armoured core with wide platforms stepping up it
    const core = width * 0.55;
    for (let k = 0; k < br.levels; k++) {
      const l = len * (1 - k * 0.07);
      const w = core * (1 - k * 0.05);
      box(len / 2, y + H / 2, l, H, w);
      if (k % 2 === 1 || k === br.levels - 1) {
        const plat = mesh(new THREE.BoxGeometry(l * 1.35, 0.025, w * (k === br.levels - 2 ? 2.4 : 1.7)), mats.paint);
        plat.position.set(len / 2, y + H, 0);
        group.add(plat);
      }
      if (k === br.levels - 2) windows(len / 2, y + H * 0.7, l, w);
      y += H;
    }
    top = { y, len: len * 0.6, width: core };
    // Great rangefinder across the top
    const rf = director(ctx, B * 0.26, 1.9);
    rf.position.set(len / 2, y, 0);
    group.add(rf);
    y += B * 0.26 * 0.9;
  } else {
    const tower = br.type === "tower";
    for (let k = 0; k < br.levels; k++) {
      const l = len * (1 - k * (tower ? 0.08 : 0.12));
      const w = width * (1 - k * (tower ? 0.06 : 0.08));
      box(len / 2 + (len - l) * 0.35, y + H / 2, l, H, w);
      top = { y: y + H, len: l, width: w };
      y += H;
    }
    const navY = y - H * 0.3;
    windows(len / 2 + (len - top.len) * 0.35, navY, top.len, top.width);
    // Bridge wings out to the ship's side
    for (const side of [-1, 1]) {
      const wing = mesh(new THREE.BoxGeometry(len * 0.3, 0.025, (B * 0.46 - top.width / 2)), mats.paint);
      wing.position.set(len * 0.25, y - H * 0.55, side * (top.width / 2 + (B * 0.46 - top.width / 2) / 2));
      group.add(wing);
    }
    const d = director(ctx, B * (tower ? 0.2 : 0.13));
    d.position.set(len * 0.55, y, 0);
    group.add(d);
    y += B * (tower ? 0.2 : 0.13) * 0.8;
  }
  root.add(group);

  if (!style.fore) return [x0 + len * 0.5, base + y + 0.05, 0];
  // Foremast stepped on the deckhouse just abaft the tower, rising past it
  return buildMast(ctx, style.fore.type, x0 + len * 1.04, base, top.y + style.fore.h);
}

/** Fire-control director: pedestal, hood and a rangefinder across it. */
function director(ctx, size, rangefinder = 1.4) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const ped = mesh(new THREE.CylinderGeometry(size * 0.28, size * 0.34, size * 0.3, 14), ctx.mats.paint);
  ped.position.y = size * 0.15;
  const hood = mesh(new THREE.BoxGeometry(size * 0.75, size * 0.42, size * 0.62), mats.paint);
  hood.position.y = size * 0.51;
  const rf = mesh(new THREE.CylinderGeometry(size * 0.07, size * 0.07, size * rangefinder, 8), mats.gun);
  rf.rotation.x = Math.PI / 2;
  rf.position.set(size * 0.1, size * 0.6, 0);
  g.add(ped, hood, rf);
  return g;
}

/** Tripod or pole mast; returns its head in ship space. */
function buildMast(ctx, type, x, y, h, z = 0) {
  const { root, mats } = ctx;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const pole = (x0, z0, x1, y1, z1, r) => {
    const a = new THREE.Vector3(x0, 0, z0);
    const b = new THREE.Vector3(x1, y1, z1);
    const len = a.distanceTo(b);
    const m = mesh(new THREE.CylinderGeometry(r * 0.7, r, len, 8), mats.paint);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  };
  const r = 0.028 + h * 0.012;
  pole(0, 0, 0, h, 0, r);
  if (type === "tripod") {
    // Legs splay athwartships (and a little aft) so their feet share the deck
    const spread = Math.min(h * 0.18, ctx.B * 0.22);
    for (const side of [-1, 1]) pole(h * 0.06, side * spread, 0, h * 0.62, 0, r * 0.75);
    const top = mesh(new THREE.CylinderGeometry(0.1 + h * 0.04, 0.08 + h * 0.03, 0.08, 10), mats.paint);
    top.position.y = h * 0.66;
    g.add(top);
  }
  const yard = mesh(new THREE.CylinderGeometry(0.01, 0.01, h * 0.55, 6), mats.black, { shadow: false });
  yard.rotation.x = Math.PI / 2;
  yard.position.y = h * 0.82;
  g.add(yard);
  root.add(g);
  return [x, y + h, z];
}

function buildFunnelsFor(ctx) {
  const { root, style, kit, ship } = ctx;
  (style.funnels ?? []).slice(0, ship.funnels).forEach((f, i) => {
    root.add(
      kit.makeFunnel({
        x: xAt(ctx, f.at),
        y: baseHeight(ctx, f.at) - 0.02,
        h: f.h,
        rBot: f.r,
        rTop: f.r * 0.96,
        index: i,
        cap: 0.12,
      })
    );
  });
}

/**
 * Gunhouse with a sloped face, a barbette under it and `count` barrels.
 * Built facing +X; the caller turns it.
 */
function gunMount(ctx, { size, count, barrel, raise = 0 }) {
  const { mats } = ctx;
  const g = wholeGroup("turret");
  const w = size;
  const l = size * 1.12;
  const h = Math.max(0.1, size * 0.3);
  const barbR = size * 0.44;
  if (raise > 0) {
    const barb = mesh(new THREE.CylinderGeometry(barbR, barbR * 1.04, raise, 24), mats.paint);
    barb.position.y = raise / 2;
    g.add(barb);
  }
  const profile = new THREE.Shape();
  profile.moveTo(-l * 0.55, 0);
  profile.lineTo(l * 0.45, 0);
  profile.lineTo(l * 0.45 - h * 0.25, h * 0.55);
  profile.lineTo(l * 0.45 - h * 0.7, h);
  profile.lineTo(-l * 0.5, h);
  profile.lineTo(-l * 0.55, h * 0.85);
  const house = new THREE.ExtrudeGeometry(profile, { depth: w, bevelEnabled: false });
  house.translate(0, raise, -w / 2);
  g.add(mesh(house, mats.paint));
  // Roof plate slightly darker, and rangefinder ears on the big ones
  const roof = mesh(new THREE.BoxGeometry(l * 0.9, 0.01, w * 0.96), mats.gun, { shadow: false });
  roof.position.set(-l * 0.07, raise + h + 0.004, 0);
  g.add(roof);
  if (size > 0.9) {
    const ears = mesh(new THREE.CylinderGeometry(size * 0.05, size * 0.05, w * 1.18, 10), mats.gun);
    ears.rotation.x = Math.PI / 2;
    ears.position.set(-l * 0.32, raise + h * 0.72, 0);
    g.add(ears);
  }
  const len = barrel ?? size * 1.3;
  const spacing = count > 1 ? (w * 0.72) / (count - 1) : 0;
  const rBase = Math.max(0.018, size * 0.045);
  for (let i = 0; i < count; i++) {
    const z = (i - (count - 1) / 2) * spacing;
    const tube = new THREE.CylinderGeometry(rBase * 0.62, rBase, len, 10);
    tube.rotateZ(-Math.PI / 2);
    tube.translate(len / 2, 0, 0);
    tube.rotateZ(0.05);
    tube.translate(l * 0.45 - h * 0.35, raise + h * 0.42, z);
    const gunBarrel = mesh(tube, mats.gun);
    gunBarrel.name = "gun-barrel";
    g.add(gunBarrel);
    const bag = new THREE.CylinderGeometry(rBase * 1.5, rBase * 1.6, h * 0.35, 10);
    bag.rotateZ(-Math.PI / 2);
    bag.translate(l * 0.45 - h * 0.2, raise + h * 0.42, z);
    g.add(mesh(bag, mats.canvas, { shadow: false }));
  }
  return g;
}

function buildTurrets(ctx) {
  const { root, ship, B, style } = ctx;
  const onDeck = style.flightDeck;
  for (const t of ship.turrets ?? []) {
    const facing = t.facing ?? (t.along < 0.5 ? "fore" : "aft");
    const housed = !onDeck && (style.houses ?? []).some((h) => t.along >= h.from && t.along <= h.to);
    const raise = t.raise ?? (t.superfire && !housed ? t.size * 0.5 : Math.max(0.02, t.size * 0.08));
    const g = gunMount(ctx, { size: t.size, count: t.count, barrel: t.barrel, raise });
    const zOff = (t.z ?? 0) * B * 0.5;
    const y = onDeck ? ctx.flightTop : baseHeight(ctx, t.along) - 0.01;
    g.position.set(xAt(ctx, t.along), y, zOff);
    g.rotation.y = facing === "fore" ? Math.PI : 0;
    root.add(g);
  }
}

/** Secondary battery: port/starboard pairs on the deckhouse, trained outboard. */
function buildSecondaries(ctx) {
  const { root, ship, B } = ctx;
  const sec = ship.secondary;
  if (!sec) return;
  const houses = ctx.style.houses ?? [];
  for (const along of sec.along) {
    const house = houses.find((h) => along >= h.from && along <= h.to);
    const half = house ? houseWidth(ctx, house, 0) / 2 : B * 0.36;
    const y = house ? baseHeight(ctx, along) - (house.levels > 1 ? ctx.style.levelH : 0) : baseHeight(ctx, along);
    const fore = along < 0.5;
    for (const side of [-1, 1]) {
      const g = gunMount(ctx, { size: sec.size, count: sec.count, raise: sec.size * 0.12 });
      const z = Math.min(B * 0.42, half - sec.size * 0.42);
      g.position.set(xAt(ctx, along), y - 0.01, side * z);
      g.rotation.y = (fore ? Math.PI : 0) + side * (fore ? -0.45 : 0.45);
      root.add(g);
    }
  }
}

function buildTorpedoes(ctx) {
  const { root, ship, mats, B } = ctx;
  for (const t of ship.torpedoes ?? []) {
    const g = wholeGroup("turret");
    const len = Math.min(0.8, B * 0.62);
    const r = 0.028;
    const base = mesh(new THREE.CylinderGeometry(r * 3.6, r * 4, 0.04, 16), mats.paint);
    base.position.y = 0.02;
    g.add(base);
    for (let i = 0; i < t.tubes; i++) {
      const z = (i - (t.tubes - 1) / 2) * r * 2.3;
      const tube = new THREE.CylinderGeometry(r, r, len, 8);
      tube.rotateZ(Math.PI / 2);
      tube.translate(0, 0.07, z);
      g.add(mesh(tube, mats.gun));
    }
    const shield = mesh(new THREE.BoxGeometry(0.1, 0.07, t.tubes * r * 2.3 + 0.02), mats.paint);
    shield.position.set(-0.05, 0.08, 0);
    g.add(shield);
    g.position.set(xAt(ctx, t.along), baseHeight(ctx, t.along), 0);
    g.rotation.y = 0.35; // trained a little off the centreline
    root.add(g);
  }
}

/** Light AA: open gun tubs with twin barrels on the deckhouse corners. */
function addAATubs(ctx, house, top) {
  const { root, mats, kit, B } = ctx;
  if (ctx.ship.category === "destroyer") return;
  const tubs = [];
  const guns = [];
  const len = xAt(ctx, house.to) - xAt(ctx, house.from);
  const half = houseWidth(ctx, house, house.levels - 1) / 2;
  for (const f of [0.2, 0.8]) {
    for (const side of [-1, 1]) {
      const x = xAt(ctx, house.from) + len * f;
      const z = side * (half - 0.12);
      tubs.push(kit.transformed(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14, 1, true), x, top + 0.035, z));
      for (const dz of [-0.025, 0.025]) {
        guns.push(kit.transformed(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), x - 0.06, top + 0.1, z + dz, 0, 0, Math.PI / 2 + 0.5));
      }
    }
  }
  for (const m of [kit.mergedMesh(tubs, mats.paint), kit.mergedMesh(guns, mats.gun, { shadow: false })]) {
    if (m) root.add(m);
  }
}

/** Ship's boats in chocks on the deckhouse either side of the funnels. */
function buildBoats(ctx) {
  const { root, style, mats, kit, B } = ctx;
  const hulls = [];
  for (const along of style.boats ?? []) {
    const house = (style.houses ?? []).find((h) => along >= h.from && along <= h.to);
    if (!house) continue;
    const y = baseHeight(ctx, along);
    const half = houseWidth(ctx, house, house.levels - 1) / 2;
    for (const side of [-1, 1]) {
      hulls.push(
        kit.transformed(new THREE.CapsuleGeometry(0.07, 0.42, 4, 10), xAt(ctx, along), y + 0.08, side * (half - 0.14), 0, 0, Math.PI / 2, 1, 1, 0.7)
      );
    }
  }
  const m = kit.mergedMesh(hulls, mats.paint);
  if (m) root.add(m);
}

// --- Aircraft carriers ----------------------------------------------------

function buildCarrier(ctx) {
  const { root, style, mats, kit, B, L } = ctx;
  const hg = style.hangar;
  const fd = style.flightDeck;
  const deck = kit.deckAt(0.5);
  const hangarTop = deck + hg.h;
  const thick = 0.06;
  ctx.flightTop = hangarTop + thick;

  // Hangar: plated to the flight deck, or open bays with roller curtains
  const hx0 = xAt(ctx, hg.from);
  const hx1 = xAt(ctx, hg.to);
  const hw = B * hg.beam;
  const [cx0, cx1] = kit.fitToHull(hx0, hx1, hw * 0.42);
  kit.block(root, cx0, cx1, deck + hg.h / 2 - 0.02, hg.h + 0.04, hw, mats.topside, { uTile: 4, vTile: hg.h });
  if (hg.open) {
    const bays = [];
    const n = Math.floor((cx1 - cx0) / 1.25);
    for (let i = 0; i < n; i++) {
      const bx = cx0 + (i + 0.5) * ((cx1 - cx0) / n);
      if (Math.abs(bx - kit.breakX) < 0.6) continue;
      for (const side of [-1, 1]) {
        bays.push(kit.transformed(new THREE.BoxGeometry(0.95, hg.h * 0.55, 0.02), bx, deck + hg.h * 0.5, side * (hw / 2 + 0.005)));
      }
    }
    const m = kit.mergedMesh(bays, mats.black, { shadow: false });
    if (m) root.add(m);
  }

  // Flight deck, overhanging the hull, cut at the break like everything else
  const fx0 = xAt(ctx, fd.from);
  const fx1 = xAt(ctx, fd.to);
  const halfW = (x) => {
    const t = (x - fx0) / (fx1 - fx0);
    let w = THREE.MathUtils.lerp(fd.bow, 1, THREE.MathUtils.smoothstep(t, 0, 0.16));
    if (t < 0.02) w *= Math.sqrt(Math.max(0.15, t / 0.02));
    if (t > 0.97) w *= Math.sqrt(Math.max(0.3, 1 - (t - 0.97) / 0.03));
    return (fd.width / 2) * w;
  };
  const cuts = [fx0, kit.breakX, fx1].filter((x, i, a) => i === 0 || i === a.length - 1 || (x > fx0 && x < fx1));
  for (let i = 0; i < cuts.length - 1; i++) {
    const slab = mesh(flightDeckSlab(cuts[i], cuts[i + 1], halfW, hangarTop, thick, fd.width), [mats.flightDeck ?? mats.deck, mats.paint]);
    slab.name = "flight-deck";
    root.add(slab);
  }
  // Supports under the overhang at the bow
  const posts = [];
  for (let x = fx0 + 0.3; x < cx0; x += 0.6) {
    const st = kit.station(x / L + 0.5);
    for (const side of [-1, 1]) {
      posts.push(kit.transformed(new THREE.CylinderGeometry(0.025, 0.025, hangarTop - st.deckY, 6), x, (hangarTop + st.deckY) / 2, side * Math.min(st.deckHalf * 0.8, halfW(x) * 0.8)));
    }
  }
  const pm = kit.mergedMesh(posts, mats.paint);
  if (pm) root.add(pm);

  // Elevators: slightly sunken plates; deck-edge lifts hang outboard
  const lifts = [];
  for (const e of style.elevators ?? []) {
    const x = xAt(ctx, e.at);
    if (Math.abs(x - kit.breakX) < e.len / 2 + 0.05) continue;
    const z = e.edge ? e.edge * (halfW(x) + e.w / 2 - 0.02) : 0;
    lifts.push(kit.transformed(new THREE.BoxGeometry(e.len, 0.012, e.w), x, ctx.flightTop + (e.edge ? -0.02 : 0.003), z));
  }
  const lm = kit.mergedMesh(lifts, mats.gun, { shadow: false });
  if (lm) root.add(lm);

  buildIsland(ctx, halfW);
  if (style.downturned) {
    const d = style.downturned;
    const x = xAt(ctx, d.at);
    const stack = kit.makeFunnel({ x, y: deck + hg.h * 0.55, z: d.side * hw * 0.48, h: d.h, rBot: d.r, rTop: d.r * 0.9, cap: 0.2, rake: 0 });
    stack.rotation.set(d.side * (Math.PI / 2 + 0.45), 0, 0);
    root.add(stack);
  }
  buildTurrets(ctx);
  buildAircraft(ctx, halfW);

  root.userData.boatDeck = { y: ctx.flightTop, beam: fd.width, x0: fx0, x1: fx1 };
}

/**
 * Flight deck strip from x0 to x1: top (group 0, planked), underside and
 * edges (group 1). Top UVs: u = x / FLIGHT_TILE, v across the full width.
 */
function flightDeckSlab(x0, x1, halfW, y, thick, width) {
  const steps = Math.max(4, Math.ceil((x1 - x0) / 0.25));
  const pos = [];
  const uv = [];
  const topIdx = [];
  const restIdx = [];
  const v = (x, yy, z, u, w) => {
    pos.push(x, yy, z);
    uv.push(u, w);
    return pos.length / 3 - 1;
  };
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const w = halfW(x);
    const u = x / 6;
    rows.push({
      ts: v(x, y + thick, w, u, 0.5 + w / width),
      tp: v(x, y + thick, -w, u, 0.5 - w / width),
      es: v(x, y + thick, w, u, 0),
      ep: v(x, y + thick, -w, u, 0),
      bs: v(x, y, w, u, 1),
      bp: v(x, y, -w, u, 1),
      bs2: v(x, y, w, u, 0),
      bp2: v(x, y, -w, u, 0),
    });
  }
  for (let i = 0; i < steps; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    topIdx.push(a.tp, a.ts, b.ts, a.tp, b.ts, b.tp);
    restIdx.push(a.es, a.bs, b.bs, a.es, b.bs, b.es);
    restIdx.push(a.ep, b.ep, b.bp, a.ep, b.bp, a.bp);
    restIdx.push(a.bs2, a.bp2, b.bp2, a.bs2, b.bp2, b.bs2);
  }
  for (const r of [rows[0], rows[steps]]) {
    const flip = r === rows[0];
    const q = [r.ep, r.es, r.bs, r.bp];
    if (flip) restIdx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    else restIdx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([...topIdx, ...restIdx]);
  geo.addGroup(0, topIdx.length, 0);
  geo.addGroup(topIdx.length, restIdx.length, 1);
  geo.computeVertexNormals();
  return geo;
}

function buildIsland(ctx, halfW) {
  const { root, style, mats, kit, B } = ctx;
  const is = style.island;
  const H = style.levelH;
  const g = wholeGroup("island");
  const x0 = xAt(ctx, is.from);
  const x1 = xAt(ctx, is.to);
  const len = x1 - x0;
  const width = B * is.width;
  const z = is.side * (halfW((x0 + x1) / 2) - width / 2 + 0.04);
  g.position.set(x0, ctx.flightTop, z);
  const faces = houseFaces(mats);
  let y = 0;
  let top = { l: len, w: width, x: len / 2 };
  for (let k = 0; k < is.levels; k++) {
    const l = len * (1 - k * 0.14);
    const w = width * (1 - k * 0.06);
    const x = len - l / 2 - k * len * 0.02;
    const m = mesh(kit.worldUVBox(l, H, w, kit.BAY_TILE, H, 2.4), faces);
    m.position.set(x, y + H / 2, 0);
    g.add(m);
    top = { l, w, x };
    y += H;
  }
  // Navigating bridge: window band on the top level, wing platforms fore
  const band = mesh(new THREE.BoxGeometry(top.l * 0.5 + 0.012, H * 0.2, top.w + 0.012), mats.black, { shadow: false });
  band.position.set(top.x - top.l * 0.25, y - H * 0.35, 0);
  g.add(band);
  const d = director(ctx, B * 0.13);
  d.position.set(top.x - top.l * 0.3, y, 0);
  g.add(d);
  root.add(g);

  const head = buildMast(ctx, "tripod", x0 + top.x, ctx.flightTop + y, 1.1, z);
  // Aerial yard lines out to the deck edge
  line(ctx, [head[0], head[1] - 0.2, z], [head[0] - 1.2, ctx.flightTop + 0.05, z - is.side * 0.3]);
  line(ctx, [head[0], head[1] - 0.2, z], [head[0] + 1.2, ctx.flightTop + 0.05, z - is.side * 0.3]);

  if (is.funnel) {
    const f = is.funnel;
    root.add(
      kit.makeFunnel({
        x: xAt(ctx, f.at),
        y: ctx.flightTop + y - H * 0.8,
        z,
        h: f.h,
        rBot: f.r,
        rTop: f.r * 0.92,
        cap: 0.18,
        ell: 0.7,
      })
    );
  }
}

/** Aircraft spotted aft, wings spread, in rows across the deck. */
function buildAircraft(ctx, halfW) {
  const { root, style, kit } = ctx;
  const ac = style.aircraft;
  if (!ac) return;
  const mat = new THREE.MeshStandardMaterial({ color: ac.color, roughness: 0.55, metalness: 0.2 });
  const parts = [];
  const perRow = 3;
  const rows = Math.ceil(ac.count / perRow);
  const y = ctx.flightTop;
  const xEnd = xAt(ctx, 0.93);
  for (let r = 0; r < rows; r++) {
    const x = xEnd - r * 1.25;
    if (Math.abs(x - kit.breakX) < 0.8) continue;
    for (let c = 0; c < perRow && r * perRow + c < ac.count; c++) {
      const z = (c - (perRow - 1) / 2) * Math.min(1.25, halfW(x) * 0.62);
      parts.push(kit.transformed(new THREE.CylinderGeometry(0.055, 0.035, 0.95, 8), x, y + 0.13, z, 0, 0, Math.PI / 2));
      parts.push(kit.transformed(new THREE.BoxGeometry(0.2, 0.02, 1.2), x - 0.1, y + 0.1, z));
      parts.push(kit.transformed(new THREE.BoxGeometry(0.1, 0.015, 0.4), x + 0.4, y + 0.15, z));
      parts.push(kit.transformed(new THREE.BoxGeometry(0.12, 0.14, 0.015), x + 0.42, y + 0.21, z));
      parts.push(kit.transformed(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), x - 0.08, y + 0.04, z));
    }
  }
  const m = kit.mergedMesh(parts, mat);
  if (m) {
    m.name = "aircraft";
    root.add(m);
  }
}

// --- Submarines -----------------------------------------------------------

/** Plan outline of a fairwater: rounded nose, tapered tail. */
function fairwaterShape(len, width) {
  const shape = new THREE.Shape();
  const n = 24;
  const hw = (t) => {
    if (t < 0.3) return (width / 2) * Math.sqrt(Math.max(0, 1 - Math.pow((0.3 - t) / 0.3, 2)));
    if (t > 0.7) return (width / 2) * (0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.7) / 0.3, 2))));
    return width / 2;
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = [t * len, hw(t)];
    if (i === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    shape.lineTo(t * len, -hw(t));
  }
  return shape;
}

function fairwater(len, width, h) {
  const geo = new THREE.ExtrudeGeometry(fairwaterShape(len, width), { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function buildSubmarine(ctx) {
  const { root, style, mats, kit, B, ship } = ctx;
  const tw = style.tower;
  const x0 = xAt(ctx, tw.from);
  const x1 = xAt(ctx, tw.to);
  const len = x1 - x0;
  const width = B * tw.beam;
  const deck = kit.deckAt((tw.from + tw.to) / 2);
  const g = wholeGroup("conning-tower");
  g.position.set(x0, deck - 0.02, 0);

  g.add(mesh(fairwater(len, width, tw.h), mats.topside));
  // Open bridge: a dark cockpit inset under the bulwark
  const well = mesh(fairwater(len * 0.8, width * 0.78, 0.01), mats.black, { shadow: false });
  well.position.set(len * 0.08, tw.h - 0.004, 0);
  g.add(well);

  if (style.wintergarten) {
    // Type VIIC's railed AA platform aft of the bridge
    const plat = mesh(new THREE.BoxGeometry(len * 0.45, 0.02, width * 0.8), mats.topside);
    plat.position.set(len * 1.12, tw.h * 0.72, 0);
    g.add(plat);
    const flak = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 5).rotateZ(Math.PI / 2 - 0.4), mats.gun, { shadow: false });
    flak.position.set(len * 1.15, tw.h * 0.72 + 0.07, 0);
    g.add(flak);
    const rail = [];
    for (const side of [-1, 1]) {
      rail.push(kit.transformed(new THREE.CylinderGeometry(0.004, 0.004, len * 0.45, 4), len * 1.12, tw.h * 0.72 + 0.06, side * width * 0.4, 0, 0, Math.PI / 2));
    }
    const rm = kit.mergedMesh(rail, mats.paint, { shadow: false });
    if (rm) {
      rm.userData.sliceHull = false;
      g.add(rm);
    }
  }
  // Periscopes (attack and search), raised
  (style.periscopes ?? []).forEach((h, i) => {
    const p = mesh(new THREE.CylinderGeometry(0.009, 0.013, h, 8), mats.gun);
    p.position.set(len * (0.45 + i * 0.14), tw.h + h / 2, 0);
    g.add(p);
  });
  if (style.shears) {
    // Periscope shears: two posts and cross braces round the periscopes
    for (const dx of [0.35, 0.72]) {
      const post = mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), mats.topside);
      post.position.set(len * dx, tw.h + 0.17, 0);
      g.add(post);
    }
    const brace = mesh(new THREE.BoxGeometry(len * 0.4, 0.02, 0.025), mats.topside);
    brace.position.set(len * 0.54, tw.h + 0.3, 0);
    g.add(brace);
  }
  if (style.dfLoop) {
    const loop = mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 16), mats.gun, { shadow: false });
    loop.position.set(len * 0.25, tw.h + 0.1, 0);
    g.add(loop);
  }
  root.add(g);

  // Jumping wires from the stem over the bridge to the stern
  const stern = kit.station(0.985);
  line(ctx, stemHead(ctx), [x0 + len * 0.1, deck + tw.h + 0.12, 0]);
  line(ctx, [x1, deck + tw.h + 0.08, 0], [stern.x, stern.deckY + 0.06, 0]);

  if (style.subHangar) {
    // I-15's watertight aircraft hangar, a tube with a domed door forward
    const h = style.subHangar;
    const hx0 = xAt(ctx, h.from);
    const hx1 = xAt(ctx, h.to);
    const hangar = wholeGroup("hangar");
    const tube = new THREE.CylinderGeometry(h.r, h.r, hx1 - hx0, 20);
    tube.rotateZ(Math.PI / 2);
    hangar.add(mesh(tube, mats.topside));
    const door = mesh(new THREE.SphereGeometry(h.r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.topside);
    door.rotation.z = Math.PI / 2;
    door.scale.set(1, 0.45, 1);
    door.position.x = -(hx1 - hx0) / 2;
    hangar.add(door);
    hangar.position.set((hx0 + hx1) / 2, kit.deckAt(h.from) + h.r * 0.85, 0);
    root.add(hangar);
  }
  if (style.catapult) {
    const c = style.catapult;
    const rails = [];
    const cx0 = xAt(ctx, c.from);
    const cx1 = xAt(ctx, c.to);
    const y0 = kit.deckAt(c.from) + 0.05;
    const y1 = kit.deckAt(c.to) + 0.05;
    const run = Math.hypot(cx1 - cx0, y1 - y0);
    for (const dz of [-0.05, 0.05]) {
      rails.push(kit.transformed(new THREE.BoxGeometry(run, 0.025, 0.02), (cx0 + cx1) / 2, (y0 + y1) / 2, dz, 0, 0, Math.atan2(y1 - y0, cx1 - cx0)));
    }
    const m = kit.mergedMesh(rails, mats.gun);
    if (m) root.add(m);
  }

  // Deck gun on a pedestal, trained fore and aft
  if (ship.deckGun) {
    const dg = ship.deckGun;
    const gun = wholeGroup("turret");
    const s = dg.size;
    const ped = mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.18, s * 0.35, 10), mats.gun);
    ped.position.y = s * 0.175;
    const cradle = mesh(new THREE.BoxGeometry(s * 0.35, s * 0.14, s * 0.2), mats.gun);
    cradle.position.y = s * 0.38;
    const barrel = new THREE.CylinderGeometry(s * 0.035, s * 0.05, s * 1.5, 8);
    barrel.rotateZ(-Math.PI / 2 + 0.06);
    barrel.translate(s * 0.7, s * 0.42, 0);
    gun.add(ped, cradle, mesh(barrel, mats.gun));
    if (s > 0.28) {
      const shield = mesh(new THREE.BoxGeometry(0.015, s * 0.35, s * 0.5), mats.topside);
      shield.position.set(s * 0.15, s * 0.45, 0);
      gun.add(shield);
    }
    gun.position.set(xAt(ctx, dg.along), kit.deckAt(dg.along) - 0.01, 0);
    gun.rotation.y = dg.along < (tw.from + tw.to) / 2 ? Math.PI : 0;
    root.add(gun);
  }

  // Bow and stern diving planes
  const planes = [];
  for (const [along, span, yf] of [[0.07, B * 0.5, 0.15], [0.94, B * 0.62, 0.55]]) {
    const st = kit.station(along);
    const y = -ship.draft * yf;
    const half = kit.section(along, 0.72 * 0.61).z;
    for (const side of [-1, 1]) {
      planes.push(kit.transformed(new THREE.BoxGeometry(span * 0.45, 0.018, span * 0.5), st.x, y, side * (half + span * 0.2)));
    }
  }
  const pm = kit.mergedMesh(planes, mats.topside);
  if (pm) root.add(pm);

  root.userData.boatDeck = { y: deck + tw.h, beam: width, x0, x1 };
}
