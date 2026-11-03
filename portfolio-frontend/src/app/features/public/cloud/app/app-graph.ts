import { CANVAS_HEIGHT, CANVAS_WIDTH, NODE_HEIGHT, NODE_WIDTH } from '../cloud-topology.data';
import { overlaps, resolveCollision } from '../studio-physics';
import { SystemDesign } from '../system/system-design';
import { AppBoxKind, pieceOf } from './app-catalog.data';
import { ASYNC_PROTOCOLS, Protocol, connectionVerdict } from './app-protocols';

/** Una pieza dibujada: su tipo del catálogo, dónde está y cómo se llama en este sistema. */
export interface AppNode {
  id: string;
  type: string;
  x: number;
  y: number;
  /** Nombre propio («Pedidos»); vacío, el del catálogo. */
  name?: string;
  /** Tecnología elegida («PostgreSQL 16»); vacía, la del catálogo. */
  tech?: string;
  /** Pieza de Infraestructura en la que corre (id de su nodo). */
  runsOn?: string;
}

export interface AppLink {
  from: string;
  to: string;
  protocol: Protocol;
}

export interface AppBox {
  id: string;
  kind: AppBoxKind;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AppGraph {
  nodes: AppNode[];
  links: AppLink[];
  boxes: AppBox[];
}

export const linkKey = (link: { from: string; to: string }) => `${link.from}>${link.to}`;
export const isAsync = (protocol: Protocol) => ASYNC_PROTOCOLS.includes(protocol);

/** Mantiene un punto dentro del lienzo, con el nodo entero a la vista. */
export function clampPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(Math.min(CANVAS_WIDTH - NODE_WIDTH / 2 - 4, Math.max(NODE_WIDTH / 2 + 4, point.x))),
    y: Math.round(Math.min(CANVAS_HEIGHT - NODE_HEIGHT / 2 - 4, Math.max(NODE_HEIGHT / 2 + 4, point.y))),
  };
}

function nextId(graph: AppGraph, type: string): string {
  let index = 1;
  const taken = new Set(graph.nodes.map((node) => node.id));
  while (taken.has(`${type}-${index}`)) {
    index++;
  }
  return `${type}-${index}`;
}

/** Añade una pieza donde se soltó (o en el primer hueco libre), sin montarse encima de otra. */
export function addNode(graph: AppGraph, type: string, at?: { x: number; y: number }): { graph: AppGraph; id: string } {
  const id = nextId(graph, type);
  const start = clampPoint(at ?? { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  let free = clampPoint(resolveCollision(id, start, graph.nodes, graph.boxes));
  // Caja llena: el hueco más cercano aunque quede fuera (el ajuste hará crecer la caja).
  if (graph.nodes.some((node) => overlaps(free, node, 0))) {
    free = clampPoint(resolveCollision(id, start, graph.nodes, []));
  }
  return { graph: { ...graph, nodes: [...graph.nodes, { id, type, ...free }] }, id };
}

export function moveNode(graph: AppGraph, id: string, to: { x: number; y: number }): AppGraph {
  const point = clampPoint(to);
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...point } : node)) };
}

/** Quita una pieza y sus conexiones. */
export function removeNode(graph: AppGraph, id: string): AppGraph {
  return { ...graph, nodes: graph.nodes.filter((node) => node.id !== id), links: graph.links.filter((link) => link.from !== id && link.to !== id) };
}

export function updateNode(graph: AppGraph, id: string, patch: Partial<Pick<AppNode, 'name' | 'tech' | 'runsOn'>>): AppGraph {
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) };
}

export type ConnectResult =
  | { ok: true; graph: AppGraph; link: AppLink }
  | { ok: false; reason: string; suggestion: string };

/** Conecta dos piezas si las reglas lo admiten, con el protocolo por defecto de esa pareja. */
export function connect(graph: AppGraph, from: string, to: string): ConnectResult {
  if (from === to) {
    return { ok: false, reason: 'Una pieza no se llama a sí misma.', suggestion: 'Suelta la flecha sobre otra pieza.' };
  }
  if (graph.links.some((link) => link.from === from && link.to === to)) {
    return { ok: false, reason: 'Esas dos piezas ya están conectadas.', suggestion: 'Cambia su protocolo pulsando la etiqueta del cable.' };
  }
  const source = graph.nodes.find((node) => node.id === from);
  const target = graph.nodes.find((node) => node.id === to);
  if (!source || !target) {
    return { ok: false, reason: 'Falta una de las piezas.', suggestion: 'Vuelve a intentarlo.' };
  }
  const verdict = connectionVerdict(source.type, target.type);
  if (!verdict.allowed) {
    return { ok: false, reason: verdict.reason, suggestion: verdict.suggestion };
  }
  const link: AppLink = { from, to, protocol: verdict.protocols[0] };
  return { ok: true, link, graph: { ...graph, links: [...graph.links, link] } };
}

/** Siguiente protocolo admitido por esa pareja (pulsar la etiqueta del cable lo va cambiando). */
export function cycleProtocol(graph: AppGraph, key: string): AppGraph {
  return {
    ...graph,
    links: graph.links.map((link) => {
      if (linkKey(link) !== key) {
        return link;
      }
      const source = graph.nodes.find((node) => node.id === link.from);
      const target = graph.nodes.find((node) => node.id === link.to);
      const verdict = source && target ? connectionVerdict(source.type, target.type) : null;
      if (!verdict?.allowed) {
        return link;
      }
      const next = verdict.protocols[(verdict.protocols.indexOf(link.protocol) + 1) % verdict.protocols.length];
      return { ...link, protocol: next };
    }),
  };
}

export function removeLink(graph: AppGraph, key: string): AppGraph {
  return { ...graph, links: graph.links.filter((link) => linkKey(link) !== key) };
}

const BOX_SIZE: Record<AppBoxKind, { w: number; h: number }> = {
  vpc: { w: 520, h: 360 }, public: { w: 200, h: 260 }, private: { w: 300, h: 260 }, domain: { w: 320, h: 220 },
};

export function addBox(graph: AppGraph, kind: AppBoxKind): AppGraph {
  const size = BOX_SIZE[kind];
  const offset = graph.boxes.length * 24;
  const box: AppBox = {
    id: `${kind}-${graph.boxes.length + 1}-${Math.random().toString(36).slice(2, 6)}`, kind,
    x: Math.min(CANVAS_WIDTH - size.w - 8, 40 + offset), y: Math.min(CANVAS_HEIGHT - size.h - 8, 40 + offset), ...size,
  };
  return { ...graph, boxes: [...graph.boxes, box] };
}

/** Mueve una caja y, con ella, las piezas que tiene dentro. */
export function moveBox(graph: AppGraph, id: string, dx: number, dy: number, from: AppGraph): AppGraph {
  const original = from.boxes.find((box) => box.id === id);
  if (!original) {
    return graph;
  }
  const x = Math.round(Math.min(CANVAS_WIDTH - original.w, Math.max(0, original.x + dx)));
  const y = Math.round(Math.min(CANVAS_HEIGHT - original.h, Math.max(0, original.y + dy)));
  const inside = (point: { x: number; y: number }) => point.x >= original.x && point.x <= original.x + original.w && point.y >= original.y && point.y <= original.y + original.h;
  const moved = new Set(from.nodes.filter(inside).map((node) => node.id));
  return {
    ...graph,
    boxes: graph.boxes.map((box) => (box.id === id ? { ...box, x, y } : box)),
    nodes: graph.nodes.map((node) => {
      const before = from.nodes.find((candidate) => candidate.id === node.id);
      return moved.has(node.id) && before ? { ...node, x: before.x + (x - original.x), y: before.y + (y - original.y) } : node;
    }),
  };
}

export function resizeBox(graph: AppGraph, id: string, w: number, h: number): AppGraph {
  return {
    ...graph,
    boxes: graph.boxes.map((box) => (box.id === id
      ? { ...box, w: Math.round(Math.max(160, Math.min(CANVAS_WIDTH - box.x, w))), h: Math.round(Math.max(120, Math.min(CANVAS_HEIGHT - box.y, h))) }
      : box)),
  };
}

export function removeBox(graph: AppGraph, id: string): AppGraph {
  return { ...graph, boxes: graph.boxes.filter((box) => box.id !== id) };
}

/**
 * Diseño de partida a partir de las decisiones de la vista de Aplicación: el camino de una
 * petición de izquierda a derecha (cliente → entrada → servicio → datos) y lo de apoyo abajo.
 */
export function graphFromDesign(design: SystemDesign): AppGraph {
  const pick = design.choices;
  const nodes: AppNode[] = [];
  const links: AppLink[] = [];
  const place = (id: string, type: string, x: number, y: number, tech?: string) => nodes.push({ id, type, x, y, ...(tech ? { tech } : {}) });
  const link = (from: string, to: string, protocol: Protocol) => links.push({ from, to, protocol });

  const client = pick.client ?? 'web-spa';
  const clientType = client === 'web-ssr' ? 'ssr' : client.startsWith('mobile') ? 'mobile' : 'spa';
  place('client', clientType, 90, 260, client === 'mobile-native' ? 'Swift / Kotlin' : undefined);

  const backendTech = pick.backend === 'go' ? 'Go' : pick.backend === 'node' ? 'NestJS' : 'Spring Boot';
  const api: Protocol = pick.api === 'grpc' ? 'gRPC' : pick.api === 'graphql' ? 'GraphQL' : 'REST';

  let entry = 'client';
  if (pick.cache === 'cdn') {
    place('cdn', 'cdn', 280, 130);
    link('client', 'cdn', 'HTTPS');
  }
  if (pick.bff) {
    place('entry', pick.bff === 'gateway' ? 'gateway' : 'bff', 280, 260);
    link('client', 'entry', api === 'gRPC' ? 'REST' : api);
    entry = 'entry';
  } else {
    place('entry', 'lb', 280, 260);
    link('client', 'entry', 'HTTPS');
    entry = 'entry';
  }

  place('backend', 'monolith', 470, 260, backendTech);
  link(entry, 'backend', api);

  const databaseType = pick.database === 'document' ? 'nosql' : pick.database === 'key-value' ? 'nosql' : 'sql';
  place('database', databaseType, 660, 190, pick.database === 'key-value' ? 'DynamoDB' : undefined);
  link('backend', 'database', databaseType === 'sql' ? 'SQL' : 'Driver');

  if (pick.cache === 'redis') {
    place('cache', 'cache', 660, 330);
    link('backend', 'cache', 'RESP');
  }
  if (pick.auth === 'oidc-managed') {
    place('idp', 'idp', 280, 400);
    link('client', 'idp', 'OIDC');
  }
  if (pick.queue) {
    const type = pick.queue === 'stream' ? 'stream' : pick.queue === 'pubsub' ? 'pubsub' : 'queue';
    place('queue', type, 470, 420);
    link('backend', 'queue', 'Eventos');
    place('worker', 'worker', 660, 470);
    link('queue', 'worker', 'Eventos');
  }
  return { nodes, links, boxes: [{ id: 'vpc-1', kind: 'vpc', label: 'Red privada', x: 385, y: 110, w: 365, h: 430 }] };
}

/** Lo guardado puede venir de otra versión o de otra mano: solo pasa lo que el lienzo entiende. */
export function sanitizeGraph(value: unknown): AppGraph | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<AppGraph>;
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .filter((node): node is AppNode => !!node && typeof node.id === 'string' && !!pieceOf(node.type) && Number.isFinite(node.x) && Number.isFinite(node.y))
    .map((node) => ({ ...node, ...clampPoint(node) }));
  const ids = new Set(nodes.map((node) => node.id));
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((link): link is AppLink => !!link && ids.has(link.from) && ids.has(link.to) && typeof link.protocol === 'string');
  const boxes = (Array.isArray(raw.boxes) ? raw.boxes : [])
    .filter((box): box is AppBox => !!box && typeof box.id === 'string' && ['vpc', 'public', 'private', 'domain'].includes(box.kind)
      && [box.x, box.y, box.w, box.h].every(Number.isFinite));
  return { nodes, links, boxes };
}
