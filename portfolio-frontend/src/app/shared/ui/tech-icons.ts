import {
  siAngular,
  siApachecassandra,
  siApachekafka,
  siCaddy,
  siDatadog,
  siDocker,
  siElasticsearch,
  siFirebase,
  siGithub,
  siGithubactions,
  siGooglebigquery,
  siGooglecloud,
  siGooglecloudstorage,
  siGooglepubsub,
  siGrafana,
  siJsonwebtokens,
  siKubernetes,
  siMongodb,
  siNeon,
  siOpenjdk,
  siOpentelemetry,
  siPostgresql,
  siPrometheus,
  siRabbitmq,
  siRedis,
  siSpringboot,
  siTailwindcss,
  siTerraform,
  siUpstash,
  siVault,
} from 'simple-icons';

export interface TechIcon {
  title: string;
  /** `false` si el trazado es un símbolo genérico y no el logo de la marca. */
  official: boolean;
  /** Trazado del logo para un viewBox de 24 × 24. Vacío en los iconos que son una imagen. */
  path: string;
  /**
   * Iconos oficiales a varios colores (AWS, Azure, Google Cloud): ruta del SVG original, sin modificar.
   * Se muestran como imagen, sin recolorear, recortar, girar ni deformar: así lo piden sus guías de uso.
   */
  image?: string;
  /** Nube a la que pertenece el servicio; sus eventos de traza son los de esa nube. */
  family?: CloudFamily;
  /** Color de marca tal como se muestra sobre fondo oscuro. */
  color: string;
}

export type CloudFamily = 'aws' | 'gcp' | 'azure';

export type TechIconKey =
  | 'java' | 'spring' | 'angular' | 'postgresql' | 'redis' | 'gemini' | 'docker' | 'cloudflare' | 'jwt'
  | 'github' | 'githubActions' | 'cloudflarePages' | 'caddy'
  | 'neon' | 'upstash' | 'tailwind' | 'terraform' | 'aws' | 'gcp' | 'azure' | 'kubernetes'
  | 'kafka' | 'rabbitmq' | 'vault' | 'elasticsearch'
  | 'mongodb' | 'cassandra' | 'prometheus' | 'grafana' | 'datadog' | 'opentelemetry'
  | 'gcpPubSub' | 'gcpStorage' | 'bigquery' | 'firebase'
  | 'awsCloudFront' | 'awsElb' | 'awsFargate' | 'awsRds' | 'awsElastiCache' | 'awsSecretsManager' | 'awsCloudWatch' | 'awsEcr'
  | 'awsEks' | 'awsEc2' | 'awsLambda' | 'awsDynamoDb' | 'awsKeyspaces' | 'awsRedshift' | 'awsMsk' | 'awsSqs' | 'awsSns'
  | 'awsApiGateway' | 'awsWaf' | 'awsRoute53' | 'awsS3' | 'awsCognito'
  | 'azFrontDoor' | 'azAppGateway' | 'azContainerApps' | 'azPostgresql' | 'azRedis' | 'azKeyVault' | 'azMonitor'
  | 'azContainerRegistry' | 'azAks' | 'azVm' | 'azFunctions' | 'azCosmosDb' | 'azCassandra' | 'azSynapse' | 'azEventHubs'
  | 'azServiceBus' | 'azEventGrid' | 'azApiManagement' | 'azWaf' | 'azDns' | 'azStorage' | 'azExternalId'
  | 'awsAppRunner' | 'awsAthena' | 'awsNeptune' | 'awsAurora' | 'awsBedrock' | 'awsFlink' | 'awsStepFunctions'
  | 'azAppService' | 'azStreamAnalytics' | 'azOpenAi' | 'azLogicApps'
  | 'gcpApigee' | 'gcpAlloyDb' | 'gcpSpanner' | 'gcpVertexAi' | 'gcpDataflow' | 'gcpArmor' | 'gcpCloudRun' | 'gcpCloudSql'
  | 'gcpGke' | 'gcpComputeEngine' | 'gcpAppEngine' | 'gcpWorkflows';

const WHITE = '#FFFFFF';

/** Símbolo genérico (un aro) para las marcas cuyo logo no se puede mostrar. No es el logo de nadie. */
const NEUTRAL_PATH = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z';

const AZURE_BLUE = '#0089D6';
const GOOGLE_BLUE = '#4285F4';

/**
 * Logos de Simple Icons: el trazado oficial de cada marca en un solo color. Son marcas
 * registradas de sus dueños y aquí solo identifican la tecnología usada.
 * - Java usa el logo de OpenJDK: el de Java no se distribuye por restricción de Oracle.
 * - Las marcas cuyo color oficial es demasiado oscuro para el fondo negro (OpenJDK, Angular,
 *   JWT, Kafka, Elasticsearch) se muestran en blanco, que es su versión para fondos oscuros.
 */
export const TECH_ICONS: Record<TechIconKey, TechIcon> = {
  java: icon(siOpenjdk, 'Java (OpenJDK)'),
  spring: icon(siSpringboot),
  angular: icon(siAngular),
  postgresql: icon(siPostgresql),
  redis: icon(siRedis),
  // Sin permiso escrito de la marca no se usa su logo (docs/brand-usage.md): símbolo neutro y el nombre al lado.
  gemini: neutral('Google Gemini'),
  docker: icon(siDocker),
  cloudflare: neutral('Cloudflare'),
  jwt: icon(siJsonwebtokens),
  github: icon(siGithub),
  githubActions: icon(siGithubactions, 'GitHub Actions'),
  cloudflarePages: neutral('Cloudflare Pages'),
  caddy: icon(siCaddy),
  neon: icon(siNeon),
  upstash: icon(siUpstash),
  tailwind: icon(siTailwindcss),
  terraform: icon(siTerraform),
  gcp: icon(siGooglecloud),
  kubernetes: icon(siKubernetes),
  kafka: icon(siApachekafka, 'Kafka'),
  rabbitmq: icon(siRabbitmq),
  vault: icon(siVault),
  elasticsearch: icon(siElasticsearch),
  mongodb: icon(siMongodb),
  cassandra: icon(siApachecassandra, 'Cassandra'),
  prometheus: icon(siPrometheus),
  grafana: icon(siGrafana),
  datadog: icon(siDatadog),
  opentelemetry: icon(siOpentelemetry),
  // Servicios de Google Cloud que tienen logo propio en Simple Icons.
  gcpPubSub: icon(siGooglepubsub),
  gcpStorage: icon(siGooglecloudstorage),
  bigquery: icon(siGooglebigquery),
  firebase: icon(siFirebase),
  // AWS y Azure no están en Simple Icons. Sus iconos salen de los paquetes oficiales
  // (AWS Architecture Icons y Azure Public Service Icons), copiados sin cambios en
  // `public/cloud-icons` (ver su README). El color solo se usa para el resplandor y los cables.
  aws: image('AWS', 'aws/aws-cloud.svg', '#FF9900', 'aws'),
  awsCloudFront: image('Amazon CloudFront', 'aws/cloudfront.svg', '#8C4FFF', 'aws'),
  awsElb: image('Elastic Load Balancing', 'aws/elastic-load-balancing.svg', '#8C4FFF', 'aws'),
  awsFargate: image('AWS Fargate', 'aws/fargate.svg', '#ED7100', 'aws'),
  awsRds: image('Amazon RDS', 'aws/rds.svg', '#C925D1', 'aws'),
  awsElastiCache: image('Amazon ElastiCache', 'aws/elasticache.svg', '#C925D1', 'aws'),
  awsSecretsManager: image('AWS Secrets Manager', 'aws/secrets-manager.svg', '#DD344C', 'aws'),
  awsCloudWatch: image('Amazon CloudWatch', 'aws/cloudwatch.svg', '#E7157B', 'aws'),
  awsEcr: image('Amazon ECR', 'aws/ecr.svg', '#ED7100', 'aws'),
  awsEks: image('Amazon EKS', 'aws/eks.svg', '#ED7100', 'aws'),
  awsEc2: image('Amazon EC2', 'aws/ec2.svg', '#ED7100', 'aws'),
  awsLambda: image('AWS Lambda', 'aws/lambda.svg', '#ED7100', 'aws'),
  awsDynamoDb: image('Amazon DynamoDB', 'aws/dynamodb.svg', '#C925D1', 'aws'),
  awsKeyspaces: image('Amazon Keyspaces', 'aws/keyspaces.svg', '#C925D1', 'aws'),
  awsRedshift: image('Amazon Redshift', 'aws/redshift.svg', '#8C4FFF', 'aws'),
  awsMsk: image('Amazon MSK', 'aws/msk.svg', '#8C4FFF', 'aws'),
  awsSqs: image('Amazon SQS', 'aws/sqs.svg', '#E7157B', 'aws'),
  awsSns: image('Amazon SNS', 'aws/sns.svg', '#E7157B', 'aws'),
  awsApiGateway: image('Amazon API Gateway', 'aws/api-gateway.svg', '#8C4FFF', 'aws'),
  awsWaf: image('AWS WAF', 'aws/waf.svg', '#DD344C', 'aws'),
  awsRoute53: image('Amazon Route 53', 'aws/route-53.svg', '#8C4FFF', 'aws'),
  awsS3: image('Amazon S3', 'aws/s3.svg', '#7AA116', 'aws'),
  awsCognito: image('Amazon Cognito', 'aws/cognito.svg', '#DD344C', 'aws'),
  azure: image('Azure', 'azure/azure.svg', AZURE_BLUE, 'azure'),
  azFrontDoor: image('Azure Front Door', 'azure/front-door.svg', '#50E6FF', 'azure'),
  azAppGateway: image('Application Gateway', 'azure/application-gateway.svg', '#76BC2D', 'azure'),
  azContainerApps: image('Container Apps', 'azure/container-apps.svg', '#32BEDD', 'azure'),
  azPostgresql: image('Azure Database for PostgreSQL', 'azure/postgresql.svg', AZURE_BLUE, 'azure'),
  azRedis: image('Azure Cache for Redis', 'azure/cache-redis.svg', AZURE_BLUE, 'azure'),
  azKeyVault: image('Key Vault', 'azure/key-vault.svg', '#FF9300', 'azure'),
  azMonitor: image('Azure Monitor', 'azure/monitor.svg', '#32BEDD', 'azure'),
  azContainerRegistry: image('Container Registry', 'azure/container-registry.svg', AZURE_BLUE, 'azure'),
  azAks: image('Azure Kubernetes Service', 'azure/aks.svg', '#B77AF4', 'azure'),
  azVm: image('Virtual Machines', 'azure/virtual-machine.svg', '#9CEBFF', 'azure'),
  azFunctions: image('Azure Functions', 'azure/functions.svg', '#1490DF', 'azure'),
  azCosmosDb: image('Azure Cosmos DB', 'azure/cosmos-db.svg', '#50E6FF', 'azure'),
  azCassandra: image('Managed Instance for Apache Cassandra', 'azure/managed-cassandra.svg', AZURE_BLUE, 'azure'),
  azSynapse: image('Azure Synapse Analytics', 'azure/synapse.svg', '#50E6FF', 'azure'),
  azEventHubs: image('Event Hubs', 'azure/event-hubs.svg', '#76BC2D', 'azure'),
  azServiceBus: image('Service Bus', 'azure/service-bus.svg', AZURE_BLUE, 'azure'),
  azEventGrid: image('Event Grid', 'azure/event-grid.svg', AZURE_BLUE, 'azure'),
  azApiManagement: image('API Management', 'azure/api-management.svg', '#198AB3', 'azure'),
  azWaf: image('Web Application Firewall', 'azure/waf.svg', '#E62323', 'azure'),
  azDns: image('Azure DNS', 'azure/dns.svg', '#5EA0EF', 'azure'),
  azStorage: image('Azure Storage', 'azure/storage.svg', '#37C2B1', 'azure'),
  azExternalId: image('Microsoft Entra External ID', 'azure/external-id.svg', AZURE_BLUE, 'azure'),
  awsAppRunner: image('AWS App Runner', 'aws/app-runner.svg', '#ED7100', 'aws'),
  awsAthena: image('Amazon Athena', 'aws/athena.svg', '#8C4FFF', 'aws'),
  awsNeptune: image('Amazon Neptune', 'aws/neptune.svg', '#C925D1', 'aws'),
  awsAurora: image('Amazon Aurora', 'aws/aurora.svg', '#C925D1', 'aws'),
  awsBedrock: image('Amazon Bedrock', 'aws/bedrock.svg', '#01A88D', 'aws'),
  awsFlink: image('Amazon Managed Service for Apache Flink', 'aws/managed-flink.svg', '#8C4FFF', 'aws'),
  awsStepFunctions: image('AWS Step Functions', 'aws/step-functions.svg', '#E7157B', 'aws'),
  azAppService: image('App Service', 'azure/app-service.svg', AZURE_BLUE, 'azure'),
  azStreamAnalytics: image('Stream Analytics', 'azure/stream-analytics.svg', AZURE_BLUE, 'azure'),
  azOpenAi: image('Azure OpenAI', 'azure/openai.svg', AZURE_BLUE, 'azure'),
  azLogicApps: image('Logic Apps', 'azure/logic-apps.svg', AZURE_BLUE, 'azure'),
  // Google Cloud: iconos oficiales de producto (cloud.google.com/icons) para lo que Simple Icons no cubre.
  gcpApigee: image('Apigee', 'gcp/apigee.svg', GOOGLE_BLUE, 'gcp'),
  gcpAlloyDb: image('AlloyDB', 'gcp/alloydb.svg', GOOGLE_BLUE, 'gcp'),
  gcpSpanner: image('Cloud Spanner', 'gcp/spanner.svg', GOOGLE_BLUE, 'gcp'),
  gcpVertexAi: image('Vertex AI', 'gcp/vertex-ai.svg', GOOGLE_BLUE, 'gcp'),
  gcpDataflow: image('Dataflow', 'gcp/dataflow.svg', GOOGLE_BLUE, 'gcp'),
  gcpArmor: image('Cloud Armor', 'gcp/cloud-armor.svg', GOOGLE_BLUE, 'gcp'),
  gcpCloudRun: image('Cloud Run', 'gcp/cloud-run.svg', GOOGLE_BLUE, 'gcp'),
  gcpCloudSql: image('Cloud SQL', 'gcp/cloud-sql.svg', GOOGLE_BLUE, 'gcp'),
  gcpGke: image('Google Kubernetes Engine', 'gcp/gke.svg', GOOGLE_BLUE, 'gcp'),
  gcpComputeEngine: image('Compute Engine', 'gcp/compute-engine.svg', GOOGLE_BLUE, 'gcp'),
  gcpAppEngine: image('App Engine', 'gcp/app-engine.svg', GOOGLE_BLUE, 'gcp'),
  gcpWorkflows: image('Workflows', 'gcp/workflows.svg', GOOGLE_BLUE, 'gcp'),
};

function image(title: string, file: string, color: string, family: CloudFamily): TechIcon {
  return { title, official: true, path: '', image: `cloud-icons/${file}`, color, family };
}

function neutral(title: string): TechIcon {
  return { title, official: false, path: NEUTRAL_PATH, color: '#A1A1AA' };
}

function icon(source: { title: string; hex: string; path: string }, title = source.title): TechIcon {
  return { title, official: true, path: source.path, color: isTooDarkForBlack(source.hex) ? WHITE : `#${source.hex}` };
}

function isTooDarkForBlack(hex: string): boolean {
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 75;
}

// El orden importa: lo más específico primero ("pgvector" antes que nada genérico).
const NAME_PATTERNS: [pattern: RegExp, key: TechIconKey][] = [
  [/spring/i, 'spring'],
  [/angular/i, 'angular'],
  [/postgres|pgvector/i, 'postgresql'],
  [/redis/i, 'redis'],
  [/gemini/i, 'gemini'],
  [/docker/i, 'docker'],
  [/cloudflare/i, 'cloudflare'],
  [/jwt|json web token/i, 'jwt'],
  [/tailwind/i, 'tailwind'],
  [/terraform/i, 'terraform'],
  [/neon/i, 'neon'],
  [/upstash/i, 'upstash'],
  [/kubernetes|\bk8s\b/i, 'kubernetes'],
  [/\baws\b|amazon web services/i, 'aws'],
  [/\bgcp\b|google cloud/i, 'gcp'],
  [/azure/i, 'azure'],
  [/\bjava\b|jdk/i, 'java'],
];

/** Clave de la tecnología que corresponde a un nombre del CMS, si se reconoce. */
export function techKeyFor(name: string | undefined): TechIconKey | null {
  return NAME_PATTERNS.find(([pattern]) => pattern.test(name ?? ''))?.[1] ?? null;
}

/** Logo que corresponde al nombre de una tecnología del CMS, si se reconoce. */
export function techIconFor(name: string | undefined): TechIcon | null {
  const key = techKeyFor(name);
  return key ? TECH_ICONS[key] : null;
}
