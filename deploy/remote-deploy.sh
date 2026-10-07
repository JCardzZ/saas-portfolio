#!/usr/bin/env bash
# Se ejecuta EN EL SERVIDOR (el workflow "CD" lo envía por SSH).
#
#   remote-deploy.sh deploy     pone en marcha IMAGE, espera a /v1/telemetry/health dentro del
#                               contenedor y, si no responde, vuelve a la imagen anterior
#   remote-deploy.sh rollback   vuelve a la imagen que había antes del último despliegue
#
# Variables: IMAGE (obligatoria en deploy), DEPLOY_PATH (carpeta con docker-compose.yml,
#            Caddyfile y .env), GHCR_USER y GHCR_TOKEN (opcionales, para una imagen privada de GHCR).
# Estado:    .image.env (imagen vigente) y .image.previous.env (la anterior).
set -euo pipefail

mode="${1:-deploy}"
cd "${DEPLOY_PATH:-$HOME/saas-portfolio}"

if [ ! -f .env ]; then
  echo "Falta $(pwd)/.env: créalo a partir de deploy/.env.example antes del primer despliegue." >&2
  exit 1
fi

compose() { docker compose --env-file .env --env-file .image.env "$@"; }
image_in() { [ -f "$1" ] && sed -n 's/^BACKEND_IMAGE=//p' "$1" || true; }

# Hasta 3 minutos: el arranque incluye las migraciones de Flyway.
healthy() {
  for _ in $(seq 1 36); do
    if compose exec -T backend wget -q -O /dev/null http://localhost:8080/v1/telemetry/health 2>/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# Vuelve a la imagen de .image.previous.env. Devuelve 0 solo si esa imagen responde.
restore_previous() {
  local previous
  previous="$(image_in .image.previous.env)"
  if [ -z "$previous" ] || [ "$previous" = "$(image_in .image.env)" ]; then
    echo "No hay imagen anterior a la que volver." >&2
    return 1
  fi
  echo "Volviendo a $previous" >&2
  echo "BACKEND_IMAGE=$previous" > .image.env
  compose up -d --remove-orphans
  if healthy; then
    echo "Restaurada la imagen anterior, que responde." >&2
    return 0
  fi
  echo "La imagen anterior tampoco responde: revisa el servidor (.env, base de datos, Redis)." >&2
  return 1
}

case "$mode" in
  deploy)
    : "${IMAGE:?Falta IMAGE (p. ej. ghcr.io/usuario/saas-portfolio-backend:sha-...)}"
    if [ -n "${GHCR_TOKEN:-}" ]; then
      echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?Falta GHCR_USER}" --password-stdin >/dev/null
      trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
    fi

    current="$(image_in .image.env)"
    echo "Desplegando $IMAGE (anterior: ${current:-ninguna})"
    # Desplegar otra vez la misma imagen no debe borrar a cuál se puede volver.
    if [ -n "$current" ] && [ "$current" != "$IMAGE" ]; then
      echo "BACKEND_IMAGE=$current" > .image.previous.env
    fi
    echo "BACKEND_IMAGE=$IMAGE" > .image.env
    compose pull backend
    compose up -d --remove-orphans

    if healthy; then
      echo "OK: /v1/telemetry/health responde con $IMAGE"
      exit 0
    fi
    echo "ERROR: /v1/telemetry/health no responde con $IMAGE. Últimas líneas del backend:" >&2
    compose logs --tail=80 backend >&2 || true
    restore_previous || true
    exit 1
    ;;
  rollback)
    restore_previous
    ;;
  *)
    echo "Uso: remote-deploy.sh deploy|rollback" >&2
    exit 2
    ;;
esac
