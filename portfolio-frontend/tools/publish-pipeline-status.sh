#!/usr/bin/env bash
# Escribe el resultado de la ejecución en curso en pipeline-status.json y lo sube a la rama `badges`.
# Uso (dentro de un workflow): publish-pipeline-status.sh [carpeta de métricas]
# Variables: GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, WORKFLOW_KEY (ci | cd | nightly)
set -euo pipefail

METRICS="${1:-metrics}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
WORK="$(mktemp -d)"

# Otro workflow puede estar publicando a la vez: si el push se rechaza, se parte de lo último y se repite.
for attempt in 1 2 3 4; do
  rm -rf "$WORK/badges"
  if git ls-remote --exit-code --heads "$REMOTE" badges > /dev/null 2>&1; then
    git clone --quiet --depth 1 --branch badges "$REMOTE" "$WORK/badges"
  else
    git init --quiet "$WORK/badges"
    git -C "$WORK/badges" checkout --quiet --orphan badges
  fi
  node "$TOOLS/pipeline-status.mjs" --existing "$WORK/badges/pipeline-status.json" --metrics "$METRICS" \
    --seed "$TOOLS/../public/pipeline-status.json" \
    --out "$WORK/badges/pipeline-status.json"
  git -C "$WORK/badges" add pipeline-status.json
  git -C "$WORK/badges" -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit --quiet -m "chore: update pipeline status ($WORKFLOW_KEY)"
  if git -C "$WORK/badges" push --quiet "$REMOTE" HEAD:badges; then
    echo "pipeline-status.json publicado ($WORKFLOW_KEY)."
    exit 0
  fi
  echo "Push rechazado (intento $attempt): se reintenta con la versión más reciente."
  sleep $((attempt * 2))
done
echo "::warning::No se pudo publicar pipeline-status.json."
exit 1
