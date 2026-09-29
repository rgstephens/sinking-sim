import assert from "node:assert/strict";
import { SHIPS, getShip } from "./ships.js";
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
import { buildShipMesh, splitShip } from "./shipMesh.js";
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
  let waterline = 0;
  let waterlineDelta = Infinity;

  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getX(i) - targetU) > 1e-6) continue;
    const halfBreadth = Math.abs(pos.getZ(i));
    if (uv.getY(i) >= 0.84) deck = Math.max(deck, halfBreadth);
    const delta = Math.abs(pos.getY(i));
    if (delta < waterlineDelta - 1e-6) {
      waterlineDelta = delta;
      waterline = halfBreadth;
    } else if (Math.abs(delta - waterlineDelta) <= 1e-6) {
      waterline = Math.max(waterline, halfBreadth);
    }
  }

  return { deck, waterline };
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

  let priorDeck = -Infinity;
  for (let station = 0; station <= 14; station++) {
    const breadth = hullBreadths(ship, station).deck;
    assert.ok(
      breadth + midship.deck * 0.025 >= priorDeck,
      `${ship.id} entrance has no abrupt reversal at station ${station} (${breadth} < ${priorDeck})`,
    );
    priorDeck = breadth;
  }

  for (const name of ["position", "normal"]) {
    const attribute = hullMesh.geometry.attributes[name];
    for (let i = 0; i < attribute.array.length; i++) {
      assert.ok(Number.isFinite(attribute.array[i]), `${ship.id} ${name} ${i} is finite`);
    }
  }
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
