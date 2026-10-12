/**
 * Oracle Cloud Infrastructure (OCI) como cuarta nube del Estudio (flag `cloud.oracle`).
 *
 * Qué servicio de OCI cubre cada pieza del lienzo y con qué recurso del proveedor oficial de
 * Terraform (`oracle/oci`) se aprovisiona. Es una tabla aparte del catálogo para que se pueda
 * revisar de un vistazo contra sus fuentes, que están en docs/architecture/cloud-equivalences.md:
 * - los nombres son los del índice oficial de servicios (docs.oracle.com/iaas);
 * - los recursos existen en la versión 9.9.0 del proveedor (github.com/oracle/terraform-provider-oci).
 *
 * Donde OCI no tiene un servicio equivalente, `noDirectEquivalent` lo dice y explica el
 * trade-off de la alternativa: no se fuerza una equivalencia.
 */
export interface OracleEquivalent {
  /** Nombre del servicio en OCI. Sin él, la pieza es un producto que se llama igual en cualquier nube. */
  service?: string;
  /** Tipo de recurso de Terraform. Sin él, la pieza no se aprovisiona en OCI con Terraform. */
  terraform?: string;
  noDirectEquivalent?: string;
}

export const ORACLE_EQUIVALENTS: Readonly<Record<string, OracleEquivalent>> = {
  // Arquitectura de referencia.
  static: { service: 'Object Storage', terraform: 'oci_objectstorage_bucket' },
  lb: { service: 'Load Balancer', terraform: 'oci_load_balancer_load_balancer' },
  containers: { service: 'Container Instances', terraform: 'oci_container_instances_container_instance' },
  postgres: { service: 'OCI Database with PostgreSQL', terraform: 'oci_psql_db_system' },
  redis: { service: 'OCI Cache', terraform: 'oci_redis_redis_cluster' },
  secrets: { service: 'Vault', terraform: 'oci_vault_secret' },
  'native-monitoring': { service: 'Monitoring', terraform: 'oci_monitoring_alarm' },
  registry: { service: 'Container Registry', terraform: 'oci_artifacts_container_repository' },

  // Cómputo.
  kubernetes: { service: 'Kubernetes Engine (OKE)', terraform: 'oci_containerengine_cluster' },
  vm: { service: 'Compute', terraform: 'oci_core_instance' },
  functions: { service: 'Functions', terraform: 'oci_functions_function' },
  'app-platform': {
    service: 'Container Instances', terraform: 'oci_container_instances_container_instance',
    noDirectEquivalent: 'Sin equivalente directo: el índice de servicios de OCI no incluye una plataforma de aplicaciones gestionada como App Runner, Cloud Run o App Service. Container Instances ejecuta el contenedor sin gestionar servidores, pero el balanceador y el despliegue desde el código se montan aparte.',
  },
  'ml-platform': { service: 'Generative AI Agents', terraform: 'oci_generative_ai_agent_agent' },

  // Datos.
  nosql: { service: 'NoSQL Database', terraform: 'oci_nosql_table' },
  'newsql-pg': { service: 'OCI Database with PostgreSQL', terraform: 'oci_psql_db_system' },
  'global-sql': {
    service: 'Globally Distributed Autonomous AI Database', terraform: 'oci_database_autonomous_database',
    noDirectEquivalent: 'Sin equivalente directo en Terraform: el servicio existe (Globally Distributed Autonomous AI Database), pero el proveedor oficial no tiene un recurso propio para él en la versión revisada. El esqueleto declara la base de datos autónoma; la distribución entre regiones se configura aparte.',
  },
  'global-database': {
    service: 'Autonomous AI Database (Data Guard entre regiones)', terraform: 'oci_database_autonomous_database',
    noDirectEquivalent: 'Sin equivalente directo: Autonomous Data Guard mantiene una base de datos en espera en otra región (RTO de unos 15 minutos y RPO de alrededor de 1 minuto, según Oracle), pero es una réplica en espera para recuperación, no una base de datos global con lecturas locales en cada región.',
  },
  graph: {
    service: 'Autonomous AI Database (Graph Studio)', terraform: 'oci_database_autonomous_database',
    noDirectEquivalent: 'Sin equivalente directo: el índice de servicios de OCI no incluye una base de datos de grafos gestionada. Los grafos de propiedades se crean dentro de Autonomous AI Database con Graph Studio, así que se aprovisiona y se paga una base de datos relacional completa.',
  },
  'wide-column': {
    service: 'NoSQL Database', terraform: 'oci_nosql_table',
    noDirectEquivalent: 'Sin equivalente directo: el índice de servicios de OCI no incluye un Cassandra gestionado. La alternativa más cercana es NoSQL Database, que tiene su propia API: venir de Cassandra exige adaptar la aplicación.',
  },
  warehouse: { service: 'Autonomous AI Lakehouse', terraform: 'oci_database_autonomous_database' },
  'sql-query': {
    service: 'Autonomous AI Lakehouse', terraform: 'oci_database_autonomous_database',
    noDirectEquivalent: 'Sin equivalente directo: el índice de servicios de OCI no incluye un motor SQL sin servidor de pago por consulta como Athena o BigQuery. Autonomous AI Lakehouse consulta formatos abiertos (Apache Iceberg), pero es una base de datos aprovisionada que se factura por ECPU y hora.',
  },

  // Mensajería.
  streaming: { service: 'Streaming with Apache Kafka', terraform: 'oci_managed_kafka_kafka_cluster' },
  'event-stream': { service: 'Streaming', terraform: 'oci_streaming_stream' },
  queue: { service: 'Queue', terraform: 'oci_queue_queue' },
  pubsub: { service: 'Notifications', terraform: 'oci_ons_notification_topic' },
  // RabbitMQ no es un servicio de OCI: se despliega sobre Kubernetes, como en Google Cloud y Azure.
  rabbitmq: { terraform: 'helm_release' },
  'stream-processing': {
    service: 'Data Flow', terraform: 'oci_dataflow_application',
    noDirectEquivalent: 'Sin equivalente directo: el índice de servicios de OCI no incluye un Apache Flink gestionado. Data Flow es Apache Spark gestionado y procesa streams con Spark Structured Streaming, por microlotes: la aplicación se escribe para Spark, no para Flink.',
  },

  // Datos y analítica.
  cdc: { service: 'GoldenGate', terraform: 'oci_golden_gate_deployment' },
  bi: { service: 'Analytics Cloud', terraform: 'oci_analytics_analytics_instance' },

  // API, red y seguridad.
  'api-gateway': { service: 'API Gateway', terraform: 'oci_apigateway_gateway' },
  workflow: {
    service: 'Integration', terraform: 'oci_integration_integration_instance',
    noDirectEquivalent: 'Sin equivalente directo: el índice de servicios de OCI no incluye un orquestador de pasos sin servidor como Step Functions. Lo más cercano es Integration (o Process Automation), que es una plataforma de integración que se aprovisiona por instancia.',
  },
  waf: { service: 'Web Application Firewall', terraform: 'oci_waf_web_app_firewall' },
  dns: { service: 'DNS', terraform: 'oci_dns_zone' },
  bucket: { service: 'Object Storage', terraform: 'oci_objectstorage_bucket' },
  identity: { service: 'IAM (Identity Domains)', terraform: 'oci_identity_domain' },
};

interface Piece {
  type: string;
  service: string | { aws: string; gcp: string; azure: string; oci?: string };
  terraform: string | { aws: string; gcp: string; azure: string; oci?: string } | null;
}

/**
 * Añade a una pieza su nombre y su recurso en OCI, si los tiene. No pisa lo que la pieza ya
 * traiga: un proyecto guardado conserva el nombre con el que se guardó.
 */
export function withOracle<T extends Piece>(piece: T): T {
  const oracle = ORACLE_EQUIVALENTS[piece.type];
  if (!oracle) {
    return piece;
  }
  const service = typeof piece.service !== 'string' && oracle.service && !piece.service.oci
    ? { ...piece.service, oci: oracle.service } : piece.service;
  const terraform = piece.terraform && typeof piece.terraform !== 'string' && oracle.terraform && !piece.terraform.oci
    ? { ...piece.terraform, oci: oracle.terraform } : piece.terraform;
  return service === piece.service && terraform === piece.terraform ? piece : { ...piece, service, terraform };
}
