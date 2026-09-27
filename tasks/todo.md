# Realistic graphics pass

## Findings (review)
- Env map is empty: `sky.js` adds the Sky mesh to `skyScene` then to `scene`; an Object3D has one parent, so PMREM + cube capture render nothing. Water and every PBR material reflect black.
- Sky blown to white: exposure 1.05–1.25 with the Preetham sky (tuned for ~0.5).
- Ocean ends 130 units out (hard edge before horizon), no fog/aerial perspective, blotchy low-frequency "foam" everywhere, no fine ripples, round halo instead of a wake.
- Hull stripes are 96 separate boxes (jagged dashes) plus an inflated antifoul shell (z-fighting). Portholes are ~300 separate meshes.
- Superstructure is flat white boxes with blue "glass" slabs; lifeboat davits are torus rings that read as handles.
- Liveries wrong: Lusitania magenta funnels, Britannic black hull (she was a white hospital ship with green band + red crosses), Titanic funnels orange instead of White Star buff.
- Smoke is fixed-size round points moving at a hard-coded 0.016 step; explosion is an orange sphere.
- Iceberg is three low-poly dodecahedra; seabed is a flat plane.
- Broken halves lose UVs/normals (faceted), superstructure goes to one half whole.

## Plan
- [x] Upgrade three 0.172 → 0.186 (built-in Sky clouds)
- [x] Sky: fix env capture, clouds per preset, sun disc hidden in capture, dark sea floor in env
- [x] Renderer: EffectComposer (MSAA HDR target) + subtle bloom + vignette + OutputPass; exposure/lighting retune; presets drive hemi/sun/clouds/window glow
- [x] Ocean: horizon-reaching remapped grid, 8 Gerstner waves w/ distance fade, detail normal map, Jacobian whitecaps, SSS, GGX sun glitter, Kelvin wake + bow wave + hull foam, horizon haze, underwater side
- [x] Ship bobs on the swell (visual only, sampled from the same waves)
- [x] Hull shader: crisp antifoul/boot/sheer lines, portholes w/ dusk glow, weathering, Britannic hospital livery
- [x] Superstructure window textures + planked tops, lit windows at dusk; deck planks
- [x] Funnels: rake, elliptical, soot; dummy 4th funnel on Olympic class emits no smoke
- [x] Lifeboats/davits/railings rebuilt + merged; rigging
- [x] splitShip keeps all attributes; superstructure split at break
- [x] Particle system: coal smoke, fire, spray, bubbles; explosion fireball + light
- [x] Iceberg sculpted mesh; tsunami wave foam lip; seabed terrain
- [x] Verify: tests, build, screenshots of each preset + a sinking

## Review

Verified with `npm test`, `vite build`, and headless Chrome (Metal GPU) screenshots of every preset, the fleet, the iceberg, the tsunami, a mine strike, flooding, breakup and the wreck on the seabed. Frame rate holds 60 fps at 1280×800.

Beyond the plan:
- Stern was lofted as a point like the bow, so the ship read backwards. It is now a rounded, overhanging counter stern.
- Freeboard was too low (one deck of black hull); raised to Olympic-class proportions.
- Water refraction pass: submerged hulls and the iceberg's underwater mass show through, tinted by depth.
- Analytic ship reflection in the water (ray against hull and superstructure boxes).
- Bloom threshold is keyed to exposure. The noon sky is ~10× brighter in HDR and veiled everything otherwise.
- Sky sun disc scaled down (the stock 760× floods bloom); overcast deck added because Preetham can't do grey skies.
- Lights fail at the break or once the boat deck floods; interior flood boxes hide once the hull is under.
- Seabed rocks were torn into shards (non-indexed jitter); keyed by position now.

Known limits: the Kelvin wake is straight behind the current heading, not a trail of the path; the dock is a free-floating pier as before.
