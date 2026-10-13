<!-- rag:skip -->
# Estudio de diseño de sistemas + plataforma MCP · progreso

> Documento de trabajo para retomar tras un `/clear`. Se actualiza al terminar cada paso.

## Estado

**Terminado el 2026-10-12: los nueve hitos (0 a 8) están integrados en `main`, cada uno por su PR.**
Todas las flags siguen apagadas.

### Resumen de cierre

- **Hitos integrados**: 0 (#22), 1 (#23), 2 (#24), 3 (#25, corregido con el #26), 4 (#27), 5 (#28), 6 (#29), 7 (#30) y 8 (#31). Todos con el CI gate en verde al integrarse, salvo el #25 (se integró antes de que acabara su CI y dejó `main` en rojo hasta el #26).
- **Parada intermedia**: el 2026-10-12, hacia las 14:50 UTC, GitHub Actions dejó de arrancar trabajos («recent account payments have failed or your spending limit needs to be increased»). Hacia las 15:20 UTC volvió a funcionar sin que se tocara nada desde aquí. Las CI de `main` de los PR #28 y #29 quedaron en rojo por eso (ningún test falló) y su CD se omitió; la del #29 se relanzó.
- **Despliegue**: no se ha desplegado nada a mano. El CD sale solo tras una CI verde en `main`. **Al cerrar este archivo no estaba comprobado que lo integrado desde el hito 5 estuviera desplegado**: hay que mirar que el último CD de `main` haya salido en verde (`gh run list --branch main --workflow CD`).
- **No se ha publicado nada en el registro de MCP** y la evaluación nocturna sigue desactivada.
- **Fallos de CI corregidos en el cierre**: el menú de plantillas se salía de la ventana en móviles anchos (hito 5); una aserción mal escapada en el test de integración (hito 6); el cliente de la API sin regenerar tras añadir `MCP_TOOL_CALL` (hito 7).

### Para retomar

1. Comprobar el último CD de `main`.
2. Copiar las «Notas para `CLAUDE.md`» de este archivo al `CLAUDE.md` del checkout principal.
3. Encender las flags una a una cuando se quiera enseñar cada parte; ver «Pendiente del autor» antes de `mcp.section`.

### Pendiente del autor

- Crear el secret `GEMINI_API_KEY` y la variable `MCP_EVAL_NIGHTLY=true` para encender la evaluación nocturna (el adaptador de Gemini no se ha ejecutado nunca).
- Confirmar `terraform fmt` en la CI en lugar de `terraform validate` (se aparta de la decisión 2).
- Antes de encender `mcp.section` en producción: comprobar que el backend ve la dirección real del cliente detrás de Caddy.
- Poner la dirección real en `docs/mcp/server.json` y decidir si se publica en el registro.
- Sin verificar en ningún sitio: la exportación de trazas a un colector real.

## Hitos

| Hito | Rama | Estado | PR |
| - | - | - | - |
| 0 · Feature flags | `feat/feature-flags` | Integrado en `main` | #22 |
| 1 · Lienzo responsivo | `feat/studio-responsive-canvas` | Integrado en `main` | #23 |
| 2 · Conexiones inteligentes | `feat/studio-smart-connections` | Integrado en `main` | #24 |
| 3 · Oracle Cloud | `feat/cloud-oracle` | Integrado en `main` (con el gate en rojo; corregido con el #26) | #25, #26 |
| 4 · Diseño de sistemas | `feat/system-design` | Integrado en `main` | #27 |
| 5 · Plantillas de sistemas | `feat/system-templates` | Integrado en `main` | #28 |
| 6 · MCP núcleo | `feat/mcp-server` | Integrado en `main` | #29 |
| 7 · MCP calidad y observabilidad | `feat/mcp-observability` | Integrado en `main` | #30 |
| 8 · Sección web | `feat/mcp-web-section` | Integrado en `main` | #31 |

## Hito 0 · qué se hizo

- Contrato: etiqueta `Feature Flags` con `GET /public/features`, `GET /admin/features`, `PUT /admin/features/{key}` y `GET /admin/features/audit`.
- Backend: migración `V7`, dominio (`FeatureFlagDomain` con las cinco flags), `FeatureFlagService` (cache-aside), puerto `FeatureFlags`, proveedor de OpenFeature (`dev.openfeature:sdk` 1.23.0), `FeatureGateConfig` (404 para lo apagado), controlador y mapper.
- Frontend: `core/flags` (`@openfeature/web-sdk` 1.10.0 con proveedor propio, `FlagService`), carga en `main.ts`, endpoints en el modo demo, página `/admin/features`.
- Verificado en local: `./gradlew test` (unitarios + ArchUnit), `./gradlew integrationTest` (7 tests, con Docker), 413 tests del frontend, `npm run build` (460 kB de 500), `npm run test:tools`, Spectral sin errores.
- Sin verificar: Lighthouse y Playwright (los ejecuta la CI); el hito no cambia nada visible del sitio público.

## Hito 1 · qué se hizo

- `zone-layout.ts` (puro, con tests): cuánto cabe en un recuadro, `resizeToContent` (no baja del tamaño de sus nodos ni de los recuadros que contiene; la esquina opuesta no se mueve), `reflow` (solo reordena lo que ha quedado fuera o encima de otro) y `contentBounds` (vista ajustada).
- `CloudInfraComponent`: con `studio.smart-rules` encendida, redimensionar una zona (ratón o Mayús+flechas) usa lo anterior; menú **Ver → Ajustar a pantalla** (y vuelta). Con la vista ajustada, los paneles de métricas y FinOps bajan debajo del lienzo.
- Sin cambio de esquema del proyecto. Con la flag apagada no cambia nada (hay tests de las dos ramas).
- Playwright: `e2e/studio-smart.e2e.ts` en todos los perfiles, con capturas antes/después (`e2e-screens/<perfil>/hito-1-*.png`).
- Verificado en local: 438 tests del frontend, build (460 kB), `test:tools`, Playwright en `desktop-1440-chromium`, `tablet-820-chromium` e `iphone-390-chromium`. **WebKit sin ejecutar.**

## Hito 2 · qué se hizo

- Reglas como datos en `graph-rules.ts` (se exportan a `architecture/graph-rules.json`): `advice` (por qué cada papel no recibe de cualquiera y qué hacer), `placement` (base de datos en subred pública) y `exposure` (conexión directa desde Internet a una base de datos: «Pon una API en medio»).
- Lienzo, con `studio.smart-rules` encendida: al trazar una conexión se resaltan los destinos válidos y se atenúan los demás; una conexión inválida no se crea y se explica con su sugerencia (`role="alert"`); los avisos de colocación y exposición salen junto al nodo y bajo el lienzo.
- Backend: `ArchitectureGraphRules.diagnostics` (los mismos datos), caso de uso `diagnose` (vacío con la flag apagada) y campo opcional `diagnostics` en `ArchitectureProject` (GET por id, POST y PUT). Guardar sigue rechazando solo lo que ya rechazaba.
- Sin cambio de esquema del proyecto. Fixture de proyecto antiguo: `e2e/fixtures/studio-project-v2-exposed-database.json` (lo escribe `tools/export-e2e-fixtures.mjs`); abre igual con la flag apagada y encendida.
- Verificado en local: `./gradlew test`, 479 tests del frontend, build (466 kB de 500), Spectral sin errores, Playwright en `desktop-1440-chromium`, `tablet-820-chromium` e `iphone-390-chromium`. **Sin ejecutar en local: `integrationTest`, WebKit y Lighthouse** (los corre la CI).

## Hito 3 · qué se hizo

- `cloud-oracle.data.ts`: qué servicio de OCI y qué recurso de `oracle/oci` cubre cada pieza, y dónde no hay equivalente directo (8 piezas, con su trade-off). Fuentes en `docs/architecture/cloud-equivalences.md`.
- `CloudProviderId` gana `oci`; `PerProvider` lo lleva opcional. Catálogo, arquitectura de referencia y proyectos guardados reciben su nombre en OCI al cargarse (`withOracle`); un nodo sin él sale como «Sin equivalente en OCI» y deja su aviso en `main.tf`.
- Terraform (los dos generadores, con casos golden `properties-oci`, `unsupported-oci` y `legacy-oci`): proveedor `oracle/oci`, `oci_core_vcn`, región por defecto `us-ashburn-1`.
- Precios: `OciPriceListAdapter` lee la lista pública de Oracle (7 números de parte). Sin precio real, «sin estimación»: en OCI no hay cifras a mano para servicios de la nube, ni comparación de costes con otras nubes.
- Flag: el selector solo ofrece OCI con `cloud.oracle` encendida (o si el proyecto abierto ya está en OCI); el backend responde «nube no admitida» (400) a `oci` con la flag apagada (`CloudProviders.resolve`).
- Marca: sin logo de Oracle (su guía respondió 403); aro neutro y nombre en texto. `docs/brand-usage.md`.
- Verificado en local: `./gradlew test`, 495 tests del frontend, build (466 kB), Spectral, Playwright en escritorio, tablet y móvil (Chromium). **Sin ejecutar en local: `integrationTest`, WebKit y Lighthouse.**

## Hito 4 · qué se hizo

- **Un proyecto, dos vistas.** Con `studio.system-design` encendida, el Estudio gana una pestaña «Aplicación» junto a «Infraestructura» (el lienzo de siempre). El diseño de sistema va dentro del proyecto (`StudioProject.system`): choices, deployments y nfr.
- **Catálogo curado como datos** (`system/system-catalog.data.ts` → `architecture/system-design.json`): 9 categorías (cliente, backend, estilo de API, autenticación, base de datos, caché, colas, BFF, push) con 3 o 4 opciones; cada opción dice en qué tipos de nodo de infraestructura se puede desplegar.
- **«Se despliega en»** validado por reglas: solo se ofrecen los nodos válidos, y si el nodo desaparece o deja de ser válido sale un error (`deployment-missing`, `deployment-invalid`); lo que falta por desplegar, un aviso.
- **Requisitos no funcionales como entrada** (usuarios, RPS, latencia p95, disponibilidad, presupuesto, PCI y salud): validación de rangos y 15 reglas en datos que avisan con qué hacer.
- **Dos evaluadores, un resultado**: `system/system-design.ts` (navegador, al momento) y `SystemDesignRules` (backend). Diez casos exportados (`architecture/system-cases.json`) que el backend tiene que evaluar texto por texto igual.
- **Salidas** (solo backend, `SystemDesignService` + `SystemDesignGenerator`): `main.tf` y `variables.tf` (el generador de siempre), `openapi.yaml` (REST) o `service.proto` (gRPC), `docker-compose.yml` y `README.md`. Para GraphQL y eventos no se genera contrato.
- **API** (etiqueta `System Design`, detrás de la flag: 404 si está apagada): `GET /public/architecture/system-design/catalog`, `POST …/evaluate` y `POST …/generate`. `ArchitectureProject` y su petición ganan `system` (opcional); migración `V8` (`system_json`).
- **Esquema del proyecto: versión 3**, con migración 2 → 3. El fixture v2 (`e2e/fixtures/studio-project-v2-exposed-database.json`) sigue abriendo.
- Verificado en local: `./gradlew test`, 536 tests del frontend, build (470 kB de 500), Spectral y los escenarios Playwright del hito en escritorio, tablet y móvil (Chromium). **Sin ejecutar en local: `integrationTest` (incluye la migración V8), WebKit y Lighthouse.** Los corre la CI del PR.

## Hito 5 · qué se hizo

- `system/system-templates.ts`: seis sistemas de ejemplo (fintech, e-commerce, telemedicina, movilidad, educación, IoT), cada uno con sus dos vistas (infraestructura + diseño de sistema), requisitos no funcionales, entre dos y cuatro decisiones clave de una línea y versión.
- Mismo mecanismo que las plantillas y los patrones de datos: `build()` en el frontend, `npm run export:presets` → `presets.json` (ahora con `system`) → el backend los siembra. Entran también en los casos golden de Terraform.
- Con `studio.system-templates` encendida, el menú Proyecto → Plantillas gana la sección «Sistemas completos»: nombre, etiqueta **«Ejemplo ficticio»**, sector, requisitos, coste estimado (calculado con el estimador del Estudio, no escrito a mano) y decisiones.
- Con la flag apagada no se ofrecen en el frontend y el backend no los devuelve (ni en la lista ni por id, 404), aunque estén sembrados.
- Un test obliga a que cada plantilla nazca sin nada que corregir: grafo válido, todo desplegado, requisitos cumplidos y dentro de presupuesto.
- Las pestañas de vista (hito 4) pasan a su propia fila, encima de la barra: en la misma fila desplazaban el menú de plantillas fuera de la pantalla en tablet.
- Verificado en local: `./gradlew test`, 546 tests del frontend, build (470 kB), Playwright en escritorio, tablet y móvil (Chromium). **Sin ejecutar en local: `integrationTest`, WebKit y Lighthouse.**

## Hito 6 · qué se hizo

- **Servidor MCP en `/v1/mcp`** (flag `mcp.section`; apagada, 404): adaptador de entrada `infrastructure/adapter/in/mcp`, con el SDK oficial `mcp-core` 2.0.1 + `mcp-json-jackson2`, transporte Streamable HTTP sobre Servlet, revisión 2025-11-25.
- **Capa propia**: las herramientas se describen con `McpTool` (sin tipos del SDK); **solo `McpSdkServer` conoce el SDK** (regla de ArchUnit). Migrar a 2026-07-28 es cambiar esa clase.
- **Seis herramientas** sobre casos de uso existentes: `listar_plantillas`, `validar_arquitectura`, `generar_terraform` (texto + `main.tf` y `variables.tf` como recursos incrustados), `estimar_costos`, `preguntar_portafolio` y `disenar_sistema`. Tres recursos (`portfolio://catalogo/servicios`, `…/sistemas`, `portfolio://proyectos`) y dos prompts (`revision_de_arquitectura`, `arquitecto`).
- **Elicitation**: `disenar_sistema` pregunta la nube, la región, los usuarios, el presupuesto, la regulación y el backend si faltan; si el cliente no la admite, devuelve un error que dice qué falta y qué valores valen.
- **Seguridad**: ninguna herramienta escribe (regla de ArchUnit sobre los métodos de los casos de uso); entradas tratadas como datos; límite por origen (30/min) y tope diario global (2000) en Redis (`McpAccessService`); 256 KB por mensaje; errores internos sin detalle hacia fuera.
- **Sintaxis HCL comprobada en cada respuesta** (`HclSyntax`, en `TerraformService`); en la CI, los casos golden pasan por el analizador real de Terraform.
- **Versionado y contrato**: cada herramienta lleva `version` y `kind` en `_meta`; `McpToolContractTest` compara con `src/test/resources/mcp/tools-contract.json`.
- **Pruebas con un cliente MCP real** (el del SDK): `McpServerEndToEndTest` (Tomcat embebido, context-path `/v1`, casos de uso reales, 12 escenarios) y un test nuevo en `PlatformIntegrationTest`.
- Nuevo en la capa de aplicación: `ArchitectureProjectUseCase.validate` (sin flag), `SystemDesignUseCase.design` (parte del sistema de ejemplo más parecido) y `McpAccessUseCase`.
- Documentación: `docs/mcp/README.md`.
- Verificado en local: `./gradlew test` completo. **Sin verificar en local: `integrationTest`** (Docker respondió «502 Bad response from Docker engine» al crear contenedores) **y el paso de `terraform fmt` de la CI** (no hay Terraform instalado en esta máquina).

## Hito 7 · qué se hizo

- **Evaluaciones**: 27 tareas sintéticas (`src/test/resources/mcp/eval-tasks.json`) y un arnés (`McpEval`) con el modelo como pieza intercambiable. En cada PR, `McpEvalTest` las resuelve con un modelo simulado y determinista contra el servidor real (cliente MCP real): 27 de 27. El resultado va a `build/reports/mcp-eval/mcp-eval.json` (artefacto y resumen de la CI) y a `docs/mcp/mcp-eval.json` (el que enseñará la web).
- **Nocturna con modelo real**: `McpRealModelEvalTest` + `GeminiEvalModel` (SDK oficial `com.google.genai:google-genai` 1.76.0, solo en tests), con tope de 25 tareas × 8 llamadas. Workflow `mcp-eval-nightly.yml` **desactivado**: necesita el secret `GEMINI_API_KEY` y la variable `MCP_EVAL_NIGHTLY=true`.
- **Observabilidad** (`McpToolTelemetry`): métricas Micrometer (`mcp.server.operation.duration`, `mcp.tool.calls`), traza con la API de OpenTelemetry siguiendo las convenciones de MCP/GenAI, y evento anónimo `MCP_TOOL_CALL` por el SSE de telemetría. Un test comprueba que no viaja contenido.
- **Registro de MCP**: `docs/mcp/server.json` preparado y comprobado contra el esquema 2025-12-11 (campos obligatorios, propiedades conocidas, patrones y longitudes; no con un validador de JSON Schema). Sin publicar.
- **MCP Apps**: documentado como siguiente paso (es una extensión, no la especificación base).
- CI: el job de tests del backend publica el informe de evaluación y, desde el hito 6, pasa los casos golden por el analizador de Terraform.
- Verificado en local: `./gradlew test` completo. **Sin verificar: la evaluación con modelo real (nunca ejecutada), la exportación de trazas (no hay colector) y `integrationTest`.**

## Hito 8 · qué se hizo

- **Sección «Usa mi plataforma desde tu IA»** en la portada (flag `mcp.section`), con el sobretítulo «Model Context Protocol». Se carga bajo demanda (trozo de 17 kB).
- **Conectar**: pestañas Claude Code, Claude Desktop, Cursor y VS Code, cada una con lo que documenta su cliente. Enlace de instalación real solo en Cursor; en los demás, botón de copiar.
- **Herramientas, estado y p95**: nuevo `GET /public/mcp/status` (detrás de la flag), con la misma lista que `tools/list`, los límites y la latencia medida por Micrometer.
- **Actividad reciente**: los eventos `MCP_TOOL_CALL` del SSE de telemetría (herramienta, resultado y latencia).
- **Probar sin instalar**: reproducción de una sesión MCP real, grabada mensaje a mensaje por un test del backend (`public/mcp/session.json`).
- **Evaluaciones**: resultado y fecha desde `public/mcp/mcp-eval.json`.
- **Modo demo**: sin servidor, todo lo anterior sale de la grabación con la etiqueta «Grabación».
- Verificado en local: `./gradlew test`, 564 tests del frontend, build (472 kB de 500), Playwright en escritorio, tablet y móvil (Chromium), con capturas `hito-8-*`. **Sin ejecutar en local: `integrationTest`, WebKit y Lighthouse.**

## Decisiones del autor (2026-10-11)

1. Servidor MCP con el SDK oficial `mcp-core` 2.0.1 y transporte Servlet, sirviendo 2025-11-25, detrás de una capa propia para migrar a 2026-07-28 cuando el SDK la publique.
2. Sintaxis HCL validada en proceso en cada respuesta; `terraform validate` real solo en CI sobre los casos golden; se mantiene la etiqueta «esqueleto».
3. `/mcp` sin autenticación, límite por IP + tope diario global; documentar que los usuarios de Claude Desktop comparten cuota. Ninguna herramienta escribe ni aplica nada.
4. Evaluaciones nocturnas con Gemini (`GEMINI_API_KEY`), 25 tareas × 8 llamadas, sintéticas y sin datos personales. **Hasta que exista el secret, el workflow nocturno queda desactivado** y solo corre la evaluación simulada en cada PR.
5. Autorizado: push, un PR por hito y, con el CI gate en verde, integrarlo en `main` y seguir. **No desplegar el VPS ni publicar en el registro de MCP.**
6. Alcance mínimo del hito 4 aprobado: 9 categorías de aplicación con 3 opciones cada una; 6 requisitos no funcionales con unas 12 reglas; salidas Terraform, OpenAPI inicial o `.proto`, `docker-compose` y README. Fuera: código de aplicación, y GraphQL y eventos como contrato generado.

## Decisiones menores tomadas

- **Las flags que existen las declara el código, no la tabla.** Sin fila, apagada: no hay que sembrar nada ni puede quedar una flag huérfana encendida.
- **OpenFeature está en el camino de la evaluación** (puerto `FeatureFlags` → cliente OpenFeature → proveedor → caso de uso con caché), no al lado: cambiar a otro proveedor es cambiar un bean.
- **Fallo al leer = apagada** (lo hace el SDK al devolver el valor por defecto). Redis caído solo quita la caché.
- **TTL de 1 minuto** para la caché de flags: si el borrado tras un cambio no llega a Redis, se corrige sola pronto.
- **Sin cambio de estado no hay entrada de auditoría.**
- **Rutas con flag: 404 y cerradas por defecto** si falta el proveedor (`FeatureGateInterceptor`).
- **Frontend sin `@openfeature/angular-sdk`**: basta el SDK web con una señal propia; menos peso en el bundle inicial.
- **Modo demo**: lo que se enciende en `/admin/features` se guarda en `localStorage` (`demo-feature-flags`), solo en ese navegador. Sirve para probar lo nuevo con `ng serve` y para Playwright. Fuera del modo demo no se lee.
- **Ramas apiladas** mientras un PR espera a la CI: el hito siguiente parte de la rama del anterior.
- **Hito 1 · la rejilla del reacomodo es la de auto-ordenar** (columnas cada 140, filas cada 90): las dos funciones dejan el mismo dibujo.
- **Hito 1 · un nodo que sigue entero dentro y sin solaparse no se mueve** al redimensionar; solo se reordena cuando hace falta. Durante un arrastre se parte siempre de la posición inicial, así que al volver atrás todo vuelve a su sitio.
- **Hito 1 · «Ajustar a pantalla»** ciñe el `viewBox` al contenido y quita el ancho mínimo de 720 px; es una vista de conjunto que el visitante pide, y en ella los nodos pueden medir menos de 44 px en un móvil (igual que en «Ajustar a pantalla» del pipeline).
- **«En móvil el editor en solo lectura»** se entiende como alcance de las pruebas: en móviles y tabletas Playwright comprueba la lectura de lo nuevo, y la edición se prueba en escritorio. No se ha quitado la edición en móvil, que ya existía (regla de no cambiar lo existente).
- **Hito 2 · las reglas nuevas avisan, no rechazan al guardar.** `placement` y `exposure` son avisos (`warning`) en el backend y en un proyecto ya guardado; solo impiden *trazar* una conexión nueva en el lienzo con la flag encendida. Así ningún proyecto guardado deja de abrir ni de guardarse.
- **Hito 2 · con la flag apagada el lienzo sigue creando cualquier conexión** y avisando después, como antes.
- **Hito 2 · el frontend no pinta los `diagnostics` del backend**: calcula los mismos con las mismas reglas. El campo queda para la API y para la herramienta `validar_arquitectura` del hito 6.
- **Hito 2 · `UseCaseConfig` recibe `ObjectProvider<FeatureFlags>`**: en un contexto parcial sin proveedor (tests `@WebMvcTest` que importan la configuración) las flags cuentan como apagadas, sin tocar los tests existentes.
- **Hito 3 · OCI no tiene filas en el catálogo del backend** (`catalog.json` sigue con tres nubes): sus nombres van en el Estudio y sus precios salen de la lista de Oracle. Consecuencia: en OCI el copiloto responde, pero no propone piezas del catálogo.
- **Hito 3 · con la flag apagada, `oci` es una nube desconocida para la API** (400 con el mensaje de siempre), no un 404: los endpoints ya existían y solo cambia un valor del enumerado.
- **Hito 3 · un producto de terceros cuesta lo mismo en cualquier nube**: en OCI solo Cloudflare, Datadog y similares conservan su cifra orientativa.
- **Hito 3 · los nombres largos de OCI se ajustan al ancho del nodo** (`textLength`), solo en OCI, para no cambiar el dibujo de las otras nubes.
- **Añadir un valor a un enumerado de una respuesta hace fallar `📜 Breaking`** (oasdiff, `response-property-enum-value-added`), en el PR y en el push a `main`. Pasó con `oci` en `cloudProvider` (hito 3): el cambio es intencionado y va detrás de una flag, pero el check no lo sabe. En adelante el contrato solo crece con campos y esquemas nuevos; si hace falta otro valor en una respuesta, se decide con el autor antes de abrir el PR.
- **Los PR se abren como borrador** y pasan a «listo» cuando el CI gate está en verde, para que no se integren a medias.
- **Hito 4 · la vista de Aplicación es un tablero de elecciones, no un segundo lienzo libre**: una opción por categoría, con el camino de la petición dibujado a partir de ellas. Cumple «un solo modelo con dos vistas» sin duplicar el editor de grafos.
- **Hito 4 · los archivos los genera solo el backend.** No hay un segundo generador en el navegador: en modo demo el botón dice que no está disponible, no inventa nada. Las comprobaciones sí van en los dos lados (el navegador las necesita al momento).
- **Hito 4 · el presupuesto se compara con el coste que estima quien llama** (`estimatedMonthlyCostUsd`); sin él, la regla no se evalúa. El backend no recalcula el coste del lienzo.
- **Hito 4 · imágenes del `docker-compose.yml`** comprobadas en Docker Hub el 2026-10-11: `postgres:17`, `mongo:8`, `redis:8`, `rabbitmq:4-management`, `apache/kafka:4.2.2`. Lo que solo existe gestionado (clave-valor, pub/sub, identidad) deja un comentario, no un contenedor.
- **Hito 4 · el contrato nuevo no usa enumerados cerrados** (`severity`, `kind`, `language`, `cloudProvider` son texto con su descripción), para que crecer no vuelva a romper `📜 Breaking`.
- **Hito 4 · el diseño de sistemas comparte el cupo del generador de Terraform** (`rateLimitProperties.terraform()`), con su propia clave (`system-design:<ip>`).
- **Hito 4 · en el móvil la vista de Aplicación es de solo lectura** (por debajo de 640 px), como pediste para lo nuevo.
- **Hito 5 · los sistemas de ejemplo se cargan desde el frontend** (`build()`), como los patrones de datos; el backend los siembra y los sirve por su API, que es de donde los leerá la herramienta MCP `listar_plantillas`.
- **Hito 5 · el coste que se muestra se calcula al vuelo** con `estimateCost`, y el presupuesto de cada plantilla es un número redondo por encima: si alguien cambia una cifra orientativa y una plantilla se sale de presupuesto, el test falla.
- **Hito 5 · al cargar un sistema con `studio.system-design` encendida se abre por la vista de Aplicación**; con ella apagada se carga solo la infraestructura (el diseño viaja en el proyecto, sin verse).
- **Hito 6 · transporte con sesiones (Streamable), no el «stateless» del SDK**: sin sesión el servidor no puede preguntar al cliente (elicitation), que es un requisito.
- **Hito 6 · `terraform fmt` en la CI en vez de `terraform validate`** (se aparta de la decisión 2 del autor, a confirmar): los esqueletos no llevan los argumentos de cada recurso, así que `validate` no puede pasar; `fmt` usa el analizador real de HCL y falla si un archivo no se puede analizar.
- **Hito 6 · Oracle Cloud no se ofrece por MCP**: las herramientas admiten `aws`, `gcp` y `azure`. OCI sigue detrás de su flag en la web.
- **Hito 6 · `disenar_sistema` no inventa una infraestructura**: parte de uno de los seis sistemas de ejemplo (el pedido, o el más parecido por elecciones y regulación) y le aplica lo que se pide. La región pedida se devuelve y se explica cómo ponerla en `variables.tf`; el generador sigue usando la región por defecto de la nube.
- **Hito 6 · `listar_plantillas` respeta `studio.system-templates`**: con esa flag apagada no lista los sistemas de ejemplo; `disenar_sistema` sí los usa siempre.
- **Hito 6 · el origen de una llamada es `getRemoteAddr()`**, como en el resto de límites de la plataforma. Detrás de un proxy sin cabeceras reenviadas, todos los clientes compartirían cupo: a revisar con la configuración del VPS antes de encender la flag.
- **Hito 6 · se usó `git push --force-with-lease` una vez** sobre `feat/system-templates` (rama propia, sin PR) al reordenarla sobre la del hito 4 corregida. Va contra la regla de no forzar: en adelante las ramas apiladas se ponen al día con `merge`.
- **Hito 7 · el modelo real se llama con el SDK oficial de Google GenAI, no con REST a mano**: la página oficial de function calling describe ahora la Interactions API y no muestra la forma de la respuesta; el SDK (leído de su jar) sí da una API comprobable al compilar. **A confirmar por el autor** cuando cree el secret: la primera ejecución nocturna dirá si hay que ajustar algo.
- **Hito 7 · el workflow nocturno tiene `schedule`, pero un interruptor doble** (variable `MCP_EVAL_NIGHTLY` + secret): sin los dos, el job se omite. Aparecerá cada noche como «omitido» en Actions.
- **Hito 7 · solo la API de OpenTelemetry, sin SDK ni exportador**: la plataforma no tiene colector. Con el agente de Java o un SDK configurado, los spans salen sin tocar código.
- **Hito 7 · las métricas viven en un `SimpleMeterRegistry`** (no hay Actuator): se pierden al reiniciar. Bastan para la p95 que enseñará la web.
- **Hito 7 · el modelo simulado sigue un plan guardado por tarea**: no «decide» nada. Lo que evalúa en cada PR es que el servidor siga resolviendo las tareas; lo que evalúa si un modelo sabe usar las herramientas es la nocturna.
- **Hito 8 · «Conectar en un clic» es un clic solo donde el cliente lo documenta** (Cursor). VS Code no documenta un enlace de instalación (comprobado el 2026-10-12): se copia el `mcp.json`. Claude Desktop no tiene enlace: se copia la dirección.
- **Hito 8 · el catálogo de herramientas de la web sale de un endpoint REST**, no de hablar MCP desde el navegador: es la misma lista de objetos que el servidor publica en `tools/list`.
- **Hito 8 · la sección no está en la barra de navegación**: `PAGE_SECTIONS` es una lista fija y un enlace a una sección apagada no llevaría a ningún sitio. Se llega bajando, o con `#mcp`.
- **Hito 8 · el enlace a la documentación es texto** (`docs/mcp/README.md`): el repositorio es privado.
- **Hito 8 · los datos de la sección (`session.json`, `mcp-eval.json`) los escriben tests del backend** en `portfolio-frontend/public/mcp/`; no se editan a mano.

## Documentación oficial verificada (2026-10-11)

| Tema | Resultado | Fuente |
| - | - | - |
| Especificación MCP | Revisión vigente **2026-07-28**: sin estado, sin `initialize` ni `Mcp-Session-Id`, `server/discover` obligatorio, elicitación por reintento (`InputRequiredResult` + `inputResponses`), `resultType` obligatorio, `ttlMs`/`cacheScope` en los listados, cabeceras `Mcp-Method`/`Mcp-Name`. Roots, Sampling y Logging en retirada. | modelcontextprotocol.io/specification/2026-07-28 (+ changelog, versioning) |
| Compatibilidad | Un cliente antiguo contra un servidor solo moderno **falla**; un servidor antiguo con un cliente de las dos eras **funciona**. | …/basic/versioning |
| Herramientas | `outputSchema` + `structuredContent` (y copia en texto), `resource_link`, `isError` para errores corregibles, nombres `[A-Za-z0-9_.-]` hasta 128, orden determinista. | …/server/tools |
| Elicitación | Modos `form` (objeto plano de primitivos y enums) y `url`. Prohibido pedir secretos por formulario. | …/client/elicitation |
| Autorización | **Opcional**. Si se pone: OAuth 2.1 + RFC 9728. | …/basic/authorization |
| MCP Apps | Extensión oficial `io.modelcontextprotocol/ui` (no es parte del núcleo). La admiten Claude, Claude Desktop, VS Code y Cursor. | …/extensions/apps/overview, client-matrix |
| Registro | En **preview**. `server.json` (esquema 2025-12-11) con `remotes: [{type: "streamable-http", url}]`; la URL debe ser pública. | …/registry/quickstart, remote-servers |
| SDK Java oficial | **2.0.1**, Java 17+, sigue la revisión **2025-11-25**. `mcp-core` trae transporte Servlet Streamable HTTP sin Spring. | github.com/modelcontextprotocol/java-sdk |
| Spring AI | Estable 2.0.1; solo Spring Boot 4.0.x y 4.1.x. | docs.spring.io/spring-ai/reference/getting-started.html |
| OpenFeature Java | `dev.openfeature:sdk` 1.23.0, Java 11+. **En uso desde el hito 0.** | openfeature.dev/docs/reference/sdks/server/java |
| OpenFeature web | `@openfeature/web-sdk` 1.10.0 (evaluación síncrona tras `initialize`). **En uso desde el hito 0.** | openfeature.dev/docs/reference/sdks/client/web |
| Precios OCI | Endpoint público documentado, sin credenciales: `apexapps.oracle.com/pls/apex/cetools/api/v1/products/?partNumber=&currencyCode=`. | docs.oracle.com (Estimating Costs) |
| Claude Code | `claude mcp add --transport http <nombre> <url>`; `.mcp.json` con `"type": "http"`. Sin instalación en un clic. | code.claude.com/docs/en/mcp |
| Claude Desktop | Customize > Connectors > Add custom connector; admite «No sign in». Las conexiones salen de la nube de Anthropic. Sin enlace de un clic. | support.claude.com (custom connectors) |
| Cursor | `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64 del JSON>`; servidor remoto `{ "url": … }`. | cursor.com/docs/context/mcp |
| VS Code | `mcp.json` con `"servers": { x: { "type": "http", "url": … } }`. | code.visualstudio.com/docs/agents/reference/mcp-configuration |

### Sin confirmar todavía (se verifica al empezar el hito que lo usa)

- **VS Code, enlace de un clic** `vscode:mcp/install?<JSON codificado>` (hito 8).
- **Proveedor Terraform de OCI**, nombres de los servicios de OCI y guía de marca de Oracle (hito 3).
- **Convenciones semánticas de OpenTelemetry para MCP y GenAI** (hito 7).
- ~~SDK Java: elicitación, `structuredContent` y transporte Servlet con Tomcat 10.1~~ **Confirmado el 2026-10-12** leyendo las clases del jar 2.0.1 y con `McpServerEndToEndTest` (cliente real, Tomcat embebido, context-path `/v1`). La convivencia con Spring Security solo la cubre la prueba de integración, que no se pudo ejecutar en local.

## Bloqueos

- Ninguno. (`gh` estuvo sin sesión hasta el 2026-10-11; resuelto con `gh auth login --web`.)

## Pendientes

- CI gate del PR del hito 4 (#27) e integrarlo; después, los PR de los hitos 5 y 6.
- Integrar los PR de los hitos 5 a 8, en orden, con su CI gate en verde.
- **Del autor**: crear el secret `GEMINI_API_KEY` y la variable `MCP_EVAL_NIGHTLY=true` para encender la evaluación nocturna; decidir si se publica en el registro de MCP (y con qué dirección).
- Antes de encender `mcp.section` en producción: comprobar que el backend ve la dirección real del cliente detrás de Caddy.
- Sin confirmar del hito 4: el `.proto` generado no se ha pasado por `protoc` (no hay compilador en la CI); el OpenAPI sí se analiza como YAML en los tests, pero no se ha pasado por un validador de OpenAPI.

## Notas para `CLAUDE.md` (pendientes de copiar)

La sesión está aislada en el worktree y no puede escribir en el `CLAUDE.md` del checkout principal. Al salir del worktree, copiar tal cual cada bloque, antes de «ENTORNOS DEL FRONTEND Y MODO DEMO».

### FEATURE FLAGS (hito 0)
- **Todo lo nuevo se integra apagado y se enciende sin desplegar.** Las flags que existen las declara el código, no la base de datos: `FeatureFlagDomain` (backend) y `FEATURE_FLAGS` en `core/flags/feature-flags.ts` (frontend), **que deben coincidir**. Hoy: `studio.smart-rules`, `cloud.oracle`, `studio.system-design`, `studio.system-templates`, `mcp.section`. Una flag sin fila en la tabla está apagada.
- **Backend**: migración `V7__feature_flags.sql` (`feature_flags` y `feature_flag_audit`, con `tenant_id`; la auditoría solo añade filas). `FeatureFlagService` (cache-aside: las claves encendidas van en `portfolio:feature-flags:enabled`, TTL 1 min, y se purgan al cambiar). El resto de la plataforma pregunta por el puerto `FeatureFlags.isEnabled(flag)`, que evalúa con **OpenFeature** (`dev.openfeature:sdk`; `PortfolioFeatureProvider` + `OpenFeatureFlagsAdapter`, dominio `portfolio`). **Si la lectura falla (base de datos caída), la flag cuenta como apagada**; Redis caído solo quita la caché.
- **Endpoints** (etiqueta `Feature Flags`): `GET /public/features` (todas, con su estado), `GET /admin/features`, `PUT /admin/features/{key}` (`{enabled}`; el actor sale del token; 404 si la flag no existe; sin cambio de estado no deja auditoría) y `GET /admin/features/audit` (100 últimos).
- **Un endpoint que nace detrás de una flag se añade a `FeatureGateConfig.GATES`** (`adapter/in/web/flags`): con la flag apagada responde el mismo 404 que una ruta inexistente. Sin proveedor de flags (tests de una sola capa) la ruta queda cerrada: un `@WebMvcTest` de un controlador con flag necesita `@MockBean FeatureFlags`. Lo que no sea Spring MVC (el servlet de MCP) necesitará su propio filtro.
- **Frontend**: `main.ts` llama a `loadFeatureFlags()` antes de iniciar Angular (después del fallback a demo; 2 s como mucho; si falla, valen los valores del build, todos apagados). Proveedor propio de `@openfeature/web-sdk` (`PlatformFlagsProvider`). Los componentes preguntan a `FlagService.isEnabled('…')` (señal). **`FlagService` no es `FeatureFlagsService`, que es el cliente generado de la API.** En tests sin proveedor todo está apagado; para encender una flag: `await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'mcp.section': true })))` y `OpenFeature.clearProviders()` al terminar.
- **Modo demo**: no se pide nada a la API; valen los del build más lo que se encienda en `/admin/features`, que se guarda solo en ese navegador (`localStorage`, clave `demo-feature-flags`) y se aplica del todo al recargar. Playwright enciende flags con `addInitScript` sobre esa clave. Fuera del modo demo esa clave no se lee.
- **Bundle inicial: 460 kB** de 500 (el SDK de OpenFeature son ~27 kB). Lo nuevo va en trozos bajo demanda.
- `integrationTest` **ya se ha ejecutado en local** (2026-10-11, con Docker en marcha): 7 tests en verde.

### LIENZO RESPONSIVO (hito 1, flag `studio.smart-rules`)
- `features/public/cloud/zone-layout.ts`: al redimensionar una zona con la flag encendida, el recuadro no baja del tamaño de su contenido (`resizeToContent`: sus nodos directos en rejilla y las zonas que contiene) y los nodos que quedarían fuera o solapados se reacomodan (`reflow`). **La rejilla es la de `auto-layout.ts`** (140 × 90, primera fila a 68): si cambia una, cambia la otra. Un nodo «directo» es el que no está en una zona más pequeña de dentro (`directNodes`).
- **Ninguna plantilla puede empezar con una zona más pequeña que lo que contiene** (test en `zone-layout.spec.ts`).
- **Ver → Ajustar a pantalla** (`fitted`): `viewBox` ceñido al contenido (`contentBounds`), clase `.canvas-fitted` (sin el `min-w` de 720 px, alto máximo 70dvh) y los paneles de métricas y FinOps debajo del lienzo.
- En un test del componente, **entre dos pulsaciones de teclado sobre una zona hay que llamar a `fixture.detectChanges()`**: la plantilla le pasa la zona al manejador.
- Playwright: `e2e/studio-smart.e2e.ts` corre en todos los perfiles (lista `FLAGGED` de `playwright.config.ts`); enciende la flag con `addInitScript` sobre `demo-feature-flags`. Lo nuevo detrás de una flag añade ahí su spec.

### CONEXIONES INTELIGENTES (hito 2, flag `studio.smart-rules`)
- `graph-rules.ts` gana tres bloques de **datos** que viajan en `architecture/graph-rules.json` (`npm run export:presets`): `advice` (por papel: por qué y qué hacer), `placement` (pieza × zona de red) y `exposure` (zona de origen × papel de destino). Los textos usan `{node}`, `{from}` y `{to}`; **frontend (`connectionVerdict`, `advisories`) y backend (`ArchitectureGraphRules.diagnostics`) deben dar el mismo texto**.
- **Dos niveles**: `incoming`, `kinds` y `maxInstances` son errores (guardar los rechaza, como antes); `placement` y `exposure` son **avisos**: no impiden abrir ni guardar, solo impiden *trazar* una conexión nueva en el lienzo con la flag encendida. Una regla nueva que rechazase al guardar rompería proyectos guardados.
- Lienzo: `connectionTargets` (clases `node-target-ok` / `node-target-no` mientras se traza) y `connectionRefusal` (aviso `role="alert"`, `data-testid="connection-refusal"`). El rechazo vive en `connect()`, así que vale también para el desplegable de propiedades.
- API: `ArchitectureProject.diagnostics` (opcional; `GraphDiagnostic {nodeId, rule, severity, message, suggestion?, from?, to?}`), solo con la flag encendida. `ArchitectureProjectUseCase.diagnose(nodes, connections)` es lo que usará la herramienta MCP `validar_arquitectura`.
- Proyectos de ejemplo para e2e: `node tools/export-e2e-fixtures.mjs` → `e2e/fixtures/`.
- **Bundle inicial: 466 kB** de 500.

### ORACLE CLOUD (hito 3, flag `cloud.oracle`)
- **`oci` es la cuarta nube**, pero no es como las otras tres: `PerProvider` la lleva **opcional** (`BaseProviderId` son las tres que siempre están). Sus nombres y recursos no se escriben en el catálogo sino en `cloud-oracle.data.ts` (`ORACLE_EQUIVALENTS`), que `SERVICE_CATALOG`, `CLOUD_NODES` y `parseProject` aplican con `withOracle`. **Un servicio nuevo del catálogo con nombre por nube necesita su fila ahí** (hay un test que falla si falta) y su línea en `docs/architecture/cloud-equivalences.md` con la fuente.
- `forProvider(valor, 'oci')` devuelve «Sin equivalente en OCI» si falta; para Terraform se usa **`resourceFor`**, que devuelve `null`. Los dos generadores dejan `# …: sin recurso de Terraform equivalente en OCI`.
- **En OCI no hay cifras de coste escritas a mano** para servicios de la nube: solo el precio de la lista pública de Oracle (`OciPriceListAdapter` + `OciSkuCatalog`, tabla cerrada de números de parte; `PRICING_OCI_ENABLED`, `PRICING_OCI_BASE_URL`). OCI tampoco entra en la comparación de costes de la auditoría ni tiene filas en `catalog.json`.
- **Flag**: frontend, `providers()` del lienzo; backend, `CloudProviders.resolve(code, flags)` en los controladores y el mapper que reciben una nube (con la flag apagada: 400 «Nube no admitida», igual que una nube desconocida).
- **Sin logo de Oracle** (`TECH_ICONS.oci` es el aro neutro). Un diagrama en OCI no pinta iconos de AWS, Azure ni Google Cloud.

### DISEÑO DE SISTEMAS (hito 4, flag `studio.system-design`)
- **Un proyecto, dos vistas.** `StudioProject.system` (opcional) es lo que va encima del lienzo: `choices` (categoría → opción), `deployments` (categoría → id de nodo) y `nfr`. El lienzo es la vista de Infraestructura; `SystemDesignComponent` (`features/public/cloud/system/`), la de Aplicación. `PROJECT_VERSION = 3`; un v2 abre igual (migración 2 → 3).
- **El catálogo y las reglas son datos**: `system/system-catalog.data.ts` (`SYSTEM_CATALOG`, `NFR_INPUTS`, `NFR_RULES`) → `npm run export:presets` → `architecture/system-design.json`. Añadir una opción o una regla es añadir una entrada; hay tests que fallan si una opción se despliega en un tipo de nodo que no existe.
- **Dos evaluadores que deben dar lo mismo**: `system/system-design.ts` (`evaluateSystem`) y `domain/model/system/SystemDesignRules.evaluate`. Los casos de `system/system-cases.ts` se exportan con su resultado a `src/test/resources/architecture/system-cases.json` y `SystemDesignRulesTest` los compara texto por texto. **Al tocar un mensaje o una regla: `npm run export:presets` y los dos tests.** Los números van sin separadores (`plain`).
- **Los archivos los genera solo el backend** (`SystemDesignService.generate` → `TerraformGenerator` + `SystemDesignGenerator`): `main.tf`, `variables.tf`, `openapi.yaml` o `service.proto`, `docker-compose.yml`, `README.md`. Nada de lo que escribe quien llama llega a los archivos salvo los nombres de nodo, escapados en el README. No guarda ni aplica nada.
- **Endpoints** (etiqueta `System Design`, en `FeatureGateConfig.GATES`: 404 con la flag apagada): `GET /public/architecture/system-design/catalog`, `POST …/evaluate`, `POST …/generate`. `SystemDesignUseCase` es lo que usará la herramienta MCP `disenar_sistema`.
- **Persistencia**: columna `system_json` (migración `V8`), `ArchitectureProjectDomain.system` (nullable; hay un constructor sin él). Al guardar se valida contra el catálogo (`SystemDesignRules.validated`): una categoría u opción desconocida es un 400.
- En el modo demo no se simula la generación (404 del mock): el panel lo dice. **Bundle inicial: 470 kB** de 500.

### PLANTILLAS DE SISTEMAS (hito 5, flag `studio.system-templates`)
- `features/public/cloud/system/system-templates.ts` (`SYSTEM_TEMPLATES`, `SystemTemplate extends StudioPreset` con `version`, `sector` y `decisions`): seis sistemas **ficticios**. Su id empieza por `system-` y su descripción termina con la frase «Ejemplo ficticio: ilustra un tipo de sistema; no describe el de ninguna empresa.» La etiqueta visible es `FICTIONAL_LABEL`.
- **Una plantilla nueva tiene que nacer sin nada que corregir** (`system-templates.spec.ts`): `checkGraph`, `advisories` y `evaluateSystem` vacíos, con el coste estimado dentro de su presupuesto. Después, `npm run export:presets` (entra en `presets.json` con su `system` y en los casos golden).
- Se listan en Proyecto → Plantillas → «Sistemas completos» (`systemTemplates()` en el lienzo); **no** en la lista general (`SYSTEM_TEMPLATE_IDS` se filtra en `ArchitectureStudioService`, como `BLUEPRINT_IDS`).
- Backend: `ArchitectureProjectService.visible` oculta las plantillas con diseño de sistema mientras la flag esté apagada (lista y `findById`). El sembrado no depende de la flag.
- Las pestañas «Infraestructura | Aplicación» van en su propia fila, encima de la barra del Estudio.

### SERVIDOR MCP (hito 6, flag `mcp.section`)
- **`/v1/mcp`**: servlet del SDK oficial (`io.modelcontextprotocol.sdk:mcp-core` y `mcp-json-jackson2` 2.0.1), registrado en `McpServerConfig` con un filtro propio para la flag (no es Spring MVC: `FeatureGateConfig` no lo cubre). `/mcp` está en `PUBLIC_ENDPOINTS`.
- **Paquete `infrastructure/adapter/in/mcp`**: `McpTool` (contrato propio), `PortfolioTools` (las seis herramientas), `PortfolioCatalog` (recursos y prompts), `McpArguments` (lectura de argumentos con errores accionables), `McpObserver` (herramienta, resultado y latencia; nunca contenido) y **`McpSdkServer`, la única clase que importa `io.modelcontextprotocol`**.
- **Tres reglas de ArchUnit**: el paquete solo usa puertos de entrada; no llama a ningún método de un caso de uso que escriba; solo `McpSdkServer` conoce el SDK. **Una herramienta nueva es un adaptador fino sobre un caso de uso**: si necesita lógica, va al caso de uso.
- **Añadir o cambiar una herramienta**: súbele la versión y regenera el contrato (`MCP_CONTRACT_UPDATE=true ./gradlew test --tests "*McpToolContractTest"`, dos veces la primera: la primera escribe el archivo).
- **Errores**: `ToolInputException` e `InvalidRequestException` vuelven como resultado con `isError` y un texto que dice qué corregir; cualquier otra excepción se registra y a quien llama le llega un mensaje genérico.
- Límites: `security.rate-limit.mcp` y `mcp-global` (`MCP_RATE_LIMIT_*`, `MCP_GLOBAL_LIMIT_*`).
- `HclSyntax` (dominio) comprueba todo HCL generado antes de devolverlo; `ArchitecturePresetSeeder.seed()` es público para poder sembrar en los tests del servidor.

### MCP · CALIDAD Y OBSERVABILIDAD (hito 7)
- **Evaluaciones**: `src/test/java/.../mcp/eval/` (`McpEval`, `McpEvalTest`, `McpRealModelEvalTest`, `GeminiEvalModel`) y `src/test/resources/mcp/eval-tasks.json`. Una tarea tiene enunciado, plan (lo que hace el modelo simulado) y lo que se espera (`tools`, `forbiddenTools`, `resultContains`, `resultExcludes`, `error`). Los diagramas se nombran (`"$graph": "reference"`, `{{graph:reference}}`) y están en `McpEval.GRAPHS`. **Al cambiar un texto que devuelve una herramienta, puede fallar una tarea**: es lo que se quiere.
- `docs/mcp/mcp-eval.json` es el resultado que enseña la web; se regenera con `MCP_EVAL_UPDATE=true ./gradlew test --tests "*McpEvalTest"`.
- `testsupport/McpTestServer`: el servidor MCP en un Tomcat embebido con casos de uso reales y precios e IA simulados y deterministas. Úsalo para cualquier prueba nueva con cliente real.
- **Observabilidad**: `infrastructure/observability/McpToolTelemetry` implementa `McpObserver` (está fuera del paquete `mcp` porque usa un puerto de salida). Solo herramienta, resultado y latencia. Atributos según las convenciones de OpenTelemetry para MCP (estado «Development»).
- Dependencias nuevas: `micrometer-core`, `opentelemetry-api` (versiones del BOM de Boot), y en tests `opentelemetry-sdk-testing` y `google-genai`.
- Workflow `mcp-eval-nightly.yml`: desactivado hasta que existan el secret `GEMINI_API_KEY` y la variable `MCP_EVAL_NIGHTLY=true`.

### SECCIÓN WEB DEL SERVIDOR MCP (hito 8, flag `mcp.section`)
- `features/public/mcp/`: `McpSectionComponent` (en la portada, dentro de `@if (mcpSection())` y `@defer`) y `mcp-data.ts` (guías por cliente, lectura de la grabación y de las evaluaciones, actividad).
- `GET /public/mcp/status` (`McpStatusController`, en `FeatureGateConfig.GATES`): herramientas (`McpSdkServer.tools()`), límites (`McpAccessUseCase.limits()`) y latencia (`McpToolTelemetry.latency()`). El cliente generado se llama `MCPService`.
- **`public/mcp/session.json` y `public/mcp/mcp-eval.json` no se editan a mano**: los escriben `McpSessionRecordingTest` (`MCP_SESSION_UPDATE=true`) y `McpEvalTest` (`MCP_EVAL_UPDATE=true`). Si cambia una herramienta, regenéralos.
- **En modo demo no se llama a la API ni se finge un servidor**: herramientas, estado y actividad salen de la grabación, con «Grabación».
- El enlace `cursor://…` necesita `bypassSecurityTrustUrl`; `safe()` solo lo concede al esquema que construye la propia sección.
- `SectionHeaderComponent` admite `overline` (opcional). Los eventos `MCP_TOOL_CALL` llegan a la consola con la etiqueta `MCP tool`.
- Playwright: `e2e/mcp-section.e2e.ts`, en la lista `FLAGGED`. **Bundle inicial: 472 kB** de 500.
