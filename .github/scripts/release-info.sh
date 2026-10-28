#!/usr/bin/env bash
# Versión de un despliegue, en JSON: la etiqueta vX.Y.Z que le toca al commit (la que ya tiene o la
# siguiente, según next-version.sh), la anterior y los asuntos de los commits entre las dos (de ahí
# salen las novedades que muestra el sitio, tools/write-version.mjs).
#
# Uso: release-info.sh <sha> <owner/repo>
# Necesita el historial completo y las etiquetas (actions/checkout con fetch-depth: 0). Deja el
# repositorio en ese commit: ejecútalo desde una copia del script, no desde el propio checkout.
set -euo pipefail

sha="$1"
repository="$2"
here="$(cd "$(dirname "$0")" && pwd)"
tags='v[0-9]*.[0-9]*.[0-9]*'

git checkout --quiet --detach "$sha"
next="$(bash "$here/next-version.sh")"
if [ -n "$next" ]; then
  version="$next"
  is_new=true
  previous="$(git describe --tags --abbrev=0 --match "$tags" 2>/dev/null || true)"
else
  # Sin commits desde la última etiqueta: este commit ya es esa versión (un despliegue repetido).
  version="$(git describe --tags --exact-match --match "$tags" HEAD)"
  is_new=false
  previous="$(git describe --tags --abbrev=0 --match "$tags" HEAD^ 2>/dev/null || true)"
fi

git log --no-merges --format=%s "${previous:+$previous..}HEAD" \
  | jq -R -s --arg version "$version" --arg previous "$previous" --arg sha "$(git rev-parse HEAD)" \
      --arg repository "$repository" --argjson isNew "$is_new" \
      '{version: $version, previous: (if $previous == "" then null else $previous end), sha: $sha,
        repository: $repository, isNew: $isNew, subjects: (split("\n") | map(select(length > 0)))}'
