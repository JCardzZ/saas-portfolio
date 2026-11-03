/**
 * Cuántas instancias de cada servicio tiene sentido poner en una arquitectura, y por qué. Son datos:
 * `maxInstances` y `instanceGroups` de las reglas del grafo salen de aquí, y el backend valida lo mismo
 * al guardar un proyecto (`architecture/graph-rules.json`).
 *
 * Tres clases, como las razonaría un arquitecto cloud:
 *   - plataforma: lo comparten todas las piezas (secretos, observabilidad, registro, WAF, DNS…). Uno.
 *   - cómputo: cada copia es otro servicio. Varias, con nombre propio, hasta un tope en el que conviene
 *     agruparlas o pasar a un orquestador.
 *   - datos: varias instancias del mismo almacén se justifican poco; se reparten esquemas dentro de una.
 */

export type InstanceClass = 'platform' | 'compute' | 'data';

export interface InstanceLimit {
  max: number;
  kind: InstanceClass;
}

/** Límite por tipo de nodo. Un tipo que no aparece no tiene límite. */
export const INSTANCE_LIMITS: Record<string, InstanceLimit> = {
  // ── Plataforma: uno por arquitectura ──
  users: { max: 1, kind: 'platform' },
  edge: { max: 1, kind: 'platform' },
  static: { max: 1, kind: 'platform' },
  secrets: { max: 1, kind: 'platform' },
  vault: { max: 1, kind: 'platform' },
  'native-monitoring': { max: 1, kind: 'platform' },
  prometheus: { max: 1, kind: 'platform' },
  datadog: { max: 1, kind: 'platform' },
  opentelemetry: { max: 1, kind: 'platform' },
  registry: { max: 1, kind: 'platform' },
  waf: { max: 1, kind: 'platform' },
  dns: { max: 1, kind: 'platform' },
  identity: { max: 1, kind: 'platform' },
  'api-gateway': { max: 1, kind: 'platform' },
  cicd: { max: 1, kind: 'platform' },
  'ml-platform': { max: 1, kind: 'platform' },
  gemini: { max: 1, kind: 'platform' },
  // Un balanceador público y, como mucho, uno interno.
  lb: { max: 2, kind: 'platform' },
  // ── Cómputo: varias, cada una un servicio ──
  containers: { max: 6, kind: 'compute' },
  vm: { max: 6, kind: 'compute' },
  functions: { max: 10, kind: 'compute' },
  'app-platform': { max: 4, kind: 'compute' },
  kubernetes: { max: 2, kind: 'compute' },
  workflow: { max: 3, kind: 'compute' },
  // ── Datos ──
  postgres: { max: 3, kind: 'data' },
  redis: { max: 2, kind: 'data' },
  nosql: { max: 3, kind: 'data' },
  'newsql-pg': { max: 2, kind: 'data' },
  'global-sql': { max: 2, kind: 'data' },
  'global-database': { max: 3, kind: 'data' },
  graph: { max: 1, kind: 'data' },
  mongodb: { max: 2, kind: 'data' },
  'wide-column': { max: 1, kind: 'data' },
  search: { max: 1, kind: 'data' },
  warehouse: { max: 1, kind: 'data' },
  'sql-query': { max: 1, kind: 'data' },
  bucket: { max: 5, kind: 'data' },
  streaming: { max: 2, kind: 'data' },
  'event-stream': { max: 4, kind: 'data' },
  queue: { max: 4, kind: 'data' },
  pubsub: { max: 2, kind: 'data' },
  rabbitmq: { max: 1, kind: 'data' },
  kafka: { max: 1, kind: 'data' },
  'stream-processing': { max: 2, kind: 'data' },
  cdc: { max: 3, kind: 'data' },
  debezium: { max: 2, kind: 'data' },
  goldengate: { max: 1, kind: 'data' },
  snowflake: { max: 1, kind: 'data' },
  databricks: { max: 1, kind: 'data' },
  bi: { max: 1, kind: 'data' },
  tableau: { max: 1, kind: 'data' },
  powerbi: { max: 1, kind: 'data' },
  'looker-studio': { max: 1, kind: 'data' },
};

/** Servicios distintos que cumplen el mismo papel: entre todos, como mucho `max`. */
export interface InstanceGroup {
  id: string;
  types: string[];
  max: number;
  why: string;
  suggestion: string;
}

export const INSTANCE_GROUPS: InstanceGroup[] = [
  {
    id: 'secrets-store', types: ['secrets', 'vault'], max: 1,
    why: 'Un solo almacén de secretos: dos fuentes de verdad para las credenciales acaban desincronizadas.',
    suggestion: 'Quédate con el gestor de la nube o con Vault, no con los dos.',
  },
  {
    id: 'bi-tool', types: ['bi', 'tableau', 'powerbi', 'looker-studio'], max: 1,
    why: 'Una sola herramienta de paneles: dos dan cifras distintas para la misma pregunta.',
    suggestion: 'Elige una herramienta de BI y conéctala al almacén de datos.',
  },
];

/** Por qué no caben más, según la clase. `{name}` es el servicio; `{max}`, su límite. */
export const LIMIT_ADVICE: Record<InstanceClass, { single: string; many: string; suggestion: string }> = {
  platform: {
    single: '{name} ya está en el lienzo. Es un servicio de plataforma: una sola instancia sirve a todas las piezas.',
    many: 'Ya hay {max} {name}: más de eso en una misma arquitectura no aporta nada.',
    suggestion: 'Conecta las piezas nuevas al que ya tienes.',
  },
  compute: {
    single: '{name} ya está en el lienzo y esta arquitectura admite uno.',
    many: 'Ya hay {max} servicios en {name}. Con más, conviene agruparlos o pasar a un orquestador.',
    suggestion: 'Reutiliza uno de los que hay o usa Kubernetes para muchos servicios.',
  },
  data: {
    single: '{name} ya está en el lienzo. Otra instancia del mismo almacén duplica copias, conexiones y coste.',
    many: 'Ya hay {max} {name}: más instancias del mismo almacén complican la operación.',
    suggestion: 'Usa otra base de datos o esquema dentro de la instancia que ya tienes.',
  },
};
