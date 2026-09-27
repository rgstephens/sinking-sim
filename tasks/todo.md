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
- [ ] Merge the implementation PR, publish `1.0.1`, deploy to Dell, and verify production.

## Issue #6 review

All seven ships were inspected in WebGL2 from plan and calibrated head-on views. The corrected entrances close at the stem without a long needle taper; the six `bowType` families have distinct fullness, Nomadic is visibly fuller than Lusitania, rake/flare/sheer remain readable, forestays meet the generated stems, teak reaches the bow without a material seam, and stern counters are unchanged. Evidence contact sheets are available at `/tmp/sinking-sim-issue6.5oPktH/plan-contact.png` and `/tmp/sinking-sim-issue6.5oPktH/bow-contact.png`; the representative Titanic views were refreshed after the final topology fix.

Automated checks cover forward deck/waterline fullness, exact stem closure, type ordering, entrance continuity, finite hull data, a valid teak-stem normal, forestay alignment, breakup invariants, and the existing simulation suite. Production release verification is pending.
