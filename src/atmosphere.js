/**
 * Atmosphere presets — drive sun, sky scattering, clouds, IBL, fog, exposure,
 * water colour, sea state, and lit windows for each look. Returned by
 * createAtmosphere(world).
 *
 * Usage:
 *   const atmo = createAtmosphere(world);
 *   atmo.set("golden");
 *   atmo.set("storm");
 */

const PRESETS = {
  golden: {
    label: "Golden Hour",
    sunElev: 9,
    sunAzim: 235,
    sunColor: 0xffb070,
    sunIntensity: 3.4,
    turbidity: 3.2,
    rayleigh: 2.2,
    mie: 0.0032,
    clouds: 0.32,
    cloudDensity: 0.45,
    envIntensity: 0.9,
    envSea: 0x0c1f2a,
    fogColor: 0xc8a888,
    fogDensity: 0.0022,
    exposure: 0.62,
    bloom: 0.2,
    oceanTurbulence: 0.55,
    waterDeep: 0x07202c,
    waterScatter: 0x2a8f7c,
    haze: 0.0011,
    windowGlow: 0.9,
    hemi: { sky: 0xffd2a8, ground: 0x0c1c26, intensity: 0.12 },
  },
  noon: {
    label: "Clear Noon",
    sunElev: 58,
    sunAzim: 210,
    sunColor: 0xfff6ea,
    sunIntensity: 8.5,
    turbidity: 2.2,
    rayleigh: 1.4,
    mie: 0.003,
    clouds: 0.22,
    cloudDensity: 0.5,
    envIntensity: 1.0,
    envSea: 0x0b2436,
    fogColor: 0xb8cfe0,
    fogDensity: 0.0016,
    exposure: 0.24,
    bloom: 0.25,
    oceanTurbulence: 0.45,
    waterDeep: 0x052c42,
    waterScatter: 0x1e9a8c,
    haze: 0.0009,
    windowGlow: 0,
    hemi: { sky: 0xcfe4f5, ground: 0x0c2232, intensity: 0.15 },
  },
  storm: {
    label: "Storm",
    sunElev: 22,
    sunAzim: 110,
    sunColor: 0xc8d0dc,
    sunIntensity: 1.3,
    turbidity: 10,
    rayleigh: 0.5,
    mie: 0.02,
    clouds: 0.0,
    cloudDensity: 0.95,
    overcast: 1,
    overcastColor: 0x8d949c,
    envIntensity: 1.0,
    envSea: 0x10181e,
    fogColor: 0x6c747c,
    fogDensity: 0.009,
    exposure: 0.95,
    bloom: 0.2,
    oceanTurbulence: 1.7,
    waterDeep: 0x0b1c24,
    waterScatter: 0x2d6e6a,
    haze: 0.004,
    windowGlow: 0.7,
    hemi: { sky: 0x8a94a0, ground: 0x0c1216, intensity: 0.5 },
  },
  overcast: {
    label: "Overcast Fog",
    sunElev: 34,
    sunAzim: 200,
    sunColor: 0xe6e8ea,
    sunIntensity: 0.8,
    turbidity: 8,
    rayleigh: 0.8,
    mie: 0.012,
    clouds: 0.0,
    cloudDensity: 0.7,
    overcast: 0.97,
    overcastColor: 0xb4babf,
    envIntensity: 1.0,
    envSea: 0x1c2428,
    fogColor: 0xa4aaae,
    fogDensity: 0.012,
    exposure: 0.8,
    bloom: 0.15,
    oceanTurbulence: 0.3,
    waterDeep: 0x122229,
    waterScatter: 0x3a6f6a,
    haze: 0.006,
    windowGlow: 0.35,
    hemi: { sky: 0xb0b4b8, ground: 0x1c2024, intensity: 0.35 },
  },
};

export function createAtmosphere(world) {
  let currentName = "golden";

  function set(name) {
    const p = PRESETS[name];
    if (!p) return;
    currentName = name;
    world.setLighting(p);
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
