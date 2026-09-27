# Implementation Plan: Dell Deployment (GitHub Issue #3)

## Overview

Package Sinking Sim as a versioned, multi-architecture nginx image, publish release `1.0.0` to the private registry, deploy it to Dell at `~/Docker/sinking-sim`, and expose it at `https://sinking-sim.gstephens.org` through Namecheap DNS and Nginx Proxy Manager.

## Assumptions and Architecture Decisions

- GitHub issue #3 is the deployment contract and `package.json` version `1.0.0` is the release tag.
- Dell preflight confirmed port `127.0.0.1:8089` and container name `sinking-sim-web` are unused. Nginx Proxy Manager reaches `sinking-sim-web:80` over the external `app-network`.
- `sinking-sim.gstephens.org` is the public hostname because `gstephens.org` already points Dell-hosted services at the current public IP and the requested host record is unused.
- The image is built separately for `linux/amd64` and `linux/arm64`, then published behind one multi-arch `1.0.0` manifest. This keeps the required build and push Make targets independently useful.
- A static `/healthz` endpoint and Docker health check provide deployment evidence and rollback triggers.
- Release version/build date appear in the UI and are printed by the container entrypoint, following project-wide service conventions.
- Rollback is `TAG=<previous-tag> docker compose pull && docker compose up -d`; DNS and proxy configuration do not need to change for image rollback.

## Task List

### Phase 1: Deployment foundation

- [x] Add Docker/nginx packaging and version/build metadata.
- [x] Add standard multi-architecture Make targets.
- [x] Add production Compose configuration and operator documentation.
- [x] Refresh the build dependency to remove known high/moderate vulnerabilities.

### Checkpoint: Local release candidate

- [x] Unit tests, dependency audit, and production build pass.
- [x] Local container responds on `/` and `/healthz` and reports version `1.0.0`.
- [x] Compose configuration renders successfully on Dell (local Docker lacks the Compose plugin).

### Phase 2: Publish and deploy

- [x] Build and push amd64/arm64 images and verify the registry manifest.
- [x] Install deployment files at `~/Docker/sinking-sim` and start `sinking-sim-web` on Dell.
- [x] Add Namecheap A record and ddclient hostname tracking.
- [x] Configure Nginx Proxy Manager with SSL, HTTP/2, common-exploit blocking, and WebSockets disabled.

### Checkpoint: Production

- [x] Container is healthy and logs show release metadata.
- [x] HTTPS health check returns 200 with a valid certificate.
- [x] Critical browser flow loads, obtains WebGL2, and starts the game.
- [x] GitHub issue #3 acceptance criteria are recorded; close the issue when this deployment change merges.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Registry or Dell credentials unavailable | High | Verify authenticated read/write access before publishing; do not expose credentials. |
| DNS propagation or certificate issuance delay | Medium | Use a 180-second DNS TTL, verify authoritative lookup, then request the certificate. |
| Port/container collision | High | Confirm `8089` and `sinking-sim-web` are unused before deployment. |
| WebGL failure in production | Medium | Run a real-browser smoke test and inspect console/network state after HTTPS deployment. |
| Bad release image | High | Keep immutable version tags and document one-command rollback to the prior tag. |

## Open Questions

- None. Existing infrastructure supports the inferred hostname, port, registry, and network.

---

# Implementation Plan: Realistic Bow Entrances (GitHub Issue #6)

## Overview

Replace the long, compounded needle-bow taper with a short, full entrance that closes at a real stem. Use the existing `bowType` and `bowFine` style data to produce visibly distinct silhouettes while preserving sheer, flare, rake, stern geometry, rigging alignment, and mesh invariants.

## Architecture Decisions

- Keep the existing loft topology and station count; change only the longitudinal bow envelope and the underwater forefoot modifier.
- Centralize `bowType` differences in one entrance policy instead of scattering type checks across deck and side generation.
- Keep the actual `u = 0` station on the centerline so the mesh remains watertight, but remove the broad `u < 0.01` forced collapse.
- Measure the generated mesh through its existing UV station coordinates so tests exercise production geometry rather than a test-only helper.
- Release the verified fix as patch version `1.0.1`, publish both supported architectures, and roll Dell forward with the existing validated rollback script.

## Task List

### Phase 1: Regression proof

- [x] Add mesh assertions that reproduce the long bow taper across all ships.
- [x] Assert visible fullness differences between Nomadic's blunt bow and Lusitania's fine bow.

### Checkpoint: RED

- [x] Focused tests fail on the current needle-bow geometry for the expected reason.

### Phase 2: Geometry correction

- [x] Implement a `bowType`-aware entrance envelope with a rapid final closure.
- [x] Remove double pinching while retaining a modest underwater forefoot shape.
- [x] Align the forestay stem reference with the corrected raked stem.

### Checkpoint: GREEN

- [x] Bow regression assertions and the full unit suite pass.
- [x] Production build succeeds.

### Phase 3: Visual and code review

- [x] Capture plan and bow-on browser views of all seven ships.
- [x] Confirm sheer, flare, rake, rigging, and stern counter remain intact.
- [x] Complete adversarial and five-axis code review; resolve required findings.

### Checkpoint: Complete

- [x] Every issue #6 acceptance criterion has test or visual evidence.
- [ ] Changes are committed, merged, released as `1.0.1`, and verified on Dell.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Fuller stations create a flat/open bow face | High | Keep only the exact stem station at zero breadth and inspect bow-on views. |
| Type curves differ numerically but not visibly | Medium | Compare the most distinct pair at the same normalized stations and capture matching views. |
| Rake separates rigging from the deck stem | Medium | Derive the forestay anchor through the same stem transform and inspect it visually. |
| Bow edits accidentally alter the counter stern | Medium | Limit changes to `u < 0.2` and retain a stern-geometry invariant. |

## Open Questions

- None. Issue #6 defines the intended silhouette and names the comparison ships.
