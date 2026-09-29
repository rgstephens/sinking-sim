/**
 * Compartment flooding, buoyancy, and helm.
 *
 * The ship frame: bow is local −X. yaw is rotation about Y (CCW from above).
 *   yaw = 0 → bow (−1, 0, 0), starboard (0, 0, +1).
 *   Positive helm (D / right) increases yaw, so the bow swings toward starboard.
 * Both vectors come from the helpers below. Nothing else rebuilds this frame.
 *
 * Vertical motion springs toward a flood-dependent draft. An empty ship sits
 * on y = 0 and is clamped so it cannot leave the water upward. A flooded ship
 * settles on the sea floor.
 */

import { bowDirection, starboardDirection } from "./frame.js";

export { bowDirection, starboardDirection };

const OVERFLOW_RATE = 0.32;
const FLOOD_BASE = 0.16;
const DAMPING_ANGULAR = 1.8;
const STABILITY = 3.8;

const HEAVE_SPRING = 4.5;
const HEAVE_DAMP = 4.4;
export const MAX_FLOAT_Y = 0.08;
export const SEABED_Y = -18;
export const MAX_SPEED = 8;
const HELM_RATE = 0.34;
// Full astern order. Screws pull less going astern than ahead.
export const MIN_THROTTLE = -0.75;
export const ASTERN_POWER = 0.6;

/** Speed the engines settle at for a throttle order, before flooding drag. */
export function throttleSpeed(throttle) {
  const t = Math.max(MIN_THROTTLE, Math.min(1, throttle));
  return t * MAX_SPEED * (t < 0 ? ASTERN_POWER : 1);
}

/** Inverse of throttleSpeed: the order a given speed answers to. */
export function speedThrottle(speed) {
  return speed / (MAX_SPEED * (speed < 0 ? ASTERN_POWER : 1));
}

export function createSimulation(ship) {
  const n = ship.compartments;
  const compartments = Array.from({ length: n }, (_, i) => ({
    index: i,
    along: (i + 0.5) / n,
    capacity: 1,
    fill: 0,
    open: false,
    breachSize: 0,
    sideBias: 0,
  }));

  return {
    ship,
    disaster: null,
    compartments,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, roll: 0, yaw: 0 },
    angularVel: { pitch: 0, roll: 0, yaw: 0 },
    yawKick: 0,
    helm: 0,
    throttle: 0.55,
    speed: 4.4,
    time: 0,
    hitTime: -1,
    breachesOpened: false,
    sunk: false,
    onSeabed: false,
    broken: false,
    breakAmount: 0,
    dropStacks: false,
    dropAllStacks: false,
    explosionFlash: 0,
    avoided: 0,
  };
}

export function triggerDisaster(state, disaster) {
  if (state.breachesOpened || !disaster) return;
  state.disaster = disaster;
  state.hitTime = state.time;
  openBreaches(state);
}

export function openBreaches(state) {
  if (state.breachesOpened || !state.disaster) return;
  state.breachesOpened = true;
  const n = state.compartments.length;
  const { breaches, initialImpulse } = state.disaster;

  for (const b of breaches) {
    const idx = Math.min(n - 1, Math.max(0, Math.floor(b.along * n)));
    const c = state.compartments[idx];
    c.open = true;
    c.breachSize = Math.max(c.breachSize, b.size * (0.6 + b.depth * 0.5));
    c.sideBias += b.side;
  }

  state.angularVel.roll += initialImpulse.roll;
  state.angularVel.pitch += initialImpulse.pitch;
  state.yawKick += initialImpulse.yaw;

  if (state.disaster.wave) state.velocity.y -= 0.55;
  if (state.disaster.explosion) {
    state.explosionFlash = 1;
    state.velocity.y -= 0.12;
  }
}

export function stepSimulation(state, dt) {
  if (dt <= 0) return;
  const t = Math.min(dt, 0.08);
  state.time += t;

  const ship = state.ship;

  for (const c of state.compartments) {
    if (c.open && c.fill < 1) {
      const depthFactor = 1 + Math.max(0, -state.position.y) * 0.08;
      const rate = FLOOD_BASE * c.breachSize * depthFactor;
      c.fill = Math.min(1, c.fill + rate * t);
    }
  }

  for (let i = 0; i < state.compartments.length; i++) {
    const c = state.compartments[i];
    if (c.fill < 0.92) continue;
    const overflow = (c.fill - 0.92) * OVERFLOW_RATE * t;
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= state.compartments.length) continue;
      const n = state.compartments[j];
      if (n.fill >= 1) continue;
      n.fill = Math.min(1, n.fill + overflow * 0.55);
      if (n.fill > 0.05) n.open = true;
      if (n.breachSize < 0.15) n.breachSize = 0.15;
    }
  }

  let waterMass = 0;
  let comX = 0;
  let comZ = 0;
  const massEmpty = ship.length * ship.beam * ship.height * 0.35;

  for (const c of state.compartments) {
    const m =
      c.fill *
      (ship.length / state.compartments.length) *
      ship.beam *
      ship.height *
      0.55;
    waterMass += m;
    const cx = (c.along - 0.5) * ship.length;
    const cz = c.sideBias * ship.beam * 0.18 * Math.min(1, c.fill * 1.4);
    comX += m * cx;
    comZ += m * cz;
  }

  const totalMass = massEmpty + waterMass;
  comX = waterMass > 0 ? comX / totalMass : 0;
  comZ = waterMass > 0 ? comZ / totalMass : 0;

  const floodFrac =
    state.compartments.reduce((s, c) => s + c.fill, 0) /
    state.compartments.length;

  const restY = SEABED_Y + ship.draft + 0.3;
  const sinkT = clamp((floodFrac - 0.38) / 0.62, 0, 1);
  const targetY = sinkT * sinkT * sinkT * restY;

  let ay =
    (targetY - state.position.y) * HEAVE_SPRING - state.velocity.y * HEAVE_DAMP;
  if (state.velocity.y > 0.6) state.velocity.y = 0.6;

  state.velocity.y += ay * t;
  state.position.y += state.velocity.y * t;

  if (state.position.y > MAX_FLOAT_Y) {
    state.position.y = MAX_FLOAT_Y;
    if (state.velocity.y > 0) state.velocity.y = 0;
  }

  if (state.position.y <= restY + 1e-3) {
    state.position.y = restY;
    if (state.velocity.y < 0) state.velocity.y = 0;
    if (floodFrac > 0.45) {
      state.onSeabed = true;
      state.sunk = true;
    }
  }

  const targetPitch = clamp(comX / (ship.length * 0.35), -0.95, 0.95);
  const targetRoll = clamp(comZ / (ship.beam * 0.22), -1.25, 1.25);

  let rollBias = 0;
  if (state.disaster?.wave && state.breachesOpened) {
    const since = state.time - state.hitTime;
    rollBias = 0.38 * Math.exp(-Math.max(0, since) * 0.22);
  }

  const pitchErr = targetPitch - state.rotation.pitch;
  const rollErr = targetRoll + rollBias - state.rotation.roll;
  const stability = STABILITY * (1 - floodFrac * 0.72);

  state.angularVel.pitch += pitchErr * stability * t;
  state.angularVel.roll += rollErr * stability * t;

  if (Math.abs(state.rotation.roll) > 0.85 && floodFrac > 0.35) {
    state.angularVel.roll += Math.sign(state.rotation.roll) * 0.45 * t;
  }

  state.angularVel.pitch *= Math.exp(-DAMPING_ANGULAR * t);
  state.angularVel.roll *= Math.exp(-DAMPING_ANGULAR * t);

  if (state.onSeabed) {
    state.angularVel.pitch *= Math.exp(-2.5 * t);
    state.angularVel.roll *= Math.exp(-2.5 * t);
    const restPitch = state.broken ? 0.4 * Math.sign(state.rotation.pitch || 1) : 0.12 * Math.sign(state.rotation.pitch || 1);
    state.rotation.pitch += (restPitch - state.rotation.pitch) * Math.min(1, t * 0.35);
  }

  state.rotation.pitch += state.angularVel.pitch * t;
  state.rotation.roll += state.angularVel.roll * t;

  const drag = state.onSeabed ? 0 : Math.max(0.05, 1 - floodFrac * 0.85);
  const targetSpeed = throttleSpeed(state.throttle) * drag;
  state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-1.15 * t));
  if (state.onSeabed) state.speed *= Math.exp(-2.4 * t);

  const authority = Math.min(1, Math.abs(state.speed) / 2.2);
  const steer = state.helm * HELM_RATE * (0.2 + 0.8 * authority);
  state.rotation.yaw += (steer + state.yawKick) * t;
  state.yawKick *= Math.exp(-1.6 * t);

  const bow = bowDirection(state.rotation.yaw);
  const stbd = starboardDirection(state.rotation.yaw);
  state.position.x += bow.x * state.speed * t + stbd.x * state.rotation.roll * 0.35 * t;
  state.position.z += bow.z * state.speed * t + stbd.z * state.rotation.roll * 0.35 * t;

  if (state.explosionFlash > 0) {
    state.explosionFlash = Math.max(0, state.explosionFlash - t * 1.4);
  }

  if (state.breachesOpened && !state.broken) {
    const sag = Math.abs(state.rotation.pitch);
    if (
      (floodFrac > 0.72 && sag > 0.18) ||
      (floodFrac > 0.58 && sag > 0.42) ||
      (state.onSeabed && floodFrac > 0.5)
    ) {
      state.broken = true;
    }
  }
  if (state.broken) {
    state.breakAmount = Math.min(1, state.breakAmount + t * 0.12);
  }

  if (state.breachesOpened && !state.dropStacks) {
    const capsize = Math.abs(state.rotation.roll) > 1.05;
    if (state.disaster?.explosion || state.broken || capsize) {
      state.dropStacks = true;
      state.dropAllStacks = capsize;
      state.dropCount = capsize ? 8 : state.broken ? 2 : 1;
    }
  }
}

export function getFloodFraction(state) {
  if (!state?.compartments?.length) return 0;
  return (
    state.compartments.reduce((s, c) => s + c.fill, 0) / state.compartments.length
  );
}

export function headingDegrees(yaw) {
  const deg = (yaw * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
