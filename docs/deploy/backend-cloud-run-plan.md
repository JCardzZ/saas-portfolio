# Plan de despliegue del backend en Google Cloud Run

| | |
|---|---|
| **Estado** | Propuesta: primer despliegue del backend (el frontend ya está en Cloudflare Pages) |
| **Objetivo de coste** | 0,00 $/mes dentro de la capa gratuita, con tope de gasto acotado |
| **Fecha de los precios** | 2026-10-15, comprobados en las páginas oficiales (sección 9) |
| **Alcance** | `portfolio-backend` (Java 21, Spring Boot 3.5.16) |

> **Regla de este documento.** Lo verificado se cita con su fuente. Lo estimado lleva la marca
> *(supuesto)*, y lo que solo se puede comprobar desplegando lleva la marca *(validar)*. Las variables
> de entorno son las que lee hoy `application.yml`; si un nombre difiere del habitual, se indica.

---

## 1. Arquitectura objetivo

```
                    Visitantes (navegador)
                             │ HTTPS
            ┌────────────────┴─────────────────┐
            ▼                                  ▼
 ┌──────────────────────┐        ┌───────────────────────────────┐
 │  Cloudflare Pages    │  fetch │  Cloud Run · servicio          │
 │  Angular 20 (SPA)    │───────▶│  portfolio-api  (us-east4)     │
 │  config.json → URL   │  /v1/* │  1 vCPU · 512 MiB · 0→3 inst.  │
 └──────────────────────┘        │  facturación por petición      │
                                 └──┬──────────┬──────────┬───────┘
          TLS · JDBC (puerto 5432)  │          │ TLS ·    │ volumen GCS FUSE
               ┌────────────────────┘          │ RESP     │ /app/data
               ▼                               ▼          ▼
 ┌──────────────────────────┐ ┌─────────────────────┐ ┌──────────────────────┐
 │ Neon · PostgreSQL 16     │ │ Upstash · Redis      │ │ Cloud Storage        │
 │ + pgvector (HNSW 768)    │ │ caché + rate limiter │ │ bucket us-east1      │
 │ aws-us-east-1 · Free     │ │ (Lua) · Free         │ │ foto de perfil (CV)  │
 └────────────▲─────────────┘ └─────────────────────┘ └──────────────────────┘
              │ escribe el índice
 ┌────────────┴─────────────┐   HTTPS   ┌──────────────────────────┐
 │ Cloud Run Job            │──────────▶│ Gemini API (embeddings   │
 │ portfolio-reindex        │           │ y chat) · clave de API   │
 │ misma imagen, perfil job │           └──────────────────────────┘
 └────────────▲─────────────┘                        ▲
              │ jobs.run (API de Cloud Run)          │ HTTPS
              └──────── portfolio-api ───────────────┘

 Secret Manager ──(--set-secrets)──▶ servicio y job
 Artifact Registry (repositorio remoto de ghcr.io) ──(imagen por digest)──▶ servicio y job
```

### 1.1 Mapeo de componentes

| Componente | Servicio | Papel | Decisión |
|---|---|---|---|
| API REST + SSE | **Cloud Run** (servicio `portfolio-api`) | Endpoints `/v1/**`, autenticación y RAG síncrono | Escala a cero; se paga solo mientras atiende |
| Base de datos | **Neon** Free, `aws-us-east-1` | Datos del CMS, usuarios, proyectos del Estudio y `document_embeddings` (pgvector) | Neon solo crea proyectos en AWS (Azure retirado, sin GCP): la API va a la región de Google más cercana |
| Caché y rate limiting | **Upstash Redis** Free, Virginia | Cache-aside (best-effort, 2 s) y script Lua de los límites por IP | Protocolo Redis por TCP con TLS (Lettuce), no la API REST |
| Ficheros | **Cloud Storage** (`us-east1`) montado como volumen | `PROFILE_PHOTO_PATH` (foto del CV) | El disco de Cloud Run es efímero; `us-east1` entra en la capa gratuita y `us-east4` no |
| Reindexado RAG | **Cloud Run Job** `portfolio-reindex` | Trocea, genera embeddings y sustituye el índice del tenant | Hoy corre en un `TaskExecutor` después del 202 (ver 2.3) |
| Imagen | GHCR → **Artifact Registry remoto** | La imagen firmada que ya publica la CI | Cloud Run no descarga imágenes privadas de GHCR directamente |
| Secretos | **Secret Manager** | Credenciales | Se inyectan como variables; nunca en la imagen ni en el repositorio |
| IA | **Gemini API** | Embeddings y chat | Circuit breaker `aiEngine` ya implementado |

**Región `us-east4` (Virginia del Norte):** está junto a Neon `aws-us-east-1` y es de nivel 1 de
precios. **Descartado:** instancias mínimas (pagan en reposo), balanceador global para un dominio
propio (cuota fija mensual) y el VPS de `deploy/` (24/7 y mantenimiento propio).

### 1.2 Capa gratuita (por mes, salvo que se indique)

| Proveedor / servicio | Límite gratuito | Uso previsto | Margen |
|---|---|---|---|
| Cloud Run (facturación por petición) | 2 M peticiones · 180 000 vCPU-s · 360 000 GiB-s · 1 GB de salida desde Norteamérica | Con 1 vCPU = **50 h de instancia activa**; con 512 MiB la memoria no es el límite | Holgado sin SSE (ver 3) |
| Artifact Registry | 0,5 GB de almacenamiento | 1–2 versiones de la imagen en caché | Política de limpieza: conservar 2 |
| Cloud Storage | 5 GB-mes en `us-east1`, `us-west1` o `us-central1` · 5 000 ops. clase A · 50 000 clase B | < 2 MB (una foto) | Amplio |
| Secret Manager | **6 versiones activas** · 10 000 accesos | 6 secretos (2.6) | **Justo**: un 7.º cuesta unos céntimos |
| Cloud Logging | 50 GiB por proyecto | Logs de la API | Amplio con `INFO` |
| Neon Free | 100 CU-h por proyecto · 1 GB de almacenamiento · suspensión a los 5 min (no se puede desactivar) · 5 GB de salida · pgvector incluido | Suspensión cuando no hay tráfico | Bien, si nada mantiene la base despierta (2.1) |
| Upstash Redis Free | 500 000 comandos · 250 MB · 10 GB de ancho de banda | Unos pocos comandos por petición | Amplio *(supuesto)* |
| Gemini API | Capa gratuita con límites por modelo | RAG y copiloto | Ya acotado por el límite diario global del backend |

**Tope de gasto:** con `--max-instances 3`, el peor caso teórico es de 3 instancias ocupadas las
24 horas:
3 × 730 h × 3 600 s × (0,000024 $/vCPU-s + 0,5 × 0,0000025 $/GiB-s) ≈ **200 $/mes**.

Solo se llega ahí con tráfico sostenido. Lo frenan los límites por IP ya existentes y los avisos de
presupuesto (sección 6). Precios del nivel 1 tomados de terceros que coinciden con la página oficial
*(validar con la calculadora)*.

---

## 2. Ajustes en Spring Boot antes de desplegar

### 2.1 HikariCP para Neon (sin servidor)

Problema: la configuración actual (`minimum-idle: 2`, `max-lifetime: 30 min`) mantiene conexiones
abiertas. Mientras el contenedor vive, eso impide que Neon se suspenda y consume CU-h. Además,
HikariCP 6 (el de Spring Boot 3.5) envía *keepalives* cada 2 min por defecto *(validar la versión
resuelta con `./gradlew dependencies`)*.

```yaml
spring:
  datasource:
    # Endpoint DIRECTO de Neon (sin "-pooler"): Flyway usa bloqueos de sesión que PgBouncer en modo
    # transacción no conserva. 3 instancias × 4 conexiones = 12, muy por debajo del máximo de Neon.
    url: ${DB_URL}            # jdbc:postgresql://ep-xxx.us-east-1.aws.neon.tech/portfolio?sslmode=require
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: ${DB_POOL_MAX:4}
      minimum-idle: 0              # sin conexiones fijas: Neon puede suspenderse
      idle-timeout: 60000          # cierra a los 60 s sin uso
      max-lifetime: 240000         # < 5 min: nunca reutiliza una conexión que Neon ya cerró al suspender
      keepalive-time: 0            # sin keepalive: no despierta a Neon
      connection-timeout: 10000    # Neon tarda en reanudarse tras suspenderse
      validation-timeout: 3000
```

- La primera consulta tras una suspensión espera a que Neon se reanude *(validar el tiempo real)*.
- **Flyway en el arranque:** cada arranque en frío comprueba las migraciones. Si alarga el
  arranque, sacarlas a un Cloud Run Job `migrate` que el CD ejecute antes de mover el tráfico, y
  poner `SPRING_FLYWAY_ENABLED=false` en el servicio.
- El `ddl-auto: validate` actual se mantiene.

### 2.2 SSE y telemetría sin servidor

**Lo que hace hoy el código.**
- `GET /telemetry/live-stream` crea un `SseEmitter` de 5 min, con latido cada 20 s y un máximo de 100
  suscriptores.
- Con facturación por petición, **un stream abierto es una petición en curso**: la instancia factura
  CPU y memoria mientras dure.
- Diez mil visitas con el stream abierto 3 min suman hasta 1,8 M vCPU-s *(supuesto, sin
  solapamiento)*, unas 10 veces la capa gratuita (~40 $).
- Cada instancia solo retransmite sus propios eventos, así que con varias instancias el stream es
  parcial.

**Situación actual del frontend:** ningún componente abre ya el stream. La consola que lo usaba se
retiró, y el Inspector de traza muestra eventos simulados.

| Opción | Coste | Datos reales | Cambio |
|---|---|---|---|
| **A. Stream desactivado en Cloud Run** (recomendada para el lanzamiento) | 0 | No (el inspector sigue con la simulación rotulada) | Propiedad `telemetry.stream.enabled=false`: el endpoint responde 204 y el frontend ya cae a la simulación |
| B. Stream bajo demanda | Bajo | Sí | Abrirlo solo con el inspector abierto; timeout del emisor en **120 s** (< `--timeout 300`) y que el cliente reconecte solo si sigue abierto |
| C. Instantánea con caché | Mínimo | Sí, con retraso | `GET /telemetry/recent` (últimos N eventos desde Redis, TTL 5 s) consultado cada 10 s con el inspector abierto. **Contrato primero** |

Reglas comunes:
- El timeout del `SseEmitter` debe ser siempre **menor que el `--timeout` del servicio**, o Cloud Run
  corta la conexión con un 504.
- El canal sigue sin publicar preguntas, IPs ni sujetos de token.

### 2.3 Reindexado RAG con Cloud Run Jobs

**Problema:** `AiRagController` responde 202 y lanza `reindex` en un `TaskExecutor`. Con facturación
por petición, **la CPU se reduce al enviar la respuesta**, así que el reindexado se queda casi parado
o lo corta el apagado de la instancia.

**Diseño (hexagonal):**

```
POST /admin/ai/rag/reindex ──▶ AiRagController ──▶ ReindexTriggerPort (application/port/out)
                                                        │
                       ┌────────────────────────────────┴───────────────────────────┐
                       ▼ local / tests                                              ▼ Cloud Run
          InProcessReindexTrigger                               CloudRunJobReindexTrigger
          (TaskExecutor, como hoy)                              jobs.run de portfolio-reindex
                                                                con TENANT_ID como override

Cloud Run Job portfolio-reindex (misma imagen, SPRING_PROFILES_ACTIVE=reindex-job)
   └─ ReindexJobRunner (adaptador de entrada, ApplicationRunner)
        └─ RAGIndexingUseCase.reindex(tenantId) ──▶ exit 0 / exit 1
```

- **Selección del adaptador:** `rag.reindex.trigger=in-process|cloud-run-job`, registrado en
  `UseCaseConfig`. El dominio y la aplicación no conocen Cloud Run.
- **Perfil del job:** `spring.main.web-application-type=none`. No abre puerto y termina al acabar.
  Se paga solo mientras corre.
- **Permisos:** la cuenta de servicio del API necesita `run.jobs.run` sobre ese job (y
  `run.jobs.runWithOverrides` para pasar el tenant): `roles/run.invoker` en el job o un rol
  personalizado *(validar qué permisos incluye hoy `roles/run.invoker`)*.
- **El contrato no cambia:** sigue siendo 202.

### 2.4 Puerto dinámico (`PORT`)

Cloud Run inyecta `PORT` (8080 por defecto).

```yaml
server:
  port: ${PORT:8080}
  servlet:
    context-path: /v1
  # Cloud Run pone la IP del visitante en X-Forwarded-For; los límites por IP la necesitan.
  forward-headers-strategy: ${SERVER_FORWARD_HEADERS_STRATEGY:native}
  shutdown: graceful            # Cloud Run envía SIGTERM y da 10 s
spring:
  lifecycle:
    timeout-per-shutdown-phase: 8s
```

*(validar)* Que `request.getRemoteAddr()` devuelva la IP del visitante y no la del proxy de Google.
Si no, todos los visitantes compartirían el mismo límite de `/auth/token`.

### 2.5 Otros ajustes

- **Redis en Upstash:** `REDIS_SSL_ENABLED=true`. La contraseña es la del protocolo Redis de la
  base, **no el token REST**.
  *(validar)* El `EVAL` del rate limiter por TCP: seis `POST /auth/token` seguidos deben dar 429.
- **Foto de perfil:** bucket montado en `/app/data`. Requiere entorno de 2.ª generación y
  `roles/storage.objectUser` en el bucket para la cuenta de servicio.
- **Logs:** `logging.level.dev.portfolio: INFO` en producción (hoy está en `DEBUG`), y JSON
  estructurado (`logging.structured.format.console: gcp`, disponible desde Spring Boot 3.4) para que
  Cloud Logging entienda la severidad.

### 2.6 Variables de entorno y secretos

Los nombres son los que lee `application.yml` hoy. Si se prefieren otros, primero se cambia ahí.

| Nombre habitual | Variable real | Tipo | Dónde |
|---|---|---|---|
| `DATABASE_URL` | `DB_URL` (JDBC, `?sslmode=require`) | Config | `--set-env-vars` |
| — | `DB_USERNAME` | Config | `--set-env-vars` |
| — | `DB_PASSWORD` | **Secreto** | Secret Manager `db-password` |
| `UPSTASH_REDIS_REST_TOKEN` | **No se usa**: el backend habla Redis por TCP. Se configura `REDIS_HOST`, `REDIS_PORT` (6379) y `REDIS_SSL_ENABLED=true` | Config | `--set-env-vars` |
| — | `REDIS_PASSWORD` | **Secreto** | `redis-password` |
| `GEMINI_API_KEY` | `GEMINI_API_KEY` | **Secreto** | `gemini-api-key` |
| `JWT_SECRET` | `JWT_SECRET` (Base64, `openssl rand -base64 32`) | **Secreto** | `jwt-secret` |
| — | `ADMIN_CLIENT_SECRET` | **Secreto** | `admin-client-secret` |
| — | `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | Config / **Secreto** | `admin-bootstrap-password`; **solo el primer arranque**: luego se quita y se destruye la versión |
| — | `CORS_ALLOWED_ORIGINS` | Config | Origen de Cloudflare Pages |
| — | `GCP_PRICING_API_KEY` (opcional) | Secreto | Sin ella GCP sale `UNKNOWN_PRICING`; mejor no usarla para no pasar de 6 versiones |

**Secretos en Secret Manager: 6** (`db-password`, `redis-password`, `gemini-api-key`, `jwt-secret`,
`admin-client-secret`, `admin-bootstrap-password`), justo el límite gratuito. Al borrar el de arranque
queda margen para el token de GHCR si el paquete es privado (sección 4).

**GitHub (secrets y variables del environment `production`):**
- Secrets: ninguno con credenciales de GCP gracias a Workload Identity Federation.
- Variables: `GCP_PROJECT_ID`, `GCP_REGION=us-east4`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`,
  `CLOUD_RUN_SERVICE=portfolio-api` y `API_BASE_URL` (la URL `run.app` + `/v1`, para
  `write-deploy-config.mjs`).

---

## 3. Dockerfile multi-stage optimizado

Sobre el actual (Gradle, no Maven: es el build del proyecto). Cambios:
- capas del JAR extraídas para que el arranque lea clases sin descomprimir;
- flags de la JVM para 512 MiB;
- sin `HEALTHCHECK` (Cloud Run lo ignora y usa sus sondas);
- `exec` para que la JVM reciba el `SIGTERM`.

```dockerfile
# syntax=docker/dockerfile:1
# Contexto: raíz del monorepo →  docker build -f portfolio-backend/Dockerfile -t portfolio-backend .

# ---------- Etapa 1: compilar (JDK 21) ----------
FROM gradle:8.13-jdk21 AS build
WORKDIR /workspace
COPY portfolio-api-spec/ portfolio-api-spec/
COPY portfolio-backend/build.gradle portfolio-backend/settings.gradle portfolio-backend/
WORKDIR /workspace/portfolio-backend
RUN gradle dependencies --no-daemon > /dev/null
COPY portfolio-backend/src/ src/
RUN gradle bootJar --no-daemon -x test \
 && java -Djarmode=tools -jar build/libs/portfolio-backend-*-SNAPSHOT.jar extract --layers --launcher --destination /extracted

# ---------- Etapa 2: ejecutar (JRE 21 Alpine) ----------
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache fontconfig ttf-dejavu \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /app/data && chown app:app /app/data

# Capas de menos a más cambiantes: una nueva versión solo sube la última.
COPY --from=build /extracted/dependencies/ ./
COPY --from=build /extracted/spring-boot-loader/ ./
COPY --from=build /extracted/snapshot-dependencies/ ./
COPY --from=build /extracted/application/ ./
COPY docs/ docs/

ENV CAREER_STORY_PATH=/app/docs/career/CAREER_STORY.md \
    PROFILE_PHOTO_PATH=/app/data/profile-photo \
    RAG_CODE_ROOT=/app/docs \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -Xss256k -XX:+UseSerialGC \
      -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=48m -XX:MaxDirectMemorySize=32m \
      -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError -Djava.awt.headless=true"

USER app
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java org.springframework.boot.loader.launch.JarLauncher"]
```

**Presupuesto de 512 MiB (por qué estas flags):**

| Zona | Límite | Nota |
|---|---|---|
| Heap | 75 % = 384 MiB | `MaxRAMPercentage=75.0` |
| Metaspace | ≤ 160 MiB | Spring + Hibernate + PDF + Resilience4j |
| Code cache | 48 MiB | C1 solamente (`TieredStopAtLevel=1`): arranca antes, pico algo menor |
| Pilas | ~50 hilos × 256 KiB ≈ 13 MiB | `-Xss256k` |
| Directa + nativa | 32 MiB + resto | Lettuce/Netty |

**La suma pasa de 512 MiB si todo llega a su máximo.** En la práctica el metaspace real se queda por
debajo, pero **es el riesgo principal**. Señal de alarma en Cloud Logging: "Memory limit of 512 MiB
exceeded" o reinicios.

Plan B, por orden:
1. `MaxRAMPercentage=60.0`;
2. `--memory 768Mi`;
3. `--memory 1Gi`.

Los tres siguen dentro de la capa gratuita a bajo tráfico, porque limita la CPU y no la memoria. El
PDF del CV (openhtmltopdf) es el pico de memoria: probarlo con `?type=full` *(validar)*.

`UseSerialGC`: con 1 vCPU y un heap pequeño es el de menor sobrecoste. **CDS/AOT** (arranque más
rápido) queda para después: su ejecución de entrenamiento arranca el contexto y tocaría la base de
datos durante el build.

---

## 4. CI/CD con GitHub Actions

El repositorio aplica **«build once, deploy many»**: `ci.yml` construye, escanea y firma una sola vez,
y `cd.yml` **no construye**, despliega ese digest. Cloud Run se integra respetando esa regla.

```
ci.yml (push a main)                                  cd.yml (workflow_run tras la CI verde)
───────────────────────────────────────────           ──────────────────────────────────────────────
1. ./gradlew test · integrationTest · ArchUnit        5. source: localiza backend-image.json
2. docker build  (imagen saas-portfolio-backend:ci)      y verifica la firma: cosign verify
3. Trivy HIGH/CRITICAL  → falla si hay que corregir   6. auth: Workload Identity Federation (sin claves)
4. publish-image:                                     7. deploy-cloudrun: --no-traffic, tag rc-<run>
   docker push ghcr.io/…@sha256 · sha-<commit>        8. humo contra la URL del tag
   cosign sign (keyless, OIDC)                        9. update-traffic: tag → 100 %
   SBOM SPDX (syft) + cosign attest                  10. si 7–9 fallan: el tráfico sigue en la
   → artefacto backend-image.json {image, digest}        revisión anterior (sin rollback que hacer)
```

Los pasos 1 a 4 **ya existen** (job `📦 Imagen + Trivy` y `publish-image`). Lo nuevo es el job de
`cd.yml`, que sustituye a `🚀 Deploy VPS`:

```yaml
  deploy-cloud-run:
    name: 🚀 Cloud Run
    needs: source
    if: needs.source.outputs.backend_digest != ''
    runs-on: ubuntu-24.04
    environment: production
    permissions:
      contents: read
      id-token: write          # token OIDC para Workload Identity Federation
    env:
      REGION: ${{ vars.GCP_REGION }}
      SERVICE: ${{ vars.CLOUD_RUN_SERVICE }}
      TAG: rc-${{ github.run_number }}
      # Imagen servida por el repositorio remoto de Artifact Registry que replica ghcr.io.
      IMAGE: ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/ghcr/jcardzz/saas-portfolio-backend@${{ needs.source.outputs.backend_digest }}
    steps:
      - uses: actions/checkout@<sha> # v4 (el que ya fija el repositorio)

      - name: Autenticar en Google Cloud (WIF)
        uses: google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA }}

      - name: Desplegar sin tráfico
        id: deploy
        uses: google-github-actions/deploy-cloudrun@2028e2d7d30a78c6910e0632e48dd561b064884d # v3
        with:
          service: ${{ env.SERVICE }}
          region: ${{ env.REGION }}
          image: ${{ env.IMAGE }}
          no_traffic: true
          tag: ${{ env.TAG }}
          flags: >-
            --memory=512Mi --cpu=1 --min-instances=0 --max-instances=3 --concurrency=80
            --timeout=300 --cpu-boost --execution-environment=gen2
            --service-account=portfolio-api@${{ vars.GCP_PROJECT_ID }}.iam.gserviceaccount.com
            --allow-unauthenticated
          # Variables y secretos van en el servicio (sección 5) y se conservan entre revisiones.

      - name: Pruebas de humo contra la revisión nueva
        run: |
          url=$(gcloud run services describe "$SERVICE" --region "$REGION" --format=json \
                | jq -r --arg t "$TAG" '.status.traffic[] | select(.tag==$t) | .url')
          API_BASE_URL="$url/v1" ./deploy/smoke-test.sh

      - name: Mover el 100 % del tráfico
        run: gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-tags "$TAG=100"

      - name: Resumen
        if: always()
        run: |
          {
            echo "### 🚀 Cloud Run · $SERVICE"
            echo "- Imagen: \`${IMAGE##*@}\` (firma verificada con cosign en el job source)"
            echo "- Revisión: tag \`$TAG\` · resultado: ${{ job.status }}"
            echo "- Rollback: \`gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=<anterior>=100\`"
          } >> "$GITHUB_STEP_SUMMARY"
```

Notas:
- Las acciones van fijadas por SHA, como el resto del repositorio. Los SHA de arriba son los de las
  etiquetas `v3` publicadas a fecha de este documento: comprobarlos al copiar.
- `gcloud` y `jq` vienen instalados en `ubuntu-24.04`.
- **Rollback:** las revisiones anteriores siguen en Cloud Run, así que volver atrás es mover el tráfico
  (segundos, sin volver a desplegar). `rollback.yml` pasa a hacer eso.
- **Job de reindexado:** se actualiza a la misma imagen en el mismo job:
  `gcloud run jobs update portfolio-reindex --image "$IMAGE" --region "$REGION"`.
- **Después del primer despliegue:**
  - `deploy/topology.json`: el backend pasa a `live` y la etapa «VPS» a «Cloud Run»; luego
    `npm run generate:delivery`;
  - variable `API_BASE_URL`: el CD reescribe `config.json` y la CSP del frontend.

---

## 5. Comandos CLI (una sola vez)

```bash
# ── Variables de la sesión ───────────────────────────────────────────────
PROJECT_ID=portfolio-prod-xxxx         # elegir
REGION=us-east4
BUCKET_REGION=us-east1                 # región con Cloud Storage gratuito
REPO=JCardzZ/saas-portfolio
gcloud config set project "$PROJECT_ID"

# ── APIs ─────────────────────────────────────────────────────────────────
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com storage.googleapis.com

# ── Cuentas de servicio ──────────────────────────────────────────────────
gcloud iam service-accounts create portfolio-api --display-name="Runtime portfolio-api"
gcloud iam service-accounts create github-deployer --display-name="Despliegue desde GitHub"
RUNTIME_SA=portfolio-api@$PROJECT_ID.iam.gserviceaccount.com
DEPLOY_SA=github-deployer@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/run.developer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser

# ── Workload Identity Federation (solo este repositorio) ─────────────────
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github-repo --location=global \
  --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"
POOL=$(gcloud iam workload-identity-pools describe github --location=global --format='value(name)')
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$POOL/attribute.repository/$REPO"

# ── Artifact Registry: repositorio remoto de ghcr.io ─────────────────────
# Si el paquete de GHCR es privado, añadir --remote-username y
# --remote-password-secret-version (un token de solo lectura en Secret Manager).
gcloud artifacts repositories create ghcr --location="$REGION" --repository-format=docker \
  --mode=remote-repository --remote-docker-repo=https://ghcr.io
# Política de limpieza (conservar solo las 2 versiones más recientes): fichero en
# infra/ y --cleanup-policy-file al crear o actualizar el repositorio.

# ── Secretos (6 = límite gratuito) ───────────────────────────────────────
for s in db-password redis-password gemini-api-key jwt-secret admin-client-secret admin-bootstrap-password; do
  gcloud secrets create "$s" --replication-policy=automatic
  read -rs -p "$s: " v; printf '%s' "$v" | gcloud secrets versions add "$s" --data-file=-; echo
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUNTIME_SA" \
    --role=roles/secretmanager.secretAccessor
done

# ── Bucket de la foto de perfil ──────────────────────────────────────────
gcloud storage buckets create "gs://$PROJECT_ID-portfolio-data" --location="$BUCKET_REGION" \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$PROJECT_ID-portfolio-data" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectUser
```

### 5.1 Primer despliegue del servicio

Después, el CD solo cambia la imagen.

```bash
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/ghcr/jcardzz/saas-portfolio-backend@sha256:<digest>

gcloud run deploy portfolio-api \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --memory 512Mi --cpu 1 \
  --min-instances 0 --max-instances 3 --concurrency 80 \
  --timeout=300 --cpu-boost --execution-environment=gen2 \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars="DB_URL=jdbc:postgresql://<endpoint>.us-east-1.aws.neon.tech/<db>?sslmode=require,DB_USERNAME=<usuario>,REDIS_HOST=<db>.upstash.io,REDIS_PORT=6379,REDIS_SSL_ENABLED=true,CORS_ALLOWED_ORIGINS=https://<proyecto>.pages.dev,SERVER_FORWARD_HEADERS_STRATEGY=native,ADMIN_BOOTSTRAP_EMAIL=<correo>,TELEMETRY_STREAM_ENABLED=false,RAG_REINDEX_TRIGGER=cloud-run-job" \
  --set-secrets="DB_PASSWORD=db-password:latest,REDIS_PASSWORD=redis-password:latest,GEMINI_API_KEY=gemini-api-key:latest,JWT_SECRET=jwt-secret:latest,ADMIN_CLIENT_SECRET=admin-client-secret:latest,ADMIN_BOOTSTRAP_PASSWORD=admin-bootstrap-password:latest" \
  --add-volume=name=data,type=cloud-storage,bucket="$PROJECT_ID-portfolio-data" \
  --add-volume-mount=volume=data,mount-path=/app/data
```

- `TELEMETRY_STREAM_ENABLED` y `RAG_REINDEX_TRIGGER` son las propiedades nuevas de 2.2 y 2.3:
  **no existen hasta implementar esos cambios**.
- `:latest` en los secretos se resuelve al crear cada instancia. Fijar una versión concreta hace
  los despliegues reproducibles.
- Tras el primer arranque (se crea el administrador): quitar `ADMIN_BOOTSTRAP_*` con
  `gcloud run services update portfolio-api --remove-env-vars=ADMIN_BOOTSTRAP_EMAIL --remove-secrets=ADMIN_BOOTSTRAP_PASSWORD`
  y destruir esa versión del secreto.

### 5.2 Job de reindexado

```bash
gcloud run jobs create portfolio-reindex --image="$IMAGE" --region="$REGION" \
  --memory 1Gi --cpu 1 --tasks 1 --max-retries 1 --task-timeout=30m \
  --service-account="$RUNTIME_SA" \
  --set-env-vars="SPRING_PROFILES_ACTIVE=reindex-job,DB_URL=…,DB_USERNAME=…,REDIS_HOST=…,REDIS_SSL_ENABLED=true" \
  --set-secrets="DB_PASSWORD=db-password:latest,REDIS_PASSWORD=redis-password:latest,GEMINI_API_KEY=gemini-api-key:latest,JWT_SECRET=jwt-secret:latest,ADMIN_CLIENT_SECRET=admin-client-secret:latest"

gcloud run jobs add-iam-policy-binding portfolio-reindex --region="$REGION" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/run.invoker   # validar que incluye runWithOverrides

# A mano:  gcloud run jobs execute portfolio-reindex --region="$REGION" --update-env-vars=TENANT_ID=default --wait
```

El job lleva 1 GiB: trocear e indexar pesa más que atender peticiones y solo cuesta mientras corre.

---

## 6. Guardarraíles FinOps

1. **Presupuesto** del proyecto con avisos al 50 %, 90 % y 100 % de **5 $**:
   `gcloud billing budgets create --billing-account=<id> --display-name=portfolio --budget-amount=5USD --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0`.
2. **`--max-instances 3`** acota el peor caso (sección 1.2); con poco tráfico basta con 1.
3. **Límites por IP ya existentes** (`/auth/token`, RAG, Terraform, pricing) y límite diario global
   de Gemini.
4. **Sin instancias mínimas ni balanceador.** La URL pública es la `run.app`.
5. **Revisión a los 7 días:** Billing → informe por SKU.
   - Si «CPU allocation time» supera ~150 000 s, mirar quién mantiene peticiones largas (SSE).
   - Neon: consola → *Compute hours*.
6. **Arranque en frío:**
   - Spring Boot tarda varios segundos *(validar con `--cpu-boost`)*, y el frontend cae a modo demo
     si `/telemetry/health` no responde en 3 s.
   - Subir ese margen a ~8 s mientras se ve «Cargando…».
   - Opcional: un ping de Cloud Scheduler en horario laboral a un endpoint que **no consulte la base
     de datos** (para no despertar a Neon).

---

## 7. Plan de ejecución

| Fase | Entregable | Hecho cuando |
|---|---|---|
| 1 | Cambios de código (2.1–2.5) en una rama + PR | Tests, ArchUnit e integración en verde |
| 2 | Dockerfile (3) | Imagen < 512 MiB de RAM en reposo con `docker stats`; Trivy en verde |
| 3 | Neon, Upstash y Gemini creados; secretos cargados | `psql` con `CREATE EXTENSION vector` hecho |
| 4 | Proyecto GCP (5), mejor como Terraform en `infra/terraform` (estado en un bucket GCS) | `terraform plan` sin cambios tras aplicar |
| 5 | Job de `cd.yml` (4) + `rollback.yml` con `update-traffic` | Primer despliegue con `workflow_dispatch` |
| 6 | Validación | Ver la lista siguiente |

**Validación en producción:**
- `/v1/telemetry/health` → `UP`.
- `deploy/smoke-test.sh` en verde.
- El sexto `POST /auth/token` en un minuto → 429 (Lua en Upstash e IP real).
- El CV `?type=full` se genera sin OOM.
- El reindexado termina en el job.
- Frío/caliente medido.
- Coste real a los 7 días.

---

## 8. Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| 512 MiB insuficientes (metaspace, PDF) | Reinicios, 503 | Plan B de memoria (sección 3) |
| Arranque en frío > 3 s | El frontend entra en modo demo | `--cpu-boost`, margen de 8 s, ping opcional |
| `getRemoteAddr()` no da la IP real | Límites por IP compartidos por todos | Validar en la fase 6 antes de anunciar el sitio |
| Paquete GHCR privado | Hace falta el 7.º secreto | Borrar el secreto de arranque antes |
| Cambios en las capas gratuitas | Coste no previsto | Google avisa con 30 días; presupuesto con avisos |

## 9. Fuentes

- Capa gratuita de Google Cloud: https://docs.cloud.google.com/free/docs/free-cloud-features
- Cloud Run, precios: https://cloud.google.com/run/pricing
- Cloud Run, facturación: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- Cloud Run, CPU y startup CPU boost: https://docs.cloud.google.com/run/docs/configuring/services/cpu
- Cloud Run, registros de imágenes admitidos: https://docs.cloud.google.com/run/docs/deploying
- Neon, precios: https://neon.com/pricing · regiones: https://neon.com/docs/introduction/regions
- Upstash Redis, precios: https://upstash.com/pricing/redis · compatibilidad: https://upstash.com/docs/redis/overall/rediscompatibility
- Acciones: https://github.com/google-github-actions/deploy-cloudrun · https://github.com/google-github-actions/auth
