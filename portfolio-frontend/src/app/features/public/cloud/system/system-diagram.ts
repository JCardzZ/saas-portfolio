import { TECH_ICONS } from '../../../../shared/ui/tech-icons';
import { CloudNode, CloudProviderId, forProvider, resolveIcon } from '../cloud-topology.data';
import { SYSTEM_CATALOG, SystemCategoryId } from './system-catalog.data';
import { SystemDesign, chosen } from './system-design';

/**
 * Diagrama de la vista de Aplicación: el sistema elegido, dibujado por capas (cliente, entrada,
 * aplicación y datos) con las conexiones entre sus piezas y, bajo cada una, el servicio de nube
 * en el que se despliega. Se recalcula con cada elección, así que el dibujo cambia al momento.
 *
 * Marcas (docs/brand-usage.md): las tecnologías van con su nombre en texto y un símbolo propio
 * de su papel (navegador, servidor, base de datos…), no con su logo: las guías de Spring, Go,
 * PostgreSQL y la Linux Foundation no permiten usar el logo sin permiso. Lo único con icono
 * oficial es el servicio de AWS, Azure o Google Cloud donde se despliega cada pieza.
 */
export type GlyphId = 'browser' | 'mobile' | 'server' | 'gateway' | 'database' | 'lock' | 'bolt' | 'globe' | 'queue' | 'bell' | 'waves';

/** Trazos propios (24 × 24, sin relleno) del papel de cada pieza. */
export const GLYPHS: Record<GlyphId, string> = {
  browser: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M6.5 6.5h.01M9.5 6.5h.01',
  mobile: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM7.5 8h.01M7.5 16h.01',
  gateway: 'M4 6v12M8 12h12M15 7l5 5-5 5',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9s1.3-6.5 3.8-9z',
  queue: 'M4 7h4v10H4zM10 7h4v10h-4zM16 7h4v10h-4z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  waves: 'M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0',
};

/** Nombre corto de cada opción, para que quepa en su nodo. El nombre completo va en su nombre accesible. */
export const SHORT_NAMES: Record<string, string> = {
  'web-spa': 'Web · SPA', 'web-ssr': 'Web · SSR', 'mobile-native': 'Móvil nativo', 'mobile-cross': 'Multiplataforma',
  'spring-boot': 'Spring Boot', node: 'Node.js · NestJS', go: 'Go',
  rest: 'REST', grpc: 'gRPC', graphql: 'GraphQL', events: 'Eventos',
  'oidc-managed': 'OIDC gestionado', 'jwt-own': 'JWT propio', session: 'Sesión con cookie',
  postgresql: 'PostgreSQL', document: 'MongoDB', 'key-value': 'Clave-valor',
  redis: 'Redis', cdn: 'CDN',
  queue: 'Cola de mensajes', stream: 'Stream de eventos', pubsub: 'Pub/Sub',
  bff: 'BFF', gateway: 'API gateway',
  'push-service': 'Notificaciones push', websocket: 'WebSocket', sse: 'Server-Sent Events',
};

const GLYPH_OF: Record<string, GlyphId> = {
  'web-spa': 'browser', 'web-ssr': 'browser', 'mobile-native': 'mobile', 'mobile-cross': 'mobile',
  'spring-boot': 'server', node: 'server', go: 'server',
  'oidc-managed': 'lock', 'jwt-own': 'lock', session: 'lock',
  postgresql: 'database', document: 'database', 'key-value': 'database',
  redis: 'bolt', cdn: 'globe',
  queue: 'queue', stream: 'queue', pubsub: 'queue',
  bff: 'server', gateway: 'gateway',
  'push-service': 'bell', websocket: 'waves', sse: 'waves',
};

/** Rótulo de la categoría dentro del nodo, cuando su nombre completo no cabe. */
const KIND_NAMES: Partial<Record<SystemCategoryId, string>> = { push: 'Tiempo real', queue: 'Colas' };

/** Rótulos de las conexiones: cortos, porque van en el hueco entre dos capas. */
const DATA_LABEL: Record<string, string> = { postgresql: 'SQL', document: 'docs', 'key-value': 'clave' };
const QUEUE_LABEL: Record<string, string> = { queue: 'encola', stream: 'eventos', pubsub: 'avisos' };
const AUTH_LABEL: Record<string, string> = { 'jwt-own': 'JWT', session: 'sesión' };

export type LaneId = 'client' | 'entry' | 'app' | 'data';
const LANE_NAMES: Record<LaneId, string> = { client: 'Cliente', entry: 'Entrada', app: 'Aplicación', data: 'Datos' };

export interface DiagramLane {
  id: LaneId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramNode {
  /** La categoría de la vista de Aplicación a la que corresponde. */
  id: SystemCategoryId;
  /** Cambia con la opción elegida: el dibujo de la pieza se renueva al cambiarla. */
  key: string;
  lane: LaneId;
  kind: string;
  title: string;
  fullName: string;
  glyph: GlyphId;
  /** Servicio de nube en el que se despliega; su icono, solo si es uno oficial de arquitectura. */
  deployedOn: { name: string; image: string | null } | null;
  /** Por qué no lleva servicio debajo: no se despliega en la nube, o aún no se ha elegido dónde. */
  note: string | null;
  pending: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EdgeKind = 'request' | 'data' | 'async' | 'auth';

export interface DiagramEdge {
  id: string;
  from: SystemCategoryId;
  to: SystemCategoryId;
  label: string;
  kind: EdgeKind;
  path: string;
  labelAt: [number, number];
}

export interface SystemDiagram {
  width: number;
  height: number;
  vertical: boolean;
  lanes: DiagramLane[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const NODE_W = 176;
export const NODE_H = 78;
const LANE_PAD = 14;
const LANE_HEAD = 26;
const NODE_GAP = 18;
/** Hueco entre capas: por él pasan las conexiones y sus rótulos. */
export const LANE_GAP = 60;
const LANE_GAP_VERTICAL = 44;
const MARGIN = 8;
/** Margen a cada lado, en vertical, por donde bajan las conexiones que rodean una pieza. */
const SIDE = 14;
const MARGIN_V = 2;
const LANE_PAD_V = 8;
/** Ancho mínimo de una pieza: por debajo, su texto ya no se lee. */
export const MIN_NODE_W = 150;
const DEPLOY_MAX = 24;

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** En qué capa va cada pieza elegida, y en qué orden dentro de ella. */
function lanesOf(design: SystemDesign): Record<LaneId, SystemCategoryId[]> {
  const has = (id: SystemCategoryId) => chosen(design, id) !== null;
  const cache = design.choices.cache;
  const auth = design.choices.auth;
  return {
    client: ['client'],
    entry: [
      ...(cache === 'cdn' ? ['cache' as const] : []),
      ...(has('bff') ? ['bff' as const] : []),
      ...(auth === 'oidc-managed' ? ['auth' as const] : []),
      ...(has('push') ? ['push' as const] : []),
    ],
    app: ['backend', ...(auth && auth !== 'oidc-managed' ? ['auth' as const] : [])],
    data: ['database', ...(cache === 'redis' ? ['cache' as const] : []), ...(has('queue') ? ['queue' as const] : [])],
  };
}

function connections(design: SystemDesign): Omit<DiagramEdge, 'path' | 'labelAt'>[] {
  const api = SHORT_NAMES[design.choices.api ?? ''] ?? '';
  const edges: Omit<DiagramEdge, 'path' | 'labelAt'>[] = [];
  const add = (from: SystemCategoryId, to: SystemCategoryId, label: string, kind: EdgeKind) =>
    edges.push({ id: `${from}-${to}`, from, to, label, kind });
  const entry: SystemCategoryId = design.choices.bff ? 'bff' : 'backend';

  if (design.choices.cache === 'cdn') {
    add('client', 'cache', 'HTTPS', 'request');
    add('cache', entry, api, 'request');
  } else {
    add('client', entry, api, 'request');
  }
  if (design.choices.bff) {
    add('bff', 'backend', api, 'request');
  }
  add('backend', 'database', DATA_LABEL[design.choices.database ?? ''] ?? '', 'data');
  if (design.choices.cache === 'redis') {
    add('backend', 'cache', 'caché', 'data');
  }
  if (design.choices.queue) {
    add('backend', 'queue', QUEUE_LABEL[design.choices.queue] ?? '', 'async');
  }
  if (design.choices.auth === 'oidc-managed') {
    add('client', 'auth', 'acceso', 'auth');
    add('backend', 'auth', 'token', 'auth');
  } else if (design.choices.auth) {
    add('backend', 'auth', AUTH_LABEL[design.choices.auth] ?? '', 'auth');
  }
  if (design.choices.push) {
    add('backend', 'push', 'envía', 'async');
    add('push', 'client', 'avisa', 'async');
  }
  return edges.filter((edge) => chosen(design, edge.from) && chosen(design, edge.to));
}

/** Línea quebrada con las esquinas redondeadas. */
function rounded(points: [number, number][], radius = 8): string {
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const before = Math.min(radius, Math.hypot(x - px, y - py) / 2);
    const after = Math.min(radius, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px);
    const uy = Math.sign(y - py);
    const vx = Math.sign(nx - x);
    const vy = Math.sign(ny - y);
    path += ` L${x - ux * before} ${y - uy * before} Q${x} ${y} ${x + vx * after} ${y + vy * after}`;
  }
  const last = points[points.length - 1];
  return `${path} L${last[0]} ${last[1]}`;
}

/** Curva entre dos nodos vecinos: sale y entra por los lados que se miran. */
function direct(a: DiagramNode, b: DiagramNode): { path: string; labelAt: [number, number] } {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const sideways = Math.abs(bx - ax) >= Math.abs(by - ay) && Math.abs(bx - ax) > a.w / 2;
  if (sideways) {
    const right = bx > ax;
    const x1 = right ? a.x + a.w : a.x;
    const x2 = right ? b.x : b.x + b.w;
    const bend = (x2 - x1) / 2;
    return { path: `M${x1} ${ay} C${x1 + bend} ${ay} ${x2 - bend} ${by} ${x2} ${by}`, labelAt: [x1 + bend, (ay + by) / 2] };
  }
  const down = by > ay;
  const y1 = down ? a.y + a.h : a.y;
  const y2 = down ? b.y : b.y + b.h;
  const bend = (y2 - y1) / 2;
  return { path: `M${ax} ${y1} C${ax} ${y1 + bend} ${bx} ${y2 - bend} ${bx} ${y2}`, labelAt: [(ax + bx) / 2, y1 + bend] };
}

/**
 * Compone el diagrama. `vertical` apila las capas de arriba abajo (pantallas estrechas): las
 * piezas son las mismas y no se encogen.
 */
export function buildSystemDiagram(
  design: SystemDesign, infra: CloudNode[], provider: CloudProviderId, vertical = false, available = 0,
): SystemDiagram {
  // Apilado en una pantalla muy estrecha, las piezas se ajustan al ancho que hay (sin bajar de MIN_NODE_W).
  const nodeW = vertical && available > 0 ? Math.max(MIN_NODE_W, Math.min(NODE_W, available - (MARGIN_V + SIDE + LANE_PAD_V) * 2)) : NODE_W;
  const pad = vertical ? LANE_PAD_V : LANE_PAD;
  const margin = vertical ? MARGIN_V : MARGIN;
  const assigned = lanesOf(design);
  const laneIds = (Object.keys(assigned) as LaneId[]).filter((id) => assigned[id].some((category) => chosen(design, category)));
  const laneW = nodeW + pad * 2;
  const laneH = (count: number) => LANE_HEAD + LANE_PAD + count * NODE_H + (count - 1) * NODE_GAP + LANE_PAD;
  const tallest = Math.max(...laneIds.map((id) => laneH(assigned[id].length)));

  const lanes: DiagramLane[] = [];
  const nodes: DiagramNode[] = [];
  let cursor = MARGIN;
  for (const id of laneIds) {
    const categories = assigned[id];
    const h = vertical ? laneH(categories.length) : tallest;
    const lane: DiagramLane = vertical
      ? { id, label: LANE_NAMES[id], x: margin + SIDE, y: cursor, w: laneW, h }
      : { id, label: LANE_NAMES[id], x: cursor, y: MARGIN, w: laneW, h };
    lanes.push(lane);
    cursor += vertical ? h + LANE_GAP_VERTICAL : laneW + LANE_GAP;

    // Las piezas de una capa van centradas en su alto.
    const used = categories.length * NODE_H + (categories.length - 1) * NODE_GAP;
    const top = lane.y + LANE_HEAD + (lane.h - LANE_HEAD - used) / 2;
    categories.forEach((category, index) => {
      const option = chosen(design, category)!;
      const target = infra.find((candidate) => candidate.id === design.deployments[category]);
      const key = target ? resolveIcon(target.icon ?? { default: 'provider' }, provider) : null;
      const image = key ? TECH_ICONS[key]?.image ?? null : null;
      const deploys = option.deploysOn.length > 0;
      nodes.push({
        id: category, key: `${category}:${option.id}`, lane: id,
        kind: KIND_NAMES[category] ?? SYSTEM_CATALOG.find((entry) => entry.id === category)!.name,
        title: SHORT_NAMES[option.id] ?? option.name, fullName: option.name, glyph: GLYPH_OF[option.id] ?? 'server',
        deployedOn: target ? { name: clip(target.name?.trim() || forProvider(target.service, provider), DEPLOY_MAX), image } : null,
        note: target ? null : deploys ? 'Sin desplegar' : category === 'client' ? 'En las tiendas de apps' : 'Dentro del backend',
        pending: deploys && !target,
        x: lane.x + pad, y: top + index * (NODE_H + NODE_GAP), w: nodeW, h: NODE_H,
      });
    });
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const laneIndex = new Map(laneIds.map((id, index) => [id, index]));
  let detours = 0;
  const edges = connections(design).flatMap((edge): DiagramEdge[] => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return [];
    }
    const ay = from.y + from.h / 2;
    const by = to.y + to.h / 2;
    if (vertical) {
      // Con otra pieza en medio, la conexión baja por el margen en vez de cruzarla.
      const between = nodes.some((node) => node !== from && node !== to && node.y + node.h / 2 > Math.min(ay, by) && node.y + node.h / 2 < Math.max(ay, by));
      if (!between) {
        return [{ ...edge, ...direct(from, to) }];
      }
      const side = detours % 2 === 0 ? 1 : -1;
      // Dos carriles por lado; si hay más rodeos, comparten carril.
      const gutter = (side === 1 ? margin + SIDE + laneW : margin + SIDE) + side * (5 + (Math.floor(detours / 2) % 2) * 5);
      detours++;
      const x = side === 1 ? from.x + from.w : from.x;
      return [{ ...edge, path: rounded([[x, ay], [gutter, ay], [gutter, by], [side === 1 ? to.x + to.w : to.x, by]]), labelAt: [gutter, (ay + by) / 2], label: '' }];
    }
    const skipped = Math.abs(laneIndex.get(from.lane)! - laneIndex.get(to.lane)!) > 1;
    if (!skipped) {
      return [{ ...edge, ...direct(from, to) }];
    }
    // Salta una capa: rodea sus piezas por el pasillo de abajo.
    const right = to.x > from.x;
    const x1 = right ? from.x + from.w : from.x;
    const x2 = right ? to.x : to.x + to.w;
    const step = (right ? 1 : -1) * (LANE_GAP / 2);
    const channel = MARGIN + tallest + 16 + detours * 12;
    detours++;
    return [{ ...edge, path: rounded([[x1, ay], [x1 + step, ay], [x1 + step, channel], [x2 - step, channel], [x2 - step, by], [x2, by]]), labelAt: [(x1 + x2) / 2, channel] }];
  });
  const last = lanes[lanes.length - 1];
  return {
    width: vertical ? laneW + (margin + SIDE) * 2 : last.x + last.w + MARGIN,
    height: vertical ? last.y + last.h + MARGIN : tallest + MARGIN * 2 + (detours ? 16 + detours * 12 : 0),
    vertical, lanes, nodes, edges,
  };
}
