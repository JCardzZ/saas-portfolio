import { CANVAS_HEIGHT, CANVAS_WIDTH, NODE_HEIGHT, NODE_WIDTH } from '../cloud-topology.data';
import { overlaps, resolveCollision } from '../studio-physics';
import { AppLayer, pieceOf } from './app-catalog.data';
import { AppBox, AppGraph, AppNode, clampPoint } from './app-graph';

/**
 * Ajuste automático del Estudio de Aplicación (flag `studio.app-canvas`), en funciones puras:
 *   - las piezas no se montan unas sobre otras;
 *   - una caja crece hasta contener sus piezas (y sus cajas hijas), con margen para su rótulo;
 *   - dos cajas hermanas que se pisan se apartan, llevándose sus piezas;
 *   - «Ordenar» coloca las piezas en columnas según la profundidad de la petición.
 */
export const BOX_PAD = { top: 36, side: 18, bottom: 18 };
const BOX_GAP = 16;
const COLUMN_STEP = 190;
/** Paso entre columnas cuando sobra ancho: deja sitio a la pastilla del protocolo entre dos piezas. */
const ROOMY_COLUMN_STEP = 230;
const FIRST_COLUMN = 90;
const ROW_STEP = 104;
const FIRST_ROW = 110;

type Rect = { x: number; y: number; w: number; h: number };

const area = (box: Rect) => box.w * box.h;
const containsPoint = (box: Rect, point: { x: number; y: number }) =>
  point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
const containsBox = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Caja más pequeña que contiene el centro de cada pieza: es la suya. */
export function boxOf(boxes: AppBox[], point: { x: number; y: number }): AppBox | null {
  return boxes.filter((box) => containsPoint(box, point)).sort((a, b) => area(a) - area(b))[0] ?? null;
}

/** Caja que contiene a otra (la más pequeña de las que la contienen), o `null`. */
function parentOf(boxes: AppBox[], child: AppBox): AppBox | null {
  return boxes.filter((box) => box.id !== child.id && area(box) > area(child) && containsBox(box, child)).sort((a, b) => area(a) - area(b))[0] ?? null;
}

/** Piezas cuya caja más pequeña es esta. */
export function membersOf(graph: AppGraph, box: AppBox): AppNode[] {
  return graph.nodes.filter((node) => boxOf(graph.boxes, node)?.id === box.id);
}

/**
 * Deja el lienzo en un estado sin choques. `anchor` es la pieza o caja que acaba de mover el
 * visitante: se queda donde la dejó y son las demás las que se apartan. `owners` fija de qué caja
 * es cada pieza cuando se sabe de antes (al ordenar); si no, la decide dónde está ahora.
 */
export function settle(graph: AppGraph, anchor?: string, owners?: Map<string, string | null>): AppGraph {
  let nodes = graph.nodes.map((node) => ({ ...node }));
  let boxes = graph.boxes.map((box) => ({ ...box }));
  // Pertenencia antes de mover nada: así una caja que crece no «adopta» piezas ajenas.
  const owner = new Map(nodes.map((node) => [node.id, owners?.has(node.id) ? owners.get(node.id)! : boxOf(boxes, node)?.id ?? null]));
  const parents = new Map(boxes.map((box) => [box.id, parentOf(boxes, box)?.id ?? null]));

  for (let pass = 0; pass < 4; pass++) {
    // 1. Piezas sin montarse: la que no es el ancla busca el hueco libre más cercano.
    const order = [...nodes].sort((a, b) => (a.id === anchor ? -1 : b.id === anchor ? 1 : 0));
    for (const node of order) {
      const others = nodes.filter((other) => other.id !== node.id);
      if (node.id !== anchor && others.some((other) => overlaps(node, other, 6))) {
        Object.assign(node, freeSpot(node, nodes, boxes));
      }
    }

    // 2. Cajas a la medida de lo que contienen (de las más pequeñas a las más grandes).
    for (const box of [...boxes].sort((a, b) => area(a) - area(b))) {
      const content: Rect[] = [
        ...nodes.filter((node) => owner.get(node.id) === box.id).map((node) => ({ x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2, w: NODE_WIDTH, h: NODE_HEIGHT })),
        ...boxes.filter((child) => parents.get(child.id) === box.id),
      ];
      if (!content.length) {
        continue;
      }
      const left = Math.min(box.x, ...content.map((item) => item.x - BOX_PAD.side));
      const top = Math.min(box.y, ...content.map((item) => item.y - BOX_PAD.top));
      const right = Math.max(box.x + box.w, ...content.map((item) => item.x + item.w + BOX_PAD.side));
      const bottom = Math.max(box.y + box.h, ...content.map((item) => item.y + item.h + BOX_PAD.bottom));
      box.x = Math.max(0, Math.round(left));
      box.y = Math.max(0, Math.round(top));
      box.w = Math.round(Math.min(CANVAS_WIDTH - box.x, right - box.x));
      box.h = Math.round(Math.min(CANVAS_HEIGHT - box.y, bottom - box.y));
    }

    // 3. Cajas hermanas que se pisan: la que no es el ancla se aparta por el lado más corto.
    let moved = false;
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.id >= b.id || parents.get(a.id) !== parents.get(b.id) || !intersects(a, b)) {
          continue;
        }
        const mover = b.id === anchor ? a : b;
        const still = mover === a ? b : a;
        const pushRight = still.x + still.w + BOX_GAP - mover.x;
        const pushDown = still.y + still.h + BOX_GAP - mover.y;
        const pushLeft = mover.x + mover.w + BOX_GAP - still.x;
        const pushUp = mover.y + mover.h + BOX_GAP - still.y;
        const options = [
          { dx: pushRight, dy: 0 }, { dx: 0, dy: pushDown }, { dx: -pushLeft, dy: 0 }, { dx: 0, dy: -pushUp },
        ].filter(({ dx, dy }) => mover.x + dx >= 0 && mover.y + dy >= 0 && mover.x + dx + mover.w <= CANVAS_WIDTH && mover.y + dy + mover.h <= CANVAS_HEIGHT)
          .sort((p, q) => Math.abs(p.dx) + Math.abs(p.dy) - (Math.abs(q.dx) + Math.abs(q.dy)));
        const shift = options[0];
        if (!shift) {
          continue;
        }
        shiftBox(mover, shift.dx, shift.dy, boxes, nodes, owner, parents);
        moved = true;
      }
    }
    // 4. Una caja que creció no adopta piezas ajenas: las que no son suyas salen por el lado más cercano.
    const ancestors = (id: string | null): Set<string> => {
      const chain = new Set<string>();
      for (let current = id; current; current = parents.get(current) ?? null) {
        chain.add(current);
      }
      return chain;
    };
    for (const node of nodes) {
      if (node.id === anchor) {
        continue;
      }
      const allowed = ancestors(owner.get(node.id) ?? null);
      const intruded = boxes.filter((box) => !allowed.has(box.id) && containsPoint(box, node)).sort((x, y) => area(x) - area(y))[0];
      if (!intruded) {
        continue;
      }
      const exits = [
        { x: intruded.x - NODE_WIDTH / 2 - BOX_GAP, y: node.y },
        { x: intruded.x + intruded.w + NODE_WIDTH / 2 + BOX_GAP, y: node.y },
        { x: node.x, y: intruded.y - NODE_HEIGHT / 2 - BOX_GAP },
        { x: node.x, y: intruded.y + intruded.h + NODE_HEIGHT / 2 + BOX_GAP },
      ].map(clampPoint).filter((point) => !containsPoint(intruded, point))
        .sort((p1, p2) => Math.hypot(p1.x - node.x, p1.y - node.y) - Math.hypot(p2.x - node.x, p2.y - node.y));
      if (exits[0]) {
        Object.assign(node, exits[0]);
        moved = true;
      }
    }
    if (!moved && pass > 0) {
      break;
    }
  }
  nodes = nodes.map((node) => ({ ...node, ...clampPoint(node) }));
  return { ...graph, nodes, boxes };
}

/**
 * Hueco libre más cercano para una pieza: dentro de su caja si cabe; si la caja está llena, el más
 * cercano fuera de ella (la caja crecerá después para volver a contenerla).
 */
export function freeSpot(node: AppNode, nodes: AppNode[], boxes: AppBox[]): { x: number; y: number } {
  const others = nodes.filter((other) => other.id !== node.id);
  const inBox = clampPoint(resolveCollision(node.id, node, nodes, boxes));
  if (!others.some((other) => overlaps(inBox, other, 0))) {
    return inBox;
  }
  return clampPoint(resolveCollision(node.id, node, nodes, []));
}

/** Mueve una caja con sus piezas y sus cajas hijas. */
function shiftBox(box: AppBox, dx: number, dy: number, boxes: AppBox[], nodes: AppNode[], owner: Map<string, string | null>, parents: Map<string, string | null>): void {
  box.x = Math.round(box.x + dx);
  box.y = Math.round(box.y + dy);
  for (const node of nodes) {
    if (owner.get(node.id) === box.id) {
      node.x = Math.round(node.x + dx);
      node.y = Math.round(node.y + dy);
    }
  }
  for (const child of boxes) {
    if (parents.get(child.id) === box.id) {
      shiftBox(child, dx, dy, boxes, nodes, owner, parents);
    }
  }
}

/** Columna de cada capa: cliente, entrada, servicios, datos y mensajería, y lo transversal a la derecha. */
const LAYER_COLUMN: Record<AppLayer, number> = { client: 0, edge: 1, service: 2, data: 3, messaging: 3, identity: 4, observability: 4, external: 4 };
/** Capas que siguen el camino de la petición (las demás no empujan columnas). */
const FLOW: AppLayer[] = ['edge', 'service', 'data', 'messaging'];
const LAST_COLUMN = 5;

/**
 * Ordena el lienzo: cada pieza en la columna de su capa (cliente, entrada, servicios, datos…),
 * empujada a la derecha por quien la llama dentro del camino de la petición (una cadena de servicios
 * ocupa varias columnas), las de una columna ordenadas junto a quien las llama, y las cajas
 * ajustadas a las piezas que ya tenían.
 */
export function autoArrange(graph: AppGraph): AppGraph {
  if (!graph.nodes.length) {
    return graph;
  }
  const owner = new Map(graph.nodes.map((node) => [node.id, boxOf(graph.boxes, node)?.id ?? null]));
  const layerOf = (node: AppNode): AppLayer => pieceOf(node.type)?.layer ?? 'service';
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  for (const link of graph.links) {
    incoming.set(link.to, [...(incoming.get(link.to) ?? []), link.from]);
  }
  const column = new Map(graph.nodes.map((node) => [node.id, LAYER_COLUMN[layerOf(node)]]));
  for (let round = 0; round < graph.nodes.length; round++) {
    let changed = false;
    for (const link of graph.links) {
      const from = byId.get(link.from)!;
      const to = byId.get(link.to)!;
      if (!FLOW.includes(layerOf(from)) || !FLOW.includes(layerOf(to)) || layerOf(to) === 'edge') {
        continue;
      }
      // Un consumidor de una cola no va más a la derecha que ella: se queda en su columna de servicio.
      if (layerOf(from) === 'messaging' && layerOf(to) === 'service') {
        continue;
      }
      const next = Math.min(LAST_COLUMN, column.get(link.from)! + 1);
      if (next > column.get(link.to)!) {
        column.set(link.to, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  const rankOf = (node: AppNode) => LAYER_COLUMN[layerOf(node)] * 10 + (layerOf(node) === 'messaging' ? 5 : 0);
  const columns = new Map<number, AppNode[]>();
  for (const node of graph.nodes) {
    const index = column.get(node.id)!;
    columns.set(index, [...(columns.get(index) ?? []), node]);
  }
  // El ancho del lienzo se reparte entre las columnas que se usan: con menos columnas, más aire entre ellas.
  const lastColumn = Math.max(...column.values());
  const columnStep = lastColumn
    ? Math.max(COLUMN_STEP, Math.min(ROOMY_COLUMN_STEP, Math.floor((CANVAS_WIDTH - FIRST_COLUMN - NODE_WIDTH / 2 - BOX_GAP) / lastColumn)))
    : COLUMN_STEP;
  const placed = new Map<string, { x: number; y: number }>();
  for (const index of [...columns.keys()].sort((a, b) => a - b)) {
    const members = columns.get(index)!;
    // Junto a quien las llama: orden por la altura media de sus llamantes ya colocados.
    const weight = (node: AppNode) => {
      const callers = (incoming.get(node.id) ?? []).map((id) => placed.get(id)?.y).filter((y): y is number => y !== undefined);
      return callers.length ? callers.reduce((sum, y) => sum + y, 0) / callers.length : rankOf(node) * 1000;
    };
    members.sort((a, b) => weight(a) - weight(b) || rankOf(a) - rankOf(b));
    const step = Math.min(ROW_STEP, (CANVAS_HEIGHT - FIRST_ROW - NODE_HEIGHT) / Math.max(1, members.length - 1));
    members.forEach((node, row) => {
      placed.set(node.id, clampPoint({ x: FIRST_COLUMN + index * columnStep, y: FIRST_ROW + row * step }));
    });
  }
  const nodes = graph.nodes.map((node) => ({ ...node, ...placed.get(node.id)! }));
  // Cajas: alrededor de sus piezas de antes; las vacías se quedan donde estaban.
  const boxes = graph.boxes.map((box) => {
    const members = nodes.filter((node) => owner.get(node.id) === box.id);
    if (!members.length) {
      return { ...box };
    }
    const left = Math.min(...members.map((node) => node.x - NODE_WIDTH / 2)) - BOX_PAD.side;
    const top = Math.min(...members.map((node) => node.y - NODE_HEIGHT / 2)) - BOX_PAD.top;
    const right = Math.max(...members.map((node) => node.x + NODE_WIDTH / 2)) + BOX_PAD.side;
    const bottom = Math.max(...members.map((node) => node.y + NODE_HEIGHT / 2)) + BOX_PAD.bottom;
    return { ...box, x: Math.max(0, Math.round(left)), y: Math.max(0, Math.round(top)), w: Math.round(right - left), h: Math.round(bottom - top) };
  });
  return settle({ ...graph, nodes, boxes }, undefined, owner);
}

/** ¿Queda algún choque? (para las pruebas y para decidir si hace falta ordenar). */
export function collisions(graph: AppGraph): number {
  let count = 0;
  graph.nodes.forEach((a, index) => graph.nodes.slice(index + 1).forEach((b) => (count += overlaps(a, b, 0) ? 1 : 0)));
  const parents = new Map(graph.boxes.map((box) => [box.id, parentOf(graph.boxes, box)?.id ?? null]));
  graph.boxes.forEach((a, index) => graph.boxes.slice(index + 1).forEach((b) => {
    count += parents.get(a.id) === parents.get(b.id) && !containsBox(a, b) && !containsBox(b, a) && intersects(a, b) ? 1 : 0;
  }));
  return count;
}
