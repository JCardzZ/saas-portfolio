# Servidor MCP de la plataforma

La plataforma se puede usar desde un asistente de IA: expone un servidor del
[Model Context Protocol](https://modelcontextprotocol.io) con las mismas capacidades que su web
(validar una arquitectura, generar Terraform, cotizar con precios de lista, diseñar un sistema y
preguntar al portafolio). Está detrás de la flag `mcp.section`: apagada, la ruta responde 404.

- **Dirección**: `https://<api>/v1/mcp` (transporte Streamable HTTP).
- **Revisión del protocolo**: 2025-11-25, con el SDK oficial de Java (`mcp-core` 2.0.1).
- **Autenticación**: ninguna. Hay un límite por origen y un tope diario (ver «Límites»).
- **Qué no hace**: ninguna herramienta guarda ni aplica nada. Todo lo que genera es un esqueleto
  que se devuelve en la respuesta.

## Herramientas

| Herramienta | Clase | Qué hace | Caso de uso que llama |
| --- | --- | --- | --- |
| `listar_plantillas` | Lectura | Plantillas de arquitectura y sistemas de ejemplo (todos ilustrativos o ficticios) | `ArchitectureProjectUseCase.findAll` |
| `validar_arquitectura` | Lectura | Reglas del grafo sobre un diagrama: un diagnóstico por nodo, con qué hacer | `ArchitectureProjectUseCase.validate` |
| `generar_terraform` | Genera | `main.tf` y `variables.tf` de un diagrama, como texto y como recursos incrustados | `TerraformUseCase.generate` |
| `estimar_costos` | Lectura | Precio de lista público de cada servicio; sin precio, «sin estimación» | `PricingUseCase.quote` |
| `preguntar_portafolio` | Lectura | Pregunta al asistente del portafolio (RAG), con citas | `RAGUseCase.query` |
| `disenar_sistema` | Genera | Propone un sistema completo y devuelve sus archivos de partida | `SystemDesignUseCase.design` |

Cada herramienta lleva en `_meta` su `version` (semver) y su `kind` (`read` o `generate`), y en
`annotations` que es de solo lectura y no destructiva.

`disenar_sistema` necesita la nube, la región, los usuarios, el presupuesto, la regulación y el
backend. Si faltan y el cliente admite *elicitation*, los pregunta con un formulario; si no la
admite, responde con un error que dice qué falta y qué valores valen.

## Recursos y prompts

- `portfolio://catalogo/servicios`: servicios de nube que el Estudio sabe dibujar.
- `portfolio://catalogo/sistemas`: catálogo del diseño de sistemas.
- `portfolio://proyectos`: proyectos publicados en el portafolio.
- Prompt `revision_de_arquitectura`: revisa una arquitectura con las reglas y los precios.
- Prompt `arquitecto`: recoge requisitos y diseña con las herramientas.

## Seguridad

- **Solo lectura y generación.** Una regla de ArchUnit impide que el paquete del servidor llame a
  un método de un caso de uso que escriba (`create`, `update`, `delete`, `register…`), y otra que
  se salte la capa de aplicación.
- **Las entradas son datos.** Los textos que envía un cliente (nombres de nodos, la pregunta, los
  argumentos de un prompt) no se interpretan como instrucciones: vuelven acotados, en una línea y
  sin formato, y en los prompts van entre marcas que el propio texto no puede cerrar.
- **Sin secretos ni datos personales en las respuestas.** El generador de Terraform nunca copia el
  valor de una variable que parece una credencial; los recursos solo sirven datos que ya son
  públicos en la API; un error interno se registra en el servidor y a quien llama le llega un
  mensaje genérico.
- **Tamaño máximo** de un mensaje: 256 KB. Un grafo admite 60 nodos y 200 conexiones.
- **`preguntar_portafolio`** pasa por el mismo caso de uso que la web: mismos límites y proveedores de IA.

## Límites

- Por origen: 30 llamadas a herramientas por minuto (`MCP_RATE_LIMIT_MAX_REQUESTS`, `MCP_RATE_LIMIT_WINDOW`).
- Entre todos: 2000 al día (`MCP_GLOBAL_LIMIT_MAX_REQUESTS`, `MCP_GLOBAL_LIMIT_WINDOW`).
- Los contadores van en Redis, como el resto de límites de la plataforma.
- El origen es la dirección desde la que llega la conexión. **Claude Desktop se conecta a un
  conector remoto desde la nube de Anthropic, no desde el equipo del usuario: todos sus usuarios
  comparten dirección y, por tanto, cupo.** Lo mismo vale para cualquier cliente que salga por un
  proxy común.

## Cómo conectarse

Métodos comprobados en la documentación de cada cliente el 2026-10-11.

- **Claude Code**: `claude mcp add --transport http portfolio https://<api>/v1/mcp`
- **Claude Desktop**: Personalizar → Conectores → Añadir conector personalizado, con la dirección
  de arriba y sin inicio de sesión.
- **Cursor**: en `mcp.json`, `{ "mcpServers": { "portfolio": { "url": "https://<api>/v1/mcp" } } }`.
- **VS Code**: en `mcp.json`, `{ "servers": { "portfolio": { "type": "http", "url": "https://<api>/v1/mcp" } } }`.

## Versionado y pruebas

- El contrato de las herramientas (nombre, versión, clase y esquemas) está guardado en
  `portfolio-backend/src/test/resources/mcp/tools-contract.json`. `McpToolContractTest` falla si
  una herramienta cambia sin subir su versión. Para regenerarlo:
  `MCP_CONTRACT_UPDATE=true ./gradlew test --tests "*McpToolContractTest"`.
- `McpServerEndToEndTest` conecta un cliente MCP real (el del SDK) al servlet dentro de un Tomcat
  embebido, con los casos de uso de verdad y las plantillas sembradas.
- `PlatformIntegrationTest` hace lo mismo contra la aplicación entera, con PostgreSQL y Redis.

## Diseño

El servidor es un adaptador de entrada más (`infrastructure/adapter/in/mcp`). Las herramientas
están descritas sin tipos del SDK (`McpTool`); **solo `McpSdkServer` conoce el SDK**. La revisión
2026-07-28 del protocolo elimina las sesiones: cuando el SDK la publique, se cambia esa clase.
Hoy hacen falta sesiones para que el servidor pueda preguntar al cliente lo que falta.

El HCL que se genera se comprueba en proceso antes de responder (`HclSyntax`). La CI pasa además
los casos de referencia por el analizador real de Terraform (`terraform fmt`); no por
`terraform validate`, que no puede aceptar un esqueleto sin los argumentos de cada recurso.

## Observabilidad

De cada llamada a una herramienta se observa lo mismo por tres caminos: **qué herramienta, cómo
acabó y cuánto tardó**. Nunca los argumentos ni el resultado (`McpToolTelemetry`).

- **Métricas (Micrometer)**: `mcp.server.operation.duration` (histograma, con `mcp.method.name`,
  `gen_ai.tool.name` y `error.type`) y `mcp.tool.calls` (contador por herramienta y resultado).
  La aplicación no lleva Actuator: viven en un registro en memoria, del que lee el estado público.
- **Traza (API de OpenTelemetry)**: un span `tools/call <herramienta>` de tipo SERVER con
  `mcp.method.name`, `gen_ai.tool.name`, `gen_ai.operation.name = execute_tool`,
  `mcp.protocol.version`, `mcp.session.id` y, si la herramienta responde con error,
  `error.type = tool_error`. Son las
  [convenciones semánticas de OpenTelemetry para MCP](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md),
  que están en estado «Development»: los nombres pueden cambiar. Solo se usa la API: **sin un SDK
  o el agente de OpenTelemetry configurado, las trazas no se exportan a ningún sitio.**
- **Evento anónimo** `MCP_TOOL_CALL` por el canal de telemetría (SSE) de la plataforma:
  `tool=… outcome=… latencyMs=…`.

## Evaluaciones

27 tareas sintéticas (`portfolio-backend/src/test/resources/mcp/eval-tasks.json`), sin datos de
ninguna persona ni de ninguna empresa. Un modelo recibe la tarea y las herramientas, las usa con
un cliente MCP real, y se comprueba qué llamó, qué no debía llamar y qué contienen los resultados.

- **En cada PR**: un modelo simulado y determinista sigue el plan guardado de cada tarea
  (`McpEvalTest`). Tiene que pasar entero. El resultado queda en `mcp-eval.json` (aquí al lado; se
  regenera con `MCP_EVAL_UPDATE=true ./gradlew test --tests "*McpEvalTest"`).
- **De noche, con un modelo real** (`McpRealModelEvalTest`, Gemini con el SDK oficial de Google
  GenAI): como mucho 25 tareas y 8 llamadas al modelo por tarea. **Está desactivada**: el workflow
  `mcp-eval-nightly.yml` solo corre si existen el secret `GEMINI_API_KEY` y la variable de
  repositorio `MCP_EVAL_NIGHTLY=true`. **El adaptador del modelo no se ha ejecutado nunca contra
  Gemini**: compila contra el SDK, pero la primera ejecución puede necesitar ajustes.

## Registro oficial de MCP

`server.json` (aquí al lado) está preparado con el esquema 2025-12-11 del registro, como servidor
remoto `streamable-http`. **No está publicado.** Antes de publicarlo:

- Sustituir `https://api.example.com/v1/mcp` por la dirección real de la API.
- El nombre `io.github.jcardzz/portfolio-platform` exige demostrar la propiedad del espacio de
  nombres al publicar (inicio de sesión con GitHub en la herramienta del registro).
- El repositorio es privado, así que el archivo no lleva `repository`.

## Sin hacer todavía

- **Interfaz interactiva dentro del cliente (MCP Apps).** Es una extensión oficial del protocolo
  (`io.modelcontextprotocol/ui`), no parte de la especificación base, y no se ha comprobado que el
  SDK de Java 2.0.1 la soporte. Queda como siguiente paso: el candidato natural es mostrar el
  diagrama resultante de `disenar_sistema`.
- Exportar las trazas: hace falta un colector de OpenTelemetry, que la plataforma no tiene.
