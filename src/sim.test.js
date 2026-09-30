import assert from "node:assert/strict";
import * as THREE from "three";
import { SHIPS, getShip, shipGroups, CATEGORIES } from "./ships.js";
import { getDisaster } from "./disasters.js";
import {
  createSimulation,
  stepSimulation,
  triggerDisaster,
  MAX_FLOAT_Y,
  SEABED_Y,
  bowDirection,
  starboardDirection,
} from "./physics.js";
import { createHazard, updateHazard } from "./hazards.js";
import { buildShipMesh, splitShip, shipStyle, BREAK_FRACTION } from "./shipMesh.js";
import {
  ENGINE_ORDERS,
  WHEEL_HARD_OVER,
  wheelAngleToHelm,
  helmToWheelAngle,
  nearestOrderIndex,
  orderDialAngle,
  dialAngleToOrderIndex,
  throttleToDialAngle,
  keyReleaseOrderIndex,
} from "./bridge.js";
import { MIN_THROTTLE, throttleSpeed, speedThrottle } from "./physics.js";
import { formatBuildInfo } from "./buildInfo.js";

assert.equal(
  formatBuildInfo("1.0.0", "27 Sep 2026"),
  "v1.0.0 · 27 Sep 2026",
  "release metadata uses the service UI convention",
);

const bow0 = bowDirection(0);
const stbd0 = starboardDirection(0);
assert.ok(Math.abs(bow0.x + 1) < 1e-9 && Math.abs(bow0.z) < 1e-9, "yaw 0 bow is -X");
assert.ok(Math.abs(stbd0.z - 1) < 1e-9 && Math.abs(stbd0.x) < 1e-9, "yaw 0 starboard is +Z");

const sim = createSimulation(getShip("titanic"));
sim.helm = 1;
sim.speed = 5;
const yawBefore = sim.rotation.yaw;
for (let i = 0; i < 40; i++) stepSimulation(sim, 0.05);
assert.ok(sim.rotation.yaw > yawBefore, "positive helm increases yaw");
const swung = bowDirection(sim.rotation.yaw);
const towardStbd = (swung.x - bow0.x) * stbd0.x + (swung.z - bow0.z) * stbd0.z;
assert.ok(towardStbd > 0.2, `right helm swings bow to starboard (${towardStbd})`);
assert.ok(sim.position.x < -1, `ship moves toward the bow, x=${sim.position.x}`);

const jump = createSimulation(getShip("titanic"));
triggerDisaster(jump, getDisaster("boiler"));
jump.velocity.y = 8;
let maxY = -Infinity;
for (let i = 0; i < 200; i++) {
  stepSimulation(jump, 0.05);
  maxY = Math.max(maxY, jump.position.y);
}
assert.ok(maxY <= MAX_FLOAT_Y + 1e-6, `ship left the water: y=${maxY}`);

const sink = createSimulation(getShip("nomadic"));
triggerDisaster(sink, getDisaster("mine"));
for (let i = 0; i < 2500; i++) stepSimulation(sink, 0.05);
assert.ok(sink.position.y < -8, `expected a deep sink, y=${sink.position.y}`);
assert.ok(sink.onSeabed, "flooded ship should rest on the sea floor");
assert.ok(sink.position.y >= SEABED_Y, "ship should not fall through the sea floor");
assert.ok(sink.broken || sink.dropStacks, "a wreck should break up or lose a stack");

const straight = createSimulation(getShip("titanic"));
straight.helm = 0;
straight.throttle = 0.7;
straight.speed = 5;
const mine = createHazard(straight, getDisaster("mine"), () => 0);
let hit = false;
for (let i = 0; i < 400 && !mine.resolved; i++) {
  stepSimulation(straight, 0.05);
  updateHazard(straight, mine, 0.05);
}
assert.equal(mine.outcome, "hit", "holding course should strike a mine laid on the track");

const dodge = createSimulation(getShip("titanic"));
dodge.helm = 1;
dodge.throttle = 0.7;
dodge.speed = 5;
const ice = createHazard(dodge, getDisaster("iceberg"), () => 0);
for (let i = 0; i < 500 && !ice.resolved; i++) {
  stepSimulation(dodge, 0.05);
  updateHazard(dodge, ice, 0.05);
}
assert.equal(ice.outcome, "avoided", "a hard turn should clear the iceberg");

const vent = createSimulation(getShip("lusitania"));
vent.throttle = 0.1;
const boiler = createHazard(vent, getDisaster("boiler"), () => 0);
for (let i = 0; i < 200 && !boiler.resolved; i++) updateHazard(vent, boiler, 0.05);
assert.equal(boiler.outcome, "avoided", "cutting throttle should vent the boiler");

const hullCache = new WeakMap();

function shipMeshes(ship) {
  if (!hullCache.has(ship)) {
    const root = buildShipMesh(ship);
    const hullMesh = root.children.find((c) => c.geometry?.attributes?.position?.count > 500);
    hullCache.set(ship, { root, hullMesh });
  }
  return hullCache.get(ship);
}

function shipHull(ship) {
  return shipMeshes(ship).hullMesh;
}

function hullBreadths(ship, stationIndex) {
  const hullMesh = shipHull(ship);
  const pos = hullMesh.geometry.attributes.position;
  const uv = hullMesh.geometry.attributes.uv;
  const targetU = stationIndex / 72;
  let deck = 0;
  let deckY = -Infinity;
  let waterline = 0;
  let waterlineDelta = Infinity;

  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getX(i) - targetU) > 1e-6) continue;
    const halfBreadth = Math.abs(pos.getZ(i));
    if (uv.getY(i) >= 0.84) {
      deck = Math.max(deck, halfBreadth);
      deckY = Math.max(deckY, pos.getY(i));
    }
    const delta = Math.abs(pos.getY(i));
    if (delta < waterlineDelta - 1e-6) {
      waterlineDelta = delta;
      waterline = halfBreadth;
    } else if (Math.abs(delta - waterlineDelta) <= 1e-6) {
      waterline = Math.max(waterline, halfBreadth);
    }
  }

  return { deck, deckY, waterline };
}

for (const ship of SHIPS) {
  const stem = hullBreadths(ship, 0);
  const first = hullBreadths(ship, 1);
  const forward = hullBreadths(ship, 3);
  const shoulder = hullBreadths(ship, 7);
  const midship = hullBreadths(ship, 36);
  const { root, hullMesh } = shipMeshes(ship);
  const deckOverlay = root.getObjectByName("deck-overlay");
  const rigging = root.getObjectByName("rigging");

  assert.ok(stem.deck < 1e-6, `${ship.id} deck closes on the stem (${stem.deck})`);
  assert.ok(stem.waterline < 1e-6, `${ship.id} waterline closes on the stem (${stem.waterline})`);
  assert.ok(
    first.deck / midship.deck > 0.25,
    `${ship.id} gains deck breadth immediately abaft the stem (${first.deck / midship.deck})`,
  );
  assert.ok(
    forward.deck / midship.deck > 0.45,
    `${ship.id} deck is at least 45% full by 4.2% of length (${forward.deck / midship.deck})`,
  );
  assert.ok(
    forward.waterline / midship.waterline > 0.35,
    `${ship.id} waterline is not razor-thin at 4.2% of length (${forward.waterline / midship.waterline})`,
  );
  assert.ok(
    shoulder.deck / midship.deck > 0.75,
    `${ship.id} holds deck breadth through the forward tenth (${shoulder.deck / midship.deck})`,
  );
  for (const name of ["position", "normal"]) {
    const attribute = hullMesh.geometry.attributes[name];
    for (let i = 0; i < attribute.array.length; i++) {
      assert.ok(Number.isFinite(attribute.array[i]), `${ship.id} ${name} ${i} is finite`);
    }
  }
  let priorDeck = -Infinity;
  for (let station = 0; station <= 14; station++) {
    const breadth = hullBreadths(ship, station).deck;
    assert.ok(
      breadth + midship.deck * 0.025 >= priorDeck,
      `${ship.id} entrance has no abrupt reversal at station ${station} (${breadth} < ${priorDeck})`,
    );
    priorDeck = breadth;
  }
  assert.ok(deckOverlay?.isMesh, `${ship.id} exposes its teak deck overlay for geometry checks`);
  const deckPositions = deckOverlay.geometry.attributes.position;
  assert.ok(
    Math.abs(deckPositions.getZ(0)) < 1e-6,
    `${ship.id} teak overlay closes at the stem`,
  );
  const deckNormals = deckOverlay.geometry.attributes.normal;
  assert.ok(
    Math.hypot(deckNormals.getX(0), deckNormals.getY(0), deckNormals.getZ(0)) > 0.99,
    `${ship.id} teak stem has a valid surface normal`,
  );
  assert.ok(rigging?.isLineSegments, `${ship.id} has rigging geometry`);
  if (ship.category === "carrier") continue; // no forestay over a flight deck
  const riggingPositions = rigging.geometry.attributes.position;
  let stemDeckX = Infinity;
  let stemDeckY = -Infinity;
  const hullUv = hullMesh.geometry.attributes.uv;
  const hullPositions = hullMesh.geometry.attributes.position;
  for (let i = 0; i < hullPositions.count; i++) {
    if (Math.abs(hullUv.getX(i)) < 1e-6 && hullUv.getY(i) > 0.99) {
      stemDeckX = Math.min(stemDeckX, hullPositions.getX(i));
      stemDeckY = Math.max(stemDeckY, hullPositions.getY(i));
    }
  }
  assert.ok(
    riggingPositions.getX(0) >= stemDeckX && riggingPositions.getX(0) - stemDeckX < ship.length * 0.015,
    `${ship.id} forestay starts at the raked stem`,
  );
  assert.ok(
    Math.abs(riggingPositions.getY(0) - (stemDeckY + 0.1)) < ship.height * 0.02,
    `${ship.id} forestay height follows the stem deck`,
  );
  assert.ok(Math.abs(riggingPositions.getZ(0)) < 1e-6, `${ship.id} forestay starts on centerline`);

}

const nomadicForward = hullBreadths(getShip("nomadic"), 3);
const nomadicMidship = hullBreadths(getShip("nomadic"), 36);
const lusitaniaForward = hullBreadths(getShip("lusitania"), 3);
const lusitaniaMidship = hullBreadths(getShip("lusitania"), 36);
assert.ok(
  nomadicForward.deck / nomadicMidship.deck - lusitaniaForward.deck / lusitaniaMidship.deck > 0.1,
  "Nomadic's blunt entrance should be visibly fuller than Lusitania's fine entrance",
);

const fullnessOrder = ["nomadic", "andrea-doria", "empress", "titanic", "queen-elizabeth", "lusitania"];
for (let i = 1; i < fullnessOrder.length; i++) {
  const fuller = getShip(fullnessOrder[i - 1]);
  const finer = getShip(fullnessOrder[i]);
  const fullerRatio = hullBreadths(fuller, 3).deck / hullBreadths(fuller, 36).deck;
  const finerRatio = hullBreadths(finer, 3).deck / hullBreadths(finer, 36).deck;
  assert.ok(
    fullerRatio - finerRatio > 0.015,
    `${fuller.id} bow type is visibly fuller than ${finer.id} (${fullerRatio} vs ${finerRatio})`,
  );
}

const mesh = buildShipMesh(getShip("titanic"));
const hull = mesh.children.find((c) => c.geometry?.attributes?.position?.count > 500);
const pos = hull.geometry.attributes.position;
let keelX = 0;
let keelY = Infinity;
let deckX = 0;
let deckY = -Infinity;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const z = pos.getZ(i);
  if (y < keelY) {
    keelY = y;
    keelX = x;
  }
  if (y > deckY && Math.abs(z) < 0.05) {
    deckY = y;
    deckX = x;
  }
}
assert.ok(deckX < keelX - 0.4, `bow deck should overhang the forefoot (deck ${deckX}, keel ${keelX})`);

const funnels = [];
mesh.traverse((o) => {
  if (o.name === "funnel") funnels.push(o);
});
assert.equal(funnels.length, 4, "Titanic keeps four funnels");

const parts = splitShip(mesh);
const countX = (root, pred) => {
  let n = 0;
  let bad = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.geometry?.type === "BoxGeometry") return;
    const g = o.geometry.attributes.position;
    if (!g || g.count < 30) return;
    n++;
    for (let i = 0; i < g.count; i += 5) {
      if (!pred(g.getX(i))) bad++;
    }
  });
  return { n, bad };
};
const bowHalf = countX(parts.bow, (x) => x < 2);
const sternHalf = countX(parts.stern, (x) => x > -2);
assert.ok(bowHalf.n > 0 && sternHalf.n > 0, "both halves keep hull geometry");
assert.ok(bowHalf.bad < 20, `bow half leaked stern vertices (${bowHalf.bad})`);
assert.ok(sternHalf.bad < 20, `stern half leaked bow vertices (${sternHalf.bad})`);

// --- WWII warships (issue #5) ---

const warships = SHIPS.filter((s) => s.category !== "liner");
const byCategory = (c) => warships.filter((s) => s.category === c);
const navies = new Set(warships.map((s) => s.navy));
assert.ok(warships.length >= 12, `at least 12 warships (${warships.length})`);
for (const navy of ["USN", "RN", "KM", "IJN", "RM", "MN"]) {
  assert.ok(navies.has(navy), `roster includes the ${navy}`);
}
const subNavies = new Set(byCategory("submarine").map((s) => s.navy));
assert.ok(byCategory("submarine").length >= 3, "at least three submarines");
for (const navy of ["USN", "KM", "IJN"]) assert.ok(subNavies.has(navy), `${navy} submarine`);
assert.equal(new Set(SHIPS.map((s) => s.id)).size, SHIPS.length, "ship ids are unique");

// Picker: every ship appears once, in a known category group, liners first.
const groups = shipGroups();
assert.equal(groups[0].id, "liner", "liners lead the picker");
assert.equal(groups[0].ships[0].id, "titanic", "Titanic stays the default ship");
assert.deepEqual(
  groups.flatMap((g) => g.ships.map((s) => s.id)).sort(),
  SHIPS.map((s) => s.id).sort(),
  "every ship is in exactly one picker group",
);
for (const s of SHIPS) {
  assert.ok(CATEGORIES.some((c) => c.id === s.category), `${s.id} has a known category`);
}

const named = (root, name) => {
  const out = [];
  root.traverse((o) => {
    if (o.name === name) out.push(o);
  });
  return out;
};
const worldBox = (o) => new THREE.Box3().setFromObject(o);

for (const ship of SHIPS) {
  const style = shipStyle(ship);
  assert.ok(style.own, `${ship.id} has its own silhouette style (no Titanic fallback)`);
  const { root } = shipMeshes(ship);
  const turrets = named(root, "turret");
  const funnels = named(root, "funnel");

  if (ship.category === "liner") {
    assert.equal(turrets.length, 0, `${ship.id} is unarmed`);
    continue;
  }
  assert.ok(root.userData.boatDeck, `${ship.id} records a superstructure extent for reflections`);
  const deckTop = root.userData.boatDeck.y;
  assert.ok(Number.isFinite(deckTop) && deckTop > 0, `${ship.id} topsides stand above the waterline`);

  if (["battleship", "cruiser", "destroyer"].includes(ship.category)) {
    assert.ok(ship.turrets?.length >= 2, `${ship.id} carries a main battery`);
    assert.ok(turrets.length >= ship.turrets.length, `${ship.id} renders every main turret`);
    assert.equal(funnels.length, ship.funnels, `${ship.id} funnel count`);
    // Main turrets sit on the ship, inside her length and above her deck.
    for (const t of ship.turrets) {
      const x = (t.along - 0.5) * ship.length;
      const mount = turrets.find((g) => Math.abs(g.position.x - x) < 1e-6 && Math.abs(g.position.z - (t.z ?? 0) * ship.beam * 0.5) < 1e-6);
      assert.ok(mount, `${ship.id} turret at ${t.along} is placed from ship data`);
      assert.ok(mount.position.y > 0.2, `${ship.id} turret at ${t.along} stands on deck`);
      // Barrels point the way the turret faces: fore turrets toward the bow.
      const facing = t.facing ?? (t.along < 0.5 ? "fore" : "aft");
      const box = worldBox(mount);
      const reach = facing === "fore" ? mount.position.x - box.min.x : box.max.x - mount.position.x;
      assert.ok(reach > t.size * 0.9, `${ship.id} turret at ${t.along} trains ${facing}`);
    }
    // Superfiring turrets clear the turret they fire over.
    const main = [...ship.turrets].filter((t) => !t.z).sort((a, b) => a.along - b.along);
    for (let i = 1; i < main.length; i++) {
      const [a, b] = [main[i - 1], main[i]];
      const hi = a.along < 0.5 ? b : a;
      const lo = a.along < 0.5 ? a : b;
      if (!hi.superfire || Math.abs(a.along - b.along) > 0.12) continue;
      const mounts = [lo, hi].map((t) => turrets.find((g) => Math.abs(g.position.x - (t.along - 0.5) * ship.length) < 1e-6));
      const loTop = worldBox(mounts[0]).max.y;
      const barrels = named(mounts[1], "gun-barrel");
      assert.equal(barrels.length, hi.count, `${ship.id} superfiring barrel count`);
      const hiBottom = Math.min(...barrels.map((b) => worldBox(b).min.y));
      assert.ok(hiBottom > loTop, `${ship.id} superfiring turret at ${hi.along} clears ${lo.along}`);
    }
  }

  if (ship.category === "carrier") {
    const deck = named(root, "flight-deck");
    assert.ok(deck.length >= 1, `${ship.id} has a flight deck`);
    const box = deck.map(worldBox).reduce((a, b) => a.union(b));
    assert.ok(box.max.x - box.min.x > ship.length * 0.85, `${ship.id} flight deck runs nearly full length`);
    assert.ok(box.max.z - box.min.z > ship.beam, `${ship.id} flight deck overhangs the hull`);
    const island = named(root, "island")[0];
    assert.ok(island, `${ship.id} has an island`);
    const side = shipStyle(ship).island.side;
    assert.ok(Math.sign(island.position.z) === side, `${ship.id} island on the ${side > 0 ? "starboard" : "port"} side`);
    assert.ok(island.position.y >= box.max.y - 0.01, `${ship.id} island stands on the flight deck`);
  }

  if (ship.category === "submarine") {
    const tower = named(root, "conning-tower")[0];
    assert.ok(tower, `${ship.id} has a conning tower`);
    assert.equal(funnels.length, 0, `${ship.id} has no funnels`);
    assert.equal(turrets.length, 1, `${ship.id} carries one deck gun`);
    const hull = shipHull(ship);
    hull.geometry.computeBoundingBox();
    const hb = hull.geometry.boundingBox;
    const casingY = hullBreadths(ship, 36).deckY;
    assert.ok(casingY < ship.length * 0.04, `${ship.id} rides low amidships: casing ${casingY}`);
    assert.ok(worldBox(tower).max.y > hb.max.y + 0.2, `${ship.id} tower stands proud of the casing`);
    // Saddle tanks: the hull is widest below the waterline, not at the deck.
    const mid = hullBreadths(ship, 36);
    assert.ok(mid.deck < ship.beam * 0.45, `${ship.id} casing narrower than the pressure hull`);
  }
}

// Every silhouette is distinct: no two ships share size and armament layout.
const signature = (s) =>
  [s.length, s.beam, s.funnels, s.category, (s.turrets ?? []).map((t) => `${t.along}:${t.count}`).join(",")].join("|");
assert.equal(new Set(SHIPS.map(signature)).size, SHIPS.length, "each ship has a distinct silhouette");

// Breakup hands each turret, tower and island to exactly one half.
for (const ship of warships) {
  const { id } = ship;
  const root = buildShipMesh(ship);
  const count = (r) => ["turret", "bridge", "island", "conning-tower"].reduce((n, name) => n + named(r, name).length, 0);
  const whole = count(root);
  const { bow, stern } = splitShip(root);
  assert.equal(count(bow) + count(stern), whole, `${id} keeps every mount through the break`);
  const breakX = ship.length * BREAK_FRACTION;
  for (const g of named(bow, "turret")) assert.ok(g.position.x <= breakX, `${id} bow half keeps only forward mounts`);
  for (const g of named(stern, "turret")) assert.ok(g.position.x > breakX, `${id} stern half keeps only aft mounts`);
}

// Flooding: every warship floods, settles on the bottom, and stays there.
const sinkTime = {};
for (const ship of warships) {
  const s = createSimulation(ship);
  triggerDisaster(s, getDisaster("mine"));
  let t = 0;
  for (; t < 12000 && !s.onSeabed; t++) stepSimulation(s, 0.05);
  assert.ok(s.onSeabed, `${ship.id} sinks to the sea floor after a mine`);
  assert.ok(s.position.y >= SEABED_Y, `${ship.id} does not fall through the sea floor`);
  let maxY = -Infinity;
  for (let i = 0; i < 200; i++) {
    stepSimulation(s, 0.05);
    maxY = Math.max(maxY, s.position.y);
  }
  assert.ok(maxY <= MAX_FLOAT_Y + 1e-6, `${ship.id} never leaves the water`);
  sinkTime[ship.id] = t;
}
// A submarine has little reserve buoyancy; an armoured battleship lasts longer.
assert.ok(sinkTime["u-boat"] < sinkTime.fletcher, `U-boat ${sinkTime["u-boat"]} sinks before Fletcher ${sinkTime.fletcher}`);
assert.ok(sinkTime.yamato > sinkTime.fletcher, `Yamato ${sinkTime.yamato} outlasts Fletcher ${sinkTime.fletcher}`);

// Armour blunts side hits but not an internal blast.
const breach = (id, disaster) => {
  const s = createSimulation(getShip(id));
  triggerDisaster(s, getDisaster(disaster));
  return Math.max(...s.compartments.map((c) => c.breachSize));
};
assert.ok(breach("yamato", "mine") < breach("fletcher", "mine") * 0.7, "belt armour shrinks a mine breach");
assert.equal(breach("yamato", "boiler"), breach("fletcher", "boiler"), "armour does not help against a boiler blast");

// Hazards reach the bow of the shortest and longest hulls alike.
for (const id of ["u-boat", "fletcher", "yamato", "essex"]) {
  const straight = createSimulation(getShip(id));
  straight.throttle = 0.7;
  straight.speed = 5;
  const mine = createHazard(straight, getDisaster("mine"), () => 0);
  for (let i = 0; i < 400 && !mine.resolved; i++) {
    stepSimulation(straight, 0.05);
    updateHazard(straight, mine, 0.05);
  }
  assert.equal(mine.outcome, "hit", `${id} holding course strikes a mine on the track`);

  const dodge = createSimulation(getShip(id));
  dodge.helm = 1;
  dodge.throttle = 0.7;
  dodge.speed = 5;
  const ice = createHazard(dodge, getDisaster("iceberg"), () => 0);
  for (let i = 0; i < 500 && !ice.resolved; i++) {
    stepSimulation(dodge, 0.05);
    updateHazard(dodge, ice, 0.05);
  }
  assert.equal(ice.outcome, "avoided", `${id} hard turn clears the iceberg`);
}

// --- Bridge controls (issue #11) ---

// Engine-order telegraph: nine orders, astern → ahead, with the issue's throttles.
assert.deepEqual(
  ENGINE_ORDERS.map((o) => [o.label, o.throttle]),
  [
    ["Full astern", -0.75],
    ["Half astern", -0.5],
    ["Slow astern", -0.25],
    ["Dead slow astern", -0.12],
    ["Stop", 0],
    ["Dead slow ahead", 0.12],
    ["Slow ahead", 0.28],
    ["Half ahead", 0.55],
    ["Full ahead", 1],
  ],
  "telegraph order table"
);
assert.equal(MIN_THROTTLE, ENGINE_ORDERS[0].throttle, "physics astern floor is full astern");
ENGINE_ORDERS.forEach((o, i) => {
  assert.equal(nearestOrderIndex(o.throttle), i, `${o.label} snaps to itself`);
  assert.equal(dialAngleToOrderIndex(orderDialAngle(i)), i, `${o.label} dial detent`);
  assert.equal(throttleToDialAngle(o.throttle), orderDialAngle(i), `${o.label} dial angle`);
});
assert.equal(orderDialAngle(4), 0, "Stop sits at the top of the dial");
assert.ok(orderDialAngle(8) > 0 && orderDialAngle(0) < 0, "ahead clockwise of astern");
assert.equal(ENGINE_ORDERS[dialAngleToOrderIndex(orderDialAngle(7) + 14)].label, "Half ahead", "release snaps to nearest");
assert.equal(ENGINE_ORDERS[dialAngleToOrderIndex(999)].label, "Full ahead", "dial clamps ahead");
assert.equal(ENGINE_ORDERS[dialAngleToOrderIndex(-999)].label, "Full astern", "dial clamps astern");
assert.equal(createSimulation(getShip("titanic")).throttle, 0.55, "new sims start at Half ahead");

// W/S nudges settle on an order when released; a tap is a single step.
assert.equal(keyReleaseOrderIndex(0.55, 0.56), 8, "tap W from Half ahead → Full ahead");
assert.equal(keyReleaseOrderIndex(0.55, 0.54), 6, "tap S from Half ahead → Slow ahead");
assert.equal(keyReleaseOrderIndex(0.55, 0.1), 5, "held S lands on the nearest order");
assert.equal(keyReleaseOrderIndex(0.55, 0.55), 7, "no movement keeps the order");
assert.equal(keyReleaseOrderIndex(1, 1), 8, "Full ahead stays at the end");

// Wheel: amidships is zero helm, about half a turn either side is hard over.
assert.equal(wheelAngleToHelm(0), 0, "amidships");
assert.equal(wheelAngleToHelm(WHEEL_HARD_OVER), 1, "hard over to starboard");
assert.equal(wheelAngleToHelm(-WHEEL_HARD_OVER), -1, "hard over to port");
assert.equal(wheelAngleToHelm(WHEEL_HARD_OVER * 3), 1, "past the stop stays hard over");
assert.ok(Math.abs(wheelAngleToHelm(WHEEL_HARD_OVER / 2) - 0.5) < 1e-12, "half wheel is half helm");
assert.ok(WHEEL_HARD_OVER > Math.PI * 0.7 && WHEEL_HARD_OVER <= Math.PI, "one gesture, not several turns");
assert.ok(Math.abs(helmToWheelAngle(wheelAngleToHelm(1.1)) - 1.1) < 1e-12, "angle ↔ helm round trip");

// Turning the wheel right (positive angle) swings the bow to starboard.
const wheelTurn = createSimulation(getShip("titanic"));
wheelTurn.helm = wheelAngleToHelm(WHEEL_HARD_OVER * 0.6);
for (let i = 0; i < 40; i++) stepSimulation(wheelTurn, 0.05);
assert.ok(wheelTurn.rotation.yaw > 0, "right wheel increases yaw");

// Full astern is faster astern than slow astern, and the answer pointer lands on the order.
const settle = (throttle) => {
  const s = createSimulation(getShip("titanic"));
  s.throttle = throttle;
  for (let i = 0; i < 400; i++) stepSimulation(s, 0.05);
  return s.speed;
};
const fullAstern = settle(-0.75);
const slowAstern = settle(-0.25);
assert.ok(fullAstern < slowAstern - 1, `full astern ${fullAstern} vs slow astern ${slowAstern}`);
assert.ok(Math.abs(settle(1) - throttleSpeed(1)) < 0.05, "full ahead unchanged at MAX_SPEED");
assert.ok(Math.abs(speedThrottle(fullAstern) + 0.75) < 0.02, "answer pointer reaches full astern");

console.log("sim tests passed");
