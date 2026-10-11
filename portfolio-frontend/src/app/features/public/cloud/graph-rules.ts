import { CatalogItem, LogicalType, SERVICE_CATALOG } from './cloud-catalog.data';
import { CloudLink, CloudNode, LinkKind } from './cloud-topology.data';

/** Extremo de una conexión a efectos de las reglas: un papel de datos o cualquier otra pieza. */
export type Endpoint = LogicalType | 'service';

/**
 * Reglas del grafo, como datos. Son las mismas que valida el backend al guardar un proyecto:
 * `npm run export:presets` las escribe en `architecture/graph-rules.json`.
 */
export interface GraphRules {
  /** Papel de datos de cada tipo de nodo; un tipo que no aparece es un servicio cualquiera. */
  logical: Record<string, LogicalType>;
  /** De qué puede recibir una conexión cada papel. */
  incoming: Record<LogicalType, Endpoint[]>;
  /** Entre qué extremos tiene sentido cada tipo de conexión. */
  kinds: Record<LinkKind, { from: Endpoint[]; to: Endpoint[] }>;
  /** Cuántas instancias de un mismo tipo admite un lienzo. */
  maxInstances: Record<string, number>;
}

const ITEMS: CatalogItem[] = SERVICE_CATALOG.flatMap((category) => category.items);
const DATABASES: Endpoint[] = ['database', 'global-database'];

export const GRAPH_RULES: GraphRules = {
  logical: {
    // Piezas de la arquitectura de referencia, que no están en el catálogo.
    postgres: 'database',
    ...Object.fromEntries(ITEMS.flatMap((item) => (item.logical ? [[item.type, item.logical]] : []))),
  },
  incoming: {
    database: ['service', 'database', 'global-database', 'cdc', 'stream-processing'],
    'global-database': ['service', 'database', 'global-database', 'cdc'],
    // El CDC lee el registro de transacciones: solo una base de datos puede alimentarlo.
    cdc: ['database', 'global-database'],
    'event-stream': ['service', 'cdc', 'event-stream', 'queue', 'stream-processing'],
    queue: ['service', 'cdc', 'event-stream', 'queue', 'stream-processing'],
    // Un procesador de streams consume de un stream, una cola o un CDC, no de una petición.
    'stream-processing': ['cdc', 'event-stream', 'queue'],
    'data-warehouse': ['service', 'database', 'global-database', 'cdc', 'event-stream', 'queue', 'stream-processing', 'data-warehouse'],
    // Los paneles leen de un almacén o de una base de datos, nunca de la aplicación ni de un stream.
    bi: ['data-warehouse', 'database', 'global-database'],
  },
  kinds: {
    CDC_STREAM: { from: [...DATABASES, 'cdc'], to: ['cdc', 'event-stream', 'queue', 'stream-processing', 'data-warehouse', ...DATABASES] },
    EVENT_BUS: { from: ['service', 'cdc', 'event-stream', 'queue', 'stream-processing'], to: ['service', 'event-stream', 'queue', 'stream-processing'] },
    ANALYTICS_SINK: { from: ['service', ...DATABASES, 'cdc', 'event-stream', 'queue', 'stream-processing', 'data-warehouse'], to: ['data-warehouse', 'bi'] },
    REPLICATION: { from: DATABASES, to: DATABASES },
  },
  maxInstances: Object.fromEntries(ITEMS.flatMap((item) => (item.maxInstances ? [[item.type, item.maxInstances]] : []))),
};

export function endpointOf(type: string, rules: GraphRules = GRAPH_RULES): Endpoint {
  return rules.logical[type] ?? 'service';
}

/** ¿Puede una pieza de tipo `from` enviar datos a una de tipo `to`? */
export function canConnect(from: string, to: string, rules: GraphRules = GRAPH_RULES): boolean {
  const target = endpointOf(to, rules);
  return target === 'service' || rules.incoming[target].includes(endpointOf(from, rules));
}

/**
 * Tipo de conexión que corresponde a dos extremos, o `undefined` si es tráfico de peticiones
 * corriente (un servicio que consulta su base de datos, por ejemplo).
 */
export function inferKind(from: string, to: string, rules: GraphRules = GRAPH_RULES): LinkKind | undefined {
  const source = endpointOf(from, rules);
  const target = endpointOf(to, rules);
  const isDatabase = (endpoint: Endpoint) => DATABASES.includes(endpoint);
  if (target === 'data-warehouse' || target === 'bi') {
    return source === 'cdc' ? 'CDC_STREAM' : 'ANALYTICS_SINK';
  }
  if (source === 'cdc' || target === 'cdc') {
    return 'CDC_STREAM';
  }
  if (isDatabase(source) && isDatabase(target)) {
    return 'REPLICATION';
  }
  const messaging: Endpoint[] = ['event-stream', 'queue', 'stream-processing'];
  if (messaging.includes(source) || messaging.includes(target)) {
    return isDatabase(target) || isDatabase(source) ? undefined : 'EVENT_BUS';
  }
  return undefined;
}

export interface RuleViolation {
  rule: 'connection' | 'link-kind' | 'max-instances';
  /** Nodo junto al que se muestra el aviso. */
  nodeId: string;
  /** Conexión que lo provoca, si es una regla de conexión. */
  link?: { from: string; to: string };
  message: string;
}

const ENDPOINT_NAMES: Record<Endpoint, string> = {
  service: 'un servicio', database: 'una base de datos', 'global-database': 'una base de datos global', cdc: 'un CDC',
  'event-stream': 'un stream de eventos', queue: 'una cola', 'stream-processing': 'un procesador de streams',
  'data-warehouse': 'un almacén de datos', bi: 'una herramienta de BI',
};

/**
 * Comprueba el grafo contra las reglas. `nameOf` da el nombre con el que se ve cada nodo, para
 * que el aviso hable como el lienzo. Nunca impide abrir ni editar: solo informa.
 */
export function checkGraph(
  nodes: CloudNode[], links: CloudLink[], nameOf: (node: CloudNode) => string = (node) => node.id, rules: GraphRules = GRAPH_RULES,
): RuleViolation[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const violations: RuleViolation[] = [];

  for (const link of links) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) {
      continue;
    }
    const source = endpointOf(from.type, rules);
    const target = endpointOf(to.type, rules);
    if (!canConnect(from.type, to.type, rules)) {
      const allowed = rules.incoming[target as LogicalType].map((endpoint) => ENDPOINT_NAMES[endpoint]).join(', ');
      violations.push({
        rule: 'connection', nodeId: to.id, link: { from: from.id, to: to.id },
        message: `Conexión no permitida: ${nameOf(from)} → ${nameOf(to)}. ${capitalize(ENDPOINT_NAMES[target])} solo recibe de: ${allowed}.`,
      });
    } else if (link.kind && !(rules.kinds[link.kind].from.includes(source) && rules.kinds[link.kind].to.includes(target))) {
      violations.push({
        rule: 'link-kind', nodeId: to.id, link: { from: from.id, to: to.id },
        message: `Tipo de conexión ${link.kind} no válido entre ${nameOf(from)} y ${nameOf(to)}.`,
      });
    }
  }

  const byType = new Map<string, CloudNode[]>();
  for (const node of nodes) {
    byType.set(node.type, [...(byType.get(node.type) ?? []), node]);
  }
  for (const [type, same] of byType) {
    const max = rules.maxInstances[type];
    if (max !== undefined && same.length > max) {
      // El aviso va en las instancias que sobran, no en las primeras.
      for (const extra of same.slice(max)) {
        violations.push({
          rule: 'max-instances', nodeId: extra.id,
          message: max === 1
            ? `Instancia duplicada: ${nameOf(extra)}. Este lienzo admite una sola.`
            : `Demasiadas instancias de ${nameOf(extra)}: ${same.length} de ${max} como máximo.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Nodo al que conectar una pieza recién añadida: el origen habitual de su tráfico si las
 * reglas lo admiten y, si no, el nodo admitido más cercano. `null` si no hay ninguno: la
 * pieza se queda suelta en vez de nacer con una conexión no permitida.
 */
export function anchorFor(
  type: string, preferredId: string, position: { x: number; y: number }, nodes: CloudNode[], rules: GraphRules = GRAPH_RULES,
): CloudNode | null {
  const allowed = nodes.filter((node) => canConnect(node.type, type, rules));
  const preferred = allowed.find((node) => node.id === preferredId);
  if (preferred || endpointOf(type, rules) === 'service') {
    return preferred ?? null;
  }
  return allowed.reduce<CloudNode | null>((best, node) =>
    (!best || distance(node, position) < distance(best, position) ? node : best), null);
}

function distance(node: { x: number; y: number }, point: { x: number; y: number }): number {
  return Math.hypot(node.x - point.x, node.y - point.y);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
