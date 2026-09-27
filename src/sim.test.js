import assert from "node:assert/strict";
import { getShip } from "./ships.js";
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

const mesh = buildShipMesh(getShip("titanic"));
const hull = mesh.children.find((c) => c.geometry?.attributes?.position?.count > 500);
const pos = hull.geometry.attributes.position;
let minX = Infinity;
let keelX = 0;
let keelY = Infinity;
let deckX = 0;
let deckY = -Infinity;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const z = pos.getZ(i);
  if (x < minX) minX = x;
  if (y < keelY) {
    keelY = y;
    keelX = x;
  }
  if (y > deckY && Math.abs(z) < 0.05) {
    deckY = y;
    deckX = x;
  }
}
let bowBreadth = 0;
for (let i = 0; i < pos.count; i++) {
  if (pos.getX(i) < minX + 0.35) bowBreadth = Math.max(bowBreadth, Math.abs(pos.getZ(i)));
}
assert.ok(bowBreadth < 0.15, `stem should be sharp, breadth=${bowBreadth}`);
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

console.log("sim tests passed");
