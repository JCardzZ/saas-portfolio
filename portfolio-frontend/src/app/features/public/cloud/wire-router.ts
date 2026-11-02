import { NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';

/** Lo único que el enrutado necesita de un nodo y de una conexión: sirve al lienzo de Cloud y al de Aplicación. */
export interface Placed { id: string; x: number; y: number }
export interface Linked { from: string; to: string }

/**
 * Cables del lienzo inteligente (flag `studio.smart-rules`):
 *   - en ángulo recto con esquinas redondeadas, eligiendo entre varias rutas la que no atraviesa nodos;
 *   - cada conexión sale y entra por su propio punto del lado, repartidos, para que no se amontonen;
 *   - la ruta termina un poco antes del nodo para dejar sitio a la punta de flecha.
 * Funciones puras: el componente solo pinta el `path`.
 */

export type Side = 'left' | 'right' | 'top' | 'bottom';
type Pt = [number, number];
type Rect = { x: number; y: number; w: number; h: number };

const STUB = 18;
const RADIUS = 8;
const PORT_SPAN = 0.6;
const ARROW_GAP = 3;

/** Por qué lados sale y entra la conexión: el que mira al otro nodo. */
export function sidesFor(from: Placed, to: Placed): [Side, Side] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) * NODE_HEIGHT >= Math.abs(dy) * NODE_WIDTH * 0.5) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

const normal: Record<Side, Pt> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

/**
 * Puntos de anclaje repartidos: si varias conexiones usan el mismo lado de un nodo, cada una tiene el
 * suyo, ordenados según dónde está el otro extremo (así no se cruzan al salir).
 */
export function assignPorts(links: Linked[], nodes: Map<string, Placed>): Map<string, { from: Pt; to: Pt; sides: [Side, Side] }> {
  type End = { key: string; end: 'from' | 'to'; node: Placed; side: Side; other: Placed };
  const ends: End[] = [];
  const sides = new Map<string, [Side, Side]>();
  for (const link of links) {
    const from = nodes.get(link.from);
    const to = nodes.get(link.to);
    if (!from || !to) continue;
    const key = `${link.from}>${link.to}`;
    const pair = sidesFor(from, to);
    sides.set(key, pair);
    ends.push({ key, end: 'from', node: from, side: pair[0], other: to }, { key, end: 'to', node: to, side: pair[1], other: from });
  }
  const groups = new Map<string, End[]>();
  for (const end of ends) {
    const id = `${end.node.id}:${end.side}`;
    groups.set(id, [...(groups.get(id) ?? []), end]);
  }
  const out = new Map<string, { from: Pt; to: Pt; sides: [Side, Side] }>();
  for (const group of groups.values()) {
    const horizontalSide = group[0].side === 'left' || group[0].side === 'right';
    group.sort((a, b) => (horizontalSide ? a.other.y - b.other.y : a.other.x - b.other.x));
    const length = horizontalSide ? NODE_HEIGHT : NODE_WIDTH;
    const step = group.length > 1 ? Math.min(14, (length * PORT_SPAN) / (group.length - 1)) : 0;
    group.forEach((end, index) => {
      const offset = (index - (group.length - 1) / 2) * step;
      const [nx, ny] = normal[end.side];
      const point: Pt = horizontalSide
        ? [end.node.x + nx * NODE_WIDTH / 2, end.node.y + offset]
        : [end.node.x + offset, end.node.y + ny * NODE_HEIGHT / 2];
      const entry = out.get(end.key) ?? { from: [0, 0] as Pt, to: [0, 0] as Pt, sides: sides.get(end.key)! };
      entry[end.end] = point;
      out.set(end.key, entry);
    });
  }
  return out;
}

const segmentHits = (a: Pt, b: Pt, r: Rect) => {
  const [x1, x2] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y1, y2] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
};

function cost(points: Pt[], obstacles: Rect[]): number {
  let hits = 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
    hits += obstacles.filter((rect) => segmentHits(points[i - 1], points[i], rect)).length;
  }
  return hits * 10_000 + length + (points.length - 2) * 24;
}

/** Quita puntos repetidos y los que están en línea con sus vecinos. */
function simplify(points: Pt[]): Pt[] {
  const unique = points.filter((point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);
  return unique.filter((point, i) => {
    if (i === 0 || i === unique.length - 1) return true;
    const [a, b] = [unique[i - 1], unique[i + 1]];
    return !((a[0] === point[0] && point[0] === b[0]) || (a[1] === point[1] && point[1] === b[1]));
  });
}

/**
 * Ruta ortogonal de `start` a `end` (en el borde de sus nodos) que evita `obstacles` (los demás nodos):
 * prueba la ruta en «Z» con el codo en varias posiciones y los rodeos por encima, por debajo o por los
 * lados, y se queda con la más corta que no atraviesa ninguno.
 */
export function routeWire(start: Pt, end: Pt, sides: [Side, Side], obstacles: Rect[]): Pt[] {
  const [n0, n1] = [normal[sides[0]], normal[sides[1]]];
  const a: Pt = [start[0] + n0[0] * STUB, start[1] + n0[1] * STUB];
  const b: Pt = [end[0] + n1[0] * STUB, end[1] + n1[1] * STUB];
  const tip: Pt = [end[0] + n1[0] * ARROW_GAP, end[1] + n1[1] * ARROW_GAP];
  const horizontal = sides[0] === 'left' || sides[0] === 'right';
  const candidates: Pt[][] = [];
  const offsets = [0, -24, 24, -48, 48, -80, 80, -120, 120];
  if (horizontal) {
    for (const off of offsets) {
      const mx = (a[0] + b[0]) / 2 + off;
      candidates.push([start, a, [mx, a[1]], [mx, b[1]], b, tip]);
    }
  } else {
    for (const off of offsets) {
      const my = (a[1] + b[1]) / 2 + off;
      candidates.push([start, a, [a[0], my], [b[0], my], b, tip]);
    }
  }
  // Rodeos: una calle por encima, por debajo o a los lados de todo lo que hay en medio.
  const between = obstacles.filter((rect) => segmentHits(a, b, { x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 })
    || (rect.x < Math.max(a[0], b[0]) && rect.x + rect.w > Math.min(a[0], b[0]) && rect.y < Math.max(a[1], b[1]) && rect.y + rect.h > Math.min(a[1], b[1])));
  if (between.length) {
    const top = Math.min(...between.map((r) => r.y)) - 16;
    const bottom = Math.max(...between.map((r) => r.y + r.h)) + 16;
    const left = Math.min(...between.map((r) => r.x)) - 16;
    const right = Math.max(...between.map((r) => r.x + r.w)) + 16;
    for (const lane of [top, bottom]) candidates.push([start, a, [a[0], lane], [b[0], lane], b, tip]);
    for (const lane of [left, right]) candidates.push([start, a, [lane, a[1]], [lane, b[1]], b, tip]);
  }
  const best = candidates.map(simplify).sort((p, q) => cost(p, obstacles) - cost(q, obstacles))[0];
  return best;
}

/** Polilínea → `d` de SVG con las esquinas redondeadas. */
export function roundedPath(points: Pt[], radius = RADIUS): string {
  if (points.length < 2) return '';
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [p, c, n] = [points[i - 1], points[i], points[i + 1]];
    const inLen = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const outLen = Math.hypot(n[0] - c[0], n[1] - c[1]);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const before: Pt = [c[0] - ((c[0] - p[0]) / (inLen || 1)) * r, c[1] - ((c[1] - p[1]) / (inLen || 1)) * r];
    const after: Pt = [c[0] + ((n[0] - c[0]) / (outLen || 1)) * r, c[1] + ((n[1] - c[1]) / (outLen || 1)) * r];
    d += ` L${round(before[0])} ${round(before[1])} Q${c[0]} ${c[1]} ${round(after[0])} ${round(after[1])}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}

/** Dónde poner el rótulo: el centro del tramo más largo, un poco por encima. */
export function labelPoint(points: Pt[]): [number, number] {
  let best = 0;
  let at: Pt = points[0];
  for (let i = 1; i < points.length; i++) {
    const length = Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
    if (length > best) {
      best = length;
      at = [(points[i][0] + points[i - 1][0]) / 2, (points[i][1] + points[i - 1][1]) / 2];
    }
  }
  return [at[0], at[1] - 7];
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Rectángulo de un nodo, para usarlo como obstáculo. */
export const nodeRect = (node: Placed, pad = 6): Rect =>
  ({ x: node.x - NODE_WIDTH / 2 - pad, y: node.y - NODE_HEIGHT / 2 - pad, w: NODE_WIDTH + pad * 2, h: NODE_HEIGHT + pad * 2 });
