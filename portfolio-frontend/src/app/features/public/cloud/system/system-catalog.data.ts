/**
 * Diseño de sistemas (flag `studio.system-design`): el catálogo de la vista de Aplicación y las
 * reglas de los requisitos no funcionales. Son datos: `npm run export:presets` los escribe en
 * `architecture/system-design.json`, que es lo que lee el backend, así que añadir una opción o una
 * regla es añadir una entrada aquí.
 *
 * Las tecnologías van por su nombre, en texto: ningún logo (docs/brand-usage.md).
 */
export type SystemCategoryId = 'client' | 'backend' | 'api' | 'auth' | 'database' | 'cache' | 'queue' | 'bff' | 'push';

export interface SystemOption {
  id: string;
  name: string;
  /** Qué es y cuándo se elige, en una línea. */
  summary: string;
  /**
   * Tipos de nodo de la vista de Infraestructura en los que esta pieza se puede desplegar.
   * Vacío: no se despliega en la nube (una app móvil, o algo que vive dentro del backend).
   */
  deploysOn: string[];
  /** Por qué no se despliega, cuando `deploysOn` está vacío. */
  notDeployed?: string;
  /** Contrato que se genera para este estilo de API. */
  contract?: 'openapi' | 'proto';
}

export interface SystemCategory {
  id: SystemCategoryId;
  name: string;
  /** Qué se decide en esta categoría. */
  question: string;
  /** Sin elegir, la pieza no forma parte del sistema. Las obligatorias siempre tienen una opción. */
  optional: boolean;
  options: SystemOption[];
}

const COMPUTE = ['containers', 'kubernetes', 'app-platform', 'functions', 'vm'];

export const SYSTEM_CATALOG: SystemCategory[] = [
  {
    id: 'client', name: 'Cliente', question: '¿Desde dónde se usa?', optional: false,
    options: [
      { id: 'web-spa', name: 'Web · SPA (Angular, React)', summary: 'Aplicación de una sola página: archivos estáticos que hablan con la API.', deploysOn: ['static', 'bucket', 'app-platform'] },
      { id: 'web-ssr', name: 'Web · render en servidor', summary: 'El HTML se genera en el servidor: mejor primera carga y SEO, a cambio de mantener un proceso.', deploysOn: COMPUTE },
      { id: 'mobile-native', name: 'Móvil · nativo (Swift, Kotlin)', summary: 'Una app por plataforma: acceso completo al dispositivo, dos bases de código.', deploysOn: [], notDeployed: 'Se distribuye por las tiendas de aplicaciones, no en la nube.' },
      { id: 'mobile-cross', name: 'Móvil · multiplataforma (Flutter, React Native)', summary: 'Una base de código para iOS y Android.', deploysOn: [], notDeployed: 'Se distribuye por las tiendas de aplicaciones, no en la nube.' },
    ],
  },
  {
    id: 'backend', name: 'Backend', question: '¿Con qué se escribe la lógica?', optional: false,
    options: [
      { id: 'spring-boot', name: 'Java · Spring Boot', summary: 'Ecosistema maduro para dominios complejos y equipos grandes.', deploysOn: COMPUTE },
      { id: 'node', name: 'Node.js · NestJS', summary: 'Mismo lenguaje que el cliente web; cómodo para entrada y salida intensivas.', deploysOn: COMPUTE },
      { id: 'go', name: 'Go', summary: 'Binarios pequeños y arranque rápido; encaja con contenedores y funciones.', deploysOn: COMPUTE },
    ],
  },
  {
    id: 'api', name: 'Estilo de API', question: '¿Cómo hablan cliente y backend?', optional: false,
    options: [
      { id: 'rest', name: 'REST', summary: 'Recursos sobre HTTP con un contrato OpenAPI: lo que más clientes entienden.', deploysOn: [], notDeployed: 'Es un contrato, no una pieza que se despliegue.', contract: 'openapi' },
      { id: 'grpc', name: 'gRPC', summary: 'Contrato .proto y llamadas binarias: eficiente entre servicios; el navegador necesita un proxy.', deploysOn: [], notDeployed: 'Es un contrato, no una pieza que se despliegue.', contract: 'proto' },
      { id: 'graphql', name: 'GraphQL', summary: 'El cliente pide exactamente los campos que necesita, en una sola petición.', deploysOn: [], notDeployed: 'Es un contrato, no una pieza que se despliegue.' },
      { id: 'events', name: 'Eventos', summary: 'Los servicios se avisan publicando eventos: desacoplados, y con consistencia eventual.', deploysOn: [], notDeployed: 'Es un contrato, no una pieza que se despliegue.' },
    ],
  },
  {
    id: 'auth', name: 'Autenticación', question: '¿Quién identifica al usuario?', optional: false,
    options: [
      { id: 'oidc-managed', name: 'OAuth2 / OIDC con proveedor gestionado', summary: 'El inicio de sesión lo lleva un servicio de identidad; el backend solo valida tokens.', deploysOn: ['identity'] },
      { id: 'jwt-own', name: 'JWT emitido por el backend', summary: 'El backend guarda las credenciales y firma los tokens: menos piezas, más responsabilidad.', deploysOn: [], notDeployed: 'Vive dentro del backend: no es una pieza aparte.' },
      { id: 'session', name: 'Sesión con cookie', summary: 'La sesión se guarda en el servidor; se revoca al instante y necesita un almacén compartido.', deploysOn: ['redis'] },
    ],
  },
  {
    id: 'database', name: 'Base de datos', question: '¿Dónde viven los datos?', optional: false,
    options: [
      { id: 'postgresql', name: 'Relacional · PostgreSQL', summary: 'Transacciones y consultas con uniones: la opción por defecto.', deploysOn: ['postgres', 'newsql-pg', 'global-database', 'global-sql'] },
      { id: 'document', name: 'Documentos · MongoDB', summary: 'Documentos con esquema flexible, leídos y escritos enteros.', deploysOn: ['mongodb', 'nosql'] },
      { id: 'key-value', name: 'Clave-valor gestionado', summary: 'Acceso por clave con latencia estable a cualquier escala; sin uniones.', deploysOn: ['nosql', 'wide-column'] },
    ],
  },
  {
    id: 'cache', name: 'Caché', question: '¿Qué se evita recalcular?', optional: true,
    options: [
      { id: 'redis', name: 'Redis', summary: 'Caché en memoria junto al backend, con caducidad por clave.', deploysOn: ['redis'] },
      { id: 'cdn', name: 'Caché en el borde (CDN)', summary: 'Las respuestas se guardan cerca del usuario: sirve para lo que es igual para todos.', deploysOn: ['edge', 'static'] },
    ],
  },
  {
    id: 'queue', name: 'Colas y eventos', question: '¿Qué trabajo puede esperar?', optional: true,
    options: [
      { id: 'queue', name: 'Cola de mensajes', summary: 'Cada mensaje lo procesa un consumidor; absorbe picos y reintenta.', deploysOn: ['queue', 'rabbitmq'] },
      { id: 'stream', name: 'Stream de eventos', summary: 'Registro ordenado que varios consumidores leen a su ritmo y pueden releer.', deploysOn: ['streaming', 'event-stream', 'kafka'] },
      { id: 'pubsub', name: 'Publicación y suscripción', summary: 'Un aviso llega a todos los suscriptores; sin historial.', deploysOn: ['pubsub'] },
    ],
  },
  {
    id: 'bff', name: 'BFF', question: '¿Hay una capa a medida de cada cliente?', optional: true,
    options: [
      { id: 'bff', name: 'BFF por cliente', summary: 'Un backend fino por tipo de cliente que agrega y adapta las respuestas.', deploysOn: COMPUTE },
      { id: 'gateway', name: 'API gateway', summary: 'Una entrada común con autenticación, límites y enrutado; sin lógica de cliente.', deploysOn: ['api-gateway'] },
    ],
  },
  {
    id: 'push', name: 'Tiempo real y push', question: '¿El servidor avisa al cliente?', optional: true,
    options: [
      { id: 'push-service', name: 'Notificaciones push', summary: 'Avisos al dispositivo aunque la app esté cerrada, a través del servicio de cada plataforma.', deploysOn: ['pubsub', 'functions'] },
      { id: 'websocket', name: 'WebSocket', summary: 'Conexión abierta en los dos sentidos: chat, colaboración, tableros en vivo.', deploysOn: ['containers', 'kubernetes', 'api-gateway'] },
      { id: 'sse', name: 'Server-Sent Events', summary: 'El servidor envía eventos por HTTP en un solo sentido; lo más simple para tableros.', deploysOn: ['containers', 'kubernetes', 'app-platform'] },
    ],
  },
];

// ---------- Requisitos no funcionales ----------

export type NfrField = 'users' | 'rps' | 'latencyMs' | 'availability' | 'budgetUsd';
export type Compliance = 'pci' | 'health';

export interface NfrInput {
  field: NfrField;
  name: string;
  unit: string;
  min: number;
  max: number;
  /** Valores admitidos, si no es un número libre. */
  choices?: number[];
  help: string;
}

export const NFR_INPUTS: NfrInput[] = [
  { field: 'users', name: 'Usuarios activos al mes', unit: 'usuarios', min: 1, max: 1_000_000_000, help: 'Cuánta gente lo usa en un mes.' },
  { field: 'rps', name: 'Peticiones por segundo en el pico', unit: 'req/s', min: 1, max: 1_000_000, help: 'El pico, no la media: es lo que dimensiona.' },
  { field: 'latencyMs', name: 'Latencia p95 objetivo', unit: 'ms', min: 1, max: 60_000, help: 'Tiempo en el que deben responder 95 de cada 100 peticiones.' },
  { field: 'availability', name: 'Disponibilidad objetivo', unit: '%', min: 99, max: 99.99, choices: [99, 99.9, 99.95, 99.99], help: '99,9 % son unas 8,8 horas de caída al año; 99,99 %, unos 53 minutos.' },
  { field: 'budgetUsd', name: 'Presupuesto mensual', unit: 'USD', min: 1, max: 10_000_000, help: 'Tope de la factura de la nube al mes.' },
];

export const COMPLIANCE_OPTIONS: { id: Compliance; name: string; help: string }[] = [
  { id: 'pci', name: 'Pagos con tarjeta (PCI DSS)', help: 'El sistema guarda, procesa o transmite datos de tarjetas.' },
  { id: 'health', name: 'Datos de salud', help: 'El sistema trata historiales o datos clínicos de personas.' },
];

/** Lo que una regla espera encontrar en el diseño cuando se cumple su condición. */
export type NfrExpectation =
  /** La categoría tiene elegida una de estas opciones. */
  | { kind: 'choice-in'; category: SystemCategoryId; options: string[] }
  /** En la vista de Infraestructura hay al menos un nodo de alguno de estos tipos. */
  | { kind: 'infra-any'; types: string[] }
  /** Si hay nodos de estos tipos, hay al menos dos; o hay alguno de los tipos de `orAny`. */
  | { kind: 'infra-replicated'; types: string[]; orAny: string[] }
  /** El coste estimado no supera el presupuesto. Sin estimación, no se evalúa. */
  | { kind: 'cost-within-budget' };

export interface NfrRule {
  id: string;
  /** Condición sobre lo que se ha pedido: un umbral numérico o una regulación marcada. */
  when: { field: NfrField; op: '>=' | '<='; value: number } | { compliance: Compliance };
  expect: NfrExpectation;
  /** `{value}` es el valor pedido; en la de presupuesto, `{cost}` y `{budget}`. */
  message: string;
  suggestion: string;
}

const DATABASES = ['postgres', 'newsql-pg', 'mongodb'];
const MONITORING = ['native-monitoring', 'datadog', 'prometheus', 'opentelemetry'];
const ELASTIC_COMPUTE = ['containers', 'kubernetes', 'app-platform', 'functions'];

export const NFR_RULES: NfrRule[] = [
  {
    id: 'rps-cache', when: { field: 'rps', op: '>=', value: 500 }, expect: { kind: 'choice-in', category: 'cache', options: ['redis', 'cdn'] },
    message: 'Con {value} peticiones por segundo y sin caché, todas las lecturas llegan a la base de datos.',
    suggestion: 'Elige una caché: Redis para datos por usuario, el borde para lo que es igual para todos.',
  },
  {
    id: 'rps-elastic-compute', when: { field: 'rps', op: '>=', value: 2000 }, expect: { kind: 'infra-any', types: ELASTIC_COMPUTE },
    message: 'Para {value} peticiones por segundo hace falta cómputo que añada réplicas solo.',
    suggestion: 'Despliega el backend en contenedores, Kubernetes o funciones, no en máquinas fijas.',
  },
  {
    id: 'rps-async', when: { field: 'rps', op: '>=', value: 2000 }, expect: { kind: 'choice-in', category: 'queue', options: ['queue', 'stream', 'pubsub'] },
    message: 'A {value} peticiones por segundo, el trabajo lento hecho dentro de la petición agota el backend en los picos.',
    suggestion: 'Saca ese trabajo a una cola o a un stream de eventos.',
  },
  {
    id: 'latency-cache', when: { field: 'latencyMs', op: '<=', value: 100 }, expect: { kind: 'choice-in', category: 'cache', options: ['redis', 'cdn'] },
    message: 'Una p95 de {value} ms deja poco margen para consultar la base de datos en cada petición.',
    suggestion: 'Elige una caché para las lecturas más frecuentes.',
  },
  {
    id: 'latency-edge', when: { field: 'latencyMs', op: '<=', value: 100 }, expect: { kind: 'infra-any', types: ['edge', 'static'] },
    message: 'Con una p95 de {value} ms, la distancia entre el usuario y la región cuenta.',
    suggestion: 'Sirve lo estático desde una CDN, cerca del usuario.',
  },
  {
    id: 'availability-database', when: { field: 'availability', op: '>=', value: 99.9 },
    expect: { kind: 'infra-replicated', types: DATABASES, orAny: ['global-database', 'global-sql', 'nosql', 'wide-column'] },
    message: 'Una disponibilidad del {value} % no se sostiene con una sola instancia de base de datos.',
    suggestion: 'Añade una réplica en espera en otra zona.',
  },
  {
    id: 'availability-entry', when: { field: 'availability', op: '>=', value: 99.9 }, expect: { kind: 'infra-any', types: ['lb', 'api-gateway'] },
    message: 'Para el {value} % hacen falta varias réplicas del backend y algo que reparta el tráfico entre ellas.',
    suggestion: 'Pon un balanceador o un API gateway delante del backend.',
  },
  {
    id: 'availability-multi-region', when: { field: 'availability', op: '>=', value: 99.99 }, expect: { kind: 'infra-any', types: ['global-database', 'global-sql'] },
    message: 'El {value} % son menos de 53 minutos de caída al año: la caída de una región entera ya no cabe.',
    suggestion: 'Lleva los datos a una base de datos con réplica en otra región.',
  },
  {
    id: 'users-observability', when: { field: 'users', op: '>=', value: 100_000 }, expect: { kind: 'infra-any', types: MONITORING },
    message: 'Con {value} usuarios, un fallo que no se mide se descubre por las quejas.',
    suggestion: 'Añade monitorización con métricas y alertas.',
  },
  {
    id: 'pci-waf', when: { compliance: 'pci' }, expect: { kind: 'infra-any', types: ['waf'] },
    message: 'Un sistema que trata datos de tarjetas expuesto a Internet necesita filtrar el tráfico malicioso.',
    suggestion: 'Añade un cortafuegos de aplicación (WAF) delante.',
  },
  {
    id: 'pci-secrets', when: { compliance: 'pci' }, expect: { kind: 'infra-any', types: ['secrets', 'vault'] },
    message: 'Las claves con las que se cifran los datos de tarjetas no pueden vivir en la configuración.',
    suggestion: 'Guárdalas en un gestor de secretos, con rotación.',
  },
  {
    id: 'pci-audit', when: { compliance: 'pci' }, expect: { kind: 'infra-any', types: MONITORING },
    message: 'Hay que poder reconstruir quién accedió a los datos de tarjetas y cuándo.',
    suggestion: 'Añade monitorización y conserva los registros de acceso.',
  },
  {
    id: 'health-secrets', when: { compliance: 'health' }, expect: { kind: 'infra-any', types: ['secrets', 'vault'] },
    message: 'Los datos de salud se cifran, y sus claves no pueden vivir en la configuración.',
    suggestion: 'Guárdalas en un gestor de secretos.',
  },
  {
    id: 'health-identity', when: { compliance: 'health' }, expect: { kind: 'choice-in', category: 'auth', options: ['oidc-managed'] },
    message: 'El acceso a datos de salud exige identificar a cada persona y poder retirarle el acceso.',
    suggestion: 'Usa un proveedor de identidad gestionado, con segundo factor.',
  },
  {
    id: 'budget', when: { field: 'budgetUsd', op: '>=', value: 1 }, expect: { kind: 'cost-within-budget' },
    message: 'El coste estimado (≈ ${cost} al mes) supera el presupuesto de ${budget}.',
    suggestion: 'Quita piezas, elige tamaños menores o sube el presupuesto.',
  },
];

/** Lo que se exporta al backend, tal cual. */
export const SYSTEM_DESIGN_DATA = { catalog: SYSTEM_CATALOG, inputs: NFR_INPUTS, compliance: COMPLIANCE_OPTIONS, rules: NFR_RULES };
