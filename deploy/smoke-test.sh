#!/usr/bin/env bash
# Pruebas de humo contra una API desplegada, desde fuera (pasando por Caddy y HTTPS).
# Uso: smoke-test.sh https://api.ejemplo.dev/v1
# Imprime una tabla Markdown y termina con 1 si alguna comprobación falla.
set -uo pipefail

BASE="${1:?Uso: smoke-test.sh <URL base de la API, p. ej. https://api.ejemplo.dev/v1>}"
BASE="${BASE%/}"
body="$(mktemp)"
failed=0

echo "### Pruebas de humo — $BASE"
echo ""
echo "| Comprobación | Resultado | Detalle |"
echo "| --- | :---: | --- |"

row() { # nombre, ok (0/1), detalle
  if [ "$2" -eq 0 ]; then echo "| $1 | ✅ | $3 |"; else echo "| $1 | ❌ | $3 |"; failed=1; fi
}

# check <nombre> <método> <ruta> <estado esperado> <tipo de contenido esperado> [filtro jq que debe dar true]
check() {
  local name="$1" method="$2" path="$3" want="$4" type="$5" filter="${6:-}"
  local out status ctype
  out="$(curl -sS -o "$body" -w '%{http_code} %{content_type}' --max-time 20 -X "$method" \
    -H 'Content-Type: application/json' ${7:+-d "$7"} "$BASE$path" 2>&1)" || { row "$name" 1 "sin respuesta: ${out##*curl: }"; return; }
  status="${out%% *}"; ctype="${out#* }"
  if [ "$status" != "$want" ]; then row "$name" 1 "HTTP $status (se esperaba $want)"; return; fi
  if [[ "$ctype" != "$type"* ]]; then row "$name" 1 "tipo \`$ctype\` (se esperaba \`$type\`)"; return; fi
  if [ -n "$filter" ] && [ "$(jq -r "$filter" "$body" 2>/dev/null)" != "true" ]; then
    row "$name" 1 "el cuerpo no cumple \`$filter\`"; return
  fi
  row "$name" 0 "HTTP $status"
}

# La salud primero y con paciencia: tras un despliegue, Caddy puede tardar en ver al backend.
for attempt in $(seq 1 24); do
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 10 "$BASE/telemetry/health" || true)"
  [ "$code" = "200" ] && break
  sleep 5
done
if [ "$code" = "200" ]; then
  row "Salud" 0 "estado $(jq -r '.status' "$body" 2>/dev/null), intento $attempt"
else
  row "Salud" 1 "HTTP ${code:-000} tras $attempt intentos"
fi

check "Tecnologías públicas" GET /public/technologies 200 application/json 'type == "array"'
check "Proyectos públicos" GET /public/projects 200 application/json 'type == "array"'
check "Catálogo cloud (sembrado al arrancar)" GET /public/architecture/catalog 200 application/json 'type == "array" and length > 0'
check "Plantillas del Estudio (sembradas)" GET /public/architecture/projects 200 application/json 'type == "array" and length > 0'
check "CV en PDF" GET '/public/cv/download?lang=es&type=ats' 200 application/pdf
# Los errores son ProblemDetail (RFC 7807), que el contrato declara como application/json.
check "Escritura sin token rechazada" POST /admin/technologies 401 application/json '.status == 401' '{}'

rm -f "$body"
exit "$failed"
