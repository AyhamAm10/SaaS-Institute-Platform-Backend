#!/usr/bin/env bash
# One-time, idempotent preparation of the VPS for the institute API.
# Run as root:  bash server-setup.sh
# It does NOT touch other projects on the server (the zien backend, its nginx
# site, its database). It adds: swap, Redis, a PostgreSQL role + database,
# the app folders and a production .env with generated secrets.
set -euo pipefail

BASE=/var/www/jil
APP_DIR=$BASE/backend
DB_NAME=jil
DB_USER=jil
PORT=4100

echo "[setup] swap"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -q vm.swappiness=10

echo "[setup] redis"
DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server >/dev/null
sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf
grep -q '^maxmemory ' /etc/redis/redis.conf || echo 'maxmemory 256mb' >> /etc/redis/redis.conf
# BullMQ needs noeviction: queued jobs must never be evicted
sed -i 's/^# *maxmemory-policy .*/maxmemory-policy noeviction/; s/^maxmemory-policy .*/maxmemory-policy noeviction/' /etc/redis/redis.conf
grep -q '^maxmemory-policy' /etc/redis/redis.conf || echo 'maxmemory-policy noeviction' >> /etc/redis/redis.conf
systemctl enable --now redis-server
systemctl restart redis-server

echo "[setup] postgres role and database"
DB_PASS_FILE=/root/.jil-db-pass
if ! sudo -u postgres psql -Atc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  openssl rand -hex 24 > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
  sudo -u postgres psql -qc "create role $DB_USER login password '$(cat "$DB_PASS_FILE")'"
fi
if ! sudo -u postgres psql -Atc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres psql -qc "create database $DB_NAME owner $DB_USER"
fi

echo "[setup] folders"
mkdir -p "$APP_DIR/incoming" "$APP_DIR/deploy" "$BASE/uploads" "$BASE/backups"

echo "[setup] .env (only when missing)"
if [ ! -f "$APP_DIR/.env" ]; then
  rand() { openssl rand -hex "$1"; }
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$PORT
HOST=127.0.0.1
API_PREFIX=api

DATABASE_URL=postgresql://$DB_USER:$(cat "$DB_PASS_FILE")@127.0.0.1:5432/$DB_NAME

JWT_ACCESS_SECRET=$(rand 48)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=$(rand 48)
JWT_REFRESH_EXPIRES_IN=7d
REPORT_SIGNING_SECRET=$(rand 48)

STORAGE_LOCAL_DIR=$BASE/uploads

REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=jil

THROTTLE_DEFAULT_LIMIT=300
THROTTLE_DEFAULT_TTL_MS=60000
THROTTLE_LOGIN_LIMIT=10
THROTTLE_LOGIN_TTL_MS=60000

COOKIE_SECURE=true

SUPER_ADMIN_NUMBER=0949620990
SUPER_ADMIN_NAME="Platform Admin"
SUPER_ADMIN_PASSWORD=$(rand 12)
EOF
  chmod 600 "$APP_DIR/.env"
  echo "[setup] wrote $APP_DIR/.env (secrets generated here, never in git)"
fi

echo "[setup] done. Next: nginx site + certificate once DNS points here, then the first deploy."
