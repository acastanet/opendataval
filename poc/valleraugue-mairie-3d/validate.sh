#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${POC_CONF_FILE:-${ROOT_DIR}/config/poc.conf}"
[[ -f "${CONF_FILE}" ]] || CONF_FILE="${ROOT_DIR}/config/poc.conf.example"
# shellcheck disable=SC1090
source "${CONF_FILE}"

OUTPUT_DIR="${OUTPUT_DIR:-./output}"
if [[ "${OUTPUT_DIR}" != /* ]]; then
  OUTPUT_DIR="${ROOT_DIR}/${OUTPUT_DIR#./}"
fi

if [[ ! -d "${OUTPUT_DIR}" ]]; then
  echo "Répertoire de sortie absent: ${OUTPUT_DIR}" >&2
  exit 1
fi

LATEST_RUN="$(find "${OUTPUT_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'run-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
if [[ -z "${LATEST_RUN}" ]]; then
  echo "Aucune exécution trouvée dans ${OUTPUT_DIR}" >&2
  exit 1
fi

REPORT="${LATEST_RUN}/poc-validation.md"
STATUS=0

check_file() {
  local relative="$1"
  local path="${LATEST_RUN}/${relative}"
  if [[ -s "${path}" ]]; then
    printf -- '- [x] `%s` présent (%s octets)\n' "${relative}" "$(stat -c '%s' "${path}")" >>"${REPORT}"
  else
    printf -- '- [ ] `%s` absent ou vide\n' "${relative}" >>"${REPORT}"
    STATUS=1
  fi
}

CITYJSON_COUNT=0
if [[ -d "${LATEST_RUN}/roofer_output" ]]; then
  CITYJSON_COUNT="$(find "${LATEST_RUN}/roofer_output" -type f \( -name '*.jsonl' -o -name '*.city.jsonl' -o -name '*.json' \) 2>/dev/null | wc -l | tr -d ' ')"
fi

cat >"${REPORT}" <<EOF_REPORT
# Validation POC 3D — mairie de Valleraugue

- Exécution : \`${LATEST_RUN##*/}\`
- Date de validation : \`$(date -u +'%Y-%m-%dT%H:%M:%SZ')\`
- Emprise : 100 × 100 m, soit 10 000 m²
- Bbox EPSG:2154 : \`${POC_BBOX}\`

## Artefacts attendus
EOF_REPORT

check_file "buildings.gpkg"
check_file "building_bbox.json"
check_file "buffered_bbox.json"
check_file "lidar_tiles.gpkg"
check_file "pdal_pipeline.json"
check_file "lidar_subset.laz"
check_file "buildings_cleaned.gpkg"

{
  echo
  echo "## Sortie Roofer"
  if [[ "${CITYJSON_COUNT}" -gt 0 ]]; then
    echo "- [x] ${CITYJSON_COUNT} fichier(s) CityJSON/CityJSONSeq détecté(s)"
  else
    echo "- [ ] aucun fichier CityJSON/CityJSONSeq détecté"
    STATUS=1
  fi
  echo
  echo "## Décision automatique"
  if [[ "${STATUS}" -eq 0 ]]; then
    echo "**PASS technique** — tous les artefacts minimaux sont présents. Une validation visuelle reste obligatoire."
  else
    echo "**FAIL technique** — un ou plusieurs artefacts minimaux manquent."
  fi
} >>"${REPORT}"

cat "${REPORT}"
exit "${STATUS}"
