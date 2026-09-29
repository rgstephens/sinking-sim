# Sinking Sim

A browser game where you pick a ship and a disaster, then watch it flood and go down.

## Run

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To serve a production build:

```bash
npm run build
npm run preview
```

## Deploy

The production image is published as `registry.gstephens.org/sinking-sim:<version>` for amd64 and arm64. See [`deploy/README.md`](deploy/README.md) for the Dell deployment, DNS, proxy, verification, update, and rollback procedure.

## Play

1. Choose a ship and an atmosphere.
2. Click **Get Underway**. The ship is already steaming.
3. Steer with the ship's wheel in the lower left: drag it round and it stays where you leave it. About half a turn either way is hard over; double-click puts it back amidships. Order speed with the engine telegraph in the lower right: drag the handle to an order from Full astern to Full ahead, and the small pointer shows the engines answering. The keys still work: holding `A` / `D` (or the arrow keys) puts the rudder hard over until you let go, and `W` / `S` step the telegraph one order at a time, or sweep it if held.
4. A hazard shows up at random — iceberg, mine, wave, or a boiler running hot. The banner tells you which way to turn, or to cut throttle. Miss it and another one comes. Hit it and the ship floods, lists, and goes down.
5. `C` cycles chase, free, and dock cameras. Drag to orbit in free camera. Scroll to zoom.

The speed slider runs from pause (`0`) through `4×`. **Space** toggles pause. `1`, `2`, and `4` jump to those speeds. **Reset** returns to the setup screen. Shortcuts stay in the lower right. Speed, heading, flood, and list sit in the bubbles along the bottom.

## Graphics

- `sky.js` — Preetham sky with drifting clouds, plus an overcast cloud deck for Storm and Overcast Fog. It also captures the environment maps used for reflections and image-based lighting.
- `water.js` — ocean that reaches the horizon: 8 Gerstner waves, ripple normal maps, whitecaps, sun glitter, bow and Kelvin wake, a mirror image of the ship, refraction of anything under the surface, and Snell's window from below.
- `shipMesh.js` — lofted hull with a raked stem and counter stern. The hull shader paints antifouling, boot-top, sheer line, portholes and weathering. Also builds the windowed superstructure, raked funnels, davits, rigging and hospital livery.
- `effects.js` — coal smoke, fire, spray and bubble particles.
- `scene.js` — HDR multisampled render, refraction pass, bloom keyed to exposure, vignette and grade, seabed, iceberg and tsunami meshes.
- `atmosphere.js` — one table per preset: sun, sky, clouds, exposure, bloom, water colour, sea state and window glow.

In dev builds, `__sinking.spawn("iceberg")` and `__sinking.trigger("mine")` in the console bring on a hazard or a hit straight away.
