/**
 * Ship frame. Bow is local −X. yaw is Object3D rotation.y (CCW from above).
 *
 * Check: yaw = 0 → bow (−1, 0, 0), starboard (0, 0, +1).
 * d(bow)/d(yaw) at 0 is (0, 0, +1), which is starboard, so +yaw / +helm is a right turn.
 */

export function bowDirection(yaw) {
  return { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) };
}

export function starboardDirection(yaw) {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}
