/**
 * Each disaster defines a different failure mode for the flooding sim.
 * Breaches are expressed in compartment-space (0 = bow, 1 = stern).
 */

export const DISASTERS = [
  {
    id: "tsunami",
    name: "Tsunami",
    description: "Broadside wave — hard roll, may capsize",
    // Wave impact applies impulse; breaches open midships starboard
    initialImpulse: { roll: 0.55, pitch: 0.05, yaw: 0.02 },
    breachDelay: 0.8,
    breaches: [
      { along: 0.35, side: 1, size: 0.55, depth: 0.35 },
      { along: 0.5, side: 1, size: 0.7, depth: 0.4 },
      { along: 0.65, side: 1, size: 0.5, depth: 0.35 },
    ],
    wave: true,
    explosion: false,
    gash: false,
  },
  {
    id: "boiler",
    name: "Boiler explosion",
    description: "Internal blast midships — rapid localized flood + vent",
    initialImpulse: { roll: 0.08, pitch: 0.04, yaw: 0 },
    breachDelay: 1.2,
    breaches: [
      { along: 0.45, side: 0, size: 0.95, depth: 0.55 },
      { along: 0.55, side: 0, size: 0.75, depth: 0.5 },
    ],
    wave: false,
    explosion: true,
    gash: false,
  },
  {
    id: "mine",
    name: "Mine strike",
    description: "Single violent below-waterline blast",
    initialImpulse: { roll: 0.12, pitch: 0.18, yaw: 0.03 },
    breachDelay: 0.15,
    breaches: [{ along: 0.28, side: -1, size: 1.1, depth: 0.7 }],
    wave: false,
    explosion: true,
    gash: false,
  },
  {
    id: "iceberg",
    name: "Iceberg collision",
    description: "Long side gash — progressive multi-compartment flood",
    initialImpulse: { roll: 0.04, pitch: 0.02, yaw: 0.01 },
    breachDelay: 0.4,
    // Long shallow scrape along starboard bow→mid
    breaches: [
      { along: 0.08, side: 1, size: 0.22, depth: 0.55 },
      { along: 0.18, side: 1, size: 0.28, depth: 0.55 },
      { along: 0.28, side: 1, size: 0.32, depth: 0.5 },
      { along: 0.38, side: 1, size: 0.25, depth: 0.48 },
      { along: 0.48, side: 1, size: 0.18, depth: 0.45 },
    ],
    wave: false,
    explosion: false,
    gash: true,
  },
];

export function getDisaster(id) {
  return DISASTERS.find((d) => d.id === id) ?? DISASTERS[0];
}
