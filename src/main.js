import {
  buildShipMesh,
  updateShipFloodVisuals,
  applyDamageVisuals,
  updateDamageEffects,
} from "./shipMesh.js";
import { applyHullDetail } from "./hullDetail.js";
import { getShip, shipGroups, shipLabel } from "./ships.js";
import {
  createSimulation,
  stepSimulation,
  getFloodFraction,
  triggerDisaster,
  headingDegrees,
  bowDirection,
  MAX_SPEED,
  speedThrottle,
} from "./physics.js";
import { createHazard, pickDisaster, updateHazard, hazardWarning } from "./hazards.js";
import { getDisaster } from "./disasters.js";
import { createScene } from "./scene.js";
import { createAtmosphere } from "./atmosphere.js";
import { formatBuildInfo } from "./buildInfo.js";
import {
  ENGINE_ORDERS,
  MIN_THROTTLE,
  MAX_THROTTLE,
  nearestOrderIndex,
  keyReleaseOrderIndex,
} from "./bridge.js";
import { createWheel, createTelegraph } from "./bridgeControls.js";

const canvas = document.getElementById("c");
const shipSelect = document.getElementById("ship-select");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const camBtn = document.getElementById("cam-btn");
const speedSlider = document.getElementById("speed-slider");
const speedReadout = document.getElementById("speed-readout");
const setupPanel = document.getElementById("setup-panel");
const simPanel = document.getElementById("sim-panel");
const statusShip = document.getElementById("status-ship");
const statusDisaster = document.getElementById("status-disaster");
const alertEl = document.getElementById("alert");
const dashEl = document.getElementById("dash");
const statSpeed = document.getElementById("stat-speed");
const statHead = document.getElementById("stat-head");
const statFlood = document.getElementById("stat-flood");
const statList = document.getElementById("stat-list");
const statState = document.getElementById("stat-state");
const buildInfo = document.getElementById("build-info");
const hudEl = document.getElementById("hud");
const bridgeEl = document.getElementById("bridge");

buildInfo.textContent = formatBuildInfo(__APP_VERSION__, __BUILD_DATE__);

for (const group of shipGroups()) {
  const optgroup = document.createElement("optgroup");
  optgroup.label = group.label;
  for (const s of group.ships) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = shipLabel(s);
    optgroup.appendChild(opt);
  }
  shipSelect.appendChild(optgroup);
}

const world = createScene(canvas);
const atmo = createAtmosphere(world);

const atmoSelect = document.getElementById("atmo-select");
for (const p of atmo.presets()) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.label;
  if (p.id === atmo.current()) opt.selected = true;
  atmoSelect.appendChild(opt);
}

const CAM_MODES = ["chase", "orbit", "dock"];
const held = new Set();
const HELM_KEYS = ["KeyA", "KeyD", "ArrowLeft", "ArrowRight"];
const THROTTLE_KEYS = ["KeyW", "KeyS", "ArrowUp", "ArrowDown"];

// The wheel's angle is the rudder order; the telegraph's handle is the engine order.
const wheel = createWheel(bridgeEl, {
  onHelm(helm) {
    if (sim) sim.helm = helm;
  },
});
const telegraph = createTelegraph(bridgeEl, {
  onOrder(i) {
    if (sim) sim.throttle = ENGINE_ORDERS[i].throttle;
  },
});
// Throttle when W/S went down, so release can settle on an order.
let nudgeFrom = null;

let sim = null;
let running = false;
let simSpeed = 1;
let lastT = performance.now();
let hazard = null;
let encounterIn = 4;

function makeShip(ship) {
  const mesh = buildShipMesh(ship);
  applyHullDetail(mesh, ship);
  return mesh;
}

function placePreviewShip() {
  const ship = getShip(shipSelect.value);
  const mesh = makeShip(ship);
  mesh.position.set(0, 0, 0);
  world.setShip(mesh);
  world.controls.target.set(0, ship.height * 0.3, 0);
  const dist = Math.max(14, ship.length * 0.9);
  world.camera.position.set(dist * 0.7, dist * 0.4, dist * 0.85);
  world.setCameraMode("orbit");
  camBtn.textContent = camLabel("orbit");
}

function camLabel(mode) {
  if (mode === "chase") return "Chase cam";
  if (mode === "dock") return "Dock view";
  return "Free camera";
}

function startSimulation() {
  const ship = getShip(shipSelect.value);
  const mesh = makeShip(ship);
  mesh.position.set(0, 0, 0);
  world.setShip(mesh);

  sim = createSimulation(ship);
  running = true;
  hazard = null;
  encounterIn = 3.5 + Math.random() * 2.5;
  simSpeed = parseFloat(speedSlider.value);

  setupPanel.classList.add("hidden");
  simPanel.classList.remove("hidden");
  dashEl.classList.remove("hidden");
  bridgeEl.classList.remove("hidden");
  hudEl.classList.add("bridge-on");
  wheel.reset();
  nudgeFrom = null;
  telegraph.setOrder(nearestOrderIndex(sim.throttle));
  statusShip.textContent = ship.name;
  statusDisaster.textContent = "Underway";
  updateSpeedLabel();

  world.setCameraMode("chase");
  camBtn.textContent = camLabel("chase");
  const bow = bowDirection(0);
  world.camera.position.set(-bow.x * 22, 9, -bow.z * 22);
  world.controls.target.set(0, ship.height * 0.3, 0);
}

function resetSimulation() {
  running = false;
  sim = null;
  hazard = null;
  simPanel.classList.add("hidden");
  dashEl.classList.add("hidden");
  bridgeEl.classList.add("hidden");
  hudEl.classList.remove("bridge-on");
  alertEl.classList.add("hidden");
  setupPanel.classList.remove("hidden");
  world.clearHazard();
  world.clearDebris();
  world.wave.visible = false;
  placePreviewShip();
}

function updateSpeedLabel() {
  const v = parseFloat(speedSlider.value);
  simSpeed = v;
  if (v === 0) speedReadout.textContent = "Pause";
  else speedReadout.textContent = `${v.toFixed(v % 1 === 0 ? 0 : 2)}×`;
}

/**
 * Visual heave, pitch and roll from the swell under the hull. Sampled from
 * the same waves the ocean draws; the physics never sees it. Fades out as the
 * ship goes under.
 */
function swellPose(ship, pos, yaw) {
  const bow = bowDirection(yaw);
  const stbd = { x: -bow.z, z: bow.x };
  const hl = ship.length * 0.42;
  const hb = ship.beam * 0.5;
  const minW = ship.length * 0.35;
  const h = (dx, dz) => world.sampleWave(pos.x + dx, pos.z + dz, minW);
  const fore = h(bow.x * hl, bow.z * hl);
  const aft = h(-bow.x * hl, -bow.z * hl);
  const port = h(-stbd.x * hb, -stbd.z * hb);
  const star = h(stbd.x * hb, stbd.z * hb);
  const afloat = Math.max(0, Math.min(1, 1 + pos.y / ship.height));
  return {
    heave: ((fore + aft + port + star) / 4) * 0.8 * afloat,
    pitch: Math.atan2(fore - aft, hl * 2) * 0.8 * afloat,
    roll: Math.atan2(star - port, hb * 2) * 0.35 * afloat,
  };
}

function applyShipPose(mesh, state) {
  const swell = swellPose(state.ship, state.position, state.rotation.yaw);
  mesh.position.x = state.position.x;
  mesh.position.y = state.position.y + swell.heave;
  mesh.position.z = state.position.z;
  mesh.rotation.order = "YXZ";
  mesh.rotation.y = state.rotation.yaw;
  mesh.rotation.x = state.rotation.roll + swell.roll;
  mesh.rotation.z = -state.rotation.pitch - swell.pitch;
}

function applyPreviewPose(mesh, ship) {
  const swell = swellPose(ship, { x: 0, y: 0, z: 0 }, 0);
  mesh.position.set(0, swell.heave, 0);
  mesh.rotation.order = "YXZ";
  mesh.rotation.set(swell.roll, 0, -swell.pitch);
}

function applyInput(dt) {
  if (!sim) return;
  if (simSpeed === 0) {
    sim.helm = 0;
    return;
  }
  if (held.has("KeyW") || held.has("ArrowUp")) {
    sim.throttle = Math.min(MAX_THROTTLE, sim.throttle + dt * 0.45);
  }
  if (held.has("KeyS") || held.has("ArrowDown")) {
    sim.throttle = Math.max(MIN_THROTTLE, sim.throttle - dt * 0.55);
  }
  // Held A/D force the rudder hard over; otherwise the wheel's angle holds.
  if (HELM_KEYS.some((k) => held.has(k))) {
    let helm = 0;
    if (held.has("KeyA") || held.has("ArrowLeft")) helm -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) helm += 1;
    sim.helm = helm;
    wheel.show(helm);
  } else {
    sim.helm = wheel.helm();
    wheel.show(null);
  }
}

/** Telegraph handle follows a key nudge; the answering pointer follows the engines. */
function updateBridge() {
  if (!sim) return;
  telegraph.update(sim.throttle, speedThrottle(sim.speed), nudgeFrom !== null);
}

function updateEncounter(dt) {
  if (!sim || sim.breachesOpened) {
    world.syncHazard(null, sim ? sim.time : 0);
    world.updateWave(null, 0);
    return;
  }
  if (!hazard) {
    encounterIn -= dt;
    if (encounterIn <= 0) hazard = createHazard(sim, pickDisaster());
  } else {
    updateHazard(sim, hazard, dt);
    if (hazard.resolved) {
      if (hazard.outcome === "hit") {
        triggerDisaster(sim, hazard.disaster);
        const mesh = world.getShip();
        if (mesh) applyDamageVisuals(mesh, hazard.disaster, sim.ship);
        statusDisaster.textContent = hazard.disaster.name;
      } else {
        sim.avoided += 1;
        encounterIn = 6;
        statusDisaster.textContent = "Avoided";
      }
      hazard = null;
      world.clearHazard();
    }
  }
  world.syncHazard(hazard, sim.time);
  world.updateWave(hazard, sim.time);
}

function updateDash() {
  if (!sim) return;
  const kts = sim.speed * 3.15;
  statSpeed.textContent = `${kts.toFixed(1)} kt`;
  statHead.textContent = `${Math.round(headingDegrees(sim.rotation.yaw)).toString().padStart(3, "0")}°`;
  statFlood.textContent = `${Math.round(getFloodFraction(sim) * 100)}%`;
  const listDeg = (sim.rotation.roll * 180) / Math.PI;
  const mark = listDeg > 1.5 ? "S" : listDeg < -1.5 ? "P" : "";
  statList.textContent = `${Math.abs(listDeg).toFixed(0)}°${mark ? " " + mark : ""}`;

  let label = "Underway";
  if (sim.onSeabed) label = "On the bottom";
  else if (sim.broken) label = "Breaking up";
  else if (sim.breachesOpened) label = sim.disaster?.name ?? "Hit";
  else if (hazard?.kind === "boiler") label = `Boiler ${Math.round(hazard.pressure * 100)}%`;
  else if (hazard) label = hazard.disaster.name;
  else if (sim.avoided > 0) label = `Clear · ${sim.avoided}`;
  statState.textContent = label;
  statusDisaster.textContent = label;

  const warn = hazardWarning(hazard);
  alertEl.textContent = warn;
  alertEl.classList.toggle("hidden", !warn);
}

function presentShip() {
  let shown = world.getShip();
  if (!shown || !sim) return;
  applyShipPose(shown, sim);

  if (sim.dropStacks && !sim.stacksReleased) {
    world.releaseStacks(shown, sim.dropAllStacks ? 8 : sim.dropCount || 1);
    sim.stacksReleased = true;
  }
  if (sim.broken && !world.isBroken()) {
    world.beginBreakup(shown);
    shown = world.getShip();
    applyShipPose(shown, sim);
  }
  if (world.isBroken()) world.updateBreak(sim.breakAmount);

  const rudder = shown.getObjectByName("rudder");
  if (rudder) rudder.rotation.y = -sim.helm * 0.55;

  // Dynamos hold until the break or until the sea reaches the boat deck.
  const power = sim.broken ? 0 : Math.max(0, Math.min(1, 1 + (sim.position.y + 0.3) / 1.2));
  world.dimShipLights(power);

  updateShipFloodVisuals(shown, sim);
  updateDamageEffects(shown, sim);
  world.updateEffects(sim, shown);

  if (world.getCameraMode() === "chase") {
    world.updateChase(shown.position, sim.rotation.yaw, sim.ship);
  } else if (world.getCameraMode() === "orbit") {
    world.controls.target.lerp(
      {
        x: shown.position.x,
        y: shown.position.y + sim.ship.height * 0.35,
        z: shown.position.z,
      },
      0.08
    );
  }
}

/** What the ocean needs to draw the hull collar and wake. */
function oceanShipInfo() {
  const mesh = world.getShip();
  if (!mesh) return null;
  const ship = sim ? sim.ship : getShip(shipSelect.value);
  const y = sim ? sim.position.y : 0;
  return {
    pos: mesh.position,
    yaw: sim ? sim.rotation.yaw : 0,
    halfLen: ship.length * 0.5,
    halfBeam: ship.beam * 0.5,
    speed01: sim ? Math.max(0, Math.min(1, Math.abs(sim.speed) / MAX_SPEED)) : 0,
    afloat01: Math.max(0, Math.min(1, 1 + y / (ship.draft * 1.5))) * (sim?.broken ? 0.5 : 1),
    body: reflectionBody(mesh, ship),
  };
}

/** Boxes the water traces for the ship's reflection (see water.js). */
function reflectionBody(mesh, ship) {
  const deck = mesh.userData.boatDeck;
  const hullTop = ship.height * 0.3;
  return {
    hullTop,
    superTop: deck ? deck.y : hullTop,
    superHalfBeam: deck ? deck.beam / 2 : 0,
    superHalfLen: deck ? (deck.x1 - deck.x0) / 2 : 0,
    hullColor: ship.hullColor,
    superColor: ship.superstructureColor,
  };
}

function tick(now) {
  const rawDt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  world.animateWater(rawDt, oceanShipInfo());

  if (running && sim) {
    applyInput(rawDt);
    const dt = rawDt * simSpeed;
    if (dt > 0) {
      const steps = Math.min(8, Math.max(1, Math.ceil(simSpeed)));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) stepSimulation(sim, sub);
      updateEncounter(dt);
    }
    presentShip();
    updateDash();
    updateBridge();
    world.updateDebris(rawDt);
  } else {
    const preview = world.getShip();
    if (preview) applyPreviewPose(preview, getShip(shipSelect.value));
    world.updateEffects(null, null);
  }

  world.render();
  requestAnimationFrame(tick);
}

function cycleCamera() {
  const i = CAM_MODES.indexOf(world.getCameraMode());
  const next = CAM_MODES[(i + 1) % CAM_MODES.length];
  world.setCameraMode(next);
  camBtn.textContent = camLabel(next);
}

startBtn.addEventListener("click", startSimulation);
resetBtn.addEventListener("click", resetSimulation);
shipSelect.addEventListener("change", () => {
  if (!running) placePreviewShip();
});
atmoSelect.addEventListener("change", () => atmo.set(atmoSelect.value));
speedSlider.addEventListener("input", updateSpeedLabel);
camBtn.addEventListener("click", cycleCamera);

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  held.add(e.code);
  if (e.repeat) return;
  if (THROTTLE_KEYS.includes(e.code) && sim && nudgeFrom === null) nudgeFrom = sim.throttle;

  if (e.code === "Space" && running) {
    speedSlider.value = simSpeed > 0 ? "0" : "1";
    updateSpeedLabel();
  }
  if (e.key === "1") {
    speedSlider.value = "1";
    updateSpeedLabel();
  }
  if (e.key === "2") {
    speedSlider.value = "2";
    updateSpeedLabel();
  }
  if (e.key === "4") {
    speedSlider.value = "4";
    updateSpeedLabel();
  }
  if (e.code === "KeyC") cycleCamera();
});

/** When the last W/S key comes up, settle the nudge on an engine order. */
function settleNudge() {
  if (nudgeFrom === null || THROTTLE_KEYS.some((k) => held.has(k))) return;
  if (sim) {
    const i = keyReleaseOrderIndex(nudgeFrom, sim.throttle);
    sim.throttle = ENGINE_ORDERS[i].throttle;
    telegraph.setOrder(i);
  }
  nudgeFrom = null;
}

window.addEventListener("keyup", (e) => {
  held.delete(e.code);
  settleNudge();
});

window.addEventListener("blur", () => {
  held.clear();
  settleNudge();
});

placePreviewShip();
updateSpeedLabel();
requestAnimationFrame(tick);

if (import.meta.env.DEV) {
  // Console hooks for checking visuals: __sinking.trigger("mine")
  window.__sinking = {
    world,
    atmo,
    getSim: () => sim,
    spawn(id) {
      if (!sim) startSimulation();
      hazard = createHazard(sim, getDisaster(id));
    },
    trigger(id) {
      if (!sim) startSimulation();
      const disaster = getDisaster(id);
      triggerDisaster(sim, disaster);
      applyDamageVisuals(world.getShip(), disaster, sim.ship);
    },
  };
}
