import { ORACLE_EQUIVALENTS, withOracle } from './cloud-oracle.data';
import { CloudProviderId, IconRef, PerProvider, ZoneId } from './cloud-topology.data';

/**
 * Servicio que el visitante puede añadir al lienzo. Se describe por lo que hace
 * (`capability`); el nombre, el logo y el recurso de Terraform dependen de la nube elegida,
 * salvo en los productos que son los mismos en cualquier nube.
 */
export interface CatalogItem {
  type: string;
  capability: string;
  service: string | PerProvider;
  icon: IconRef;
  /** Tipo de recurso de Terraform con el que se aprovisiona; `null` si el generador aún no lo cubre. */
  terraform: string | PerProvider | null;
  /** Zona del lienzo en la que cae al añadirlo. */
  zone: ZoneId;
  /** Nodo desde el que le llega el tráfico; a él se conecta sola. */
  connectFrom: 'users' | 'edge' | 'lb' | 'api';
  why: string;
  /** Servicio que suele adoptarse a escala de empresa. */
  enterprise?: boolean;
  /** Papel que juega en un flujo de datos; de él salen las reglas de conexión (`graph-rules.ts`). */
  logical?: LogicalType;
  /** Cuántas instancias de este servicio tiene sentido poner en un mismo lienzo. */
  maxInstances?: number;
  /**
   * Nubes en las que no hay un servicio equivalente: el nombre mostrado es la alternativa más
   * cercana y este texto, su trade-off. Fuentes en docs/architecture/cloud-equivalences.md.
   */
  noDirectEquivalent?: Partial<Record<CloudProviderId, string>>;
}

/** Papel de un servicio en un flujo de datos. Varios servicios distintos comparten papel. */
export type LogicalType =
  | 'database' | 'global-database' | 'cdc' | 'event-stream' | 'queue' | 'stream-processing' | 'data-warehouse' | 'bi';

export interface CatalogCategory {
  id: string;
  name: string;
  items: CatalogItem[];
}

const CATALOG: CatalogCategory[] = [
  {
    id: 'compute',
    name: 'Cómputo',
    items: [
      {
        enterprise: true,
        type: 'kubernetes', capability: 'Kubernetes gestionado', icon: { default: 'kubernetes', aws: 'awsEks', gcp: 'gcpGke', azure: 'azAks' }, zone: 'compute', connectFrom: 'lb',
        service: { aws: 'EKS', gcp: 'GKE', azure: 'AKS' },
        terraform: { aws: 'aws_eks_cluster', gcp: 'google_container_cluster', azure: 'azurerm_kubernetes_cluster' },
        why: 'Orquestación de contenedores para varias réplicas y despliegues graduales.',
      },
      {
        type: 'vm', capability: 'Máquinas virtuales', icon: { default: 'provider', aws: 'awsEc2', gcp: 'gcpComputeEngine', azure: 'azVm' }, zone: 'compute', connectFrom: 'lb',
        service: { aws: 'EC2', gcp: 'Compute Engine', azure: 'Virtual Machines' },
        terraform: { aws: 'aws_instance', gcp: 'google_compute_instance', azure: 'azurerm_linux_virtual_machine' },
        why: 'Servidores completos cuando hace falta control total del sistema.',
      },
    ],
  },
  {
    id: 'serverless',
    name: 'Serverless',
    items: [
      {
        type: 'containers', capability: 'Contenedores serverless', icon: { default: 'docker', aws: 'awsFargate', gcp: 'gcpCloudRun', azure: 'azContainerApps' }, zone: 'compute', connectFrom: 'lb',
        service: { aws: 'ECS Fargate', gcp: 'Cloud Run', azure: 'Container Apps' },
        terraform: { aws: 'aws_ecs_service', gcp: 'google_cloud_run_v2_service', azure: 'azurerm_container_app' },
        why: 'Contenedores Docker que escalan solos, sin gestionar nodos.',
      },
      {
        type: 'functions', capability: 'Funciones serverless', icon: { default: 'provider', aws: 'awsLambda', azure: 'azFunctions' }, zone: 'compute', connectFrom: 'api',
        service: { aws: 'Lambda', gcp: 'Cloud Functions', azure: 'Functions' },
        terraform: { aws: 'aws_lambda_function', gcp: 'google_cloudfunctions2_function', azure: 'azurerm_linux_function_app' },
        why: 'Código que se ejecuta bajo demanda, sin servidor que mantener.',
      },
      {
        type: 'app-platform', capability: 'PaaS de aplicaciones web', icon: { default: 'provider', aws: 'awsAppRunner', gcp: 'gcpAppEngine', azure: 'azAppService' }, zone: 'compute', connectFrom: 'lb',
        service: { aws: 'App Runner', gcp: 'App Engine', azure: 'App Service' },
        terraform: { aws: 'aws_apprunner_service', gcp: 'google_app_engine_standard_app_version', azure: 'azurerm_linux_web_app' },
        why: 'Despliega desde el código o la imagen sin configurar red ni escalado.',
      },
      {
        enterprise: true,
        type: 'ml-platform', capability: 'Plataforma de IA gestionada', icon: { default: 'provider', aws: 'awsBedrock', gcp: 'gcpVertexAi', azure: 'azOpenAi' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Bedrock', gcp: 'Vertex AI', azure: 'Azure OpenAI' },
        terraform: { aws: 'aws_bedrockagent_agent', gcp: 'google_vertex_ai_endpoint', azure: 'azurerm_cognitive_account' },
        why: 'Modelos fundacionales dentro de la nube, con sus controles de red e identidad.',
      },
    ],
  },
  {
    id: 'data',
    name: 'Bases de datos',
    items: [
      {
        type: 'nosql', logical: 'database', capability: 'NoSQL clave-valor', icon: { default: 'provider', gcp: 'firebase', aws: 'awsDynamoDb', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'DynamoDB', gcp: 'Firestore (Datastore)', azure: 'Cosmos DB' },
        terraform: { aws: 'aws_dynamodb_table', gcp: 'google_firestore_database', azure: 'azurerm_cosmosdb_account' },
        why: 'Almacén clave-valor para datos de acceso muy frecuente.',
      },
      {
        enterprise: true,
        type: 'newsql-pg', logical: 'database', capability: 'PostgreSQL de alto rendimiento', icon: { default: 'postgresql', aws: 'awsAurora', gcp: 'gcpAlloyDb', azure: 'azPostgresql' }, zone: 'data', connectFrom: 'api',
        // Azure: Cosmos DB for PostgreSQL está en retirada y no admite despliegues nuevos; su sucesor
        // son los Elastic Clusters de Azure Database for PostgreSQL (docs/architecture/cloud-equivalences.md).
        service: { aws: 'Aurora PostgreSQL', gcp: 'AlloyDB', azure: 'Azure Database for PostgreSQL (Elastic Clusters)' },
        terraform: { aws: 'aws_rds_cluster', gcp: 'google_alloydb_cluster', azure: 'azurerm_postgresql_flexible_server' },
        why: 'Compatible con PostgreSQL, con almacenamiento distribuido y réplicas de lectura rápidas.',
      },
      {
        enterprise: true,
        type: 'global-sql', logical: 'global-database', capability: 'SQL distribuido multirregión', icon: { default: 'provider', aws: 'awsAurora', gcp: 'gcpSpanner', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Aurora DSQL', gcp: 'Cloud Spanner', azure: 'Cosmos DB (multirregión)' },
        terraform: { aws: 'aws_dsql_cluster', gcp: 'google_spanner_instance', azure: 'azurerm_cosmosdb_account' },
        why: 'Escrituras consistentes en varias regiones. En Azure el equivalente más cercano no es SQL relacional.',
      },
      {
        enterprise: true,
        type: 'global-database', logical: 'global-database', maxInstances: 3, capability: 'Base de datos global con réplica entre regiones',
        icon: { default: 'provider', aws: 'awsAurora', gcp: 'gcpSpanner' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Aurora Global Database', gcp: 'Cloud Spanner', azure: 'Azure SQL Database (failover groups)' },
        terraform: { aws: 'aws_rds_global_cluster', gcp: 'google_spanner_instance', azure: 'azurerm_mssql_failover_group' },
        why: 'Una región atiende las escrituras y otra guarda una réplica lista para tomar el relevo si la primera cae.',
        noDirectEquivalent: {
          azure: 'Sin equivalente directo: los failover groups de Azure SQL Database escriben en una sola región y replican de forma asíncrona, así que un failover puede perder los últimos cambios. Cosmos DB sí escribe en varias regiones, pero no es relacional.',
        },
      },
      {
        enterprise: true,
        type: 'graph', logical: 'database', capability: 'Base de datos de grafos', icon: { default: 'provider', aws: 'awsNeptune', gcp: 'gcpSpanner', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Neptune', gcp: 'Spanner Graph', azure: 'Cosmos DB (Gremlin)' },
        terraform: { aws: 'aws_neptune_cluster', gcp: 'google_spanner_instance', azure: 'azurerm_cosmosdb_gremlin_graph' },
        why: 'Relaciones muy conectadas: recomendaciones, fraude, grafos de conocimiento.',
      },
      {
        type: 'mongodb', logical: 'database', capability: 'Base de datos documental', icon: 'mongodb', zone: 'external', connectFrom: 'api',
        service: 'MongoDB Atlas', terraform: 'mongodbatlas_advanced_cluster',
        why: 'Documentos JSON con esquema flexible; servicio externo, el mismo en cualquier nube.',
      },
      {
        type: 'wide-column', logical: 'database', capability: 'Columnar ancha (Cassandra)', icon: { default: 'cassandra', aws: 'awsKeyspaces', azure: 'azCassandra' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Keyspaces', gcp: 'Bigtable', azure: 'Managed Cassandra' },
        terraform: { aws: 'aws_keyspaces_table', gcp: 'google_bigtable_instance', azure: 'azurerm_cosmosdb_cassandra_cluster' },
        why: 'Escrituras masivas y series temporales a gran escala.',
      },
      {
        type: 'search', capability: 'Búsqueda de texto', icon: 'elasticsearch', zone: 'data', connectFrom: 'api',
        service: 'Elasticsearch', terraform: 'elasticstack_elasticsearch_index',
        why: 'Búsqueda de texto completo y análisis de logs.',
      },
      {
        enterprise: true,
        type: 'warehouse', logical: 'data-warehouse', capability: 'Almacén de datos analítico', icon: { default: 'provider', gcp: 'bigquery', aws: 'awsRedshift', azure: 'azSynapse' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Redshift', gcp: 'BigQuery', azure: 'Synapse Analytics' },
        terraform: { aws: 'aws_redshift_cluster', gcp: 'google_bigquery_dataset', azure: 'azurerm_synapse_workspace' },
        why: 'Consultas analíticas sobre grandes volúmenes de datos.',
      },
      {
        type: 'sql-query', logical: 'data-warehouse', capability: 'Consultas SQL serverless sobre ficheros', icon: { default: 'provider', aws: 'awsAthena', gcp: 'bigquery', azure: 'azSynapse' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Athena', gcp: 'BigQuery (tablas externas)', azure: 'Synapse serverless SQL' },
        terraform: { aws: 'aws_athena_workgroup', gcp: 'google_bigquery_table', azure: 'azurerm_synapse_workspace' },
        why: 'SQL directamente sobre el almacenamiento de objetos, pagando por consulta.',
      },
    ],
  },
  {
    id: 'messaging',
    name: 'Mensajería',
    items: [
      {
        enterprise: true,
        type: 'streaming', logical: 'event-stream', capability: 'Streaming de eventos (Kafka)', icon: { default: 'kafka', aws: 'awsMsk', azure: 'azEventHubs' }, zone: 'compute', connectFrom: 'api',
        service: { aws: 'MSK (Kafka)', gcp: 'Managed Kafka', azure: 'Event Hubs' },
        terraform: { aws: 'aws_msk_cluster', gcp: 'google_managed_kafka_cluster', azure: 'azurerm_eventhub_namespace' },
        why: 'Bus de eventos para desacoplar productores y consumidores.',
      },
      {
        type: 'event-stream', logical: 'event-stream', maxInstances: 4, capability: 'Stream de eventos nativo de la nube',
        icon: { default: 'provider', gcp: 'gcpPubSub', azure: 'azEventHubs' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Kinesis Data Streams', gcp: 'Pub/Sub', azure: 'Event Hubs' },
        terraform: { aws: 'aws_kinesis_stream', gcp: 'google_pubsub_topic', azure: 'azurerm_eventhub' },
        why: 'Ingesta de eventos del propio proveedor: sin clúster que dimensionar, a cambio de su API en lugar de la de Kafka.',
      },
      {
        type: 'queue', logical: 'queue', capability: 'Cola de mensajes', icon: { default: 'provider', gcp: 'gcpPubSub', aws: 'awsSqs', azure: 'azServiceBus' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'SQS', gcp: 'Pub/Sub', azure: 'Service Bus' },
        terraform: { aws: 'aws_sqs_queue', gcp: 'google_pubsub_subscription', azure: 'azurerm_servicebus_queue' },
        why: 'Cola de trabajo para tareas en segundo plano, como la reindexación.',
      },
      {
        type: 'pubsub', logical: 'queue', capability: 'Notificaciones publicar-suscribir', icon: { default: 'provider', gcp: 'gcpPubSub', aws: 'awsSns', azure: 'azEventGrid' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'SNS', gcp: 'Pub/Sub', azure: 'Event Grid' },
        terraform: { aws: 'aws_sns_topic', gcp: 'google_pubsub_topic', azure: 'azurerm_eventgrid_topic' },
        why: 'Un evento, muchos suscriptores.',
      },
      {
        type: 'rabbitmq', logical: 'queue', capability: 'Broker AMQP', icon: 'rabbitmq', zone: 'compute', connectFrom: 'api',
        service: 'RabbitMQ', terraform: { aws: 'aws_mq_broker', gcp: 'helm_release', azure: 'helm_release' },
        why: 'Mensajería con enrutado flexible; gestionado en AWS, sobre Kubernetes en las demás.',
      },
      {
        enterprise: true,
        type: 'stream-processing', logical: 'stream-processing', capability: 'Procesamiento de streams', icon: { default: 'provider', aws: 'awsFlink', gcp: 'gcpDataflow', azure: 'azStreamAnalytics' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Managed Flink', gcp: 'Dataflow', azure: 'Stream Analytics' },
        terraform: { aws: 'aws_kinesisanalyticsv2_application', gcp: 'google_dataflow_job', azure: 'azurerm_stream_analytics_job' },
        why: 'Transforma y agrega eventos en vuelo, sin gestionar el clúster.',
      },
    ],
  },
  {
    id: 'data-analytics',
    name: 'Datos y analítica',
    items: [
      {
        enterprise: true,
        type: 'cdc', logical: 'cdc', maxInstances: 3, capability: 'Captura de cambios (CDC) gestionada',
        icon: 'provider', zone: 'managed', connectFrom: 'api',
        service: { aws: 'Database Migration Service', gcp: 'Datastream', azure: 'Data Factory (CDC)' },
        terraform: { aws: 'aws_dms_replication_task', gcp: 'google_datastream_stream', azure: 'azurerm_data_factory' },
        why: 'Lee el registro de transacciones de la base de datos y publica cada cambio, sin tocar la aplicación.',
        noDirectEquivalent: {
          azure: 'Sin equivalente directo: el recurso CDC de Data Factory está en vista previa y solo lee de SQL Server, Azure SQL, Cosmos DB y Snowflake. Para PostgreSQL, MySQL u Oracle lo habitual es Debezium publicando en Event Hubs.',
        },
      },
      {
        type: 'debezium', logical: 'cdc', maxInstances: 2, capability: 'CDC de código abierto sobre Kafka Connect',
        icon: 'dataService', zone: 'compute', connectFrom: 'api',
        service: 'Debezium', terraform: null,
        why: 'Conectores que leen el registro de PostgreSQL, MySQL u Oracle y publican cada cambio en Kafka; lo operas tú.',
      },
      {
        enterprise: true,
        type: 'goldengate', logical: 'cdc', maxInstances: 1, capability: 'Replicación de datos en tiempo real',
        icon: 'dataService', zone: 'managed', connectFrom: 'api',
        service: 'Oracle GoldenGate', terraform: null,
        why: 'Replicación basada en el registro entre bases de datos distintas; habitual donde el origen es Oracle. De pago.',
      },
      {
        type: 'kafka', logical: 'event-stream', maxInstances: 1, capability: 'Kafka operado por ti',
        icon: 'dataService', zone: 'compute', connectFrom: 'api',
        service: 'Apache Kafka', terraform: 'helm_release',
        why: 'El mismo Kafka en cualquier nube o en tu centro de datos, a cambio de operar el clúster.',
      },
      {
        enterprise: true,
        type: 'snowflake', logical: 'data-warehouse', maxInstances: 1, capability: 'Almacén de datos independiente de la nube',
        icon: 'dataService', zone: 'managed', connectFrom: 'api',
        service: 'Snowflake', terraform: 'snowflake_database',
        why: 'Almacén analítico que separa cómputo y almacenamiento y funciona igual sobre AWS, Google Cloud o Azure.',
      },
      {
        enterprise: true,
        type: 'databricks', logical: 'stream-processing', maxInstances: 1, capability: 'Lakehouse y procesamiento con Spark',
        icon: 'dataService', zone: 'managed', connectFrom: 'api',
        service: 'Databricks', terraform: 'databricks_cluster',
        why: 'Procesa lotes y streams con Spark sobre un lago de datos; el mismo producto en las tres nubes.',
      },
      {
        type: 'bi', logical: 'bi', maxInstances: 1, capability: 'Paneles e informes del proveedor',
        icon: 'provider', zone: 'managed', connectFrom: 'api',
        service: { aws: 'Amazon Quick Sight', gcp: 'Looker', azure: 'Power BI Embedded' },
        terraform: { aws: 'aws_quicksight_data_source', gcp: 'google_looker_instance', azure: 'azurerm_powerbi_embedded' },
        why: 'Paneles sobre el almacén de datos, con el servicio de inteligencia de negocio de cada nube.',
      },
      {
        type: 'tableau', logical: 'bi', maxInstances: 1, capability: 'Inteligencia de negocio',
        icon: 'dataService', zone: 'external', connectFrom: 'api',
        service: 'Tableau', terraform: null,
        why: 'Paneles e informes para negocio; se conecta al almacén de datos, no a la aplicación.',
      },
      {
        type: 'powerbi', logical: 'bi', maxInstances: 1, capability: 'Inteligencia de negocio',
        icon: 'dataService', zone: 'external', connectFrom: 'api',
        service: 'Power BI', terraform: null,
        why: 'Paneles e informes para negocio; habitual donde ya se usa Microsoft 365.',
      },
      {
        type: 'looker-studio', logical: 'bi', maxInstances: 1, capability: 'Paneles gratuitos',
        icon: 'dataService', zone: 'external', connectFrom: 'api',
        service: 'Looker Studio', terraform: null,
        why: 'Paneles sencillos y gratuitos sobre el almacén de datos; sin modelo semántico ni gobierno.',
      },
    ],
  },
  {
    id: 'observability',
    name: 'Observabilidad',
    items: [
      {
        type: 'prometheus', capability: 'Métricas y paneles', icon: 'prometheus', zone: 'compute', connectFrom: 'api',
        service: 'Prometheus + Grafana', terraform: 'helm_release',
        why: 'Métricas con alertas y paneles, desplegado sobre Kubernetes.',
      },
      {
        type: 'datadog', capability: 'Monitorización como servicio', icon: 'datadog', zone: 'external', connectFrom: 'api',
        service: 'Datadog', terraform: 'datadog_monitor',
        why: 'Métricas, trazas y logs en un único servicio externo.',
      },
      {
        type: 'opentelemetry', capability: 'Trazas distribuidas', icon: 'opentelemetry', zone: 'compute', connectFrom: 'api',
        service: 'OpenTelemetry', terraform: 'helm_release',
        why: 'Estándar abierto para seguir una petición entre servicios.',
      },
      {
        type: 'native-monitoring', capability: 'Logs y métricas nativos', icon: { default: 'provider', aws: 'awsCloudWatch', azure: 'azMonitor' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'CloudWatch', gcp: 'Cloud Monitoring', azure: 'Azure Monitor' },
        terraform: { aws: 'aws_cloudwatch_log_group', gcp: 'google_monitoring_alert_policy', azure: 'azurerm_log_analytics_workspace' },
        why: 'La monitorización integrada de cada nube.',
      },
    ],
  },
  {
    id: 'api-management',
    name: 'API Management e integración',
    items: [
      {
        enterprise: true,
        type: 'api-gateway', capability: 'Gestión de APIs', icon: { default: 'provider', aws: 'awsApiGateway', gcp: 'gcpApigee', azure: 'azApiManagement' }, zone: 'public', connectFrom: 'edge',
        service: { aws: 'Amazon API Gateway', gcp: 'Apigee', azure: 'API Management' },
        terraform: { aws: 'aws_apigatewayv2_api', gcp: 'google_apigee_organization', azure: 'azurerm_api_management' },
        why: 'Puerta de entrada con cuotas, claves, versionado y portal de desarrolladores.',
      },
      {
        type: 'workflow', capability: 'Orquestación de flujos e integraciones', icon: { default: 'provider', aws: 'awsStepFunctions', gcp: 'gcpWorkflows', azure: 'azLogicApps' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Step Functions', gcp: 'Workflows', azure: 'Logic Apps' },
        terraform: { aws: 'aws_sfn_state_machine', gcp: 'google_workflows_workflow', azure: 'azurerm_logic_app_workflow' },
        why: 'Encadena llamadas entre servicios con reintentos y estado, sin código de pegamento.',
      },
    ],
  },
  {
    id: 'network-security',
    name: 'Redes y seguridad',
    items: [
      {
        type: 'waf', capability: 'Cortafuegos de aplicación', icon: { default: 'provider', aws: 'awsWaf', gcp: 'gcpArmor', azure: 'azWaf' }, zone: 'public', connectFrom: 'edge',
        service: { aws: 'WAF', gcp: 'Cloud Armor', azure: 'Web Application Firewall' },
        terraform: { aws: 'aws_wafv2_web_acl', gcp: 'google_compute_security_policy', azure: 'azurerm_web_application_firewall_policy' },
        why: 'Filtra tráfico malicioso antes de que llegue a la aplicación.',
      },
      {
        type: 'dns', capability: 'DNS gestionado', icon: { default: 'provider', aws: 'awsRoute53', azure: 'azDns' }, zone: 'global', connectFrom: 'edge',
        service: { aws: 'Route 53', gcp: 'Cloud DNS', azure: 'Azure DNS' },
        terraform: { aws: 'aws_route53_zone', gcp: 'google_dns_managed_zone', azure: 'azurerm_dns_zone' },
        why: 'Resolución de nombres y comprobaciones de salud.',
      },
      {
        type: 'bucket', capability: 'Almacenamiento de objetos', icon: { default: 'provider', gcp: 'gcpStorage', aws: 'awsS3', azure: 'azStorage' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'S3', gcp: 'Cloud Storage', azure: 'Blob Storage' },
        terraform: { aws: 'aws_s3_bucket', gcp: 'google_storage_bucket', azure: 'azurerm_storage_container' },
        why: 'Archivos y copias de seguridad.',
      },
      {
        type: 'identity', capability: 'Identidad de usuarios', icon: { default: 'provider', aws: 'awsCognito', azure: 'azExternalId' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Cognito', gcp: 'Identity Platform', azure: 'Entra External ID' },
        terraform: { aws: 'aws_cognito_user_pool', gcp: 'google_identity_platform_config', azure: 'azuread_application' },
        why: 'Registro e inicio de sesión de usuarios finales.',
      },
      {
        type: 'secrets', capability: 'Secretos gestionados', icon: { default: 'provider', aws: 'awsSecretsManager', azure: 'azKeyVault' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Secrets Manager', gcp: 'Secret Manager', azure: 'Key Vault' },
        terraform: { aws: 'aws_secretsmanager_secret', gcp: 'google_secret_manager_secret', azure: 'azurerm_key_vault' },
        why: 'Claves y credenciales fuera del código y de la imagen.',
      },
      {
        type: 'vault', capability: 'Secretos independientes de la nube', icon: 'vault', zone: 'managed', connectFrom: 'api',
        service: 'HashiCorp Vault', terraform: 'vault_mount',
        why: 'Secretos y credenciales rotadas, con la misma herramienta en cualquier nube.',
      },
    ],
  },
];

/** Cada servicio con su equivalente en OCI y, donde no lo hay, su aviso (`cloud-oracle.data.ts`). */
function inOracle(item: CatalogItem): CatalogItem {
  const gap = ORACLE_EQUIVALENTS[item.type]?.noDirectEquivalent;
  const piece = withOracle(item);
  return gap ? { ...piece, noDirectEquivalent: { ...piece.noDirectEquivalent, oci: gap } } : piece;
}

export const SERVICE_CATALOG: CatalogCategory[] = CATALOG.map((category) => ({ ...category, items: category.items.map(inOracle) }));
