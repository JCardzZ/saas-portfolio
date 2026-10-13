#!/usr/bin/env bash
# Recorre la API con un usuario de cada rol y dice, operación por operación, si la respuesta es
# la que corresponde a sus permisos. Crea (o reutiliza) un editor y un lector de prueba.
#
#   ADMIN_EMAIL=… ADMIN_PASSWORD=… ./scripts/rbac-smoke.sh [http://localhost:8080/v1]
#
# Necesita un administrador que ya exista (ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD al
# arrancar el backend). No cambia contenido: las escrituras que prueba van con cuerpos que el
# servidor rechaza por validación, así que solo se comprueba si la seguridad deja pasar o no.
set -euo pipefail

API="${1:-http://localhost:8080/v1}"
: "${ADMIN_EMAIL:?Falta ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Falta ADMIN_PASSWORD}"
TEST_PASSWORD="${RBAC_TEST_PASSWORD:-$(openssl rand -base64 18)}"
EDITOR_EMAIL="rbac-editor@example.com"
VIEWER_EMAIL="rbac-viewer@example.com"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

login() { # correo contraseña -> token de acceso
  curl -s -m 15 -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" | json "['accessToken']"
}

status() { # método ruta token [cuerpo]
  local body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -s -m 15 -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -d "$body"
  else
    curl -s -m 15 -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3"
  fi
}

ADMIN_TOKEN="$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
[[ -n "$ADMIN_TOKEN" ]] || { echo "No se pudo entrar como administrador en $API (credenciales, o límite de 5 intentos por minuto: cada pasada hace 3)" >&2; exit 1; }

ensure_user() { # correo nombre rol: lo crea o, si ya existe, le pone el rol y la contraseña de esta pasada
  local id
  id="$(curl -s -m 15 "$API/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys,json
print(next((u['id'] for u in json.load(sys.stdin) if u['email']==sys.argv[1]), ''))" "$1")"
  local payload
  if [[ -z "$id" ]]; then
    payload="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"displayName":sys.argv[2],"password":sys.argv[3],"role":sys.argv[4]}))' "$1" "$2" "$TEST_PASSWORD" "$3")"
    curl -s -m 15 -o /dev/null -X POST "$API/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$payload"
  else
    payload="$(python3 -c 'import json,sys; print(json.dumps({"password":sys.argv[1],"role":sys.argv[2],"active":True}))' "$TEST_PASSWORD" "$3")"
    curl -s -m 15 -o /dev/null -X PUT "$API/admin/users/$id" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$payload"
  fi
}

ensure_user "$EDITOR_EMAIL" "Editor de prueba" EDITOR
ensure_user "$VIEWER_EMAIL" "Lector de prueba" VIEWER
EDITOR_TOKEN="$(login "$EDITOR_EMAIL" "$TEST_PASSWORD")"
VIEWER_TOKEN="$(login "$VIEWER_EMAIL" "$TEST_PASSWORD")"
[[ -n "$EDITOR_TOKEN" && -n "$VIEWER_TOKEN" ]] || { echo "No se pudo entrar con los usuarios de prueba" >&2; exit 1; }

# No están aquí la reindexación del asistente (lanzarla hace trabajo de verdad) ni las operaciones
# de infraestructura (aún sin implementar): sus permisos los comprueban los tests del backend.
# método | ruta | cuerpo | permiso | ADMIN EDITOR VIEWER (s = pasa la seguridad, n = 403)
MATRIX='
GET|/auth/me||(cualquiera)|s s s
GET|/admin/technologies||cms:read|s s s
POST|/admin/technologies|{}|cms:write|s s n
GET|/admin/projects||cms:read|s s s
POST|/admin/projects|{}|cms:write|s s n
POST|/admin/articles|{}|cms:write|s s n
POST|/admin/architecture/projects|{}|studio:write|s s n
GET|/admin/features||flags:read|s s s
GET|/admin/features/audit||flags:read|s s s
PUT|/admin/features/no-existe|{"enabled":true}|flags:write|s n n
GET|/admin/users||users:manage|s n n
GET|/admin/roles||users:manage|s n n
POST|/admin/users|{}|users:manage|s n n
'

printf '\n%-7s %-36s %-14s %-9s %-9s %-9s\n' MÉTODO RUTA PERMISO ADMIN EDITOR VIEWER
failures=0
while IFS='|' read -r method path body permission expected; do
  [[ -z "$method" ]] && continue
  read -r -a want <<< "$expected"
  cells=()
  index=0
  for token in "$ADMIN_TOKEN" "$EDITOR_TOKEN" "$VIEWER_TOKEN"; do
    code="$(status "$method" "$path" "$token" "$body")"
    # Pasar la seguridad es cualquier respuesta que no sea 401 ni 403 (un 400 o un 404 ya son del controlador).
    passed=s; [[ "$code" == 401 || "$code" == 403 ]] && passed=n
    mark=ok; [[ "$passed" != "${want[$index]}" ]] && { mark=MAL; failures=$((failures + 1)); }
    cells+=("$code $mark")
    index=$((index + 1))
  done
  printf '%-7s %-36s %-14s %-9s %-9s %-9s\n' "$method" "$path" "$permission" "${cells[0]}" "${cells[1]}" "${cells[2]}"
done <<< "$MATRIX"

anonymous="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$API/admin/users")"
printf '\nSin token, GET /admin/users responde %s (se espera 401).\n' "$anonymous"
[[ "$anonymous" == 401 ]] || failures=$((failures + 1))

if (( failures > 0 )); then
  echo "Hay $failures respuestas que no corresponden a los permisos." >&2
  exit 1
fi
echo "Todas las respuestas corresponden a los permisos de cada rol."
