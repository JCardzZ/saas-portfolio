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

### Tests

```bash
cd portfolio-backend  && ./gradlew test               # unitarios, reglas de arquitectura y cobertura
cd portfolio-backend  && ./gradlew integrationTest    # PostgreSQL (pgvector) y Redis en contenedores; necesita Docker
cd portfolio-frontend && npx ng test --watch=false --browsers=ChromeHeadless && npm run build
```

## CI/CD

| Workflow | Cuándo | Qué hace |
| --- | --- | --- |
| `ci.yml` | cada PR y cada push a `main` | Contrato (lint, cambios incompatibles, código generado) → tests (unitarios, integración, arquitectura, frontend en 3 grupos) → build (presupuesto de bundle, Lighthouse, preview, imagen escaneada con Trivy) → **✅ CI gate**. En paralelo, gitleaks y CodeQL. En `main` publica en GHCR la imagen ya escaneada (firmada con cosign y con SBOM) y guarda el build del frontend. |
| `cd.yml` | cuando la CI termina bien en `main` | No construye nada: despliega el mismo build del frontend en Cloudflare Pages y la misma imagen por digest. El despliegue al servidor es manual: pruebas de humo, y release con etiqueta semver o vuelta a la imagen anterior. |
| `nightly-security.yml` | cada noche | CodeQL ampliado, Trivy sobre la imagen y las dependencias, revisión de dependencias. |

Lo que no cambió en un PR no se ejecuta, y un job omitido no bloquea el gate.
