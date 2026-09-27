# Sinking Sim — a Fish Slop–style game prompt

Taking the same shape as [fishslop.md](fishslop.md): a short, casual seed prompt that names the reference and leaves mechanics implied, a slightly more complete variant if you want to spell out the loop, and a follow-up ladder for iterating once the first version exists. This one is for a **3D ship-sinking simulator**, not a reconstruction of someone else's prompt — it's the one to actually paste in.

---

## What Sinking Sim is

| Piece | Detail |
| --- | --- |
| Inspiration | Physics/disaster sims like *Sinking Simulator*, *Floating Sandbox*, and *Ship Simulator* damage models |
| Core loop | Pick a ship → pick a disaster → pick a simulation speed → watch (and nudge) the ship flood, list, and go down |
| Stack | Three.js (WebGL) for rendering; a lightweight buoyancy/physics layer (custom or cannon-es / Rapier) for hull tilt, flooding, and breakup |
| Disasters | Tsunami wave strike, boiler explosion, mine contact, iceberg collision |
| Ships | Titanic, Britannic, Nomadic, Queen Elizabeth, and a few more (Lusitania, Andrea Doria, Empress of Ireland are good next additions) |
| Controls | Disaster picker, ship picker, simulation-speed slider (pause → 1x → fast-forward), free camera |
| Failure modes to watch for | Ship sinks instantly instead of progressively flooding, water doesn't actually rise inside the hull, no distinction between disaster types beyond a label, tilt physics that snap/glitch instead of settling, ships that are all the same silhouette re-skinned |

---

## Seed prompt (short, Theo-style)

```text
Build a browser game called Sinking Sim, in 3D with Three.js.
Pick a ship (Titanic, Britannic, Nomadic, Queen Elizabeth, and a few more historical ocean liners), pick how it sinks (tsunami, boiler explosion, mine strike, iceberg collision), and watch it flood and go down. Let me control the speed of the simulation. Keep it simple and playable.
```

---

## More complete variant (spell out the loop)

```text
Make Sinking Sim — a 3D ship-sinking simulator for the browser, Three.js.

- Ship picker: Titanic, Britannic, Nomadic, Queen Elizabeth, plus a couple more real ocean liners (Lusitania, Andrea Doria, etc.) — distinct hull shapes/sizes, not reskins
- Disaster picker, each with a different failure mode:
  - Tsunami: a wave hits broadside, ship rolls hard and may capsize
  - Boiler explosion: internal blast breaches a compartment, rapid localized flooding, maybe a fire/smoke effect
  - Mine: below-waterline hull breach, flooding starts at the strike point and spreads
  - Iceberg: gash along the side below the waterline, progressive multi-compartment flooding (bonus points if compartments overflow into each other like the real Titanic)
- Flooding sim: water level inside the hull actually rises over time based on breach size/location, ship tilts and settles realistically (bow-down, list to one side, etc.) as compartments fill
- Simulation speed control: pause, 1x, and at least a fast-forward option, so you can watch a slow flood or skip ahead
- Free-orbit camera plus maybe a fixed "watch from the dock" view
- Simple water shader/plane is fine — focus the effort on the sinking physics and ship variety, not photorealism
```

---

## Follow-up ladder (once a first version exists)

Make the tilt/flooding feel right:

```text
The ship sinks too fast / too uniformly — it should list and go bow or stern down based on where the water's flooding in, and slow down as it approaches the point of no return. Fix the physics, don't just fake a rotation animation.
```

Push disaster variety further:

```text
Right now all four disasters look the same underneath. Make the iceberg gash a long shallow scrape along the side, the mine a single violent below-the-waterline blast, the boiler explosion an internal event you see venting from the funnels/hull before flooding starts, and the tsunami a wave you can actually see roll in and hit before the sinking begins.
```

Add more ships without breaking the picker:

```text
Add the Lusitania, Andrea Doria, and Empress of Ireland to the ship picker. Each needs its own hull proportions and dimensions, not a rescaled Titanic.
```

If speed control feels broken:

```text
The speed slider doesn't actually change the simulation rate, it just changes animation playback. Make it control the actual physics timestep so flooding, tilt, and camera drift all speed up or slow down together.
```

Cousin "cleanup" prompt once it's messy:

```text
This Sinking Sim codebase is vibe-coded slop. Rewrite it cleanly from first principles — separate the ship data, the disaster/damage logic, and the render loop into clear modules. Fewer files, same game.
```

---

## Best single guess (one string, paste-ready)

```text
Build Sinking Sim: a 3D browser game (Three.js) where you pick a ship — Titanic, Britannic, Nomadic, Queen Elizabeth, and a few more historical ocean liners — and pick how it sinks: tsunami, boiler explosion, mine strike, or iceberg collision. Simulate real progressive flooding and hull tilt based on the disaster, not just a canned animation, and let me control the simulation speed (pause, normal, fast-forward). Keep it playable and readable code, not photorealistic.
```
