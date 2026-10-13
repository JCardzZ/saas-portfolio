<!-- rag:skip -->
# Uso de marcas y logos

**Fecha de consulta: 8 de octubre de 2026.** Regla del sitio: **un logo de terceros solo se
muestra si la guía de su dueño lo permite para este uso.** Donde no hay permiso, o no se ha podido
confirmar, va el nombre en texto con el mismo estilo de nodo. Lo no confirmado se marca como tal;
no se da nada por permitido de memoria. No es asesoría legal.

## Decisiones

| Marca | Decisión | Qué dice su guía |
| --- | --- | --- |
| AWS (iconos de arquitectura) | **Se usan**, solo en diagramas de arquitectura | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/): «We allow customers and partners to use these toolkits and assets to create architecture diagrams.» |
| Azure (iconos de arquitectura) | **Se usan**, solo en diagramas de arquitectura | [Azure icons](https://learn.microsoft.com/en-us/azure/architecture/icons/): Microsoft permite usarlos «in architectural diagrams, training materials, or documentation». No recortar, voltear, girar ni deformar; no usarlos para representar un producto propio; se recomienda el nombre del producto junto al icono. |
| Google Cloud (iconos) | **Se usan**, solo en diagramas de arquitectura. **Condiciones sin confirmar hoy** | [Google Cloud icons](https://cloud.google.com/icons): la página no se pudo leer en esta consulta. Se mantienen las mismas reglas que con AWS y Azure (sin modificar, con el nombre al lado). Revisar antes de publicar. |
| Cloudflare, Cloudflare Pages | **Sin logo: nombre en texto** | [Cloudflare trademark](https://www.cloudflare.com/trademark/): los logos necesitan permiso escrito (salvo sus insignias web, sin alterar). El nombre puede usarse en texto, como adjetivo («servicios de Cloudflare»). |
| Google Gemini | **Sin logo: nombre en texto** | No se encontró una guía de uso del logo para desarrolladores. Sin confirmar. |
| Groq, OpenRouter, Anthropic (Claude), OpenAI | **Sin logo: nombre en texto** | Guías no encontradas o no legibles en la consulta (la de OpenAI respondió 403). Sin confirmar. |
| Apache Kafka, Debezium, Oracle GoldenGate, Snowflake, Databricks, Tableau, Power BI, Looker Studio | **Sin logo: nombre en texto** | Guías de marca no consultadas una a una; ninguna da un permiso general conocido para usar el logo en un sitio de terceros. Regla del proyecto: sin permiso explícito, nombre en texto. En el Estudio usan el símbolo neutro `dataService`. |
| Servicios de datos nuevos de AWS, Google Cloud y Azure (Kinesis Data Streams, Database Migration Service, Aurora Global Database, Amazon Quick Sight, Datastream, Looker, Data Factory, Azure SQL Database, Power BI Embedded) | **Icono genérico de su nube, con el nombre al lado** | Sus iconos de arquitectura oficiales sí se podrían usar (filas de arriba), pero no están copiados en `public/cloud-icons/`. Hasta copiarlos sin modificar del paquete oficial, el nodo muestra el icono de la nube y el nombre del servicio; no se dibuja ni se aproxima ninguno. |
| Oracle, Oracle Cloud Infrastructure (OCI) y sus servicios | **Sin logo: nombre en texto.** Consulta del 11 de octubre de 2026 | [Third Party Usage Guidelines for Oracle Trademarks](https://www.oracle.com/legal/trademarks/): la página respondió 403 y no se pudo leer; el resumen del buscador dice que cubre los nombres (se pueden usar para referirse a los productos de Oracle) y que los logos se rigen por otro documento, que no se localizó. **Sin confirmar**: no se usa ningún logo ni icono de Oracle. La nube `oci` y sus servicios llevan el aro neutro y el nombre oficial en texto. No se sugiere alianza ni patrocinio. |
| Claude Code, Claude Desktop, Cursor, VS Code (sección del servidor MCP) | **Sin logo: nombre en texto**, en una pestaña | No se consultó su guía de marca. Se nombran solo para decir cómo conectar cada cliente, con el método que documenta cada uno; no se sugiere alianza ni patrocinio. «Model Context Protocol» va como sobretítulo en texto, sin su logo. |
| Spring, Spring Boot | **Sin logo: nombre en texto.** Consulta del 12 de octubre de 2026 | [Spring trademarks](https://spring.io/trademarks): «Use of any Spring Marks logo is reserved solely for use by Broadcom in its unaltered form.» El uso nominativo de la palabra sí está permitido, «but this does not allow you to use the logo». |
| Go | **Sin logo: nombre en texto.** Consulta del 12 de octubre de 2026 | [Go brand](https://go.dev/brand): «Do not use the Go Logo or Go as a stylized form without permission.» |
| PostgreSQL | **Sin logo: nombre en texto.** Consulta del 12 de octubre de 2026 | [Trademark policy](https://www.postgresql.org/about/policies/trademarks/): el uso libre cubre los nombres; para lo demás, «you must contact us for permission before you use our marks», y las marcas «should not be presented with other trademarks or logos». |
| gRPC, Kubernetes y demás proyectos de la Linux Foundation | **Sin logo: nombre en texto.** Consulta del 12 de octubre de 2026 | [Trademark usage](https://www.linuxfoundation.org/legal/trademark-usage): usar un logo en un sitio web pide permiso escrito, salvo como enlace a la página del proyecto. Cada proyecto puede tener reglas propias: no se consultaron. |
| GraphQL | **Sin logo: nombre en texto.** Consulta del 12 de octubre de 2026 | [GraphQL brand](https://graphql.org/brand/): las referencias factuales están aprobadas de antemano, pero la página no dice que eso alcance al logo; pide no combinarlo con otros. Sin permiso claro. |
| MongoDB | **Sin logo: nombre en texto.** Consulta del 12 de octubre de 2026 | [Trademark usage guidelines](https://www.mongodb.com/legal/trademark-usage-guidelines): no resuelve el caso de un diagrama de terceros y remite a preguntar. Sin permiso claro. |
| Redis | **Sin logo: nombre en texto**, por coherencia. Consulta del 12 de octubre de 2026 | [Trademark policy](https://redis.io/legal/trademark-policy/): es la única que lo admitiría («You may use the Trademarks to identify Redis… in an informational context»), con una frase de atribución en cada página. No se usa para no mezclar criterios; se puede revisar. |
| Node.js, NestJS, Angular, React, Flutter, Swift, Kotlin | **Sin logo: nombre en texto** | Guías no leídas (la política de OpenJS es un PDF que no se pudo abrir en la consulta). Regla del proyecto: sin permiso explícito, nombre en texto. |
| GitHub, GitHub Actions, Docker, Neon, Upstash, Caddy | **Sin logo en las vistas «Arquitectura en producción» y «Pipeline CI/CD»** | Guías no consultadas. Sin confirmar. |

## Cómo se aplica en el código

- **Vistas «Arquitectura en producción» y «Pipeline CI/CD»**: ningún nodo lleva logo. Los nodos de
  `deploy/topology.json` tienen `icon: null` y hay tests que fallan si aparece una imagen en un nodo.
- **Resto del sitio** (`shared/ui/tech-icons.ts`): `cloudflare`, `cloudflarePages` y `gemini` usan
  un símbolo neutro (un aro, `official: false`), no el logo, con el nombre siempre al lado.
- **Productos de datos de terceros** (categoría «Datos y analítica» del Estudio): `icon: 'dataService'`,
  el mismo aro neutro, y hay un test que falla si alguno pasa a llevar logo.
- **Oracle Cloud** (`cloud.oracle`): `oci` en `tech-icons.ts` es el aro neutro; un diagrama en OCI no pinta
  ningún icono de arquitectura de otra nube (hay tests que lo comprueban).
- **Iconos de AWS, Azure y Google Cloud** (`public/cloud-icons/`): copiados sin modificar de los
  paquetes oficiales; se pintan como imagen, sin recolorear, recortar ni girar, y siempre con el
  nombre del servicio. Solo aparecen en el diagrama del Estudio de arquitectura.

- **Vista de Aplicación del Estudio** (`cloud/system/system-icons.ts`): **decisión del autor del 12 de
  octubre de 2026, que se aparta de la regla general de este documento.** Cada tecnología lleva su
  logo (trazado de Simple Icons, en el color de la marca) junto a su nombre en texto, para
  identificarla, con un aviso de marcas visible junto al diagrama («marcas de sus respectivos dueños…
  este sitio no está afiliado») y las frases de atribución que piden Redis, Spring y PostgreSQL cuando
  su logo está en pantalla. **Un aviso no es un permiso**: las guías de Spring y Go lo prohíben sin
  autorización y las de PostgreSQL y la Linux Foundation piden solicitarlo (tabla de arriba). El autor
  asume ese riesgo; si una marca pide retirarlo, se quita su entrada de `OPTION_LOGOS` y la pieza pasa
  a su símbolo genérico. Las opciones genéricas (CDN, cola, gateway) llevan un símbolo propio, y el
  servicio de nube donde se despliega cada pieza, su icono oficial de arquitectura.

## Pendiente de revisar

El resto de logos del sitio (Angular, Spring, PostgreSQL, Redis, Docker, Kubernetes, Terraform,
Kafka y otros) son trazados de [Simple Icons](https://simpleicons.org/), que distribuye los
dibujos pero **no concede permiso de marca**: cada marca tiene su propia guía y **ninguna se ha
verificado** en esas vistas. Las consultas del 12 de octubre de 2026 (tabla de arriba) dicen que **Spring no
permite su logo y que PostgreSQL y Kubernetes piden permiso**: esos tres siguen pintándose en la portada
y en el Estudio, y habría que cambiarlos por texto o pedir permiso. Hasta revisarlas una a una, lo prudente es tratarlas como las de arriba (nombre en
texto) o confirmar el permiso. Es una decisión pendiente.
