# Equivalencias entre nubes del Estudio de arquitectura

El Estudio traduce cada pieza del lienzo entre AWS, Google Cloud y Azure. La mayoría de las
equivalencias son directas. Este documento recoge las que **no** lo son, con la fuente oficial
que lo respalda y la alternativa elegida. Fecha de la revisión: 2026-10-10.

Regla: si una nube no tiene un servicio equivalente, el nodo lo dice («sin equivalente
directo») y explica el trade-off de la alternativa; no se fuerza una equivalencia.

## PostgreSQL de alto rendimiento en Azure (`newsql-pg`)

- **Antes**: Azure Cosmos DB for PostgreSQL.
- **Ahora**: Azure Database for PostgreSQL (Elastic Clusters).
- **Por qué**: Microsoft tiene Cosmos DB for PostgreSQL en retirada: «is no longer supported
  for new projects» y los despliegues nuevos están bloqueados. El sucesor que recomienda son
  los Elastic Clusters de Azure Database for PostgreSQL (servidor flexible con Citus).
- **Fuente**: <https://learn.microsoft.com/en-us/azure/cosmos-db/postgresql/concepts-benefits-database-postgresql>
- **Proyectos ya guardados**: cada nodo guarda el nombre de su servicio, así que un proyecto
  anterior sigue abriendo y muestra el nombre con el que se guardó.

## Captura de cambios (CDC) en Azure (`cdc`) — sin equivalente directo

AWS tiene Database Migration Service (replicación continua) y Google Cloud, Datastream. En
Azure no hay un servicio gestionado equivalente:

| Candidato | Qué ofrece | Por qué no es equivalente |
|---|---|---|
| Recurso CDC de Azure Data Factory | Se ejecuta de forma continua; latencia por defecto de 15 minutos y opción «real-time» de menos de 1 minuto; destinos Azure SQL, Delta y Synapse | En vista previa pública; como bases de datos de origen solo admite SQL Server, Azure SQL Database, SQL Managed Instance, Cosmos DB y Snowflake (no PostgreSQL, MySQL ni Oracle); no admite integration runtime autohospedado |
| Azure Database Migration Service | El modo online mantiene el destino sincronizado hasta el corte | Es una migración con corte, no una replicación permanente; sin modo online hacia Azure SQL Database ni desde Oracle |
| Mirroring de Microsoft Fabric | Replica en continuo y casi en tiempo real | Es Microsoft Fabric, otro producto, y el único destino es OneLake |

- **Alternativa elegida**: «Data Factory (CDC)», marcada «sin equivalente directo».
- **Trade-off**: vista previa y orígenes limitados. Para PostgreSQL, MySQL u Oracle el camino
  habitual es Debezium publicando en Event Hubs (su punto de conexión compatible con Kafka).
- **Fuentes**:
  - <https://learn.microsoft.com/en-us/azure/data-factory/concepts-change-data-capture-resource>
  - <https://learn.microsoft.com/en-us/azure/data-factory/concepts-change-data-capture>
  - <https://learn.microsoft.com/en-us/azure/dms/resource-scenario-status>
  - <https://learn.microsoft.com/en-us/fabric/mirroring/overview>

## Base de datos global con réplica entre regiones en Azure (`global-database`) — sin equivalente directo

AWS tiene Aurora Global Database y Google Cloud, Cloud Spanner. En Azure hay que elegir:

| Candidato | Qué ofrece | Trade-off |
|---|---|---|
| Azure SQL Database con failover groups | Relacional, con réplica en otra región y un punto de conexión que sigue a la primaria | Una sola región de escritura; la replicación es asíncrona, así que un failover puede perder datos |
| Azure Cosmos DB | Escrituras en varias regiones | Es NoSQL: obliga a rediseñar el modelo y a resolver conflictos |

- **Alternativa elegida para el patrón de recuperación multirregión**: Azure SQL Database
  (failover groups), marcada «sin equivalente directo».
- El servicio `global-sql` (escrituras consistentes en varias regiones) sigue apuntando a
  Cosmos DB, con su aviso de que no es SQL relacional.
- **Fuentes**:
  - <https://learn.microsoft.com/en-us/azure/azure-sql/database/failover-group-configure-sql-db?view=azuresql>
  - <https://learn.microsoft.com/en-us/azure/reliability/reliability-sql-database>
  - <https://learn.microsoft.com/en-us/azure/well-architected/mission-critical/mission-critical-data-platform>

## Inteligencia de negocio del proveedor (`bi`)

- AWS: **Amazon Quick Sight**. Amazon QuickSight pasó a ser una función de Amazon Quick y se
  escribe así en la documentación actual; las API y los recursos conservan el nombre `quicksight`.
  Fuente: <https://docs.aws.amazon.com/quick/latest/userguide/what-is.html>
- Google Cloud: Looker. Azure: Power BI Embedded.
- Tableau, Power BI y Looker Studio están además como productos independientes de la nube.

## Stream de eventos: dos servicios distintos

- `streaming`: Kafka gestionado (MSK / Managed Service for Apache Kafka / Event Hubs).
- `event-stream`: el stream nativo de cada nube (Kinesis Data Streams / Pub/Sub / Event Hubs).
- En Azure los dos caen en Event Hubs, que ofrece su API propia y un punto de conexión
  compatible con Kafka.

## Oracle Cloud Infrastructure, cuarta nube (flag `cloud.oracle`)

Revisión del 2026-10-11. La tabla vive en `portfolio-frontend/src/app/features/public/cloud/cloud-oracle.data.ts`.

**Fuentes**

- Nombres de los servicios: índice oficial de la documentación de OCI,
  <https://docs.oracle.com/en-us/iaas/Content/home.htm>.
- Recursos de Terraform: proveedor oficial `oracle/oci`, versión 9.9.0 (2026-10-08),
  <https://github.com/oracle/terraform-provider-oci> (`website/docs/r/`). Todos los recursos de la tabla
  existen en esa versión.
- Cambio de nombre de Autonomous Database a Autonomous AI Database (14 de octubre de 2025):
  <https://docs.oracle.com/en-us/iaas/releasenotes/autonomous-database-dedicated/adbd-service-rebranding.htm>.
- Precios: lista pública de Oracle, sin clave,
  `https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?partNumber=…&currencyCode=USD`.

**Equivalencias directas**

| Pieza | Servicio de OCI | Recurso de Terraform |
|---|---|---|
| Kubernetes | Kubernetes Engine (OKE) | `oci_containerengine_cluster` |
| Máquinas virtuales | Compute | `oci_core_instance` |
| Contenedores serverless | Container Instances | `oci_container_instances_container_instance` |
| Funciones | Functions | `oci_functions_function` |
| IA generativa | Generative AI Agents | `oci_generative_ai_agent_agent` |
| PostgreSQL | OCI Database with PostgreSQL | `oci_psql_db_system` |
| Redis | OCI Cache | `oci_redis_redis_cluster` |
| NoSQL | NoSQL Database | `oci_nosql_table` |
| Almacén de datos | Autonomous AI Lakehouse | `oci_database_autonomous_database` |
| Kafka gestionado | Streaming with Apache Kafka | `oci_managed_kafka_kafka_cluster` |
| Stream de eventos | Streaming | `oci_streaming_stream` |
| Cola | Queue | `oci_queue_queue` |
| Publicación y suscripción | Notifications | `oci_ons_notification_topic` |
| CDC | GoldenGate | `oci_golden_gate_deployment` |
| BI | Analytics Cloud | `oci_analytics_analytics_instance` |
| API gateway | API Gateway | `oci_apigateway_gateway` |
| WAF | Web Application Firewall | `oci_waf_web_app_firewall` |
| DNS | DNS | `oci_dns_zone` |
| Almacenamiento de objetos | Object Storage | `oci_objectstorage_bucket` |
| Identidad | IAM (Identity Domains) | `oci_identity_domain` |
| Secretos | Vault | `oci_vault_secret` |
| Balanceador | Load Balancer | `oci_load_balancer_load_balancer` |
| Monitorización | Monitoring | `oci_monitoring_alarm` |
| Registro de imágenes | Container Registry | `oci_artifacts_container_repository` |
| Red privada | VCN | `oci_core_vcn` |

RabbitMQ no es un servicio de OCI: se despliega sobre Kubernetes (`helm_release`), como en Google
Cloud y Azure.

**Sin equivalente directo**

| Pieza | Alternativa elegida | Trade-off | Respaldo |
|---|---|---|---|
| Plataforma de aplicaciones (`app-platform`) | Container Instances | El balanceador y el despliegue desde el código se montan aparte | El índice de servicios no incluye una plataforma como App Runner o App Service |
| SQL distribuido (`global-sql`) | Globally Distributed Autonomous AI Database | El proveedor de Terraform no tiene un recurso propio: el esqueleto declara la base de datos autónoma | El servicio está en el índice; no hay recurso `globally_distributed` en `website/docs/r/` |
| Base de datos global (`global-database`) | Autonomous AI Database con Autonomous Data Guard entre regiones | Es una réplica en espera para recuperación (RTO de unos 15 minutos, RPO de alrededor de 1 minuto), no lecturas locales en cada región | <https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/adg-about-cross-region--cross-tenancy.html> |
| Grafos (`graph`) | Autonomous AI Database con Graph Studio | Se aprovisiona una base de datos relacional completa | El índice no incluye una base de datos de grafos gestionada; <https://docs.oracle.com/en/cloud/paas/autonomous-database/csgru/whats-new-graph-studio-autonomous-database.html> |
| Columnas anchas (`wide-column`) | NoSQL Database | API propia: venir de Cassandra exige adaptar la aplicación | El índice no incluye un Cassandra gestionado |
| SQL sobre el lago (`sql-query`) | Autonomous AI Lakehouse | Es una base de datos aprovisionada, facturada por ECPU y hora, no de pago por consulta | Lista de precios (`B95701`, «ECPU Per Hour»); anuncio del Lakehouse y Apache Iceberg |
| Procesamiento de streams (`stream-processing`) | Data Flow | Es Apache Spark (microlotes con Structured Streaming), no Flink | El índice no incluye un Flink gestionado; <https://docs.oracle.com/en/learn/oci-data-flow-spark-kafka/index.html> |
| Orquestación (`workflow`) | Integration | Plataforma de integración aprovisionada por instancia | El índice no incluye un orquestador de pasos sin servidor; lista Integration y Process Automation |

**Precios**

En OCI el Estudio no muestra ninguna cifra escrita a mano para un servicio de la nube: o llega su
precio de la lista pública de Oracle, o el nodo dice «sin estimación» y no suma al total. Los
números de parte consultados (`OciSkuCatalog`, comprobados el 2026-10-11): `B97384` (Compute
Standard E5, OCPU/hora), `B96545` (OKE, clúster Enhanced/hora), `B99060` (Database with PostgreSQL,
OCPU/hora), `B110500` (Streaming with Apache Kafka, OCPU/hora), `B92992` (GoldenGate, OCPU/hora),
`B95701` (Autonomous AI Lakehouse, ECPU/hora) y `B89630` (Analytics Cloud Professional, OCPU/hora).
Los productos con tramo gratuito o de pago por petición (Functions, Queue, Object Storage, Load
Balancer…) no tienen «un» precio mensual y quedan sin estimación.

**Sin confirmar**

- La región por defecto del esqueleto (`us-ashburn-1`) no se contrastó con la lista oficial de regiones.
- El panel de propiedades no sugiere formas de cómputo en OCI: sus nombres no se contrastaron.
- Los términos de la auditoría en OCI (dominios de disponibilidad, emparejamiento de VCN) son genéricos a propósito.
