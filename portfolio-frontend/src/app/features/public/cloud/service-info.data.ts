import { CloudProviderId } from './cloud-topology.data';

/**
 * Ficha de cada servicio del Estudio: qué es y para qué se usa (por tipo de pieza, igual en
 * cualquier nube) y, por nube, su nombre oficial, su documentación y lo que tenga de particular.
 *
 * Los textos viven aquí, no en los componentes, y cada uno es un objeto por idioma: hoy solo
 * `es`; la versión en inglés se añade rellenando `en`, sin tocar nada más.
 *
 * Los enlaces son a la documentación oficial de cada proveedor. Se comprueban con
 * `node tools/check-service-docs.mjs` (necesita red; no corre en la CI), que pide cada página y
 * muestra su título para contrastarlo con el nombre. Última comprobación: 2026-10-12.
 */
export interface Localized {
  es: string;
  en?: string;
}

export interface ProviderInfo {
  /** Nombre oficial del servicio, como lo escribe su proveedor. */
  name: string;
  /** Página de entrada de su documentación oficial. */
  docs: string;
  /** Lo que este servicio tiene de distinto respecto a la descripción general de la pieza. */
  note?: Localized;
}

export interface ServiceInfo {
  what: Localized;
  /** Dos o tres usos habituales. */
  uses: Localized[];
  /** Servicio que cubre la pieza en cada nube. */
  providers?: Record<CloudProviderId, ProviderInfo>;
  /** Producto que es el mismo en cualquier nube. */
  product?: ProviderInfo;
}

const t = (es: string): Localized => ({ es });
const p = (name: string, docs: string, note?: string): ProviderInfo => (note ? { name, docs, note: t(note) } : { name, docs });
const info = (what: string, uses: string[], rest: Pick<ServiceInfo, 'providers' | 'product'>): ServiceInfo =>
  ({ what: t(what), uses: uses.map(t), ...rest });

const AWS = 'https://docs.aws.amazon.com';
const GCP = 'https://cloud.google.com';
const AZURE = 'https://learn.microsoft.com/azure';
const OCI = 'https://docs.oracle.com/en-us/iaas';

const PUBSUB_NOTE = 'Pub/Sub cubre con un mismo servicio las colas, los avisos y el flujo de eventos.';
const SPANNER_NOTE = 'Spanner cubre tanto el SQL distribuido como la base de datos global: es el mismo servicio.';

export const SERVICE_INFO: Readonly<Record<string, ServiceInfo>> = {
  // ── Piezas de la arquitectura de referencia que no están en el catálogo ──
  users: info('Las personas que usan la aplicación desde su navegador o su móvil.',
    ['Punto de partida de cada petición', 'Referencia para medir la latencia que percibe el visitante'], {}),
  edge: info('Red que se pone delante del sitio para servirlo desde cerca del visitante y pararle los ataques.',
    ['Servir archivos estáticos desde la ubicación más cercana', 'Absorber ataques de denegación de servicio', 'Terminar HTTPS antes de llegar al origen'],
    { product: p('Cloudflare', 'https://developers.cloudflare.com/') }),
  static: info('Almacén de archivos con una red de distribución delante, para servir un sitio web sin servidores.',
    ['Publicar una aplicación de una sola página', 'Servir imágenes y descargas con caché'],
    { providers: {
      aws: p('Amazon S3 + Amazon CloudFront', `${AWS}/cloudfront/`),
      gcp: p('Cloud Storage + Cloud CDN', `${GCP}/cdn/docs`),
      azure: p('Azure Storage + Azure Front Door', `${AZURE}/frontdoor/`),
      oci: p('OCI Object Storage', `${OCI}/Content/Object/home.htm`, 'El índice de servicios de OCI no incluye una red de distribución propia: el diagrama solo muestra el almacén.'),
    } }),
  lb: info('Reparte las peticiones entre varias copias de la aplicación y deja de enviar a las que fallan.',
    ['Repartir carga entre réplicas', 'Publicar un único punto de entrada con HTTPS', 'Sacar de servicio una instancia que no responde'],
    { providers: {
      aws: p('Application Load Balancer', `${AWS}/elasticloadbalancing/latest/application/introduction.html`),
      gcp: p('Cloud Load Balancing', `${GCP}/load-balancing/docs`),
      azure: p('Azure Application Gateway', `${AZURE}/application-gateway/`),
      oci: p('OCI Load Balancer', `${OCI}/Content/Balance/home.htm`),
    } }),
  postgres: info('Base de datos relacional PostgreSQL que la nube instala, actualiza y respalda por ti.',
    ['Datos transaccionales de la aplicación', 'Consultas SQL con relaciones y restricciones', 'Copias de seguridad y réplicas sin administrarlas a mano'],
    { providers: {
      aws: p('Amazon RDS for PostgreSQL', `${AWS}/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html`),
      gcp: p('Cloud SQL for PostgreSQL', `${GCP}/sql/docs/postgres`),
      azure: p('Azure Database for PostgreSQL', `${AZURE}/postgresql/`),
      oci: p('OCI Database with PostgreSQL', `${OCI}/Content/postgresql/home.htm`),
    } }),
  redis: info('Almacén de datos en memoria, muy rápido, que se usa sobre todo como caché.',
    ['Guardar respuestas para no repetir consultas', 'Contadores y límites de peticiones', 'Datos de vida corta'],
    { providers: {
      aws: p('Amazon ElastiCache', `${AWS}/elasticache/`),
      gcp: p('Memorystore for Redis', `${GCP}/memorystore/docs/redis`),
      azure: p('Azure Cache for Redis', `${AZURE}/azure-cache-for-redis/`),
      oci: p('OCI Cache', `${OCI}/Content/ocicache/home.htm`),
    } }),
  registry: info('Almacén privado de imágenes de contenedor, de donde las descarga la plataforma al desplegar.',
    ['Guardar las imágenes que genera la integración continua', 'Desplegar una versión concreta por su etiqueta o su huella'],
    { providers: {
      aws: p('Amazon Elastic Container Registry (ECR)', `${AWS}/ecr/`),
      gcp: p('Artifact Registry', `${GCP}/artifact-registry/docs`),
      azure: p('Azure Container Registry', `${AZURE}/container-registry/`),
      oci: p('OCI Container Registry', `${OCI}/Content/Registry/home.htm`),
    } }),
  gemini: info('Servicio de Google que da acceso por API a sus modelos de lenguaje.',
    ['Generar respuestas a partir de un contexto', 'Convertir texto en vectores para buscar por significado'],
    { product: p('Gemini API', 'https://ai.google.dev/gemini-api/docs') }),
  cicd: info('Herramientas que construyen la aplicación y crean su infraestructura a partir de archivos de texto.',
    ['Describir la infraestructura como código', 'Empaquetar la aplicación en una imagen reproducible'],
    { product: p('Terraform + Docker', 'https://developer.hashicorp.com/terraform/docs') }),

  // ── Cómputo ──
  kubernetes: info('Plataforma que ejecuta y coordina contenedores en un grupo de máquinas; la nube mantiene su parte de control.',
    ['Ejecutar muchos servicios con varias réplicas', 'Desplegar versiones nuevas de forma gradual', 'Usar las mismas definiciones en cualquier nube'],
    { providers: {
      aws: p('Amazon Elastic Kubernetes Service (EKS)', `${AWS}/eks/`),
      gcp: p('Google Kubernetes Engine (GKE)', `${GCP}/kubernetes-engine/docs`),
      azure: p('Azure Kubernetes Service (AKS)', `${AZURE}/aks/`),
      oci: p('OCI Kubernetes Engine (OKE)', `${OCI}/Content/ContEng/home.htm`),
    } }),
  vm: info('Servidores virtuales completos, con su sistema operativo, que se alquilan por tiempo de uso.',
    ['Software que necesita control total del sistema', 'Aplicaciones que no están en contenedores', 'Cargas con requisitos especiales de hardware'],
    { providers: {
      aws: p('Amazon EC2', `${AWS}/ec2/`),
      gcp: p('Compute Engine', `${GCP}/compute/docs`),
      azure: p('Azure Virtual Machines', `${AZURE}/virtual-machines/`),
      oci: p('OCI Compute', `${OCI}/Content/Compute/home.htm`),
    } }),

  // ── Serverless ──
  containers: info('Ejecuta contenedores sin que tengas que crear ni mantener las máquinas donde corren.',
    ['APIs y servicios web en contenedores', 'Escalar según el tráfico sin administrar servidores'],
    { providers: {
      aws: p('Amazon ECS en AWS Fargate', `${AWS}/AmazonECS/latest/developerguide/AWS_Fargate.html`),
      gcp: p('Cloud Run', `${GCP}/run/docs`),
      azure: p('Azure Container Apps', `${AZURE}/container-apps/`),
      oci: p('OCI Container Instances', `${OCI}/Content/container-instances/home.htm`),
    } }),
  functions: info('Ejecuta un trozo de código cuando ocurre algo y solo cobra mientras se ejecuta.',
    ['Reaccionar a un evento (un archivo subido, un mensaje)', 'Tareas cortas y esporádicas', 'Pegamento entre servicios'],
    { providers: {
      aws: p('AWS Lambda', `${AWS}/lambda/`),
      gcp: p('Cloud Run functions', `${GCP}/functions/docs`, 'Google lo llamaba Cloud Functions; ahora forma parte de Cloud Run.'),
      azure: p('Azure Functions', `${AZURE}/azure-functions/`),
      oci: p('OCI Functions', `${OCI}/Content/Functions/home.htm`),
    } }),
  'app-platform': info('Publica una aplicación web a partir de su código o su imagen, sin configurar red ni escalado.',
    ['Sitios y APIs sencillos', 'Equipos pequeños que no quieren administrar infraestructura'],
    { providers: {
      aws: p('AWS App Runner', `${AWS}/apprunner/`),
      gcp: p('App Engine', `${GCP}/appengine/docs`),
      azure: p('Azure App Service', `${AZURE}/app-service/`),
      oci: p('OCI Container Instances', `${OCI}/Content/container-instances/home.htm`),
    } }),
  'ml-platform': info('Da acceso a modelos de inteligencia artificial ya entrenados, dentro de la propia nube.',
    ['Asistentes y búsqueda sobre documentos propios', 'Resumir, clasificar o extraer datos de texto', 'Usar modelos con los controles de red e identidad de la nube'],
    { providers: {
      aws: p('Amazon Bedrock', `${AWS}/bedrock/`),
      gcp: p('Vertex AI', `${GCP}/vertex-ai/docs`, 'Su documentación oficial se presenta hoy como «Gemini Enterprise Agent Platform».'),
      azure: p('Azure OpenAI', `${AZURE}/ai-services/openai/`, 'Su documentación oficial está hoy dentro de Microsoft Foundry.'),
      oci: p('OCI Generative AI Agents', `${OCI}/Content/generative-ai-agents/home.htm`),
    } }),

  // ── Bases de datos ──
  nosql: info('Base de datos que guarda documentos o pares clave-valor en vez de tablas con relaciones.',
    ['Datos con forma variable', 'Lecturas y escrituras muy rápidas por clave', 'Crecer en volumen sin rediseñar el esquema'],
    { providers: {
      aws: p('Amazon DynamoDB', `${AWS}/dynamodb/`),
      gcp: p('Firestore', `${GCP}/firestore/docs`),
      azure: p('Azure Cosmos DB', `${AZURE}/cosmos-db/`),
      oci: p('Oracle NoSQL Database Cloud Service', `${OCI}/nosql-database/index.html`),
    } }),
  'newsql-pg': info('Base de datos compatible con PostgreSQL, pensada para más carga y disponibilidad que una instancia normal.',
    ['Aplicaciones PostgreSQL con mucho tráfico', 'Réplicas de lectura y recuperación rápida ante fallos'],
    { providers: {
      aws: p('Amazon Aurora PostgreSQL', `${AWS}/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraPostgreSQL.html`),
      gcp: p('AlloyDB for PostgreSQL', `${GCP}/alloydb/docs`),
      azure: p('Azure Database for PostgreSQL (Elastic Clusters)', `${AZURE}/postgresql/elastic-clusters/concepts-elastic-clusters`),
      oci: p('OCI Database with PostgreSQL', `${OCI}/Content/postgresql/home.htm`, 'En OCI es el mismo servicio que el PostgreSQL gestionado.'),
    } }),
  'global-sql': info('Base de datos SQL que reparte los datos entre varias regiones y mantiene las transacciones coherentes.',
    ['Aplicaciones con usuarios en varios continentes', 'Seguir escribiendo aunque caiga una región'],
    { providers: {
      aws: p('Amazon Aurora DSQL', `${AWS}/aurora-dsql/`),
      gcp: p('Spanner', `${GCP}/spanner/docs`, SPANNER_NOTE),
      azure: p('Azure Cosmos DB (multirregión)', `${AZURE}/cosmos-db/distribute-data-globally`),
      oci: p('Oracle Globally Distributed Autonomous AI Database', 'https://docs.oracle.com/en/cloud/paas/globally-distributed-autonomous-database/'),
    } }),
  'global-database': info('Una base de datos con copias en varias regiones, para leer cerca del usuario y recuperarse si cae una región.',
    ['Recuperación ante la caída de una región entera', 'Lecturas rápidas en regiones lejanas'],
    { providers: {
      aws: p('Amazon Aurora Global Database', `${AWS}/AmazonRDS/latest/AuroraUserGuide/aurora-global-database.html`),
      gcp: p('Spanner', `${GCP}/spanner/docs`, SPANNER_NOTE),
      azure: p('Azure SQL Database (failover groups)', `${AZURE}/azure-sql/database/failover-group-sql-db`),
      oci: p('Autonomous AI Database (Autonomous Data Guard)', `${OCI}/autonomous-database-serverless/doc/adg-about-cross-region--cross-tenancy.html`),
    } }),
  graph: info('Base de datos que guarda los datos como nodos y relaciones, para consultar cómo se conectan.',
    ['Redes de relaciones (personas, cuentas, dispositivos)', 'Detección de fraude', 'Recomendaciones'],
    { providers: {
      aws: p('Amazon Neptune', `${AWS}/neptune/`),
      gcp: p('Spanner Graph', `${GCP}/spanner/docs/graph/overview`),
      azure: p('Azure Cosmos DB for Apache Gremlin', `${AZURE}/cosmos-db/gremlin/`),
      oci: p('Autonomous AI Database (Graph Studio)', 'https://docs.oracle.com/en/cloud/paas/autonomous-database/csgru/whats-new-graph-studio-autonomous-database.html'),
    } }),
  mongodb: info('Base de datos de documentos MongoDB, ofrecida como servicio por la empresa que la desarrolla.',
    ['Datos con forma de documento JSON', 'La misma base de datos en cualquier nube'],
    { product: p('MongoDB Atlas', 'https://www.mongodb.com/docs/atlas/') }),
  'wide-column': info('Base de datos de filas con muchísimas columnas, hecha para escribir y leer grandes volúmenes muy deprisa.',
    ['Series temporales y datos de sensores', 'Historiales enormes consultados por clave'],
    { providers: {
      aws: p('Amazon Keyspaces (for Apache Cassandra)', `${AWS}/keyspaces/`),
      gcp: p('Bigtable', `${GCP}/bigtable/docs`),
      azure: p('Azure Managed Instance for Apache Cassandra', `${AZURE}/managed-instance-apache-cassandra/`),
      oci: p('Oracle NoSQL Database Cloud Service', `${OCI}/nosql-database/index.html`),
    } }),
  search: info('Motor de búsqueda que indexa texto y documentos para encontrarlos por palabras, filtros o relevancia.',
    ['Buscador de un sitio o catálogo', 'Explorar logs', 'Búsqueda por significado con vectores'],
    { product: p('Elasticsearch', 'https://www.elastic.co/docs') }),
  warehouse: info('Almacén de datos hecho para analizar: guarda grandes volúmenes y responde consultas que los recorren enteros.',
    ['Informes y cuadros de mando', 'Cruzar datos de varios sistemas', 'Análisis histórico'],
    { providers: {
      aws: p('Amazon Redshift', `${AWS}/redshift/`),
      gcp: p('BigQuery', `${GCP}/bigquery/docs`),
      azure: p('Azure Synapse Analytics', `${AZURE}/synapse-analytics/`),
      oci: p('Oracle Autonomous AI Lakehouse', `${OCI}/autonomous-database-serverless/index.html`),
    } }),
  'sql-query': info('Consulta con SQL archivos guardados en un almacén de objetos, sin cargarlos antes en una base de datos.',
    ['Analizar logs y exportaciones tal como están', 'Consultas ocasionales sobre un lago de datos'],
    { providers: {
      aws: p('Amazon Athena', `${AWS}/athena/`),
      gcp: p('BigQuery (tablas externas)', `${GCP}/bigquery/docs/external-tables`),
      azure: p('Azure Synapse Analytics (grupo de SQL sin servidor)', `${AZURE}/synapse-analytics/sql/on-demand-workspace-overview`),
      oci: p('Oracle Autonomous AI Lakehouse', `${OCI}/autonomous-database-serverless/index.html`),
    } }),

  // ── Mensajería ──
  streaming: info('Apache Kafka administrado por la nube: un registro de eventos ordenado que muchos servicios leen a su ritmo.',
    ['Comunicar servicios mediante eventos', 'Volver a leer eventos pasados', 'Alimentar analítica en tiempo real'],
    { providers: {
      aws: p('Amazon Managed Streaming for Apache Kafka (MSK)', `${AWS}/msk/`),
      gcp: p('Managed Service for Apache Kafka', `${GCP}/managed-service-for-apache-kafka/docs`),
      azure: p('Azure Event Hubs', `${AZURE}/event-hubs/`, 'Event Hubs no es Kafka: ofrece un punto de conexión compatible con su protocolo.'),
      oci: p('OCI Streaming with Apache Kafka', `${OCI}/Content/kafka/home.htm`),
    } }),
  'event-stream': info('Servicio propio de cada nube para recibir un flujo continuo de eventos y repartirlo a quien lo procese.',
    ['Recoger eventos de aplicaciones y dispositivos', 'Alimentar procesos y analítica en tiempo real'],
    { providers: {
      aws: p('Amazon Kinesis Data Streams', `${AWS}/streams/latest/dev/introduction.html`),
      gcp: p('Pub/Sub', `${GCP}/pubsub/docs`, PUBSUB_NOTE),
      azure: p('Azure Event Hubs', `${AZURE}/event-hubs/`),
      oci: p('OCI Streaming', `${OCI}/Content/Streaming/home.htm`),
    } }),
  queue: info('Cola de mensajes: un servicio deja trabajos y otro los recoge cuando puede.',
    ['Trabajos en segundo plano', 'Absorber picos sin perder peticiones', 'Separar servicios para que uno no tumbe al otro'],
    { providers: {
      aws: p('Amazon Simple Queue Service (SQS)', `${AWS}/sqs/`),
      gcp: p('Pub/Sub', `${GCP}/pubsub/docs`, PUBSUB_NOTE),
      azure: p('Azure Service Bus', `${AZURE}/service-bus-messaging/`),
      oci: p('OCI Queue', `${OCI}/Content/queue/home.htm`),
    } }),
  pubsub: info('Publica un aviso una vez y lo entrega a todos los que están suscritos.',
    ['Avisar a varios servicios del mismo hecho', 'Notificaciones por correo, SMS o webhook'],
    { providers: {
      aws: p('Amazon Simple Notification Service (SNS)', `${AWS}/sns/`),
      gcp: p('Pub/Sub', `${GCP}/pubsub/docs`, PUBSUB_NOTE),
      azure: p('Azure Event Grid', `${AZURE}/event-grid/`),
      oci: p('OCI Notifications', `${OCI}/Content/Notification/home.htm`),
    } }),
  rabbitmq: info('Intermediario de mensajes de código abierto que enruta cada mensaje a la cola que corresponde.',
    ['Colas de trabajo con reglas de enrutado', 'Integrar sistemas que hablan protocolos distintos'],
    { product: p('RabbitMQ', 'https://www.rabbitmq.com/docs') }),
  'stream-processing': info('Procesa los eventos según llegan (filtra, agrupa, calcula) en vez de esperar a un lote.',
    ['Métricas y alertas en tiempo real', 'Limpiar y enriquecer eventos antes de guardarlos'],
    { providers: {
      aws: p('Amazon Managed Service for Apache Flink', `${AWS}/managed-flink/`),
      gcp: p('Dataflow', `${GCP}/dataflow/docs`),
      azure: p('Azure Stream Analytics', `${AZURE}/stream-analytics/`),
      oci: p('OCI Data Flow', `${OCI}/data-flow/using/home.htm`),
    } }),

  // ── Datos y analítica ──
  cdc: info('Captura cada cambio que ocurre en una base de datos y lo envía a otro sistema casi al momento.',
    ['Mantener un almacén de datos al día', 'Sacar datos de una base sin cargarla con consultas', 'Migrar sin parar el servicio'],
    { providers: {
      aws: p('AWS Database Migration Service', `${AWS}/dms/`),
      gcp: p('Datastream', `${GCP}/datastream/docs`),
      azure: p('Azure Data Factory (captura de datos modificados)', `${AZURE}/data-factory/concepts-change-data-capture-resource`),
      oci: p('OCI GoldenGate', `${OCI}/goldengate/index.html`),
    } }),
  debezium: info('Herramienta de código abierto que lee el registro de cambios de una base de datos y los publica como eventos.',
    ['Publicar los cambios de una base de datos en Kafka', 'Sincronizar cachés e índices de búsqueda'],
    { product: p('Debezium', 'https://debezium.io/documentation/') }),
  goldengate: info('Producto de Oracle que replica datos entre bases de datos en tiempo real.',
    ['Replicar entre bases de datos de distinto fabricante', 'Migraciones sin parada'],
    { product: p('Oracle GoldenGate', 'https://docs.oracle.com/en/database/goldengate/') }),
  kafka: info('Plataforma de código abierto que guarda los eventos en un registro ordenado y los reparte a quien los lea.',
    ['Columna vertebral de eventos entre servicios', 'Volver a procesar eventos pasados'],
    { product: p('Apache Kafka', 'https://kafka.apache.org/documentation/') }),
  snowflake: info('Almacén de datos en la nube que se contrata como servicio y funciona sobre AWS, Azure o Google Cloud.',
    ['Analítica sobre datos de muchas fuentes', 'Compartir datos entre equipos o empresas'],
    { product: p('Snowflake', 'https://docs.snowflake.com/') }),
  databricks: info('Plataforma para procesar y analizar datos a gran escala, construida sobre Apache Spark.',
    ['Transformar grandes volúmenes de datos', 'Procesar streams', 'Entrenar modelos sobre esos datos'],
    { product: p('Databricks', 'https://docs.databricks.com/') }),
  bi: info('Herramienta de la nube para crear informes y cuadros de mando a partir de los datos.',
    ['Cuadros de mando para negocio', 'Incrustar informes dentro de una aplicación'],
    { providers: {
      aws: p('Amazon Quick Sight', `${AWS}/quicksight/`, 'Antes se escribía Amazon QuickSight.'),
      gcp: p('Looker', `${GCP}/looker/docs`),
      azure: p('Power BI Embedded', 'https://learn.microsoft.com/power-bi/developer/embedded/'),
      oci: p('Oracle Analytics Cloud', `${OCI}/analytics-cloud/index.html`),
    } }),
  tableau: info('Herramienta de visualización para explorar datos y publicar cuadros de mando.',
    ['Análisis visual por parte de negocio', 'Cuadros de mando compartidos'],
    { product: p('Tableau', 'https://help.tableau.com/') }),
  powerbi: info('Herramienta de Microsoft para crear informes y cuadros de mando.',
    ['Informes para negocio', 'Análisis sobre datos de varias fuentes'],
    { product: p('Power BI', 'https://learn.microsoft.com/power-bi/') }),
  'looker-studio': info('Herramienta gratuita de Google para montar informes y cuadros de mando.',
    ['Informes rápidos sobre datos de Google', 'Cuadros de mando compartidos por enlace'],
    { product: p('Looker Studio', 'https://cloud.google.com/looker/docs/studio', 'Su documentación oficial lo presenta hoy como «Data Studio».') }),

  // ── Observabilidad ──
  prometheus: info('Prometheus recoge métricas de los servicios y Grafana las muestra en paneles; los dos son de código abierto.',
    ['Vigilar el estado y el rendimiento', 'Alertas cuando una métrica se sale de lo normal'],
    { product: p('Prometheus + Grafana', 'https://prometheus.io/docs/') }),
  datadog: info('Servicio externo que reúne métricas, trazas y logs de toda la plataforma en un solo sitio.',
    ['Vigilar aplicaciones e infraestructura', 'Investigar un fallo siguiendo la petición'],
    { product: p('Datadog', 'https://docs.datadoghq.com/') }),
  opentelemetry: info('Estándar abierto para que las aplicaciones emitan trazas, métricas y logs en un formato común.',
    ['Seguir una petición a través de varios servicios', 'No atarse a un proveedor de observabilidad'],
    { product: p('OpenTelemetry', 'https://opentelemetry.io/docs/') }),
  'native-monitoring': info('El servicio de cada nube que recoge métricas y logs de lo que se ejecuta en ella.',
    ['Paneles y alertas sin instalar nada', 'Guardar y consultar logs'],
    { providers: {
      aws: p('Amazon CloudWatch', `${AWS}/cloudwatch/`),
      gcp: p('Cloud Monitoring', `${GCP}/monitoring/docs`),
      azure: p('Azure Monitor', `${AZURE}/azure-monitor/`),
      oci: p('OCI Monitoring', `${OCI}/Content/Monitoring/home.htm`),
    } }),

  // ── API e integración ──
  'api-gateway': info('Puerta de entrada de las APIs: comprueba quién llama, aplica límites y reparte a los servicios.',
    ['Publicar APIs con claves y cuotas', 'Validar tokens antes de llegar al servicio', 'Versionar y documentar APIs'],
    { providers: {
      aws: p('Amazon API Gateway', `${AWS}/apigateway/`),
      gcp: p('Apigee', `${GCP}/apigee/docs`),
      azure: p('Azure API Management', `${AZURE}/api-management/`),
      oci: p('OCI API Gateway', `${OCI}/Content/APIGateway/home.htm`),
    } }),
  workflow: info('Encadena pasos entre servicios, con reintentos y memoria de por dónde va, sin escribir ese control a mano.',
    ['Procesos de varios pasos (un pedido, un alta)', 'Integrar sistemas con reintentos automáticos'],
    { providers: {
      aws: p('AWS Step Functions', `${AWS}/step-functions/`),
      gcp: p('Workflows', `${GCP}/workflows/docs`),
      azure: p('Azure Logic Apps', `${AZURE}/logic-apps/`),
      oci: p('Oracle Integration', `${OCI}/application-integration/index.html`),
    } }),

  // ── Redes y seguridad ──
  waf: info('Filtro que revisa las peticiones web y bloquea las que parecen un ataque.',
    ['Parar inyecciones y otros ataques conocidos', 'Limitar peticiones abusivas'],
    { providers: {
      aws: p('AWS WAF', `${AWS}/waf/`),
      gcp: p('Google Cloud Armor', `${GCP}/armor/docs`),
      azure: p('Azure Web Application Firewall', `${AZURE}/web-application-firewall/`),
      oci: p('OCI Web Application Firewall', `${OCI}/Content/WAF/home.htm`),
    } }),
  dns: info('Traduce el nombre de dominio a la dirección de los servidores.',
    ['Apuntar el dominio a la aplicación', 'Desviar el tráfico si un destino deja de responder'],
    { providers: {
      aws: p('Amazon Route 53', `${AWS}/route53/`),
      gcp: p('Cloud DNS', `${GCP}/dns/docs`),
      azure: p('Azure DNS', `${AZURE}/dns/`),
      oci: p('OCI DNS', `${OCI}/Content/DNS/home.htm`),
    } }),
  bucket: info('Almacén de archivos de cualquier tamaño, a los que se accede por su nombre.',
    ['Archivos subidos por los usuarios', 'Copias de seguridad', 'Datos en bruto para analizar después'],
    { providers: {
      aws: p('Amazon S3', `${AWS}/s3/`),
      gcp: p('Cloud Storage', `${GCP}/storage/docs`),
      azure: p('Azure Blob Storage', `${AZURE}/storage/blobs/`),
      oci: p('OCI Object Storage', `${OCI}/Content/Object/home.htm`),
    } }),
  identity: info('Gestiona el registro y el inicio de sesión de los usuarios de tu aplicación.',
    ['Alta e inicio de sesión sin programarlos', 'Entrar con cuentas de Google, Microsoft u otras', 'Emitir los tokens que validan las APIs'],
    { providers: {
      aws: p('Amazon Cognito', `${AWS}/cognito/`),
      gcp: p('Identity Platform', `${GCP}/identity-platform/docs`),
      azure: p('Microsoft Entra External ID', 'https://learn.microsoft.com/entra/external-id/'),
      oci: p('OCI IAM (dominios de identidad)', `${OCI}/Content/Identity/home.htm`),
    } }),
  secrets: info('Caja fuerte para contraseñas, claves y certificados, que la aplicación pide cuando los necesita.',
    ['Sacar las credenciales del código y de la imagen', 'Cambiar una clave sin volver a desplegar', 'Saber quién leyó cada secreto'],
    { providers: {
      aws: p('AWS Secrets Manager', `${AWS}/secretsmanager/`),
      gcp: p('Secret Manager', `${GCP}/secret-manager/docs`),
      azure: p('Azure Key Vault', `${AZURE}/key-vault/`),
      oci: p('OCI Vault', `${OCI}/Content/KeyManagement/home.htm`),
    } }),
  vault: info('Gestor de secretos de código abierto que funciona igual en cualquier nube.',
    ['Secretos en entornos con varias nubes', 'Credenciales temporales que caducan solas'],
    { product: p('HashiCorp Vault', 'https://developer.hashicorp.com/vault/docs') }),
};

/** Texto en el idioma pedido; si aún no está traducido, en español. */
export function localized(text: Localized, lang: keyof Localized = 'es'): string {
  return text[lang] ?? text.es;
}

/** Todos los enlaces de documentación, para comprobarlos. */
export function serviceDocLinks(): { type: string; provider: CloudProviderId | 'product'; name: string; docs: string }[] {
  return Object.entries(SERVICE_INFO).flatMap(([type, entry]) => [
    ...Object.entries(entry.providers ?? {}).map(([provider, value]) => ({ type, provider: provider as CloudProviderId, name: value.name, docs: value.docs })),
    ...(entry.product ? [{ type, provider: 'product' as const, name: entry.product.name, docs: entry.product.docs }] : []),
  ]);
}
