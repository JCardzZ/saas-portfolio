import { TechIconKey } from '../../../shared/ui/tech-icons';
import { SystemEventStep } from '../data/system-events.service';

export type CloudProviderId = 'aws' | 'gcp' | 'azure';
export type PerProvider = Record<CloudProviderId, string>;

/**
 * Referencia a un logo: una tecnología concreta, `provider` (el de la nube elegida), o un
 * mapa por nube para los servicios que tienen logo propio solo en alguna de ellas
 * (p. ej. Pub/Sub en GCP); `default` cubre las demás.
 */
export type IconRef =
  | TechIconKey
  | 'provider'
  | ({ default: TechIconKey | 'provider' } & Partial<Record<CloudProviderId, TechIconKey>>);

export function resolveIcon(ref: IconRef, provider: CloudProviderId): TechIconKey {
  const key = typeof ref === 'string' ? ref : (ref[provider] ?? ref.default);
  return key === 'provider' ? provider : key;
}

/** Valor de un campo que puede ser único o distinto en cada nube. */
export function forProvider(value: string | PerProvider, provider: CloudProviderId): string {
  return typeof value === 'string' ? value : value[provider];
}

/**
 * Dónde vive un nodo. Determina en qué parte del lienzo cae y qué puede hablar con qué:
 * - `outside`: Internet (visitantes, borde);
 * - `global`: dentro de la nube pero fuera de la red privada (almacenamiento estático, CDN);
 * - `public` / `compute` / `data`: las tres subredes de la red privada;
 * - `managed`: servicios gestionados de la nube;
 * - `external`: servicios de terceros.
 */
export type ZoneId = 'outside' | 'global' | 'public' | 'compute' | 'data' | 'managed' | 'external';

export interface CloudProvider {
  id: CloudProviderId;
  name: string;
  /** Rótulo del recuadro exterior del diagrama. */
  boundary: string;
  /** Nombre de la red privada en ese proveedor y su recurso de Terraform. */
  network: string;
  networkResource: string;
}

/** Pieza del diagrama. `service` es el nombre del servicio que la cubre en cada nube. */
export interface CloudNode {
  id: string;
  /** Clase de pieza (p. ej. `secrets`); varias instancias pueden compartirla. */
  type: string;
  x: number;
  y: number;
  zone: ZoneId;
  role: string;
  service: string | PerProvider;
  icon: IconRef | null;
  /** Tipo de recurso de Terraform que la aprovisiona; `null` si queda fuera de Terraform. */
  terraform: string | PerProvider | null;
  why: string;
  /** Añadida por el visitante en el modo de edición. */
  custom?: boolean;
  /** Nombre que le ha puesto el visitante; sin él se usa el del servicio. */
  name?: string;
  /** Propiedades editables del recurso. */
  props?: NodeProps;
}

export interface NodeProps {
  /** Capacidad o tipo de instancia, p. ej. `t3.medium` o `db.m5.large`. */
  instance?: string;
  /** Puertos, separados por comas. */
  ports?: string;
  /** Variables de entorno, una por línea con el formato `CLAVE=valor`. */
  env?: string;
}

/** Qué lleva una conexión de datos. Una conexión sin tipo es tráfico de peticiones, como siempre. */
export type LinkKind = 'CDC_STREAM' | 'EVENT_BUS' | 'ANALYTICS_SINK' | 'REPLICATION';

export const LINK_KINDS: { kind: LinkKind; name: string; hint: string }[] = [
  { kind: 'CDC_STREAM', name: 'Flujo CDC', hint: 'cambios de una base de datos, leídos de su registro de transacciones' },
  { kind: 'EVENT_BUS', name: 'Bus de eventos', hint: 'eventos publicados para quien quiera consumirlos' },
  { kind: 'ANALYTICS_SINK', name: 'Carga analítica', hint: 'datos que terminan en un almacén o en un panel' },
  { kind: 'REPLICATION', name: 'Replicación', hint: 'copia de los datos entre réplicas o regiones' },
];

export interface CloudLink {
  from: string;
  to: string;
  label?: string;
  kind?: LinkKind;
}

export const CANVAS_WIDTH = 1110;
export const CANVAS_HEIGHT = 716;
export const NODE_WIDTH = 128;
export const NODE_HEIGHT = 72;

export const CLOUD_PROVIDERS: CloudProvider[] = [
  { id: 'aws', name: 'AWS', boundary: 'AWS Cloud · región', network: 'VPC', networkResource: 'aws_vpc' },
  { id: 'gcp', name: 'GCP', boundary: 'Google Cloud · región', network: 'VPC', networkResource: 'google_compute_network' },
  { id: 'azure', name: 'Azure', boundary: 'Azure · región', network: 'VNet', networkResource: 'azurerm_virtual_network' },
];

/**
 * Arquitectura de referencia de ESTA plataforma en cada nube: qué servicio cubriría cada
 * pieza y en qué zona de red viviría. Es un mapa de despliegue, no un historial de proyectos;
 * hoy la plataforma está preparada para Neon (PostgreSQL) y Upstash (Redis).
 */
export const CLOUD_NODES: CloudNode[] = [
  { id: 'users', type: 'users', x: 64, y: 250, zone: 'outside', role: 'Navegador', service: 'Visitantes', icon: null, terraform: null, why: 'Entran por HTTPS; nunca hablan directamente con la nube.' },
  { id: 'edge', type: 'edge', x: 196, y: 250, zone: 'outside', role: 'CDN · WAF · DNS', service: 'Cloudflare', icon: 'cloudflare', terraform: 'cloudflare_record', why: 'Borde común a las tres nubes: caché, protección y la IP real del visitante.' },
  {
    id: 'static', type: 'static', x: 402, y: 95, zone: 'global', role: 'Frontend Angular', icon: { default: 'provider', gcp: 'gcpStorage', aws: 'awsCloudFront', azure: 'azFrontDoor' },
    service: { aws: 'S3 + CloudFront', gcp: 'Cloud Storage + CDN', azure: 'Storage + Front Door' },
    terraform: { aws: 'aws_cloudfront_distribution', gcp: 'google_storage_bucket', azure: 'azurerm_cdn_frontdoor_profile' },
    why: 'El build estático del frontend, servido desde almacenamiento de objetos.',
  },
  {
    id: 'lb', type: 'lb', x: 402, y: 250, zone: 'public', role: 'Balanceador', icon: { default: 'provider', aws: 'awsElb', azure: 'azAppGateway' },
    service: { aws: 'Application LB', gcp: 'Cloud Load Balancing', azure: 'Application Gateway' },
    terraform: { aws: 'aws_lb', gcp: 'google_compute_global_forwarding_rule', azure: 'azurerm_application_gateway' },
    why: 'Único punto de entrada a la red privada; termina TLS y reparte entre réplicas.',
  },
  {
    id: 'api', type: 'containers', x: 556, y: 250, zone: 'compute', role: 'API Spring Boot', icon: { default: 'docker', aws: 'awsFargate', gcp: 'gcpCloudRun', azure: 'azContainerApps' },
    service: { aws: 'ECS Fargate', gcp: 'Cloud Run', azure: 'Container Apps' },
    terraform: { aws: 'aws_ecs_service', gcp: 'google_cloud_run_v2_service', azure: 'azurerm_container_app' },
    why: 'La imagen Docker del backend, sin gestionar servidores. A mayor escala: EKS, GKE o AKS.',
  },
  {
    id: 'postgres', type: 'postgres', x: 710, y: 250, zone: 'data', role: 'PostgreSQL + pgvector', icon: { default: 'postgresql', aws: 'awsRds', gcp: 'gcpCloudSql', azure: 'azPostgresql' },
    service: { aws: 'RDS PostgreSQL', gcp: 'Cloud SQL', azure: 'PostgreSQL Flexible' },
    terraform: { aws: 'aws_db_instance', gcp: 'google_sql_database_instance', azure: 'azurerm_postgresql_flexible_server' },
    why: 'Datos del CMS y el índice vectorial del asistente, sin acceso desde Internet.',
  },
  {
    id: 'redis', type: 'redis', x: 710, y: 340, zone: 'data', role: 'Redis', icon: { default: 'redis', aws: 'awsElastiCache', azure: 'azRedis' },
    service: { aws: 'ElastiCache', gcp: 'Memorystore', azure: 'Cache for Redis' },
    terraform: { aws: 'aws_elasticache_replication_group', gcp: 'google_redis_instance', azure: 'azurerm_redis_cache' },
    why: 'Caché cache-aside y contadores de límites; si cae, la API sigue respondiendo.',
  },
  {
    id: 'secrets', type: 'secrets', x: 865, y: 215, zone: 'managed', role: 'Secretos', icon: { default: 'provider', aws: 'awsSecretsManager', azure: 'azKeyVault' },
    service: { aws: 'Secrets Manager', gcp: 'Secret Manager', azure: 'Key Vault' },
    terraform: { aws: 'aws_secretsmanager_secret', gcp: 'google_secret_manager_secret', azure: 'azurerm_key_vault' },
    why: 'JWT_SECRET, credenciales de base de datos y la clave de Gemini, fuera de la imagen.',
  },
  {
    id: 'observability', type: 'native-monitoring', x: 865, y: 300, zone: 'managed', role: 'Logs y métricas', icon: { default: 'provider', aws: 'awsCloudWatch', azure: 'azMonitor' },
    service: { aws: 'CloudWatch', gcp: 'Cloud Monitoring', azure: 'Azure Monitor' },
    terraform: { aws: 'aws_cloudwatch_log_group', gcp: 'google_monitoring_alert_policy', azure: 'azurerm_log_analytics_workspace' },
    why: 'Recoge los avisos de fail-open y las transiciones del circuit breaker.',
  },
  {
    id: 'registry', type: 'registry', x: 865, y: 385, zone: 'managed', role: 'Registro de imágenes', icon: { default: 'docker', aws: 'awsEcr', azure: 'azContainerRegistry' },
    service: { aws: 'ECR', gcp: 'Artifact Registry', azure: 'Container Registry' },
    terraform: { aws: 'aws_ecr_repository', gcp: 'google_artifact_registry_repository', azure: 'azurerm_container_registry' },
    why: 'Guarda la imagen del backend que despliega la capa de cómputo.',
  },
  { id: 'gemini', type: 'gemini', x: 556, y: 668, zone: 'external', role: 'Servicio externo', service: 'Gemini API', icon: 'gemini', terraform: null, why: 'Embeddings y respuestas del asistente; la API sale a Internet solo para esto.' },
  { id: 'cicd', type: 'cicd', x: 865, y: 668, zone: 'external', role: 'CI/CD', service: 'Terraform + Docker', icon: 'terraform', terraform: null, why: 'La infraestructura se define como código y la imagen se publica en el registro.' },
];

/** Conexiones de partida. El trazado se calcula a partir de la posición de los nodos, que se pueden mover. */
export const CLOUD_LINKS: CloudLink[] = [
  { from: 'users', to: 'edge' },
  { from: 'edge', to: 'static', label: 'estáticos' },
  { from: 'edge', to: 'lb', label: '/v1' },
  { from: 'lb', to: 'api' },
  { from: 'api', to: 'postgres' },
  { from: 'api', to: 'redis' },
  { from: 'api', to: 'gemini', label: 'salida NAT' },
  { from: 'cicd', to: 'registry' },
];

/** Huecos de cada zona, en orden de preferencia, donde cae un servicio añadido con un clic. */
const ROWS = [250, 340, 430, 520];
export const ZONE_SLOTS: Record<ZoneId, [x: number, y: number][]> = {
  outside: [[64, 250], [196, 250], [196, 345], [64, 345], [196, 440], [64, 440], [196, 95], [64, 95], [196, 535], [64, 535]],
  global: [[402, 95], [556, 95], [710, 95], [865, 95], [1005, 95]],
  public: ROWS.map((y) => [402, y]),
  compute: ROWS.map((y) => [556, y]),
  data: ROWS.map((y) => [710, y]),
  managed: [865, 1005].flatMap((x) => [215, 300, 385, 470, 555].map((y): [number, number] => [x, y])),
  external: [[556, 668], [865, 668], [402, 668], [710, 668], [1005, 668], [196, 640], [64, 640]],
};

/** Registro SIMULADO de un aprovisionamiento con Terraform en cada nube, para el inspector de traza. */
export const PROVISIONING_LOG: Record<CloudProviderId, SystemEventStep[]> = {
  aws: [
    ['info', 'Terraform Plan', 'AWS · 14 to add, 0 to change, 0 to destroy'],
    ['ok', 'AWS VPC Ready', '2 subredes privadas · 2 zonas'],
    ['ok', 'AWS RDS Ready', 'PostgreSQL 16 + pgvector'],
    ['ok', 'AWS ECS Fargate Ready', 'contenedor Docker · 2 tareas'],
    ['ok', 'Cloudflare Edge Cache 100%', 'AWS · origen CloudFront'],
    ['ok', 'Terraform Apply', 'AWS · completado'],
  ],
  gcp: [
    ['info', 'Terraform Plan', 'GCP · 11 to add, 0 to change, 0 to destroy'],
    ['ok', 'GCP VPC Ready', 'Private Service Connect'],
    ['ok', 'GCP Cloud SQL Ready', 'PostgreSQL 16 + pgvector'],
    ['ok', 'GCP Cloud Run Ready', 'contenedor Docker · 0 → N instancias'],
    ['ok', 'Cloudflare Edge Cache 100%', 'GCP · origen Cloud CDN'],
    ['ok', 'Terraform Apply', 'GCP · completado'],
  ],
  azure: [
    ['info', 'Terraform Plan', 'Azure · 13 to add, 0 to change, 0 to destroy'],
    ['ok', 'Azure VNet Ready', 'Private Link'],
    ['ok', 'Azure PostgreSQL Ready', 'Flexible Server 16 + pgvector'],
    ['ok', 'Azure Container Apps Ready', 'contenedor Docker · 2 réplicas'],
    ['ok', 'Cloudflare Edge Cache 100%', 'Azure · origen Front Door'],
    ['ok', 'Terraform Apply', 'Azure · completado'],
  ],
};
