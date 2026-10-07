#!/usr/bin/env bash
# Calcula la siguiente versión semántica a partir de los commits (Conventional Commits) desde
# la última etiqueta vX.Y.Z. Imprime la etiqueta nueva, o nada si no hay commits que publicar.
#   cambio incompatible ("feat!:", "BREAKING CHANGE")  → mayor (menor mientras la versión sea 0.x)
#   feat                                               → menor
#   cualquier otro                                     → parche
# Sin etiquetas previas, la primera es v0.1.0.
set -euo pipefail

last="$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)"
if [ -z "$last" ]; then
  echo "v0.1.0"
  exit 0
fi

range="$last..HEAD"
if [ "$(git rev-list --count "$range")" -eq 0 ]; then
  exit 0
fi

IFS=. read -r major minor patch <<< "${last#v}"
subjects="$(git log --no-merges --format=%s "$range")"
bodies="$(git log --no-merges --format=%b "$range")"

if grep -qE '^[a-z]+(\([^)]*\))?!:' <<< "$subjects" || grep -q 'BREAKING CHANGE' <<< "$bodies"; then
  if [ "$major" -eq 0 ]; then minor=$((minor + 1)); patch=0; else major=$((major + 1)); minor=0; patch=0; fi
elif grep -qE '^feat(\([^)]*\))?:' <<< "$subjects"; then
  minor=$((minor + 1)); patch=0
else
  patch=$((patch + 1))
fi
echo "v$major.$minor.$patch"
