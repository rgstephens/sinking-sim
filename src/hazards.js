import { DISASTERS } from "./disasters.js";
import { bowDirection, starboardDirection } from "./frame.js";

export function pickDisaster(rng = Math.random) {
  const i = Math.floor(rng() * DISASTERS.length);
  return DISASTERS[Math.min(DISASTERS.length - 1, i)];
}

export function createHazard(sim, disaster, rng = Math.random) {
  const yaw = sim.rotation.yaw;
  const fwd = bowDirection(yaw);
  const right = starboardDirection(yaw);
  const side = rng() < 0.5 ? -1 : 1;

  if (disaster.id === "boiler") {
    return {
      id: disaster.id,
      disaster,
      kind: "boiler",
      pressure: 0.22,
      phase: 0,
      position: { x: sim.position.x, y: sim.position.y, z: sim.position.z },
      radius: 0,
      side: 0,
      yaw,
      resolved: false,
      outcome: null,
    };
  }

  const lead = disaster.id === "tsunami" ? 32 : disaster.id === "mine" ? 40 : 48;
  const lateral =
    disaster.id === "tsunami"
      ? side * 6
      : disaster.id === "mine"
        ? side * (0.3 + rng() * 1.4)
        : side * (0.6 + rng() * 2.2);
  const radius = disaster.id === "mine" ? 3.1 : disaster.id === "tsunami" ? 11 : 5.6;

  return {
    id: disaster.id,
    disaster,
    kind: disaster.id,
    pressure: 0,
    phase: 0,
    position: {
      x: sim.position.x + fwd.x * lead + right.x * lateral,
      y: disaster.id === "mine" ? -0.25 : 0.15,
      z: sim.position.z + fwd.z * lead + right.z * lateral,
    },
    radius,
    side,
    yaw,
    resolved: false,
    outcome: null,
  };
}

export function bowWorld(sim) {
  const bow = bowDirection(sim.rotation.yaw);
  const reach = sim.ship.length * 0.47;
  return {
    x: sim.position.x + bow.x * reach,
    z: sim.position.z + bow.z * reach,
  };
}

function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function updateHazard(sim, hazard, dt) {
  if (!hazard || hazard.resolved) return hazard;

  if (hazard.kind === "boiler") {
    const hot = sim.throttle > 0.4;
    hazard.pressure += (hot ? 0.16 : -0.22) * dt;
    if (hazard.pressure <= 0) {
      hazard.pressure = 0;
      hazard.resolved = true;
      hazard.outcome = "avoided";
    } else if (hazard.pressure >= 1) {
      hazard.pressure = 1;
      hazard.resolved = true;
      hazard.outcome = "hit";
    }
    return hazard;
  }

  const bow = bowWorld(sim);
  const d = distXZ(bow, hazard.position);

  if (hazard.kind === "tsunami") {
    hazard.phase += dt * 0.2;
    if (d < hazard.radius && hazard.phase > 0.45) {
      hazard.resolved = true;
      hazard.outcome = "hit";
      return hazard;
    }
    if (hazard.phase >= 1) {
      hazard.resolved = true;
      hazard.outcome = d < hazard.radius ? "hit" : "avoided";
    }
    return hazard;
  }

  if (d < hazard.radius) {
    hazard.resolved = true;
    hazard.outcome = "hit";
    return hazard;
  }

  const fwd = bowDirection(sim.rotation.yaw);
  const ahead =
    (hazard.position.x - sim.position.x) * fwd.x +
    (hazard.position.z - sim.position.z) * fwd.z;
  if (ahead < -sim.ship.length * 0.35) {
    hazard.resolved = true;
    hazard.outcome = "avoided";
  }
  return hazard;
}

export function hazardWarning(hazard) {
  if (!hazard || hazard.resolved) return "";
  if (hazard.kind === "boiler") return "BOILER PRESSURE — CUT THROTTLE";
  if (hazard.kind === "iceberg") return "ICEBERG AHEAD — TURN TO MISS IT";
  if (hazard.kind === "mine") return "MINE AHEAD — STEER CLEAR";
  if (hazard.kind === "tsunami") {
    const dir = hazard.side > 0 ? "STARBOARD" : "PORT";
    return `WAVE OFF THE ${dir} BOW — TURN AWAY`;
  }
  return "";
}
