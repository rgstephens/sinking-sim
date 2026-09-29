/**
 * Bridge controls: the ship's wheel and the engine-order telegraph.
 *
 * Pure mapping only (no DOM) so the node tests can check it. The widgets that
 * draw and drag these live in bridgeControls.js.
 *
 * Wheel: angle in radians, clockwise positive as seen on screen. Turning the
 * wheel right swings the bow to starboard, the same as positive helm.
 *
 * Telegraph: dial angle in degrees from the top, clockwise positive. Astern
 * orders sit on the left, ahead orders on the right, Stop at the top.
 */

/** Wheel angle that means hard over: a bit under half a turn either way. */
export const WHEEL_HARD_OVER = (150 * Math.PI) / 180;

/** Engine orders, astern → ahead, in the order they sit clockwise on the dial. */
export const ENGINE_ORDERS = [
  { id: "full-astern", label: "Full astern", short: "FULL", throttle: -0.75 },
  { id: "half-astern", label: "Half astern", short: "HALF", throttle: -0.5 },
  { id: "slow-astern", label: "Slow astern", short: "SLOW", throttle: -0.25 },
  { id: "dead-slow-astern", label: "Dead slow astern", short: "D.SLOW", throttle: -0.12 },
  { id: "stop", label: "Stop", short: "STOP", throttle: 0 },
  { id: "dead-slow-ahead", label: "Dead slow ahead", short: "D.SLOW", throttle: 0.12 },
  { id: "slow-ahead", label: "Slow ahead", short: "SLOW", throttle: 0.28 },
  { id: "half-ahead", label: "Half ahead", short: "HALF", throttle: 0.55 },
  { id: "full-ahead", label: "Full ahead", short: "FULL", throttle: 1 },
];

export const MIN_THROTTLE = ENGINE_ORDERS[0].throttle;
export const MAX_THROTTLE = ENGINE_ORDERS[ENGINE_ORDERS.length - 1].throttle;

/** Degrees between neighbouring orders on the dial. */
export const DIAL_STEP = 30;
const DIAL_START = -DIAL_STEP * ((ENGINE_ORDERS.length - 1) / 2);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function wheelAngleToHelm(angle) {
  return clamp(angle / WHEEL_HARD_OVER, -1, 1);
}

export function helmToWheelAngle(helm) {
  return clamp(helm, -1, 1) * WHEEL_HARD_OVER;
}

/** Index of the order whose throttle is closest to `throttle`. */
export function nearestOrderIndex(throttle) {
  let best = 0;
  for (let i = 1; i < ENGINE_ORDERS.length; i++) {
    if (Math.abs(ENGINE_ORDERS[i].throttle - throttle) < Math.abs(ENGINE_ORDERS[best].throttle - throttle)) {
      best = i;
    }
  }
  return best;
}

export function orderDialAngle(index) {
  return DIAL_START + index * DIAL_STEP;
}

export function dialAngleToOrderIndex(angle) {
  return clamp(Math.round((angle - DIAL_START) / DIAL_STEP), 0, ENGINE_ORDERS.length - 1);
}

/** Dial angle for any throttle, interpolating between the orders. */
export function throttleToDialAngle(throttle) {
  const t = clamp(throttle, MIN_THROTTLE, MAX_THROTTLE);
  for (let i = 1; i < ENGINE_ORDERS.length; i++) {
    const a = ENGINE_ORDERS[i - 1].throttle;
    const b = ENGINE_ORDERS[i].throttle;
    if (t <= b) return orderDialAngle(i - 1) + ((t - a) / (b - a)) * DIAL_STEP;
  }
  return orderDialAngle(ENGINE_ORDERS.length - 1);
}

/**
 * Order to settle on when W or S is released. Normally the nearest detent,
 * but a nudge that moved the throttle at all always lands at least one order
 * in the direction of travel, so a quick tap is a single step.
 */
export function keyReleaseOrderIndex(startThrottle, endThrottle) {
  const start = nearestOrderIndex(startThrottle);
  const near = nearestOrderIndex(endThrottle);
  const moved = endThrottle - startThrottle;
  if (near !== start || Math.abs(moved) < 1e-6) return near;
  return clamp(start + Math.sign(moved), 0, ENGINE_ORDERS.length - 1);
}
