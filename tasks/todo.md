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

# Dell deployment (GitHub issue #3)

- [x] Add multi-stage Docker/nginx packaging, health check, and release metadata.
- [x] Add multi-architecture registry Make targets.
- [x] Add `deploy/` Compose configuration, environment template, and runbook.
- [x] Remove known dependency vulnerabilities and pass local release checks.
- [x] Publish the `1.0.0` amd64/arm64 image manifest.
- [x] Deploy `sinking-sim-web` at `~/Docker/sinking-sim` on Dell.
- [x] Configure Namecheap DNS, ddclient, Nginx Proxy Manager, and Let's Encrypt.
- [x] Verify the live HTTPS game and document deployment evidence.

## Deployment review

Local checks passed: unit tests, Vite production build plus release-metadata validation, zero-vulnerability npm audit, amd64/arm64 image builds, nginx syntax, native container health/content/startup metadata, shell syntax, and diff whitespace.

Production evidence:

- Registry manifest `sha256:1620cd7d4c1961b8e85c001b3d3958c63a58b8c59cc2d212383ce70d74f997de` contains `linux/amd64` and `linux/arm64`.
- Dell runs healthy container `sinking-sim-web` from `registry.gstephens.org/sinking-sim:1.0.0` at `~/Docker/sinking-sim`, bound to `127.0.0.1:8089` and `app-network`.
- Namecheap A record `sinking-sim.gstephens.org` resolves to `50.34.59.250`; Dell ddclient tracks the hostname and was restarted successfully.
- Nginx Proxy Manager proxy host #35 forwards HTTP to `sinking-sim-web:80`; Force SSL, HTTP/2, and Block Common Exploits are enabled; WebSockets are disabled.
- Let's Encrypt certificate #45 is valid from 27 Sep 2026 through 26 Dec 2026.
- `https://sinking-sim.gstephens.org/healthz` and `/` return HTTP 200. The real browser rendered the production game with WebGL2, showed `v1.0.0 · 27 Sep 2026`, and transitioned RMS Titanic to `Underway` after **Get Underway**.

# Realistic bow entrances (GitHub issue #6)

- [x] Add failing generated-mesh regressions for bow fullness, closure, and type variation.
- [x] Replace the long power-law taper and compounded cutwater pinch.
- [x] Keep stem rake/rigging aligned and preserve stern geometry.
- [x] Pass unit tests and the production build.
- [x] Verify plan and bow-on silhouettes for every current ship in a real browser.
- [x] Complete three bounded adversarial cycles and five-axis code-quality review.
- [x] Merge the implementation PR, publish `1.0.1`, deploy to Dell, and verify production.

## Issue #6 review

All seven ships were inspected in WebGL2 from plan and calibrated head-on views. The corrected entrances close at the stem without a long needle taper; the six `bowType` families have distinct fullness, Nomadic is visibly fuller than Lusitania, rake/flare/sheer remain readable, forestays meet the generated stems, teak reaches the bow without a material seam, and stern counters are unchanged. Evidence contact sheets are available at `/tmp/sinking-sim-issue6.5oPktH/plan-contact.png` and `/tmp/sinking-sim-issue6.5oPktH/bow-contact.png`; the representative Titanic views were refreshed after the final topology fix.

Automated checks cover forward deck/waterline fullness, exact stem closure, type ordering, entrance continuity, finite hull data, a valid teak-stem normal, forestay alignment, breakup invariants, and the existing simulation suite.

Production release evidence:

- PR #9 merged at commit `49d6a571a38d22bfdd1cf767789fad603484d557`; issue #6 closed and tag `v1.0.1` was published.
- Registry manifest `sha256:59f41ae870218b1aa1b8c0842129a7ec0087b11ad9c7fe165b7a7921f8463e65` contains verified `linux/amd64` and `linux/arm64` images.
- Dell runs healthy image `registry.gstephens.org/sinking-sim:1.0.1`; startup logs print `Sinking Sim 1.0.1 (27 Sep 2026)` and `1.0.0` remains the rollback tag.
- Public `/healthz` and `/` return HTTP 200 through Nginx Proxy Manager; the existing Let's Encrypt certificate remains valid through 26 Dec 2026.
- A production browser obtained WebGL2 with zero console errors, visibly displayed `v1.0.1 · 27 Sep 2026`, and transitioned RMS Titanic to `Underway`. Final screenshot: `/tmp/sinking-sim-issue6.5oPktH/production-1.0.1.png`.

# Bridge wheel and engine telegraph (GitHub issue #11)

- [x] Pure mapping in `src/bridge.js`: nine engine orders, wheel angle ↔ helm (±150° is hard over), dial detents, key-release snapping.
- [x] SVG ship's wheel (lower left) and engine-order telegraph (lower right) in `src/bridgeControls.js`, pointer events with capture, `touch-action: none`, `pointercancel`.
- [x] Keys: held A/D force ±1 and the wheel shows it; release returns to the wheel angle (amidships if untouched). W/S sweep the handle; release settles on the nearest order, and a tap steps one order.
- [x] Physics: astern floor raised from −0.22 to full astern (−0.75) with 60% astern screw efficiency; ahead unchanged.
- [x] Layout: key hint above the telegraph, dash lifted below 1000px, safe-area insets, 124px controls at ≤720px.
- [x] `npm test` covers the order table, wheel angle ↔ helm at amidships and both hard-over ends, key snapping, right-wheel-to-starboard, and full vs slow astern speed.
- [x] Browser checks (headless Chrome, WebGL): drags, keys, touch, no camera orbit, no scroll/zoom, no overlaps at 1280, 900, 720 and 390 px.
- [x] Version prepared as `1.1.0`.

# WWII warships and submarines (GitHub issue #5)

- [x] `ships.js`: `category`/`navy` on every ship; 20 warships across USN, RN, Kriegsmarine, IJN, Regia Marina, Marine Nationale and VMF, incl. 3 submarines (Gato, Type VII, I-15) and 3 carriers; turret, secondary, protection/strength, screw and livery data.
- [x] `shipMesh.js` style: per-category defaults + a per-ship entry for every ship (no Titanic fallback); submarine section/stern form; deck material (teak/steel).
- [x] Warship builders: turrets (barbette, sloped gunhouse, barrels, superfiring), secondary mounts, bridge towers (tower / pagoda / compact / cruiser), tripod/pole masts, warship funnels (shared funnel builder), boats.
- [x] Carrier builder: hangar, split-at-break flight deck with markings and elevators, island (starboard; port on Akagi), Akagi's downturned stack, parked aircraft.
- [x] Submarine builder: casing, conning tower with bridge/periscopes, deck gun, dive planes, jumping wires, limber holes.
- [x] Hull shader: Measure 22 band, dark sub bottom, limber holes, darkened-ship portholes.
- [x] Breakup: turrets/towers/islands split as whole groups.
- [x] Physics: protection reduces breach size; hull strength scales breakup thresholds.
- [x] Dropdown grouped by category with `<optgroup>`s.
- [x] Tests: every ship builds with invariants, owns a style, turrets/flight deck/conning tower present per category, sinks sanely, hazards hit/miss across short and long hulls.
- [x] Verify in a real browser (screenshots per category + a warship sink), bump to 1.2.0; PR preparation follows verification.

## Issue #5 completion plan

- [x] Read the issue and audit the existing uncommitted implementation without replacing it.
- [x] Resolve the failing turret-clearance regression using generated barrel geometry.
- [x] Address independent review findings and verify mesh, breakup, flooding, and hazards.
- [x] Inspect the grouped picker and each warship category in WebGL, including sinking.
- [x] Update release metadata and roster documentation; run tests and production build.
- [x] Record final verification evidence and review results.

Scope: retain the seven liners, add the existing 20 WWII warships across seven navies, and meet issue #5 acceptance criteria. Submarines flood and sink; manual diving remains future work.

## Issue #5 review

Implemented 20 warships across seven navies, including three carriers and US/German/Japanese submarines. All 27 ships own a silhouette profile and appear once in the category-grouped picker. Warships share the existing hull/funnel helpers and keep their topside builders in `warshipMesh.js`; no dependencies were added.

Verification:

- `npm test` passes mesh invariants, real superfiring barrel clearance, flight-deck/island placement, submarine casing/tower checks, whole-mount conservation through breakup for every warship, mine sinking/seabed stability, armour behavior, and hazard hit/avoid checks across hull sizes.
- `BUILD_DATE='29 Sep 2026' npm run build` passes with verified `v1.2.0 · 29 Sep 2026` metadata. The existing large-bundle advisory remains. `git diff --check` passes.
- Isolated headless Chrome renders all 27 ships in WebGL2 and shows six picker groups. Screenshots cover each new category, all three carriers/submarines, and Iowa flooding/wreck. [Screenshot contact sheet](screenshots/issue-5/fleet-contact.jpg).
- Browser simulation steps accelerated Iowa, Essex, Fletcher, and U-boat through mine flooding and breakup; each displayed “On the bottom” with the rendered split state. No JavaScript exceptions or shader errors; the browser logged the existing missing favicon request.
- Independent review identified and resolved Fubuki duplicating a torpedo mount at the exact break boundary, Yamato secondary guns intersecting neighbouring turret roofs, and Akagi's flight deck lacking hull overhang. Clearance tests now measure actual barrel bounds; submarine freeboard is measured amidships rather than at the raised bow.

Manual dive/surface controls remain outside the issue's minimum scope. Release metadata is prepared; production deployment is not part of this change.
