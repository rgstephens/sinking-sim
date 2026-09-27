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
