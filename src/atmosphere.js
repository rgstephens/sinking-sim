/**
 * Atmosphere presets — drives sun position, fog, exposure, and ocean turbulence
 * for the major look variants. Returned by createAtmosphere(world).
 *
 * Usage:
 *   const atmo = createAtmosphere(world);
 *   atmo.set("golden");
 *   atmo.set("storm");
 */

const PRESETS = {
  golden: {
    label: "Golden Hour",
    sunElev: 16,
    sunAzim: 220,
    fogColor: 0xe8b888,
    fogDensity: 0.0030,
    exposure: 1.25,
    turbidity: 3.5,
    rayleigh: 3.0,
    oceanTurbulence: 0.6,
    hemi: { sky: 0xe8b888, ground: 0x2a3040, intensity: 0.55 },
  },
  noon: {
    label: "Clear Noon",
    sunElev: 60,
    sunAzim: 220,
    fogColor: 0xa8c8e0,
    fogDensity: 0.0025,
    exposure: 1.05,
    turbidity: 2.0,
    rayleigh: 1.6,
    oceanTurbulence: 0.4,
    hemi: { sky: 0xc8e0f5, ground: 0x1a3040, intensity: 0.65 },
  },
  storm: {
    label: "Storm",
    sunElev: 28,
    sunAzim: 90,
    fogColor: 0x5a6878,
    fogDensity: 0.0090,
    exposure: 0.85,
    turbidity: 9,
    rayleigh: 0.4,
    oceanTurbulence: 1.6,
    hemi: { sky: 0x6a7080, ground: 0x101418, intensity: 0.35 },
  },
  overcast: {
    label: "Overcast Fog",
    sunElev: 40,
    sunAzim: 200,
    fogColor: 0xb0b6bc,
    fogDensity: 0.0120,
    exposure: 0.95,
    turbidity: 6,
    rayleigh: 0.8,
    oceanTurbulence: 0.3,
    hemi: { sky: 0xa8acb2, ground: 0x2a2c30, intensity: 0.55 },
  },
};

export function createAtmosphere(world) {
  let currentName = "golden";

  function set(name) {
    const p = PRESETS[name];
    if (!p) return;
    currentName = name;

    // Sun → sky + env map
    world.setSun(p.sunElev, p.sunAzim);

    // Fog
    world.scene.fog.color.setHex(p.fogColor);
    world.scene.fog.density = p.fogDensity;

    // Exposure
    world.renderer.toneMappingExposure = p.exposure;

    // Ocean turbulence
    if (world.setOceanTurbulence) world.setOceanTurbulence(p.oceanTurbulence);
  }

  function current() {
    return currentName;
  }

  function presets() {
    return Object.entries(PRESETS).map(([id, p]) => ({ id, ...p }));
  }

  // Apply default
  set("golden");

  return { set, current, presets, defaults: PRESETS };
}
