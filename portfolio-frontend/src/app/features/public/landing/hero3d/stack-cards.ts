import type { Localized } from '../../../../core/i18n/language.service';
import type { TechIconKey } from '../../../../shared/ui/tech-icons';

/**
 * Ficha de cada tecnología del globo del hero, «tipo carta»: categoría, para qué sirve y dónde está.
 * `where`: `platform` = esta plataforma la usa de verdad; `studio` = es una pieza que se puede
 * dibujar en el Estudio de arquitectura (no se afirma que la plataforma la use). No inventar usos.
 */
export interface StackCard {
  category: Localized;
  about: Localized;
  where: 'platform' | 'studio';
}

const BACKEND = { en: 'Backend', es: 'Backend' };
const FRONTEND = { en: 'Frontend', es: 'Frontend' };
const DATA = { en: 'Data', es: 'Datos' };
const AI = { en: 'AI', es: 'IA' };
const DEVOPS = { en: 'DevOps', es: 'DevOps' };
const SECURITY = { en: 'Security', es: 'Seguridad' };
const OBSERVABILITY = { en: 'Observability', es: 'Observabilidad' };
const MESSAGING = { en: 'Messaging', es: 'Mensajería' };
const CLOUD = { en: 'Cloud', es: 'Cloud' };
const COMPUTE = { en: 'Compute', es: 'Cómputo' };
const SERVERLESS = { en: 'Serverless', es: 'Serverless' };
const EDGE = { en: 'Edge & APIs', es: 'Borde y APIs' };

const card = (category: Localized, en: string, es: string, where: StackCard['where'] = 'studio'): StackCard => ({ category, about: { en, es }, where });

export const STACK_CARDS: Partial<Record<TechIconKey, StackCard>> = {
  java: card(BACKEND, 'Typed, fast and battle-tested: the language of the whole backend.', 'Tipado, rápido y probado en batalla: el lenguaje de todo el backend.', 'platform'),
  spring: card(BACKEND, 'Hexagonal REST API with security, caching and resilience built in.', 'API REST hexagonal con seguridad, caché y resiliencia de serie.', 'platform'),
  angular: card(FRONTEND, 'Standalone components and signals for a fast, accessible UI.', 'Componentes standalone y signals para una interfaz rápida y accesible.', 'platform'),
  postgresql: card(DATA, 'Source of truth, plus pgvector for semantic search.', 'Fuente de verdad, y pgvector para la búsqueda semántica.', 'platform'),
  redis: card(DATA, 'Best-effort cache and atomic rate limiting with Lua.', 'Caché best-effort y límites de peticiones atómicos con Lua.', 'platform'),
  gemini: card(AI, 'Embeddings and answers with citations, behind a circuit breaker.', 'Embeddings y respuestas con citas, tras un circuit breaker.', 'platform'),
  docker: card(DEVOPS, 'Same image from CI to production, signed and scanned.', 'La misma imagen de la CI a producción, firmada y escaneada.', 'platform'),
  kubernetes: card(COMPUTE, 'Orchestrate containers that scale and heal themselves.', 'Orquesta contenedores que escalan y se recuperan solos.'),
  terraform: card(DEVOPS, 'Infrastructure as code: reviewable, repeatable environments.', 'Infraestructura como código: entornos revisables y repetibles.', 'platform'),
  githubActions: card(DEVOPS, 'CI/CD with a single gate: tests, scans and deploys.', 'CI/CD con una sola puerta: tests, escaneos y despliegues.', 'platform'),
  github: card(DEVOPS, 'Code, reviews and pull requests for every change.', 'Código, revisiones y pull requests para cada cambio.', 'platform'),
  cloudflare: card(EDGE, 'Edge hosting and CDN for the frontend.', 'Hosting en el borde y CDN para el frontend.', 'platform'),
  caddy: card(EDGE, 'Reverse proxy with automatic HTTPS in front of the API.', 'Proxy inverso con HTTPS automático delante de la API.', 'platform'),
  neon: card(DATA, 'Serverless PostgreSQL for the cloud environment.', 'PostgreSQL serverless para el entorno en la nube.', 'platform'),
  upstash: card(DATA, 'Serverless Redis for cache and limits in the cloud.', 'Redis serverless para caché y límites en la nube.', 'platform'),
  tailwind: card(FRONTEND, 'Design tokens turned into utilities: one visual language.', 'Tokens de diseño convertidos en utilidades: un solo lenguaje visual.', 'platform'),
  jwt: card(SECURITY, 'Stateless sessions with roles and permissions.', 'Sesiones sin estado con roles y permisos.', 'platform'),
  opentelemetry: card(OBSERVABILITY, 'Vendor-neutral traces, metrics and logs.', 'Trazas, métricas y logs sin atarse a un proveedor.'),
  prometheus: card(OBSERVABILITY, 'Metrics and alerts to see problems before users do.', 'Métricas y alertas para ver los problemas antes que el usuario.'),
  kafka: card(MESSAGING, 'Event streaming that decouples services at scale.', 'Streaming de eventos que desacopla servicios a escala.'),
  aws: card(CLOUD, 'The broadest cloud catalog, drawn in the Studio.', 'El catálogo de nube más amplio, dibujable en el Estudio.'),
  awsEks: card(COMPUTE, 'Managed Kubernetes on AWS.', 'Kubernetes gestionado en AWS.'),
  awsLambda: card(SERVERLESS, 'Run code per event, pay per invocation.', 'Código por evento, pagando por invocación.'),
  awsRds: card(DATA, 'Managed relational databases with backups and failover.', 'Bases relacionales gestionadas con copias y failover.'),
  awsAurora: card(DATA, 'High-performance PostgreSQL-compatible database.', 'Base de datos compatible con PostgreSQL de alto rendimiento.'),
  awsElastiCache: card(DATA, 'Managed in-memory cache.', 'Caché en memoria gestionada.'),
  awsApiGateway: card(EDGE, 'Publish, secure and throttle APIs.', 'Publica, protege y limita APIs.'),
  awsSqs: card(MESSAGING, 'Durable queues to absorb traffic spikes.', 'Colas duraderas para absorber picos de tráfico.'),
  awsCloudFront: card(EDGE, 'Global CDN close to every user.', 'CDN global cerca de cada usuario.'),
  awsBedrock: card(AI, 'Managed foundation models behind an API.', 'Modelos fundacionales gestionados tras una API.'),
  azure: card(CLOUD, 'Microsoft cloud, drawn in the Studio.', 'La nube de Microsoft, dibujable en el Estudio.'),
  azAks: card(COMPUTE, 'Managed Kubernetes on Azure.', 'Kubernetes gestionado en Azure.'),
  azContainerApps: card(SERVERLESS, 'Serverless containers that scale to zero.', 'Contenedores serverless que escalan a cero.'),
  azFunctions: card(SERVERLESS, 'Event-driven functions on Azure.', 'Funciones dirigidas por eventos en Azure.'),
  azPostgresql: card(DATA, 'Managed PostgreSQL on Azure.', 'PostgreSQL gestionado en Azure.'),
  azCosmosDb: card(DATA, 'Globally distributed multi-model database.', 'Base multimodelo distribuida globalmente.'),
  azApiManagement: card(EDGE, 'Gateway, policies and developer portal for APIs.', 'Gateway, políticas y portal de desarrolladores para APIs.'),
  azServiceBus: card(MESSAGING, 'Enterprise queues and topics.', 'Colas y temas empresariales.'),
  azFrontDoor: card(EDGE, 'Global entry point with CDN and WAF.', 'Punto de entrada global con CDN y WAF.'),
  azOpenAi: card(AI, 'OpenAI models with Azure security and quotas.', 'Modelos de OpenAI con la seguridad y cuotas de Azure.'),
  gcp: card(CLOUD, 'Google cloud, drawn in the Studio.', 'La nube de Google, dibujable en el Estudio.'),
  gcpGke: card(COMPUTE, 'Managed Kubernetes on Google Cloud.', 'Kubernetes gestionado en Google Cloud.'),
  gcpCloudRun: card(SERVERLESS, 'Containers from zero to scale, per request.', 'Contenedores de cero a escala, por petición.'),
  gcpCloudSql: card(DATA, 'Managed PostgreSQL and MySQL.', 'PostgreSQL y MySQL gestionados.'),
  gcpAlloyDb: card(DATA, 'PostgreSQL-compatible for demanding workloads.', 'Compatible con PostgreSQL para cargas exigentes.'),
  gcpSpanner: card(DATA, 'Relational database that scales globally.', 'Base relacional que escala globalmente.'),
  gcpPubSub: card(MESSAGING, 'Global event delivery between services.', 'Entrega global de eventos entre servicios.'),
  bigquery: card(DATA, 'Serverless analytics over huge datasets.', 'Analítica serverless sobre datos enormes.'),
  gcpApigee: card(EDGE, 'Enterprise API management.', 'Gestión de APIs empresarial.'),
  gcpVertexAi: card(AI, 'Train, deploy and serve AI models.', 'Entrena, despliega y sirve modelos de IA.'),
  oci: card(CLOUD, 'Oracle cloud, available in the Studio.', 'La nube de Oracle, disponible en el Estudio.'),
};
