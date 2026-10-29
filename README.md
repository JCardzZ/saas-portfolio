# saas-portfolio

[![CI](https://github.com/JCardzZ/saas-portfolio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JCardzZ/saas-portfolio/actions/workflows/ci.yml)
[![CD](https://github.com/JCardzZ/saas-portfolio/actions/workflows/cd.yml/badge.svg?branch=main)](https://github.com/JCardzZ/saas-portfolio/actions/workflows/cd.yml)
[![Cobertura](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/JCardzZ/saas-portfolio/badges/coverage.json)](https://github.com/JCardzZ/saas-portfolio/actions/workflows/ci.yml)

Portafolio profesional construido como una plataforma: un CMS con API propia, un asistente que
responde sobre el contenido (RAG con pgvector y Gemini) y un estudio de arquitectura multi-cloud
que se ejecuta en el navegador.

**Demo:** pendiente de publicar.

## Qué incluye

- **Sitio público**: proyectos, tecnologías, artículos, trayectoria y CV descargable en PDF
  (español e inglés; corto, completo y ATS).
- **Asistente**: preguntas en lenguaje natural con citas a las fuentes indexadas.
- **Estudio de arquitectura**: editor de diagramas con traducción entre AWS, GCP y Azure,
  esqueleto de Terraform, comprobaciones de seguridad y estimación de costes orientativa.
- **Administración**: gestión del contenido, reindexado y foto de perfil.

Buena parte de lo que el sitio muestra "en vivo" (telemetría, caos, tráfico) es una simulación en
el navegador y está etiquetada así en la interfaz.

## Stack

| Parte | Tecnología |
| --- | --- |
| Contrato | OpenAPI 3.0.3 (`portfolio-api-spec/`), del que se generan el servidor y el cliente |
| Backend | Java 21, Spring Boot 3.2, arquitectura hexagonal, PostgreSQL 16 + pgvector, Redis, Flyway |
| Frontend | Angular 18 (standalone, signals), Tailwind CSS 3 |
| Entrega | GitHub Actions, Cloudflare Pages (frontend), imagen Docker en GHCR (backend) |

## Estructura

```
portfolio-api-spec/   Contrato OpenAPI (fuente única de URLs y DTOs)
portfolio-backend/    API Spring Boot
portfolio-frontend/   Cliente Angular
docs/                 Documento de trayectoria (fuente del CV y de la línea de tiempo)
deploy/               Docker Compose y Caddy para el servidor del backend
infra/                Esqueleto de Terraform
```

## Cómo ejecutarlo

### Solo el frontend (modo demo, sin backend)

Requiere Node 22.

```bash
cd portfolio-frontend
npm ci
npm start            # http://localhost:4200
```

En desarrollo el frontend responde con datos simulados y muestra la insignia "Modo demo".

### Backend

Requiere Java 21, PostgreSQL 16 con la extensión `vector` y Redis.

```bash
cd portfolio-backend
export JWT_SECRET="$(openssl rand -base64 32)"
export ADMIN_CLIENT_SECRET="<elige uno>"
export DB_URL=jdbc:postgresql://localhost:5432/portfolio_db
export DB_USERNAME=postgres DB_PASSWORD=postgres
./gradlew bootRun    # http://localhost:8080/v1
```

`GEMINI_API_KEY` es opcional: sin ella la aplicación arranca y las funciones de IA responden 503.
Para que el frontend use este backend, pon `mockMode: false` en
`portfolio-frontend/src/environments/environment.development.ts`.

### Todo en local con Docker

PostgreSQL 16 con pgvector, Redis y el backend, con un solo comando:

```bash
./scripts/dev-up.sh        # la primera vez crea .env con secretos generados; después basta `docker compose up -d`
```

La API queda en `http://localhost:8080/v1`. Para que el frontend la use, pon `mockMode: false` en
`portfolio-frontend/src/environments/environment.development.ts` y arranca con `npm start`.
Con el backend en marcha, el Estudio de arquitectura muestra precios de lista reales de Azure y de
AWS (leídos de sus fuentes públicas, sin clave) y cada consulta aparece en el inspector de traza.
Google Cloud exige una clave de API (`GCP_PRICING_API_KEY`) y asignar sus SKU en `pricing.gcp.skus`;
sin eso sus servicios salen como «sin precio». Un servicio sin tarifa asignada nunca se aproxima.

### Usuarios, roles y permisos

Además del cliente de máquina (`POST /auth/token`), las personas entran con correo y contraseña
(`POST /auth/login`) y reciben un token de acceso de 15 minutos y uno de refresco de un solo uso.
No hay registro público: el primer administrador se crea al arrancar con `ADMIN_BOOTSTRAP_EMAIL` y
`ADMIN_BOOTSTRAP_PASSWORD` (solo si aún no hay cuentas) y los demás, desde `/admin/users`.

| Rol | Puede |
| --- | --- |
| `ADMIN` | Todo: contenido, Estudio, flags, usuarios e infraestructura |
| `EDITOR` | Escribir el contenido y el Estudio, la foto del CV y la reindexación; ver las flags |
| `VIEWER` | Solo leer la administración |

Cada operación de `/admin` pide un permiso (`cms:write`, `flags:write`, `users:manage`…); la tabla
está en `AccessRules` y un test comprueba que todas las del contrato tienen el suyo. Para probarlo
con un usuario de cada rol contra un backend en marcha:

```bash
ADMIN_EMAIL=admin@local.test ADMIN_PASSWORD='<la de tu .env>' ./scripts/rbac-smoke.sh http://localhost:8080/v1
```

### Tests

```bash
cd portfolio-backend  && ./gradlew test               # unitarios, reglas de arquitectura y cobertura
cd portfolio-backend  && ./gradlew integrationTest    # PostgreSQL (pgvector) y Redis en contenedores; necesita Docker
cd portfolio-frontend && npx ng test --watch=false --browsers=ChromeHeadless && npm run build
```

## CI/CD

| Workflow | Cuándo | Qué hace |
| --- | --- | --- |
| `ci.yml` | cada PR, cada push a `main` y cada noche | Contrato (lint, cambios incompatibles, código generado) → tests (unitarios, integración, arquitectura, frontend en 3 grupos) → build (presupuesto de bundle, Lighthouse, preview, imagen escaneada con Trivy) → **✅ CI gate**. En paralelo, gitleaks y CodeQL. En `main` publica en GHCR la imagen ya escaneada (firmada con cosign y con SBOM) y guarda el build del frontend. |
| `cd.yml` | cuando la CI termina bien en `main` | No construye nada: despliega el mismo build del frontend en Cloudflare Pages y la misma imagen por digest. Si cambió el backend, también lo despliega en Cloud Run: pruebas de humo o vuelta a la imagen anterior. Cada despliegue lleva una versión `vX.Y.Z` (Conventional Commits) que el sitio sirve en `version.json`, la API devuelve en `/telemetry/health` y, si todo termina bien, se publica como release. |
| `nightly-security.yml` | cada noche | CodeQL ampliado, Trivy sobre la imagen y las dependencias, revisión de dependencias. |

Lo que no cambió en un PR no se ejecuta, y un job omitido no bloquea el gate. Para que un cambio llegue a producción en pocos minutos, el gate solo espera al contrato, los tests y el build: la imagen se construye en paralelo con los tests, Trivy avisa sin bloquear, y Lighthouse y los móviles (versión rápida, iPhone SE y tablet) informan en los PR sin frenarlos y no se ejecutan en `main`. La batería completa de móviles va cada noche.
