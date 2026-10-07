#!/usr/bin/env bash
# Se ejecuta EN EL SERVIDOR (el workflow "Deploy backend" lo envía por SSH). Pone en marcha la
# imagen indicada, comprueba /v1/telemetry/health y, si no responde, vuelve a la imagen anterior.
#
# Variables: IMAGE (obligatoria), DEPLOY_PATH (carpeta con docker-compose.yml, Caddyfile y .env),
#            GHCR_USER y GHCR_TOKEN (opcionales, para descargar una imagen privada de GHCR).
set -euo pipefail

: "${IMAGE:?Falta IMAGE (p. ej. ghcr.io/usuario/saas-portfolio-backend:sha-...)}"
cd "${DEPLOY_PATH:-$HOME/saas-portfolio}"

if [ ! -f .env ]; then
  echo "Falta $(pwd)/.env: créalo a partir de deploy/.env.example antes del primer despliegue." >&2
  exit 1
fi

compose() { docker compose --env-file .env --env-file .image.env "$@"; }

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

previous=""
if [ -f .image.env ]; then
  previous="$(sed -n 's/^BACKEND_IMAGE=//p' .image.env)"
fi

if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?Falta GHCR_USER}" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi

echo "Desplegando $IMAGE (anterior: ${previous:-ninguna})"
echo "BACKEND_IMAGE=$IMAGE" > .image.env
compose pull backend
compose up -d --remove-orphans

if healthy; then
  echo "OK: /v1/telemetry/health responde con $IMAGE"
  docker image prune -f >/dev/null
  exit 0
fi

echo "ERROR: /v1/telemetry/health no responde con $IMAGE. Últimas líneas del backend:" >&2
compose logs --tail=80 backend >&2 || true

if [ -n "$previous" ] && [ "$previous" != "$IMAGE" ]; then
  echo "Volviendo a $previous" >&2
  echo "BACKEND_IMAGE=$previous" > .image.env
  compose up -d --remove-orphans
  if healthy; then
    echo "Restaurada la imagen anterior, que responde." >&2
  else
    echo "La imagen anterior tampoco responde: revisa el servidor (.env, base de datos, Redis)." >&2
  fi
else
  echo "No hay imagen anterior a la que volver." >&2
fi
exit 1
