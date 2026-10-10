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
