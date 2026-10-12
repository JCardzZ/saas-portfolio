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

## Pendiente de revisar

El resto de logos del sitio (Angular, Spring, PostgreSQL, Redis, Docker, Kubernetes, Terraform,
Kafka y otros) son trazados de [Simple Icons](https://simpleicons.org/), que distribuye los
dibujos pero **no concede permiso de marca**: cada marca tiene su propia guía y **ninguna se ha
verificado**. Hasta revisarlas una a una, lo prudente es tratarlas como las de arriba (nombre en
texto) o confirmar el permiso. Es una decisión pendiente.
