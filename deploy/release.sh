#!/bin/sh
set -eu

new_tag=${1:?Usage: ./release.sh <image-tag>}
case "$new_tag" in
  ""|[.-]*|*[!A-Za-z0-9_.-]*)
    echo "Invalid Docker image tag: $new_tag" >&2
    exit 1
    ;;
esac
compose_file=${COMPOSE_FILE:-docker-compose.yml}
env_file=${ENV_FILE:-.env}
previous_tag=$(sed -n 's/^TAG=//p' "$env_file" | tail -1)
had_container=false
if docker inspect sinking-sim-web >/dev/null 2>&1; then
  had_container=true
fi

if [ -z "$previous_tag" ]; then
  echo "TAG is missing from $env_file" >&2
  exit 1
fi

validate_release() {
  expected_tag=$1
  [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' sinking-sim-web)" = "healthy" ] || return 1
  curl --fail --silent --show-error http://127.0.0.1:8089/healthz >/dev/null || return 1

  html=$(curl --fail --silent --show-error http://127.0.0.1:8089/) || return 1
  echo "$html" | grep -q 'id="build-info"' || return 1
  asset_path=$(echo "$html" | sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' | head -1)
  [ -n "$asset_path" ] || return 1

  app_version=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' sinking-sim-web | sed -n 's/^APP_VERSION=//p')
  build_date=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' sinking-sim-web | sed -n 's/^BUILD_DATE=//p')
  [ "$app_version" = "$expected_tag" ] || return 1
  [ -n "$build_date" ] || return 1

  asset_file=$(mktemp)
  if ! curl --fail --silent --show-error "http://127.0.0.1:8089${asset_path}" -o "$asset_file" ||
     ! grep -Fq "$app_version" "$asset_file" ||
     ! grep -Fq "$build_date" "$asset_file"; then
    rm -f "$asset_file"
    return 1
  fi
  rm -f "$asset_file"
}

wait_for_release() {
  expected_tag=$1
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    if validate_release "$expected_tag"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  trap - HUP INT TERM
  sed "s/^TAG=.*/TAG=${previous_tag}/" "$env_file" > "${env_file}.tmp"
  mv "${env_file}.tmp" "$env_file"
  if [ "$had_container" = true ]; then
    echo "Deployment validation failed; restoring ${previous_tag}" >&2
    docker compose --env-file "$env_file" -f "$compose_file" up -d
    wait_for_release "$previous_tag"
  else
    echo "Initial deployment validation failed; removing the failed stack" >&2
    docker compose --env-file "$env_file" -f "$compose_file" down
  fi
}

trap 'rollback; exit 1' HUP INT TERM

sed "s/^TAG=.*/TAG=${new_tag}/" "$env_file" > "${env_file}.tmp"
mv "${env_file}.tmp" "$env_file"

if ! docker compose --env-file "$env_file" -f "$compose_file" pull ||
   ! docker compose --env-file "$env_file" -f "$compose_file" up -d; then
  rollback
  exit 1
fi

if ! wait_for_release "$new_tag"; then
  rollback
  exit 1
fi

trap - HUP INT TERM
echo "Sinking Sim ${new_tag} is healthy"
