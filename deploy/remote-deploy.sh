#!/usr/bin/env bash
# Runs ON THE SERVER after the pipeline has rsynced a new build into
# $APP/incoming (dist/, package*.json, prisma/, prisma.config.ts).
# Order matters: install -> generate -> migrate -> swap build -> reload ->
# health check. If the new build does not answer, the previous build comes back.
set -euo pipefail

APP=/var/www/jil/backend
IN=$APP/incoming
cd "$APP"

[ -d "$IN/dist" ] || { echo "[deploy] no incoming build"; exit 1; }
[ -f .env ] || { echo "[deploy] missing .env (run deploy/server-setup.sh first)"; exit 1; }

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "[deploy] dependencies"
cp "$IN/package.json" "$IN/package-lock.json" "$IN/prisma.config.ts" .
rm -rf prisma && cp -r "$IN/prisma" prisma
npm ci --no-audit --no-fund
npx prisma generate

echo "[deploy] database migrations"
npx prisma migrate deploy

echo "[deploy] swapping the build (previous one kept as dist.prev)"
rm -rf dist.prev dist.failed
[ -d dist ] && mv dist dist.prev
mv "$IN/dist" dist

echo "[deploy] reloading with pm2"
pm2 startOrReload "$APP/deploy/ecosystem.config.cjs" --update-env
pm2 save >/dev/null

echo "[deploy] health check"
ok=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/${API_PREFIX:-api}/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "[deploy] the new build did not answer, rolling back"
  pm2 logs jil-api --lines 30 --nostream || true
  if [ -d dist.prev ]; then
    mv dist dist.failed
    mv dist.prev dist
    pm2 startOrReload "$APP/deploy/ecosystem.config.cjs" --update-env
  fi
  exit 1
fi

# Keep only the last 14 daily database dumps
mkdir -p /var/www/jil/backups
find /var/www/jil/backups -name '*.sql.gz' -mtime +14 -delete || true

echo "[deploy] ok"
