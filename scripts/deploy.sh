#!/usr/bin/env bash
# CRS Net — build + run the site container with durable visitor-counter storage.
# Usage: bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

docker build -t crs-net-web:main .
docker rm -f crs-net 2>/dev/null || true
docker volume create crsnet-counter >/dev/null
docker run -d --name crs-net -p 8080:80 \
  --restart unless-stopped \
  -v crsnet-counter:/var/lib/crsnet \
  crs-net-web:main

echo "waiting for health…"
for i in $(seq 1 20); do
  status=$(docker inspect --format '{{.State.Health.Status}}' crs-net 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done
docker ps --filter name=crs-net --format '{{.Names}} {{.Status}} {{.Ports}}'
curl -s -o /dev/null -w "origin -> %{http_code}\n" http://127.0.0.1:8080/
