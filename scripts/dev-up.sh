#!/usr/bin/env bash
# Levanta el entorno local (PostgreSQL + pgvector, Redis y el backend) con Docker.
# La primera vez crea .env con secretos generados en esta máquina; no se sube al repositorio.
#
#   ./scripts/dev-up.sh            todo
#   ./scripts/dev-up.sh postgres redis   solo los datos (backend con ./gradlew bootRun)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  umask 077
  {
    echo "# Generado por scripts/dev-up.sh. Solo para desarrollo local; no lo subas."
    echo "JWT_SECRET=$(openssl rand -base64 32)"
    echo "ADMIN_CLIENT_SECRET=$(openssl rand -base64 24)"
  } > .env
  echo "Creado .env con secretos nuevos (el del administrador está en ADMIN_CLIENT_SECRET)."
fi

docker compose up -d --build "$@"

echo
echo "API:    http://localhost:${BACKEND_PORT:-8080}/v1/telemetry/health"
echo "Logs:   docker compose logs -f backend"
echo "Parar:  docker compose down"
