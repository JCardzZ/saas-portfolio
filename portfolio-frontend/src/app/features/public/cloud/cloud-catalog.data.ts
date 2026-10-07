import { IconRef, PerProvider, ZoneId } from './cloud-topology.data';

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
  /** Tipo de recurso de Terraform con el que se aprovisiona. */
  terraform: string | PerProvider;
  /** Zona del lienzo en la que cae al añadirlo. */
  zone: ZoneId;
  /** Nodo desde el que le llega el tráfico; a él se conecta sola. */
  connectFrom: 'users' | 'edge' | 'lb' | 'api';
  why: string;
  /** Servicio que suele adoptarse a escala de empresa. */
  enterprise?: boolean;
}

export interface CatalogCategory {
  id: string;
  name: string;
  items: CatalogItem[];
}

export const SERVICE_CATALOG: CatalogCategory[] = [
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
        type: 'nosql', capability: 'NoSQL clave-valor', icon: { default: 'provider', gcp: 'firebase', aws: 'awsDynamoDb', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'DynamoDB', gcp: 'Firestore (Datastore)', azure: 'Cosmos DB' },
        terraform: { aws: 'aws_dynamodb_table', gcp: 'google_firestore_database', azure: 'azurerm_cosmosdb_account' },
        why: 'Almacén clave-valor para datos de acceso muy frecuente.',
      },
      {
        enterprise: true,
        type: 'newsql-pg', capability: 'PostgreSQL de alto rendimiento', icon: { default: 'postgresql', aws: 'awsAurora', gcp: 'gcpAlloyDb', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Aurora PostgreSQL', gcp: 'AlloyDB', azure: 'Cosmos DB for PostgreSQL' },
        terraform: { aws: 'aws_rds_cluster', gcp: 'google_alloydb_cluster', azure: 'azurerm_cosmosdb_postgresql_cluster' },
        why: 'Compatible con PostgreSQL, con almacenamiento distribuido y réplicas de lectura rápidas.',
      },
      {
        enterprise: true,
        type: 'global-sql', capability: 'SQL distribuido multirregión', icon: { default: 'provider', aws: 'awsAurora', gcp: 'gcpSpanner', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Aurora DSQL', gcp: 'Cloud Spanner', azure: 'Cosmos DB (multirregión)' },
        terraform: { aws: 'aws_dsql_cluster', gcp: 'google_spanner_instance', azure: 'azurerm_cosmosdb_account' },
        why: 'Escrituras consistentes en varias regiones. En Azure el equivalente más cercano no es SQL relacional.',
      },
      {
        enterprise: true,
        type: 'graph', capability: 'Base de datos de grafos', icon: { default: 'provider', aws: 'awsNeptune', gcp: 'gcpSpanner', azure: 'azCosmosDb' }, zone: 'data', connectFrom: 'api',
        service: { aws: 'Neptune', gcp: 'Spanner Graph', azure: 'Cosmos DB (Gremlin)' },
        terraform: { aws: 'aws_neptune_cluster', gcp: 'google_spanner_instance', azure: 'azurerm_cosmosdb_gremlin_graph' },
        why: 'Relaciones muy conectadas: recomendaciones, fraude, grafos de conocimiento.',
      },
      {
        type: 'mongodb', capability: 'Base de datos documental', icon: 'mongodb', zone: 'external', connectFrom: 'api',
        service: 'MongoDB Atlas', terraform: 'mongodbatlas_advanced_cluster',
        why: 'Documentos JSON con esquema flexible; servicio externo, el mismo en cualquier nube.',
      },
      {
        type: 'wide-column', capability: 'Columnar ancha (Cassandra)', icon: { default: 'cassandra', aws: 'awsKeyspaces', azure: 'azCassandra' }, zone: 'data', connectFrom: 'api',
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
        type: 'warehouse', capability: 'Almacén de datos analítico', icon: { default: 'provider', gcp: 'bigquery', aws: 'awsRedshift', azure: 'azSynapse' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Redshift', gcp: 'BigQuery', azure: 'Synapse Analytics' },
        terraform: { aws: 'aws_redshift_cluster', gcp: 'google_bigquery_dataset', azure: 'azurerm_synapse_workspace' },
        why: 'Consultas analíticas sobre grandes volúmenes de datos.',
      },
      {
        type: 'sql-query', capability: 'Consultas SQL serverless sobre ficheros', icon: { default: 'provider', aws: 'awsAthena', gcp: 'bigquery', azure: 'azSynapse' }, zone: 'managed', connectFrom: 'api',
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
        type: 'streaming', capability: 'Streaming de eventos (Kafka)', icon: { default: 'kafka', aws: 'awsMsk', azure: 'azEventHubs' }, zone: 'compute', connectFrom: 'api',
        service: { aws: 'MSK (Kafka)', gcp: 'Managed Kafka', azure: 'Event Hubs' },
        terraform: { aws: 'aws_msk_cluster', gcp: 'google_managed_kafka_cluster', azure: 'azurerm_eventhub_namespace' },
        why: 'Bus de eventos para desacoplar productores y consumidores.',
      },
      {
        type: 'queue', capability: 'Cola de mensajes', icon: { default: 'provider', gcp: 'gcpPubSub', aws: 'awsSqs', azure: 'azServiceBus' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'SQS', gcp: 'Pub/Sub', azure: 'Service Bus' },
        terraform: { aws: 'aws_sqs_queue', gcp: 'google_pubsub_subscription', azure: 'azurerm_servicebus_queue' },
        why: 'Cola de trabajo para tareas en segundo plano, como la reindexación.',
      },
      {
        type: 'pubsub', capability: 'Notificaciones publicar-suscribir', icon: { default: 'provider', gcp: 'gcpPubSub', aws: 'awsSns', azure: 'azEventGrid' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'SNS', gcp: 'Pub/Sub', azure: 'Event Grid' },
        terraform: { aws: 'aws_sns_topic', gcp: 'google_pubsub_topic', azure: 'azurerm_eventgrid_topic' },
        why: 'Un evento, muchos suscriptores.',
      },
      {
        type: 'rabbitmq', capability: 'Broker AMQP', icon: 'rabbitmq', zone: 'compute', connectFrom: 'api',
        service: 'RabbitMQ', terraform: { aws: 'aws_mq_broker', gcp: 'helm_release', azure: 'helm_release' },
        why: 'Mensajería con enrutado flexible; gestionado en AWS, sobre Kubernetes en las demás.',
      },
      {
        enterprise: true,
        type: 'stream-processing', capability: 'Procesamiento de streams', icon: { default: 'provider', aws: 'awsFlink', gcp: 'gcpDataflow', azure: 'azStreamAnalytics' }, zone: 'managed', connectFrom: 'api',
        service: { aws: 'Managed Flink', gcp: 'Dataflow', azure: 'Stream Analytics' },
        terraform: { aws: 'aws_kinesisanalyticsv2_application', gcp: 'google_dataflow_job', azure: 'azurerm_stream_analytics_job' },
        why: 'Transforma y agrega eventos en vuelo, sin gestionar el clúster.',
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
