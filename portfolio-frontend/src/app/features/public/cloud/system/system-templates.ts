import { autoLayout } from '../auto-layout';
import { CloudLink, CloudNode, CloudProviderId } from '../cloud-topology.data';
import { at, BASE, BASE_ZONES, placed, StudioPreset, StudioProject } from '../studio-project';
import { SystemDesign } from './system-design';

/**
 * Sistema completo de ejemplo (flag `studio.system-templates`): las dos vistas de un proyecto
 * (infraestructura y aplicación), sus requisitos no funcionales y las decisiones que lo
 * explican. Es una plantilla como las demás: se construye, se versiona, se exporta al backend
 * (`npm run export:presets`) y se valida igual.
 *
 * Todos son FICTICIOS: ilustran un tipo de sistema, no el de ninguna empresa.
 */
export interface SystemTemplate extends StudioPreset {
  /** Versión de la plantilla: sube cuando cambia su grafo o su diseño. */
  version: number;
  sector: string;
  /** Las decisiones que explican el diseño, cada una en una línea. */
  decisions: string[];
}

/** Lo que se muestra junto a cada plantilla, siempre. */
export const FICTIONAL_LABEL = 'Ejemplo ficticio';
const FICTIONAL = 'Ejemplo ficticio: ilustra un tipo de sistema; no describe el de ninguna empresa.';

const ENTRY: CloudLink[] = [{ from: 'users', to: 'edge' }, { from: 'edge', to: 'lb' }, { from: 'lb', to: 'api' }];
const standby = (role: string): CloudNode => at(BASE('postgres'), 710, 340, { id: 'postgres-standby', role, custom: true });
const monitoring = (): CloudNode => BASE('observability');

function system(provider: CloudProviderId, nodes: CloudNode[], links: CloudLink[], design: SystemDesign): StudioProject {
  const zones = structuredClone(BASE_ZONES);
  // Como el resto de las plantillas, en la forma que daría «Auto-ordenar».
  return { provider, zones, nodes: autoLayout(nodes, links, zones), links, system: design };
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: 'system-fintech',
    version: 1,
    sector: 'Fintech',
    name: 'Billetera digital',
    summary: 'App móvil de pagos entre personas, con datos de tarjeta',
    decisions: [
      'Todo entra por un API gateway con WAF: un solo sitio donde autenticar y limitar.',
      'Los movimientos se confirman en PostgreSQL con réplica en espera; lo lento (avisos, conciliación) va a una cola.',
      'La identidad la lleva un proveedor gestionado: el backend no guarda contraseñas.',
    ],
    description: `App móvil de pagos entre personas: API gateway con WAF, backend en contenedores, PostgreSQL con réplica y una cola para lo asíncrono. ${FICTIONAL}`,
    build: () => system('aws', [
      BASE('users'), BASE('edge'),
      placed('waf', 'waf', 402, 250), placed('api-gateway', 'gateway', 402, 340, { role: 'Entrada de las APIs' }),
      BASE('lb'), at(BASE('api'), 556, 250, { role: 'API de pagos' }),
      at(BASE('postgres'), 710, 250, { role: 'Movimientos y saldos' }), standby('Réplica en otra zona'),
      at(BASE('redis'), 710, 430, { role: 'Límites y sesiones' }),
      placed('queue', 'queue', 865, 215, { role: 'Avisos y conciliación' }),
      placed('pubsub', 'push', 865, 300, { role: 'Notificaciones push' }),
      placed('identity', 'identity', 865, 385, { role: 'Inicio de sesión' }),
      BASE('secrets'), monitoring(),
    ], [
      { from: 'users', to: 'edge' }, { from: 'edge', to: 'waf' }, { from: 'waf', to: 'gateway' }, { from: 'gateway', to: 'lb' }, { from: 'lb', to: 'api' },
      { from: 'api', to: 'postgres' }, { from: 'postgres', to: 'postgres-standby', kind: 'REPLICATION' }, { from: 'api', to: 'redis' },
      { from: 'api', to: 'queue', kind: 'EVENT_BUS' }, { from: 'api', to: 'push', kind: 'EVENT_BUS' },
      { from: 'api', to: 'identity' }, { from: 'api', to: 'secrets' }, { from: 'api', to: 'observability' },
    ], {
      choices: { client: 'mobile-cross', backend: 'spring-boot', api: 'rest', auth: 'oidc-managed', database: 'postgresql', cache: 'redis', queue: 'queue', bff: 'gateway', push: 'push-service' },
      deployments: { backend: 'api', auth: 'identity', database: 'postgres', cache: 'redis', queue: 'queue', bff: 'gateway', push: 'push' },
      nfr: { users: 200_000, rps: 600, latencyMs: 300, availability: 99.95, budgetUsd: 400, compliance: ['pci'] },
    }),
  },
  {
    id: 'system-ecommerce',
    version: 1,
    sector: 'E-commerce',
    name: 'Tienda en línea',
    summary: 'Catálogo con render en servidor, búsqueda y pedidos',
    decisions: [
      'El catálogo se renderiza en el servidor y se guarda en el borde: la primera carga y el SEO mandan.',
      'El pago se delega a una pasarela externa: el sistema no toca datos de tarjeta.',
      'Los pedidos se confirman en PostgreSQL y el resto (stock, correo) reacciona desde una cola.',
    ],
    description: `Tienda en línea con el catálogo renderizado en el servidor y servido desde el borde, búsqueda aparte y pedidos en PostgreSQL con réplica. ${FICTIONAL}`,
    build: () => system('gcp', [
      BASE('users'), BASE('edge'), BASE('lb'),
      placed('containers', 'web', 556, 250, { role: 'Web con render en servidor' }), at(BASE('api'), 556, 340, { role: 'API de pedidos' }),
      at(BASE('postgres'), 710, 250, { role: 'Pedidos y clientes' }), standby('Réplica en otra zona'),
      placed('search', 'search', 710, 430, { role: 'Búsqueda del catálogo' }),
      placed('queue', 'queue', 865, 215, { role: 'Stock y correo' }),
      placed('identity', 'identity', 865, 300, { role: 'Cuentas de cliente' }),
      placed('bucket', 'bucket', 865, 385, { role: 'Imágenes de producto' }),
      BASE('secrets'), monitoring(),
    ], [
      { from: 'users', to: 'edge' }, { from: 'edge', to: 'lb' }, { from: 'lb', to: 'web' }, { from: 'web', to: 'api' },
      { from: 'api', to: 'postgres' }, { from: 'postgres', to: 'postgres-standby', kind: 'REPLICATION' },
      { from: 'api', to: 'search' }, { from: 'api', to: 'queue', kind: 'EVENT_BUS' }, { from: 'api', to: 'identity' },
      { from: 'web', to: 'bucket' }, { from: 'api', to: 'secrets' }, { from: 'api', to: 'observability' },
    ], {
      choices: { client: 'web-ssr', backend: 'node', api: 'rest', auth: 'oidc-managed', database: 'postgresql', cache: 'cdn', queue: 'queue' },
      deployments: { client: 'web', backend: 'api', auth: 'identity', database: 'postgres', cache: 'edge', queue: 'queue' },
      nfr: { users: 500_000, rps: 1500, latencyMs: 200, availability: 99.9, budgetUsd: 400, compliance: [] },
    }),
  },
  {
    id: 'system-telemedicine',
    version: 1,
    sector: 'Telemedicina',
    name: 'Consulta médica en línea',
    summary: 'Citas y videoconsulta, con datos de salud',
    decisions: [
      'Cada persona entra con un proveedor de identidad gestionado y segundo factor: son datos de salud.',
      'La sala de consulta usa WebSocket sobre los mismos contenedores del backend.',
      'Los historiales viven en PostgreSQL con réplica; las claves de cifrado, en el gestor de secretos.',
    ],
    description: `Citas y videoconsulta: web estática, backend en contenedores con WebSocket, PostgreSQL con réplica e identidad gestionada. ${FICTIONAL}`,
    build: () => system('azure', [
      BASE('users'), BASE('edge'), BASE('static'), BASE('lb'), at(BASE('api'), 556, 250, { role: 'API de citas y salas' }),
      at(BASE('postgres'), 710, 250, { role: 'Historiales y citas' }), standby('Réplica en otra zona'),
      placed('queue', 'queue', 865, 215, { role: 'Recordatorios' }),
      placed('identity', 'identity', 865, 300, { role: 'Pacientes y médicos' }),
      BASE('secrets'), monitoring(),
    ], [
      ...ENTRY, { from: 'edge', to: 'static' },
      { from: 'api', to: 'postgres' }, { from: 'postgres', to: 'postgres-standby', kind: 'REPLICATION' },
      { from: 'api', to: 'queue', kind: 'EVENT_BUS' }, { from: 'api', to: 'identity' }, { from: 'api', to: 'secrets' }, { from: 'api', to: 'observability' },
    ], {
      choices: { client: 'web-spa', backend: 'spring-boot', api: 'rest', auth: 'oidc-managed', database: 'postgresql', queue: 'queue', push: 'websocket' },
      deployments: { client: 'static', backend: 'api', auth: 'identity', database: 'postgres', queue: 'queue', push: 'api' },
      nfr: { users: 50_000, rps: 200, latencyMs: 300, availability: 99.9, budgetUsd: 300, compliance: ['health'] },
    }),
  },
  {
    id: 'system-mobility',
    version: 1,
    sector: 'Movilidad',
    name: 'Viajes compartidos',
    summary: 'App de conductores y pasajeros, con posición en tiempo real',
    decisions: [
      'gRPC entre la app y el BFF: muchas llamadas pequeñas y frecuentes con la posición.',
      'La posición de cada viaje va a un stream; el emparejamiento lo lee de ahí, no de la petición.',
      'Clave-valor para viajes y Redis para lo que está pasando ahora: lecturas en milisegundos.',
    ],
    description: `App de viajes compartidos: BFF y backend en Kubernetes, stream de posiciones, base de datos clave-valor y Redis para el estado en vivo. ${FICTIONAL}`,
    build: () => system('aws', [
      BASE('users'), BASE('edge'), BASE('lb'),
      placed('containers', 'bff', 556, 250, { role: 'BFF de la app' }),
      placed('kubernetes', 'cluster', 556, 340, { role: 'Viajes y emparejamiento' }),
      placed('nosql', 'trips', 710, 250, { role: 'Viajes y conductores' }),
      at(BASE('redis'), 710, 340, { role: 'Estado en vivo' }),
      placed('streaming', 'positions', 865, 215, { role: 'Posiciones' }),
      placed('pubsub', 'push', 865, 300, { role: 'Notificaciones push' }),
      BASE('secrets'), monitoring(),
    ], [
      { from: 'users', to: 'edge' }, { from: 'edge', to: 'lb' }, { from: 'lb', to: 'bff' }, { from: 'bff', to: 'cluster' },
      { from: 'cluster', to: 'trips' }, { from: 'cluster', to: 'redis' },
      { from: 'cluster', to: 'positions', kind: 'EVENT_BUS' }, { from: 'cluster', to: 'push', kind: 'EVENT_BUS' },
      { from: 'cluster', to: 'secrets' }, { from: 'cluster', to: 'observability' },
    ], {
      choices: { client: 'mobile-native', backend: 'go', api: 'grpc', auth: 'jwt-own', database: 'key-value', cache: 'redis', queue: 'stream', bff: 'bff', push: 'push-service' },
      deployments: { backend: 'cluster', database: 'trips', cache: 'redis', queue: 'positions', bff: 'bff', push: 'push' },
      nfr: { users: 1_000_000, rps: 5000, latencyMs: 100, availability: 99.95, budgetUsd: 600, compliance: [] },
    }),
  },
  {
    id: 'system-education',
    version: 1,
    sector: 'Educación',
    name: 'Aula virtual',
    summary: 'Cursos, entregas y avisos para alumnos y docentes',
    decisions: [
      'GraphQL: cada pantalla del curso pide justo lo que pinta, en una sola petición.',
      'Los cursos son documentos (temario, entregas, rúbricas): encajan mejor en MongoDB que en tablas.',
      'Un 99 % basta: fuera del horario lectivo se puede parar para mantenimiento.',
    ],
    description: `Aula virtual: web estática servida desde el borde, API GraphQL en contenedores, MongoDB para los cursos y avisos por publicación y suscripción. ${FICTIONAL}`,
    build: () => system('gcp', [
      BASE('users'), BASE('edge'), BASE('static'), BASE('lb'), at(BASE('api'), 556, 250, { role: 'API GraphQL' }),
      placed('mongodb', 'courses', 710, 250, { role: 'Cursos y entregas' }),
      placed('pubsub', 'notices', 865, 215, { role: 'Avisos' }),
      placed('identity', 'identity', 865, 300, { role: 'Alumnos y docentes' }),
      placed('bucket', 'bucket', 865, 385, { role: 'Material y entregas' }),
      BASE('secrets'), monitoring(),
    ], [
      ...ENTRY, { from: 'edge', to: 'static' },
      { from: 'api', to: 'courses' }, { from: 'api', to: 'notices', kind: 'EVENT_BUS' }, { from: 'api', to: 'identity' },
      { from: 'api', to: 'bucket' }, { from: 'api', to: 'secrets' }, { from: 'api', to: 'observability' },
    ], {
      choices: { client: 'web-spa', backend: 'node', api: 'graphql', auth: 'oidc-managed', database: 'document', cache: 'cdn', queue: 'pubsub', push: 'sse' },
      deployments: { client: 'static', backend: 'api', auth: 'identity', database: 'courses', cache: 'edge', queue: 'notices', push: 'api' },
      nfr: { users: 80_000, rps: 300, latencyMs: 400, availability: 99, budgetUsd: 300, compliance: [] },
    }),
  },
  {
    id: 'system-iot',
    version: 1,
    sector: 'IoT',
    name: 'Telemetría de sensores',
    summary: 'Miles de dispositivos que envían lecturas y un panel que las muestra',
    decisions: [
      'Los dispositivos publican eventos; nadie espera respuesta: el estilo de la API son los eventos.',
      'Las lecturas entran a un stream y se agregan en vuelo antes de llegar al almacén.',
      'El panel lee el último estado de cada sensor de Redis, no del histórico.',
    ],
    description: `Telemetría de sensores: ingesta en funciones, stream de lecturas, procesamiento en vuelo hacia un almacén de datos y un panel web. ${FICTIONAL}`,
    build: () => system('azure', [
      BASE('users'), BASE('edge'), BASE('static'), BASE('lb'),
      placed('functions', 'ingest', 556, 250, { role: 'Ingesta de lecturas' }), at(BASE('api'), 556, 340, { role: 'API del panel' }),
      placed('nosql', 'devices', 710, 250, { role: 'Dispositivos y última lectura' }),
      at(BASE('redis'), 710, 340, { role: 'Último estado' }),
      placed('event-stream', 'readings', 865, 215, { role: 'Lecturas' }),
      placed('stream-processing', 'aggregate', 865, 300, { role: 'Agregados por minuto' }),
      placed('warehouse', 'history', 865, 385, { role: 'Histórico' }),
      BASE('secrets'), monitoring(),
    ], [
      ...ENTRY, { from: 'edge', to: 'static' }, { from: 'lb', to: 'ingest' },
      { from: 'ingest', to: 'readings', kind: 'EVENT_BUS' }, { from: 'readings', to: 'aggregate', kind: 'EVENT_BUS' },
      { from: 'aggregate', to: 'history', kind: 'ANALYTICS_SINK' }, { from: 'aggregate', to: 'devices' },
      { from: 'api', to: 'devices' }, { from: 'api', to: 'redis' }, { from: 'api', to: 'secrets' }, { from: 'api', to: 'observability' },
    ], {
      choices: { client: 'web-spa', backend: 'go', api: 'events', auth: 'jwt-own', database: 'key-value', cache: 'redis', queue: 'stream' },
      deployments: { client: 'static', backend: 'ingest', database: 'devices', cache: 'redis', queue: 'readings' },
      nfr: { users: 5000, rps: 8000, latencyMs: 1000, availability: 99.9, budgetUsd: 600, compliance: [] },
    }),
  },
];

export const SYSTEM_TEMPLATE_IDS: string[] = SYSTEM_TEMPLATES.map((template) => template.id);
