# syntax=docker/dockerfile:1
#
# Imagen del backend. El contexto de build es la RAÍZ del monorepo, porque el build genera
# código a partir del contrato OpenAPI y la imagen incluye docs/:
#
#   docker build -f portfolio-backend/Dockerfile -t portfolio-backend .
#
# Variables obligatorias al arrancar: DB_URL, DB_USERNAME, DB_PASSWORD, REDIS_HOST,
# JWT_SECRET y ADMIN_CLIENT_SECRET. Opcionales: REDIS_PASSWORD, REDIS_SSL_ENABLED,
# GEMINI_API_KEY, CORS_ALLOWED_ORIGINS (el origen público del frontend).

# ---------- Etapa 1: compilar ----------
FROM gradle:8.13-jdk21 AS build
WORKDIR /workspace

# El contrato y la definición del build cambian poco: en su propia capa, las dependencias
# descargadas se reutilizan mientras no cambien.
COPY portfolio-api-spec/ portfolio-api-spec/
COPY portfolio-backend/build.gradle portfolio-backend/settings.gradle portfolio-backend/
WORKDIR /workspace/portfolio-backend
RUN gradle dependencies --no-daemon > /dev/null

COPY portfolio-backend/src/ src/
# Los tests se ejecutan en CI (./gradlew clean test), no al construir la imagen.
RUN gradle bootJar --no-daemon -x test

# ---------- Etapa 2: ejecutar ----------
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# El CV en PDF se maqueta con librerías que usan AWT: en Alpine necesitan fontconfig y una fuente del sistema.
RUN apk add --no-cache fontconfig ttf-dejavu

# Sin privilegios de root dentro del contenedor.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /workspace/portfolio-backend/build/libs/portfolio-backend-*-SNAPSHOT.jar app.jar
# La trayectoria profesional: alimenta /public/career-timeline y el índice RAG.
COPY docs/ docs/

# Lo que se sube desde administración (la foto de perfil). Móntalo como volumen para conservarlo.
RUN mkdir -p /app/data && chown app:app /app/data
VOLUME /app/data

ENV CAREER_STORY_PATH=/app/docs/career/CAREER_STORY.md \
    PROFILE_PHOTO_PATH=/app/data/profile-photo \
    RAG_CODE_ROOT=/app/docs \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Djava.awt.headless=true"

USER app
EXPOSE 8080

# Responde 503 si la base de datos no está disponible, así que refleja la salud real.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:8080/v1/telemetry/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
