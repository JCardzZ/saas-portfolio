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

## Sin hacer todavía

- No está publicado en el registro oficial de MCP.
- No hay interfaz interactiva dentro del cliente (MCP Apps).
