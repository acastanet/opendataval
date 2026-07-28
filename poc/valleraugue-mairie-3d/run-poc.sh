#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${POC_CONF_FILE:-${ROOT_DIR}/config/poc.conf}"
EXAMPLE_CONF_FILE="${ROOT_DIR}/config/poc.conf.example"

if [[ -f "${CONF_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${CONF_FILE}"
elif [[ -f "${EXAMPLE_CONF_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${EXAMPLE_CONF_FILE}"
else
  echo "Configuration absente: ${CONF_FILE} ou ${EXAMPLE_CONF_FILE}" >&2
  exit 2
fi

POC_BBOX="${POC_BBOX:-751306 6331501 751406 6331601}"
BUFFER_M="${BUFFER_M:-15}"
JOBS="${JOBS:-}"
CLEAN="${CLEAN:-0}"
OUTPUT_DIR="${OUTPUT_DIR:-./output}"
UPSTREAM_COMMIT="${UPSTREAM_COMMIT:-0c4fb086586fac3b01a5974ff0b79937e51c9315}"
UPSTREAM_REPO="https://github.com/ignfab/roofer-with-ignf-datasets.git"
WORK_DIR="${ROOT_DIR}/.work/roofer-with-ignf-datasets"

fail() {
  echo "ERREUR: $*" >&2
  exit 1
}

for command in docker git python3; do
  command -v "${command}" >/dev/null 2>&1 || fail "commande requise introuvable: ${command}"
done

docker info >/dev/null 2>&1 || fail "Docker est installé mais le moteur n'est pas accessible"

read -r XMIN YMIN XMAX YMAX extra <<<"${POC_BBOX}"
[[ -z "${extra:-}" && -n "${YMAX:-}" ]] || fail "POC_BBOX doit contenir exactement quatre coordonnées"

python3 - "${XMIN}" "${YMIN}" "${XMAX}" "${YMAX}" <<'PY'
import sys
xmin, ymin, xmax, ymax = map(float, sys.argv[1:])
width = xmax - xmin
height = ymax - ymin
if abs(width - 100.0) > 0.01 or abs(height - 100.0) > 0.01:
    raise SystemExit(f"L'emprise doit mesurer 100 x 100 m, reçu {width:.2f} x {height:.2f} m")
if xmin >= xmax or ymin >= ymax:
    raise SystemExit("Emprise invalide")
print(f"Emprise validée: {width:.0f} x {height:.0f} m, soit {width * height:.0f} m²")
PY

if [[ "${OUTPUT_DIR}" != /* ]]; then
  OUTPUT_DIR="${ROOT_DIR}/${OUTPUT_DIR#./}"
fi
mkdir -p "${OUTPUT_DIR}" "$(dirname "${WORK_DIR}")"

if [[ ! -d "${WORK_DIR}/.git" ]]; then
  git clone --filter=blob:none "${UPSTREAM_REPO}" "${WORK_DIR}"
fi

git -C "${WORK_DIR}" fetch --depth 1 origin "${UPSTREAM_COMMIT}"
git -C "${WORK_DIR}" checkout --detach "${UPSTREAM_COMMIT}"

CURRENT_COMMIT="$(git -C "${WORK_DIR}" rev-parse HEAD)"
[[ "${CURRENT_COMMIT}" == "${UPSTREAM_COMMIT}" ]] || fail "révision amont inattendue: ${CURRENT_COMMIT}"

ARGS=(
  --bbox "${XMIN}" "${YMIN}" "${XMAX}" "${YMAX}"
  --buffer "${BUFFER_M}"
  --out "${OUTPUT_DIR}"
)

if [[ -n "${JOBS}" ]]; then
  ARGS+=(--jobs "${JOBS}")
fi
if [[ "${CLEAN}" == "1" ]]; then
  ARGS+=(--clean)
fi

cat <<INFO
POC bâtiments 3D — mairie de Valleraugue
- bbox Lambert-93 : ${XMIN} ${YMIN} ${XMAX} ${YMAX}
- surface           : 10 000 m²
- tampon            : ${BUFFER_M} m
- sortie            : ${OUTPUT_DIR}
- pipeline amont    : ${UPSTREAM_COMMIT}
INFO

(
  cd "${WORK_DIR}"
  ./run.sh "${ARGS[@]}"
)

echo
echo "Traitement terminé. Exécuter ensuite: ${ROOT_DIR}/validate.sh"
