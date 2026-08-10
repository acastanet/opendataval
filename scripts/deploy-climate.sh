#!/usr/bin/env sh
set -eu

REPO_DIR="${OPENDATAVAL_REPO_DIR:-/root/opendataval}"
COMMENTARY_MODE="${CLIMATE_COMMENTARY_MODE:-auto}"
BASE_URL="${CLIMATE_SMOKE_BASE_URL:-http://127.0.0.1:8080}"

cd "$REPO_DIR"

echo "== OpenDataVal climat: mise à jour master =="
git fetch origin master
git checkout master
git pull --ff-only origin master

echo "== OpenDataVal climat: production des actifs =="
set -- python3 apps/climate-sheet-service/scripts/produce_sheet.py --commentary-mode "$COMMENTARY_MODE"
[ -n "${CLIMATE_OVERVIEW_RESULT:-}" ] && set -- "$@" --overview "$CLIMATE_OVERVIEW_RESULT"
[ -n "${CLIMATE_FINGERPRINT_RESULT:-}" ] && set -- "$@" --fingerprint "$CLIMATE_FINGERPRINT_RESULT"
[ -n "${CLIMATE_SEASONS_RESULT:-}" ] && set -- "$@" --seasons "$CLIMATE_SEASONS_RESULT"
[ -n "${CLIMATE_WATER_RESULT:-}" ] && set -- "$@" --water "$CLIMATE_WATER_RESULT"
"$@"

echo "== OpenDataVal climat: reconstruction Caddy =="
docker compose build caddy
docker compose up -d caddy

echo "== OpenDataVal climat: smoke tests =="
tries=0
until curl -fsS "$BASE_URL/climat/" >/tmp/opendataval-climat-index.html; do
  tries=$((tries + 1))
  if [ "$tries" -ge 20 ]; then
    echo "Échec: /climat/ ne répond pas après redémarrage Caddy" >&2
    docker compose ps caddy >&2 || true
    docker compose logs --tail=100 caddy >&2 || true
    exit 1
  fi
  sleep 1
done

for asset in \
  climate-overview-v1-neutral.svg \
  climate-fingerprint-v4-neutral.svg \
  thermal-seasons-v4.json \
  water-through-year-v1-neutral.svg \
  manifest.json
do
  curl -fsS "$BASE_URL/climat/generated/$asset" >/dev/null
done

grep -q "LES SAISONS SE DÉPLACENT" /tmp/opendataval-climat-index.html

echo "== Publication climat OK =="
echo "commit: $(git rev-parse HEAD)"
echo "local:  $BASE_URL/climat/"
