# Sinking Sim deployment

Sinking Sim runs as a static nginx container on Dell. Nginx Proxy Manager reaches the container over the shared `app-network`; port `127.0.0.1:8089` is available only on Dell for direct diagnostics.

## Copy the deployment files

From a repository checkout on your workstation:

```bash
ssh dell.tail2ece30.ts.net 'mkdir -p ~/Docker/sinking-sim'
scp docker-compose.yml .env.example release.sh dell.tail2ece30.ts.net:~/Docker/sinking-sim/
ssh dell.tail2ece30.ts.net 'chmod 755 ~/Docker/sinking-sim/release.sh'
```

Run these commands from the repository's `deploy/` directory so the three source files resolve correctly.

## Deploy on Dell

```bash
mkdir -p ~/Docker/sinking-sim
cd ~/Docker/sinking-sim
cp .env.example .env
docker network inspect app-network >/dev/null 2>&1 || docker network create app-network
docker login registry.gstephens.org
docker compose config
./release.sh 1.0.1
docker compose ps
curl --fail http://127.0.0.1:8089/healthz
```

Before the first deployment, confirm that `8089` is free with `ss -ltn 'sport = :8089'` and that `docker ps -a --format '{{.Names}}'` does not contain `sinking-sim-web`.

## Nginx Proxy Manager

Create a proxy host for `sinking-sim.gstephens.org`:

- Scheme: `http`
- Forward hostname: `sinking-sim-web`
- Forward port: `80`
- Block Common Exploits: enabled
- WebSockets: disabled
- SSL: request a Let's Encrypt certificate, enable Force SSL and HTTP/2

## DNS and dynamic DNS

Create a Namecheap A record for `sinking-sim` pointing to Dell's public IP. Add `sinking-sim.gstephens.org` to the hostname list in `~/Docker/ddclient/ddclient.conf`, preserving its existing credentials and providers, then restart and inspect the updater:

```bash
cd ~/Docker/ddclient
docker compose restart ddclient
docker compose logs --tail=50 ddclient
```

## Update

Publish a new immutable tag, then run:

```bash
./release.sh <new-tag>
```

The script records the previous tag, pulls and starts the new release, and restores the previous tag if container health or the HTML smoke check fails.
When publishing a later release, update the version and release dates in `package.json`, `Makefile`, and the Dockerfile defaults together; the Make variables can also be overridden for a one-off build.

## Roll back

Run `./release.sh <previous-tag>`. For the first release, stop and remove the stack with `docker compose down`; DNS and proxy configuration can remain for a corrected image.

## Verify a release

```bash
docker buildx imagetools inspect registry.gstephens.org/sinking-sim:1.0.1
docker compose ps
docker logs sinking-sim-web 2>&1 | grep 'Sinking Sim 1.0.1'
curl --fail https://sinking-sim.gstephens.org/healthz
curl --fail --head https://sinking-sim.gstephens.org/
openssl s_client -connect sinking-sim.gstephens.org:443 -servername sinking-sim.gstephens.org </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Confirm the manifest lists both `linux/amd64` and `linux/arm64`, the certificate is valid, the page shows `v1.0.1 · 27 Sep 2026`, and a real browser can start the game with working WebGL and no new console errors.
