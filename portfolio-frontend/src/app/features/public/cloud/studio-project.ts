import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { CatalogItem, SERVICE_CATALOG } from './cloud-catalog.data';
import { withOracle } from './cloud-oracle.data';
import { SystemDesign, parseSystemDesign } from './system/system-design';
import {
  BASE_PROVIDER_IDS, CANVAS_HEIGHT, CANVAS_WIDTH, CLOUD_LINKS, CLOUD_NODES, CLOUD_PROVIDERS, CloudLink, CloudNode, CloudProviderId, IconRef, LINK_KINDS, LinkKind,
  NODE_HEIGHT, PerProvider, ZoneId,
} from './cloud-topology.data';

// ---------- Zonas ----------

export type ZoneKind = 'cloud' | 'region' | 'vpc' | 'public' | 'private';

/** Recuadro del lienzo que agrupa nodos: la nube, una red, una subred... */
export interface StudioZone {
  id: string;
  kind: ZoneKind;
  /** Zona de red que adquiere un nodo al quedar dentro; `null` si el recuadro solo agrupa. */
  role: ZoneId | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rótulo propio; sin él se usa el de su clase en la nube activa. */
  label?: string;
}

export const ZONE_KINDS: { kind: Exclude<ZoneKind, 'cloud'>; name: string; role: ZoneId | null }[] = [
  { kind: 'vpc', name: 'VPC / red privada', role: null },
  { kind: 'public', name: 'Subred pública', role: 'public' },
  { kind: 'private', name: 'Subred privada', role: 'compute' },
  { kind: 'region', name: 'Región adicional (multirregión)', role: null },
];

export const ZONE_MIN_SIZE = 90;

/** Zonas de la arquitectura de referencia: la nube, su red privada y las tres subredes. */
export const BASE_ZONES: StudioZone[] = [
  { id: 'cloud', kind: 'cloud', role: null, x: 290, y: 30, w: 800, h: 586 },
  { id: 'network', kind: 'vpc', role: null, x: 320, y: 150, w: 472, h: 450 },
  { id: 'subnet-public', kind: 'public', role: 'public', x: 332, y: 182, w: 140, h: 406 },
  { id: 'subnet-app', kind: 'private', role: 'compute', x: 486, y: 182, w: 140, h: 406 },
  { id: 'subnet-data', kind: 'private', role: 'data', x: 640, y: 182, w: 140, h: 406 },
];

export function zoneLabel(zone: StudioZone, provider: CloudProviderId): string {
  if (zone.label) {
    return zone.label;
  }
  const cloud = CLOUD_PROVIDERS.find((candidate) => candidate.id === provider)!;
  switch (zone.kind) {
    case 'cloud': return cloud.boundary;
    case 'region': return 'Región adicional';
    case 'vpc': return `${cloud.network} · red privada`;
    case 'public': return 'Subred pública';
    case 'private': return zone.role === 'data' ? 'Subred privada · datos' : 'Subred privada · aplicación';
  }
}

function contains(zone: StudioZone, x: number, y: number): boolean {
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}

/** El recuadro más pequeño que contiene el punto. */
export function zoneAt(zones: StudioZone[], x: number, y: number): StudioZone | null {
  return zones.filter((zone) => contains(zone, x, y)).sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
}

/**
 * Zona de red que le corresponde a un nodo por el sitio donde está: la de la subred que lo
 * contiene; dentro de una red sin subred, privada; dentro de la nube pero fuera de la red,
 * servicio gestionado; y fuera de todo, Internet o un tercero según lo que ya fuera.
 */
export function roleAt(zones: StudioZone[], x: number, y: number, current: ZoneId): ZoneId {
  const zone = zoneAt(zones, x, y);
  if (!zone) {
    return current === 'outside' || current === 'external' ? current : 'external';
  }
  if (zone.role) {
    return zone.role;
  }
  if (zone.kind === 'vpc') {
    return 'compute';
  }
  return current === 'global' || current === 'managed' ? current : 'managed';
}

export type ZoneCorner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Redimensiona un recuadro tirando de una esquina: la esquina opuesta se queda donde estaba.
 * Ni más pequeño que el mínimo ni fuera del lienzo.
 */
export function resizeZone(origin: StudioZone, corner: ZoneCorner, dx: number, dy: number): StudioZone {
  const right = origin.x + origin.w;
  const bottom = origin.y + origin.h;
  let { x, y, w, h } = origin;
  if (corner.endsWith('e')) {
    w = Math.min(CANVAS_WIDTH - origin.x, Math.max(ZONE_MIN_SIZE, origin.w + dx));
  } else {
    x = Math.max(0, Math.min(right - ZONE_MIN_SIZE, origin.x + dx));
    w = right - x;
  }
  if (corner.startsWith('s')) {
    h = Math.min(CANVAS_HEIGHT - origin.y, Math.max(ZONE_MIN_SIZE, origin.h + dy));
  } else {
    y = Math.max(0, Math.min(bottom - ZONE_MIN_SIZE, origin.y + dy));
    h = bottom - y;
  }
  return { ...origin, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Zonas contenidas por completo en otra: se mueven con ella. */
export function zonesInside(zones: StudioZone[], outer: StudioZone): StudioZone[] {
  return zones.filter((zone) => zone.id !== outer.id
    && zone.x >= outer.x && zone.y >= outer.y && zone.x + zone.w <= outer.x + outer.w && zone.y + zone.h <= outer.y + outer.h);
}

/** Hueco para un nodo nuevo dentro del recuadro que da esa zona de red, si hay alguno dibujado. */
export function slotsIn(zones: StudioZone[], role: ZoneId): [x: number, y: number][] {
  return zones.filter((zone) => zone.role === role).flatMap((zone) => {
    const slots: [number, number][] = [];
    for (let y = zone.y + 68; y + NODE_HEIGHT / 2 <= zone.y + zone.h; y += 90) {
      slots.push([Math.round(zone.x + zone.w / 2), y]);
    }
    return slots;
  });
}

// ---------- Proyecto ----------

export interface StudioProject {
  provider: CloudProviderId;
  nodes: CloudNode[];
  links: CloudLink[];
  zones: StudioZone[];
  /** Diseño de sistema: lo que va encima de la infraestructura. Sin él, el proyecto es solo el lienzo. */
  system?: SystemDesign;
}

export function referenceProject(): StudioProject {
  return { provider: 'aws', nodes: structuredClone(CLOUD_NODES), links: structuredClone(CLOUD_LINKS), zones: structuredClone(BASE_ZONES) };
}

/** Nombre que se muestra de un nodo: el que le haya puesto el visitante o el del servicio, numerado si se repite. */
export function nodeLabel(node: CloudNode, nodes: CloudNode[], service: string): string {
  if (node.name?.trim()) {
    return node.name.trim();
  }
  const twins = nodes.filter((candidate) => candidate.type === node.type && !candidate.name?.trim());
  const position = twins.findIndex((candidate) => candidate.id === node.id);
  return position > 0 ? `${service} #${position + 1}` : service;
}

// ---------- Plantillas ----------

export interface StudioPreset {
  id: string;
  name: string;
  summary: string;
  /** Texto largo, para la ficha del proyecto en el backend. */
  description?: string;
  build: () => StudioProject;
}

const CATALOG: CatalogItem[] = SERVICE_CATALOG.flatMap((category) => category.items);
/** Una pieza de la arquitectura de referencia, por su id. */
export const BASE = (id: string) => structuredClone(CLOUD_NODES.find((node) => node.id === id)!);

/** Un servicio del catálogo colocado en el lienzo. */
export function placed(type: string, id: string, x: number, y: number, extra: Partial<CloudNode> = {}): CloudNode {
  const item = CATALOG.find((candidate) => candidate.type === type)!;
  return {
    id, type, x, y, zone: item.zone, role: item.capability, service: item.service, icon: item.icon, terraform: item.terraform,
    why: item.why, custom: true, ...extra,
  };
}

/** Un sistema del centro de datos propio: fuera de la nube y de Terraform. */
function onPremise(type: string, id: string, x: number, y: number, service: string, role: string, why: string): CloudNode {
  return { id, type, x, y, zone: 'external', role, service, icon: null, terraform: null, why, custom: true };
}

export const at = (node: CloudNode, x: number, y: number, extra: Partial<CloudNode> = {}): CloudNode => ({ ...node, x, y, ...extra });

const ILLUSTRATIVE = 'Escenario ilustrativo de este tipo de sistema: no describe la infraestructura real de ninguna entidad.';

/**
 * Escenarios de partida. Los tres del medio son arquitecturas ILUSTRATIVAS de un tipo de
 * sistema: no describen la infraestructura real de ninguna entidad. Son también la fuente de
 * las plantillas que siembra el backend (`npm run export:presets`).
 */
export const STUDIO_PRESETS: StudioPreset[] = [
  { id: 'reference', name: 'Arquitectura de referencia', summary: 'La de esta plataforma', build: referenceProject },
  {
    id: 'aks-oauth2',
    name: 'Microservicios en Kubernetes (AKS + OAuth2 + Redis)',
    summary: 'Microservicios en Kubernetes con APIs protegidas',
    description: `Microservicios Spring Boot en AKS detrás de un gestor de APIs que valida tokens OAuth2, con Redis como caché. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'azure',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'),
        placed('api-gateway', 'apim', 402, 250, { role: 'Entrada de las APIs · OAuth2', props: { ports: '443' } }),
        placed('kubernetes', 'aks', 556, 250, { role: 'Microservicios Spring Boot', props: { instance: '3 nodos · Standard_D4s_v5', ports: '8080' } }),
        BASE('postgres'), BASE('redis'),
        placed('identity', 'identity', 865, 215, { role: 'Emisor de tokens OAuth2 / JWT' }),
        at(BASE('secrets'), 865, 300), at(BASE('observability'), 865, 385), at(BASE('registry'), 1005, 215),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'apim', label: 'OAuth2' }, { from: 'apim', to: 'aks' },
        { from: 'aks', to: 'postgres' }, { from: 'aks', to: 'redis' }, { from: 'apim', to: 'identity', label: 'valida JWT' },
      ],
    }),
  },
  {
    id: 'legacy-core',
    name: 'Core legado integrado por colas (Mainframe + MQ + Spring Batch + Lambda + SQS)',
    summary: 'APIs en la nube que hablan con el core por colas',
    description: `Las APIs y los procesos por lotes nunca llaman al core de forma síncrona: dejan mensajes en colas y el core los atiende a su ritmo. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: [...structuredClone(BASE_ZONES), { id: 'on-premise', kind: 'region', role: 'external', x: 330, y: 624, w: 462, h: 88, label: 'Centro de datos propio' }],
      nodes: [
        BASE('users'), BASE('edge'), BASE('lb'),
        at(BASE('api'), 556, 250, { role: 'API Spring Boot', props: { instance: '0.5 vCPU · 1 GB', ports: '8080', env: 'MQ_QUEUE_MANAGER=QM1\nMQ_CHANNEL=APP.SVRCONN' } }),
        placed('containers', 'batch', 556, 340, { name: 'Spring Batch', role: 'Procesos por lotes', zone: 'compute' }),
        placed('functions', 'lambda', 556, 430, { role: 'Consume la cola y entrega al core' }),
        // Redis arriba: así el cable de la API a la caché no se cruza con el de los lotes a la base de datos.
        at(BASE('postgres'), 710, 340), at(BASE('redis'), 710, 250), BASE('secrets'), BASE('observability'),
        placed('queue', 'queue', 865, 385, { role: 'Eventos pendientes de entregar' }),
        onPremise('mq', 'mq', 556, 668, 'IBM MQ', 'Colas de mensajes', 'Desacopla las APIs del core: si el core tarda o cae, los mensajes esperan en la cola.'),
        onPremise('mainframe', 'core-system', 710, 668, 'Mainframe', 'Core transaccional', 'Recibe tramas planas; las APIs nunca lo llaman de forma síncrona.'),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'lb', label: '/v1' }, { from: 'lb', to: 'api' },
        { from: 'api', to: 'postgres' }, { from: 'api', to: 'redis' }, { from: 'batch', to: 'postgres' },
        { from: 'api', to: 'queue', label: 'eventos' }, { from: 'queue', to: 'lambda' },
        { from: 'lambda', to: 'mq', label: 'JMS' }, { from: 'batch', to: 'mq' }, { from: 'mq', to: 'core-system', label: 'tramas planas' },
      ],
    }),
  },
  {
    id: 'high-traffic',
    name: 'Plataforma de alto tráfico anti-DDoS (CDN + WAF + AWS)',
    summary: 'Picos de tráfico en eventos masivos',
    description: `Borde y cortafuegos que absorben el tráfico hostil, dos réplicas de la API y una base de datos con réplica en espera en otra zona. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), at(BASE('edge'), 196, 250, { role: 'Anti-DDoS · CDN · DNS' }), BASE('static'),
        placed('waf', 'waf', 402, 250), at(BASE('lb'), 402, 340),
        at(BASE('api'), 556, 250, { role: 'API pública', props: { instance: '1 vCPU · 2 GB', ports: '8080' } }),
        placed('containers', 'api-2', 556, 340, { role: 'API pública', zone: 'compute' }),
        at(BASE('postgres'), 710, 340),
        at(BASE('postgres'), 710, 430, { id: 'postgres-standby', name: 'RDS · réplica Multi-AZ', role: 'En espera en otra zona', custom: true }),
        at(BASE('redis'), 710, 250),
        placed('queue', 'queue', 865, 215, { role: 'Procesamiento asíncrono' }), at(BASE('observability'), 865, 300), at(BASE('secrets'), 865, 385),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'static', label: 'contenido' }, { from: 'edge', to: 'waf' },
        { from: 'waf', to: 'lb' }, { from: 'lb', to: 'api' }, { from: 'lb', to: 'api-2' },
        { from: 'api', to: 'postgres' }, { from: 'api-2', to: 'postgres' }, { from: 'postgres', to: 'postgres-standby', label: 'replicación' },
        { from: 'api', to: 'redis' }, { from: 'api', to: 'queue' },
      ],
    }),
  },
  // ---------- Patrones de referencia: no van ligados a ninguna entidad ----------
  {
    id: 'event-driven',
    name: 'Arquitectura Event-Driven de Alto Rendimiento (Kafka + Spring Cloud Stream + DynamoDB)',
    summary: 'Streaming de eventos con productores y consumidores desacoplados',
    description: `Los productores publican en Kafka y responden sin esperar; los consumidores procesan a su ritmo y escriben en una base de datos clave-valor. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'), BASE('lb'),
        at(BASE('api'), 556, 250, { role: 'Productores (Cloud Stream)' }),
        placed('streaming', 'kafka', 556, 340, { role: 'Bus de eventos' }),
        placed('containers', 'consumers', 556, 430, { role: 'Consumidores (Cloud Stream)', zone: 'compute' }),
        placed('nosql', 'store', 710, 250, { role: 'Estado por clave' }),
        BASE('secrets'), BASE('observability'),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'lb' }, { from: 'lb', to: 'api' },
        { from: 'api', to: 'kafka', label: 'publica' }, { from: 'kafka', to: 'consumers', label: 'consume' }, { from: 'consumers', to: 'store' },
      ],
    }),
  },
  {
    id: 'ecommerce-cqrs',
    name: 'E-Commerce Global Multi-Region (CQRS + Event Sourcing + Aurora Multi-AZ)',
    summary: 'Escrituras y lecturas separadas, con réplica en otra región',
    description: `Los comandos se guardan como eventos en la base de datos relacional; un bus los lleva al modelo de lectura, que es el que atiende las consultas de la tienda. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: [...structuredClone(BASE_ZONES), { id: 'second-region', kind: 'region', role: 'managed', x: 24, y: 420, w: 250, h: 170, label: 'Región secundaria' }],
      nodes: [
        BASE('users'), BASE('edge'), at(BASE('static'), 402, 95, { role: 'Tienda (frontend)' }), BASE('lb'),
        at(BASE('api'), 556, 250, { role: 'Comandos · escritura' }),
        placed('containers', 'queries', 556, 340, { role: 'Consultas · lectura', zone: 'compute' }),
        placed('streaming', 'events', 556, 430, { role: 'Bus de eventos' }),
        placed('newsql-pg', 'event-store', 710, 250, { role: 'Almacén de eventos' }),
        placed('search', 'read-model', 710, 340, { role: 'Modelo de lectura' }),
        at(BASE('redis'), 710, 430, { role: 'Caché de consultas' }),
        placed('newsql-pg', 'replica', 149, 488, { role: 'Réplica de lectura', zone: 'managed' }),
        BASE('secrets'), BASE('observability'),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'static', label: 'estáticos' }, { from: 'edge', to: 'lb' },
        { from: 'lb', to: 'api' }, { from: 'lb', to: 'queries' },
        { from: 'api', to: 'event-store' }, { from: 'api', to: 'events', label: 'publica' }, { from: 'events', to: 'queries', label: 'proyecta' },
        { from: 'queries', to: 'read-model' }, { from: 'queries', to: 'redis' }, { from: 'event-store', to: 'replica', label: 'replicación' },
      ],
    }),
  },
  {
    id: 'saas-multitenant',
    name: 'Plataforma SaaS B2B Multi-Inquilino (API Gateway + Micro-Frontends + Isolated Tenant Schemas)',
    summary: 'Módulos independientes y datos aislados por inquilino',
    description: `La puerta de APIs identifica al inquilino y enruta a cada servicio; cada inquilino tiene su propio esquema en la base de datos. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'), at(BASE('static'), 402, 95, { role: 'Micro-frontends' }),
        placed('api-gateway', 'gateway', 402, 250, { role: 'Enruta por inquilino' }),
        at(BASE('api'), 556, 250, { role: 'Servicio de cuentas' }),
        placed('containers', 'billing', 556, 340, { role: 'Servicio de facturación', zone: 'compute' }),
        at(BASE('redis'), 710, 250), at(BASE('postgres'), 710, 340, { role: 'Un esquema por inquilino' }),
        placed('identity', 'identity', 865, 215, { role: 'Inquilinos y usuarios' }),
        placed('queue', 'queue', 865, 300, { role: 'Facturas pendientes' }),
        at(BASE('secrets'), 865, 385), at(BASE('observability'), 865, 470),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'static', label: 'módulos' }, { from: 'edge', to: 'gateway' },
        { from: 'gateway', to: 'api' }, { from: 'gateway', to: 'billing' }, { from: 'gateway', to: 'identity', label: 'valida token' },
        { from: 'api', to: 'postgres' }, { from: 'billing', to: 'postgres' }, { from: 'api', to: 'redis' }, { from: 'billing', to: 'queue' },
      ],
    }),
  },
  {
    id: 'fintech-payments',
    name: 'Pasarela de Pagos Zero-Trust FinTech (Vault + Kafka + Idempotency Engine)',
    summary: 'Cobros que no se duplican y secretos que caducan',
    description: `Cada cobro lleva una clave de idempotencia que se comprueba antes de tocar el libro mayor; ningún servicio guarda credenciales, las pide a Vault. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'),
        placed('waf', 'waf', 402, 250), placed('api-gateway', 'gateway', 402, 340, { role: 'mTLS y cuotas' }),
        at(BASE('api'), 556, 250, { role: 'API de pagos' }),
        placed('streaming', 'events', 556, 340, { role: 'Eventos de pago' }),
        placed('containers', 'ledger', 556, 430, { role: 'Libro mayor', zone: 'compute' }),
        at(BASE('redis'), 710, 250, { role: 'Claves de idempotencia' }),
        at(BASE('postgres'), 710, 340, { role: 'Transacciones ACID' }),
        at(BASE('observability'), 865, 215), placed('vault', 'vault', 865, 300, { role: 'Credenciales dinámicas' }),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'waf' }, { from: 'waf', to: 'gateway' }, { from: 'gateway', to: 'api' },
        { from: 'api', to: 'redis', label: '¿ya cobrado?' }, { from: 'api', to: 'postgres' }, { from: 'api', to: 'events', label: 'publica' },
        { from: 'events', to: 'ledger', label: 'consume' }, { from: 'ledger', to: 'postgres' }, { from: 'api', to: 'vault' }, { from: 'ledger', to: 'vault' },
      ],
    }),
  },
  {
    id: 'rag-enterprise',
    name: 'Sistema RAG Enterprise & Vector Search (Spring Boot + pgvector + Redis + LLM API)',
    summary: 'Ingesta de documentos y respuestas con citas',
    description: `La ingesta trocea los documentos y guarda sus vectores; la API busca los fragmentos más parecidos a la pregunta y se los pasa al modelo. Es el mismo patrón del asistente de este portafolio. ${ILLUSTRATIVE}`,
    build: () => ({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'), BASE('static'), BASE('lb'),
        at(BASE('api'), 556, 250, { role: 'API RAG Spring Boot' }),
        placed('containers', 'ingest', 556, 340, { role: 'Ingesta y troceo', zone: 'compute' }),
        at(BASE('redis'), 710, 250, { role: 'Caché y límites' }),
        at(BASE('postgres'), 710, 340, { role: 'pgvector · índice HNSW' }),
        placed('ml-platform', 'llm', 865, 215, { role: 'Embeddings y respuestas' }),
        placed('queue', 'queue', 865, 300, { role: 'Cola de ingesta' }),
        placed('bucket', 'documents', 865, 385, { role: 'Documentos de origen' }),
        at(BASE('secrets'), 865, 470),
      ],
      links: [
        { from: 'users', to: 'edge' }, { from: 'edge', to: 'static', label: 'estáticos' }, { from: 'edge', to: 'lb' }, { from: 'lb', to: 'api' },
        { from: 'api', to: 'postgres', label: 'top-k' }, { from: 'api', to: 'redis' }, { from: 'api', to: 'llm' },
        { from: 'api', to: 'queue' }, { from: 'queue', to: 'ingest' }, { from: 'ingest', to: 'documents' },
        { from: 'ingest', to: 'postgres' }, { from: 'ingest', to: 'llm' },
      ],
    }),
  },
  { id: 'blank', name: 'Lienzo en blanco', summary: 'Sin nodos ni zonas', build: () => ({ provider: 'aws', nodes: [], links: [], zones: [] }) },
];

/** Plantillas que el backend guarda y sirve: los escenarios, sin los dos puntos de partida locales. */
export const SERVER_PRESET_IDS = [
  'aks-oauth2', 'legacy-core', 'high-traffic', 'event-driven', 'ecommerce-cqrs', 'saas-multitenant', 'fintech-payments', 'rag-enterprise',
];

// ---------- Guardar, exportar e importar ----------

export const PROJECT_FORMAT = 'architecture-studio';
/**
 * Versión del esquema del proyecto. 1: nodos, conexiones sin tipo y zonas. 2: las conexiones
 * pueden llevar `kind`. 3: el proyecto puede llevar `system` (diseño de sistema). Un proyecto
 * anterior se abre igual y se guarda ya en la versión actual.
 */
export const PROJECT_VERSION = 3;
export const PROJECT_EXTENSION = '.architecture.json';
export const PROJECT_STORAGE_KEY = 'architecture-studio-project';

export const MAX_NODES = 60;
const MAX_ZONES = 24;
const MAX_LINKS = 200;
const PROVIDERS: CloudProviderId[] = ['aws', 'gcp', 'azure', 'oci'];
const ZONE_IDS: ZoneId[] = ['outside', 'global', 'public', 'compute', 'data', 'managed', 'external'];
const KINDS: ZoneKind[] = ['cloud', 'region', 'vpc', 'public', 'private'];
const ID = /^[A-Za-z0-9_-]{1,48}$/;
const RESOURCE = /^[a-z0-9_]{1,80}$/;
const LINK_KIND_IDS = LINK_KINDS.map((entry) => entry.kind);

export function serializeProject(project: StudioProject): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, ...project }, null, 2);
}

export type ParsedProject = { ok: true; project: StudioProject } | { ok: false; error: string };

/**
 * Lee un proyecto guardado o importado. El archivo puede venir de cualquier parte, así que no
 * se confía en él: solo se aceptan los campos conocidos, con sus tipos, tamaños y valores
 * válidos, y todo lo demás se descarta.
 */
export function parseProject(text: string): ParsedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!isRecord(raw) || raw['format'] !== PROJECT_FORMAT) {
    return { ok: false, error: 'El archivo no es un proyecto del Estudio de arquitectura.' };
  }
  raw = migrateProject(raw);
  if (!isRecord(raw)) {
    return { ok: false, error: 'El proyecto es de una versión que este estudio no sabe abrir.' };
  }
  const nodes = Array.isArray(raw['nodes']) ? raw['nodes'] : null;
  const links = Array.isArray(raw['links']) ? raw['links'] : null;
  const zones = Array.isArray(raw['zones']) ? raw['zones'] : null;
  if (!nodes || !links || !zones || !PROVIDERS.includes(raw['provider'] as CloudProviderId)) {
    return { ok: false, error: 'Al proyecto le faltan la nube, los nodos, las conexiones o las zonas.' };
  }
  if (nodes.length > MAX_NODES || zones.length > MAX_ZONES || links.length > MAX_LINKS) {
    return { ok: false, error: 'El proyecto es demasiado grande para este lienzo.' };
  }

  const parsedNodes: CloudNode[] = [];
  for (const candidate of nodes) {
    const node = parseNode(candidate);
    if (!node || parsedNodes.some((existing) => existing.id === node.id)) {
      return { ok: false, error: 'El proyecto contiene un nodo no válido o repetido.' };
    }
    parsedNodes.push(node);
  }
  const parsedZones: StudioZone[] = [];
  for (const candidate of zones) {
    const zone = parseZone(candidate);
    if (!zone || parsedZones.some((existing) => existing.id === zone.id)) {
      return { ok: false, error: 'El proyecto contiene una zona no válida o repetida.' };
    }
    parsedZones.push(zone);
  }
  const ids = new Set(parsedNodes.map((node) => node.id));
  const parsedLinks = links.flatMap((link): CloudLink[] =>
    isRecord(link) && ids.has(link['from'] as string) && ids.has(link['to'] as string) && link['from'] !== link['to']
      ? [{
          from: link['from'] as string, to: link['to'] as string,
          ...(text_(link['label'], 40) ? { label: text_(link['label'], 40)! } : {}),
          ...(LINK_KIND_IDS.includes(link['kind'] as LinkKind) ? { kind: link['kind'] as LinkKind } : {}),
        }]
      : []);

  const system = parseSystemDesign(raw['system']);
  return {
    ok: true,
    project: { provider: raw['provider'] as CloudProviderId, nodes: parsedNodes, links: parsedLinks, zones: parsedZones, ...(system ? { system } : {}) },
  };
}

/**
 * Lleva un proyecto guardado con un esquema anterior al actual, paso a paso. Devuelve `null`
 * si la versión no se conoce (por ejemplo, un archivo de un estudio más nuevo).
 */
export function migrateProject(raw: Record<string, unknown>): Record<string, unknown> | null {
  let project = raw;
  for (let guard = 0; guard < MIGRATIONS.length + 1; guard++) {
    if (project['version'] === PROJECT_VERSION) {
      return project;
    }
    const step = MIGRATIONS.find((migration) => migration.from === project['version']);
    if (!step) {
      return null;
    }
    project = { ...step.apply(project), version: step.from + 1 };
  }
  return null;
}

const MIGRATIONS: { from: number; apply: (project: Record<string, unknown>) => Record<string, unknown> }[] = [
  // 1 → 2: las conexiones ganan `kind`, que es opcional; en la versión 1 no existía, así que
  // cualquier `kind` que traiga un archivo de esa versión no es del estudio y se quita.
  {
    from: 1,
    apply: (project) => ({
      ...project,
      links: Array.isArray(project['links'])
        ? project['links'].map((link) => {
            if (!isRecord(link)) {
              return link;
            }
            const { kind: _dropped, ...rest } = link;
            return rest;
          })
        : project['links'],
    }),
  },
  // 2 → 3: el proyecto gana `system`, que es opcional; en la versión 2 no existía, así que
  // cualquier `system` que traiga un archivo de esa versión no es del estudio y se quita.
  {
    from: 2,
    apply: (project) => {
      const { system: _dropped, ...rest } = project;
      return rest;
    },
  },
];

function parseNode(raw: unknown): CloudNode | null {
  if (!isRecord(raw)) {
    return null;
  }
  const service = perProvider(raw['service'], 60);
  const terraform = raw['terraform'] === null || raw['terraform'] === undefined ? null : perProvider(raw['terraform'], 80, RESOURCE);
  if (!ID.test(String(raw['id'])) || !ID.test(String(raw['type'])) || !finite(raw['x']) || !finite(raw['y'])
    || !ZONE_IDS.includes(raw['zone'] as ZoneId) || !service || (raw['terraform'] != null && !terraform)) {
    return null;
  }
  const props = isRecord(raw['props']) ? raw['props'] : {};
  const cleanProps = {
    ...(text_(props['instance'], 60) ? { instance: text_(props['instance'], 60)! } : {}),
    ...(text_(props['ports'], 80) ? { ports: text_(props['ports'], 80)! } : {}),
    ...(typeof props['env'] === 'string' && props['env'].trim() ? { env: props['env'].slice(0, 2000) } : {}),
  };
  // A un nodo guardado antes de la cuarta nube se le añade su equivalente en OCI, si lo tiene.
  return withOracle({
    id: raw['id'] as string,
    type: raw['type'] as string,
    x: Math.round(Math.min(CANVAS_WIDTH, Math.max(0, raw['x'] as number))),
    y: Math.round(Math.min(CANVAS_HEIGHT, Math.max(0, raw['y'] as number))),
    zone: raw['zone'] as ZoneId,
    role: text_(raw['role'], 80) ?? '',
    service,
    icon: iconRef(raw['icon']),
    terraform,
    why: text_(raw['why'], 240) ?? '',
    ...(raw['custom'] === true ? { custom: true } : {}),
    ...(text_(raw['name'], 60) ? { name: text_(raw['name'], 60)! } : {}),
    ...(Object.keys(cleanProps).length ? { props: cleanProps } : {}),
  });
}

function parseZone(raw: unknown): StudioZone | null {
  if (!isRecord(raw) || !ID.test(String(raw['id'])) || !KINDS.includes(raw['kind'] as ZoneKind)
    || ![raw['x'], raw['y'], raw['w'], raw['h']].every(finite)
    || (raw['role'] !== null && !ZONE_IDS.includes(raw['role'] as ZoneId))) {
    return null;
  }
  const w = Math.min(CANVAS_WIDTH, Math.max(ZONE_MIN_SIZE, raw['w'] as number));
  const h = Math.min(CANVAS_HEIGHT, Math.max(ZONE_MIN_SIZE / 2, raw['h'] as number));
  return {
    id: raw['id'] as string,
    kind: raw['kind'] as ZoneKind,
    role: raw['role'] as ZoneId | null,
    x: Math.round(Math.min(CANVAS_WIDTH - w, Math.max(0, raw['x'] as number))),
    y: Math.round(Math.min(CANVAS_HEIGHT - h, Math.max(0, raw['y'] as number))),
    w: Math.round(w),
    h: Math.round(h),
    ...(text_(raw['label'], 60) ? { label: text_(raw['label'], 60)! } : {}),
  };
}

function iconRef(raw: unknown): IconRef | null {
  const known = (value: unknown): value is string => typeof value === 'string' && (value === 'provider' || value in TECH_ICONS);
  if (known(raw)) {
    return raw as IconRef;
  }
  if (isRecord(raw) && known(raw['default'])) {
    const ref: Record<string, string> = { default: raw['default'] };
    for (const provider of PROVIDERS) {
      if (known(raw[provider]) && raw[provider] !== 'provider') {
        ref[provider] = raw[provider] as string;
      }
    }
    return ref as unknown as IconRef;
  }
  return null;
}

function perProvider(raw: unknown, max: number, pattern?: RegExp): string | PerProvider | null {
  const valid = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max && (!pattern || pattern.test(value));
  if (valid(raw)) {
    return raw;
  }
  // OCI es opcional: un proyecto anterior a la cuarta nube no lo trae y sigue siendo válido.
  return isRecord(raw) && BASE_PROVIDER_IDS.every((provider) => valid(raw[provider]))
    ? { aws: raw['aws'] as string, gcp: raw['gcp'] as string, azure: raw['azure'] as string, ...(valid(raw['oci']) ? { oci: raw['oci'] } : {}) }
    : null;
}

function text_(raw: unknown, max: number): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, max) : null;
}

function finite(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isFinite(raw);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}
