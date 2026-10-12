import { CatalogItem, LogicalType, SERVICE_CATALOG } from './cloud-catalog.data';
import { CloudLink, CloudNode, LinkKind, ZoneId } from './cloud-topology.data';

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
  /** Por qué cada papel no recibe de cualquiera y qué hacer en su lugar. */
  advice: Record<LogicalType, RuleAdvice>;
  /** Piezas que no deberían estar en ciertas zonas de red. Avisan; no impiden guardar. */
  placement: PlacementRule[];
  /** Conexiones directas desde una zona que conviene pasar por una pieza intermedia. Avisan; no impiden guardar. */
  exposure: ExposureRule[];
}

export interface RuleAdvice {
  why: string;
  suggestion: string;
}

/** En `message` y `suggestion`, `{node}` es el nombre de la pieza. */
export interface PlacementRule {
  id: string;
  endpoints: Endpoint[];
  zones: ZoneId[];
  message: string;
  suggestion: string;
}

/** En `message` y `suggestion`, `{from}` y `{to}` son los nombres de los dos extremos. */
export interface ExposureRule {
  id: string;
  fromZones: ZoneId[];
  to: Endpoint[];
  message: string;
  suggestion: string;
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
  advice: {
    database: { why: 'Una base de datos recibe escrituras de un servicio, de otra base de datos o de un flujo ya procesado.', suggestion: 'Pon un servicio o un procesador de streams en medio.' },
    'global-database': { why: 'Una base de datos global recibe escrituras de un servicio o de otra base de datos.', suggestion: 'Pon un servicio en medio.' },
    cdc: { why: 'El CDC lee el registro de transacciones, así que solo una base de datos puede alimentarlo.', suggestion: 'Conéctalo desde la base de datos de origen.' },
    'event-stream': { why: 'Un stream de eventos recibe de un productor, de un CDC o de otra pieza de mensajería.', suggestion: 'Pon un servicio que publique los eventos o un CDC en medio.' },
    queue: { why: 'Una cola recibe de un productor, de un CDC o de otra pieza de mensajería.', suggestion: 'Pon un servicio que publique los mensajes o un CDC en medio.' },
    'stream-processing': { why: 'Un procesador de streams consume de un stream, una cola o un CDC, no de una petición.', suggestion: 'Pon una cola o un stream de eventos en medio.' },
    'data-warehouse': { why: 'Un almacén de datos carga de servicios, bases de datos y flujos de datos.', suggestion: 'Pon una base de datos o un stream de eventos en medio.' },
    bi: { why: 'Los paneles leen de un almacén o de una base de datos, nunca de la aplicación ni de un stream.', suggestion: 'Pon un almacén de datos en medio.' },
  },
  placement: [
    {
      id: 'database-in-public-subnet', endpoints: DATABASES, zones: ['public'],
      message: 'Riesgo de seguridad: {node} está en una subred pública, alcanzable desde Internet.',
      suggestion: 'Muévela a una subred privada y deja en la pública solo el balanceador o el API gateway.',
    },
  ],
  exposure: [
    {
      id: 'internet-to-database', fromZones: ['outside'], to: DATABASES,
      message: '{from} llega desde Internet y {to} es una base de datos: no debe quedar expuesta.',
      suggestion: 'Pon una API en medio: {from} → API → {to}.',
    },
  ],
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
  rule: 'connection' | 'link-kind' | 'max-instances' | 'placement' | 'exposure';
  /** Nodo junto al que se muestra el aviso. */
  nodeId: string;
  /** Conexión que lo provoca, si es una regla de conexión. */
  link?: { from: string; to: string };
  message: string;
  /** Qué hacer para resolverlo, cuando la regla lo dice. */
  suggestion?: string;
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

/** Resultado de intentar una conexión: si no se admite, por qué y qué hacer en su lugar. */
export type ConnectionVerdict = { allowed: true } | { allowed: false; reason: string; suggestion: string };

type Named = Pick<CloudNode, 'id' | 'type' | 'zone'>;

function fill(template: string, names: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => names[key] ?? whole);
}

function exposureOf(from: Named, to: Named, rules: GraphRules): ExposureRule | undefined {
  return rules.exposure.find((rule) => rule.fromZones.includes(from.zone) && rule.to.includes(endpointOf(to.type, rules)));
}

/**
 * ¿Se puede trazar una conexión nueva de `from` a `to`? Es más estricto que `canConnect`:
 * tampoco admite las conexiones que `exposure` desaconseja. Lo usa el lienzo mientras se
 * arrastra un cable (flag `studio.smart-rules`); en un grafo ya guardado esas solo avisan.
 */
export function connectionVerdict(
  from: CloudNode, to: CloudNode, nameOf: (node: CloudNode) => string = (node) => node.id, rules: GraphRules = GRAPH_RULES,
): ConnectionVerdict {
  const names = { from: nameOf(from), to: nameOf(to) };
  if (from.id === to.id) {
    return { allowed: false, reason: 'Un nodo no se conecta consigo mismo.', suggestion: 'Elige otro nodo como destino.' };
  }
  if (!canConnect(from.type, to.type, rules)) {
    const advice = rules.advice[endpointOf(to.type, rules) as LogicalType];
    return { allowed: false, reason: `${names.from} no puede enviar datos a ${names.to}. ${advice.why}`, suggestion: advice.suggestion };
  }
  const exposure = exposureOf(from, to, rules);
  if (exposure) {
    return { allowed: false, reason: fill(exposure.message, names), suggestion: fill(exposure.suggestion, names) };
  }
  return { allowed: true };
}

/**
 * Avisos de colocación y de exposición de un grafo: una base de datos en una subred pública,
 * una conexión directa desde Internet... No impiden abrir, editar ni guardar.
 */
export function advisories(
  nodes: CloudNode[], links: CloudLink[], nameOf: (node: CloudNode) => string = (node) => node.id, rules: GraphRules = GRAPH_RULES,
): RuleViolation[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const found: RuleViolation[] = [];
  for (const node of nodes) {
    for (const rule of rules.placement) {
      if (rule.zones.includes(node.zone) && rule.endpoints.includes(endpointOf(node.type, rules))) {
        const names = { node: nameOf(node) };
        found.push({ rule: 'placement', nodeId: node.id, message: fill(rule.message, names), suggestion: fill(rule.suggestion, names) });
      }
    }
  }
  for (const link of links) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    const rule = from && to ? exposureOf(from, to, rules) : undefined;
    if (from && to && rule) {
      const names = { from: nameOf(from), to: nameOf(to) };
      found.push({ rule: 'exposure', nodeId: to.id, link: { from: from.id, to: to.id }, message: fill(rule.message, names), suggestion: fill(rule.suggestion, names) });
    }
  }
  return found;
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
