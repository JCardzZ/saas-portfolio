<!-- rag:skip -->
# Estudio de diseño de sistemas + plataforma MCP · progreso

> Documento de trabajo para retomar tras un `/clear`. Se actualiza al terminar cada paso.

## Estado

- **Plan aprobado** el 2026-10-11, con las seis decisiones de abajo. Trabajo autónomo: solo parar si algo rompe producción, exige gastar dinero o cambia el alcance.
- **Hito actual: 2 · Conexiones inteligentes** (sin empezar). Los hitos 0 y 1 están terminados y subidos, **sin PR**: `gh` no tiene sesión en esta máquina (ver Bloqueos).
- Las ramas van apiladas: `feat/feature-flags` → `feat/studio-responsive-canvas`. Cuando haya `gh`: PR del hito 0 contra `main`, esperar al gate, integrar, y seguir con el siguiente.
- **Worktree**: `.claude/worktrees/system-design-mcp`.
- `CLAUDE.md` no se versiona y no existe en el worktree: se actualiza el del checkout principal (`/Users/jcardzz/dev/saas/saas-portfolio/CLAUDE.md`).

## Hitos

| Hito | Rama | Estado | PR |
| - | - | - | - |
| 0 · Feature flags | `feat/feature-flags` | Subida; verificada en local | pendiente (sin `gh`) |
| 1 · Lienzo responsivo | `feat/studio-responsive-canvas` (sobre la del hito 0) | Subida; verificada en local | pendiente (sin `gh`) |
| 2 · Conexiones inteligentes | — | Sin empezar | — |
| 3 · Oracle Cloud | — | Sin empezar | — |
| 4 · Diseño de sistemas | — | Sin empezar | — |
| 5 · Plantillas de sistemas | — | Sin empezar | — |
| 6 · MCP núcleo | — | Sin empezar | — |
| 7 · MCP calidad y observabilidad | — | Sin empezar | — |
| 8 · Sección web | — | Sin empezar | — |

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
- **SDK Java**: elicitación y `structuredContent` en la 2.0.1, y convivencia del transporte Servlet con Tomcat 10.1 y Spring Security (hito 6).

## Bloqueos

- **`gh` sin sesión en esta máquina** (`gh auth status`: «You are not logged into any GitHub hosts», comprobado dos veces el 2026-10-11 tras el visto bueno). Sin ella no se puede abrir el PR, leer el CI gate ni integrar. Hace falta `gh auth login` en esta máquina.

## Pendientes

- Push de `feat/feature-flags`, PR y CI gate.
- Hitos 1 a 8.

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
