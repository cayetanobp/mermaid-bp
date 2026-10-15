#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
docker compose --env-file "$root/.env" -f "$root/deploy/docker/compose.yaml" config --quiet
docker compose --env-file "$root/.env" -f "$root/deploy/docker/compose.yaml" up -d --build
