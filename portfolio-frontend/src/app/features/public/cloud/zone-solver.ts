import { CANVAS_HEIGHT, CANVAS_WIDTH, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { overlaps, resolveCollision } from './studio-physics';
import { StudioZone } from './studio-project';

/**
 * Recuadros elásticos (flag `studio.smart-rules`). Tras mover o redimensionar un recuadro:
 *   1. ningún recuadro se monta sobre un hermano: el que estorba se aparta (con lo que contiene) por
 *      el eje en el que menos se pisan, alejándose del que se está editando;
 *   2. cada recuadro crece lo justo para seguir conteniendo a sus hijos, con su margen y el espacio
 *      del rótulo;
 *   3. se repite hasta que todo encaja (crecer puede empujar a otro hermano más arriba en el árbol).
 * Es una función pura: siempre parte del estado anterior a la edición, así que al deshacer el gesto
 * todo vuelve a su sitio.
 *
 * Solo se reacciona a lo que de verdad choca (un recuadro que pisa a otro, un hijo que se sale): el
 * hueco y el margen se aplican al apartar o al crecer, no se exigen a lo que ya estaba bien. Así un
 * diseño intacto es estable y tocar un recuadro no descoloca los demás.
 */

/** Hueco mínimo entre dos recuadros hermanos. */
export const ZONE_GAP = 12;
/** Margen interior: arriba deja sitio al rótulo. */
export const ZONE_PADDING = { top: 30, side: 12, bottom: 12 };

type Box = { x: number; y: number; w: number; h: number };

const right = (b: Box) => b.x + b.w;
const bottom = (b: Box) => b.y + b.h;
const area = (b: Box) => b.w * b.h;
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (outer: Box, x: number, y: number) => x >= outer.x && x <= right(outer) && y >= outer.y && y <= bottom(outer);
const encloses = (outer: Box, inner: Box) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && right(inner) <= right(outer) + 1 && bottom(inner) <= bottom(outer) + 1;

/**
 * Árbol de recuadros: el padre de cada uno es el menor que lo contiene entero. Se calcula sobre el
 * estado de antes de editar (con los recuadros ya montados la geometría no sirve para saberlo).
 */
export function zoneParents(zones: StudioZone[]): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  for (const zone of zones) {
    const parent = zones
      .filter((other) => other.id !== zone.id && area(other) > area(zone) && encloses(other, zone))
      .sort((a, b) => area(a) - area(b))[0];
    parents.set(zone.id, parent?.id ?? null);
  }
  return parents;
}

function descendants(id: string, parents: Map<string, string | null>): Set<string> {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of parents) {
      if (!out.has(child) && (parent === id || (parent !== null && out.has(parent)))) {
        out.add(child);
        grew = true;
      }
    }
  }
  return out;
}

/** Recuadro al que pertenece un nodo: el menor que contiene su centro. */
function ownerOf(node: CloudNode, zones: StudioZone[]): string | null {
  return zones.filter((zone) => inside(zone, node.x, node.y)).sort((a, b) => area(a) - area(b))[0]?.id ?? null;
}

export interface SettleResult {
  zones: StudioZone[];
  nodes: CloudNode[];
}

/**
 * Reacomoda los recuadros alrededor de `anchorId` (el que se está editando, que no se mueve).
 * `parents` es el árbol de antes de editar; para un recuadro que se ha movido a otro sitio, su padre
 * es el menor recuadro (que no sea suyo) que contiene su centro.
 */
export function settleZones(
  zones: StudioZone[], nodes: CloudNode[], anchorId: string, parents: Map<string, string | null>,
  /** Lienzo y nodos de antes del gesto: de ahí sale a qué recuadro pertenece cada nodo. */
  before: { zones: StudioZone[]; nodes: CloudNode[] } = { zones, nodes },
): SettleResult {
  let current = zones.map((zone) => ({ ...zone }));
  let placed = nodes.map((node) => ({ ...node }));
  const tree = new Map(parents);
  const anchor = current.find((zone) => zone.id === anchorId);
  if (anchor) {
    const own = descendants(anchorId, tree);
    const host = current
      .filter((zone) => zone.id !== anchorId && !own.has(zone.id) && area(zone) > area(anchor) && inside(zone, center(anchor).x, center(anchor).y))
      .sort((a, b) => area(a) - area(b))[0];
    tree.set(anchorId, host?.id ?? null);
  }
  // Qué nodos van dentro de cada recuadro: se fija al principio y viajan con él.
  const start = new Map(before.nodes.map((node) => [node.id, node]));
  const owner = new Map(placed.map((node) => [node.id, ownerOf(start.get(node.id) ?? node, before.zones)]));
  /** Nodos apartados por sí solos: los que viajan con su recuadro no buscan hueco, ya los acompaña. */
  const pushed = new Set<string>();

  /** Recuadros que contienen a `id` (sus antepasados en el árbol). */
  const ancestorsOf = (id: string | null) => {
    const out = new Set<string>();
    for (let at = id; at !== null && at !== undefined; at = tree.get(at) ?? null) out.add(at);
    return out;
  };
  const shift = (id: string, dx: number, dy: number) => {
    const moving = new Set([id, ...descendants(id, tree)]);
    current = current.map((zone) => (moving.has(zone.id) ? { ...zone, x: zone.x + dx, y: zone.y + dy } : zone));
    placed = placed.map((node) => (moving.has(owner.get(node.id) ?? '') ? { ...node, x: node.x + dx, y: node.y + dy } : node));
  };
  const fitsCanvas = (box: Box, dx: number, dy: number) =>
    box.x + dx >= 0 && box.y + dy >= 0 && right(box) + dx <= CANVAS_WIDTH && bottom(box) + dy <= CANVAS_HEIGHT;

  for (let pass = 0; pass < 40; pass++) {
    let changed = false;

    // 1. Hermanos sin montarse.
    const byParent = new Map<string | null, StudioZone[]>();
    for (const zone of current) {
      const parent = tree.get(zone.id) ?? null;
      byParent.set(parent, [...(byParent.get(parent) ?? []), zone]);
    }
    for (const siblings of byParent.values()) {
      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const a = current.find((zone) => zone.id === siblings[i].id)!;
          const b = current.find((zone) => zone.id === siblings[j].id)!;
          const overlapX = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
          const overlapY = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const px = overlapX + ZONE_GAP;
          const py = overlapY + ZONE_GAP;
          // Se aparta el que no se está editando; entre dos que no, el que está más abajo y a la derecha.
          const [fixed, mover] = b.id === anchorId || (a.id !== anchorId && a.x + a.y > b.x + b.y) ? [b, a] : [a, b];
          const dirX = Math.sign(center(mover).x - center(fixed).x) || 1;
          const dirY = Math.sign(center(mover).y - center(fixed).y) || 1;
          const options: [number, number][] = px <= py ? [[dirX * px, 0], [0, dirY * py]] : [[0, dirY * py], [dirX * px, 0]];
          const [dx, dy] = options.find(([x, y]) => fitsCanvas(mover, x, y)) ?? options[0];
          shift(mover.id, Math.round(dx), Math.round(dy));
          changed = true;
        }
      }
    }

    // 1b. Un nodo suelto no queda debajo de un recuadro que no es el suyo: se aparta por el lado más corto.
    for (const zone of current) {
      const box = { x: zone.x - ZONE_GAP, y: zone.y - ZONE_GAP, w: zone.w + ZONE_GAP * 2, h: zone.h + ZONE_GAP * 2 };
      const own = new Set([zone.id, ...descendants(zone.id, tree)]);
      for (const node of placed) {
        if (own.has(owner.get(node.id) ?? '')) continue;
        // Solo los nodos que viven al lado del recuadro (mismo padre): los de fuera de la nube no cuentan.
        if ((owner.get(node.id) ?? null) !== (tree.get(zone.id) ?? null)) continue;
        const half = { w: NODE_WIDTH / 2, h: NODE_HEIGHT / 2 };
        // Solo si el recuadro lo pisa de verdad; al apartarlo se le deja el hueco (`box`).
        const px = Math.min(node.x + half.w, right(zone)) - Math.max(node.x - half.w, zone.x);
        const py = Math.min(node.y + half.h, bottom(zone)) - Math.max(node.y - half.h, zone.y);
        if (px <= 0 || py <= 0) continue;
        const toRight = right(box) + half.w - node.x, toLeft = node.x - (box.x - half.w);
        const toBottom = bottom(box) + half.h - node.y, toTop = node.y - (box.y - half.h);
        // Hacia donde no caiga dentro de otro recuadro ajeno (ni de este).
        const nodeOwner = owner.get(node.id) ?? null;
        const landsFree = (dx: number, dy: number) => current.every((other) => {
          if (other.id === nodeOwner) return true;
          const b = { x: node.x + dx - half.w, y: node.y + dy - half.h, w: NODE_WIDTH, h: NODE_HEIGHT };
          return right(b) <= other.x || right(other) <= b.x || bottom(b) <= other.y || bottom(other) <= b.y || encloses(b, other) === false && encloses(other, b) && ancestorsOf(nodeOwner).has(other.id);
        });
        // Hacia fuera por el mismo eje: una pieza al lado del recuadro se aparta de lado, sin saltar
        // arriba o abajo, y una columna de piezas se desplaza entera en vez de dispersarse.
        const out = center(zone);
        const sideways: [number, number] = node.x >= out.x ? [toRight, 0] : [-toLeft, 0];
        const upright: [number, number] = node.y >= out.y ? [0, toBottom] : [0, -toTop];
        // Nunca cruza al otro lado del recuadro: sin sitio hacia fuera se queda, y el gesto se detiene.
        const beside = node.y >= zone.y && node.y <= bottom(zone);
        const [dx, dy] = beside ? sideways : upright;
        if (!fitsCanvas({ x: node.x - half.w, y: node.y - half.h, w: NODE_WIDTH, h: NODE_HEIGHT }, dx, dy) || !landsFree(dx, dy)) continue;
        // Nunca fuera del lienzo: si no cabe en ningún lado, se queda en el borde, a la vista.
        const x = Math.min(CANVAS_WIDTH - half.w - 4, Math.max(half.w + 4, Math.round(node.x + dx)));
        const y = Math.min(CANVAS_HEIGHT - half.h - 4, Math.max(half.h + 4, Math.round(node.y + dy)));
        if (x === node.x && y === node.y) continue;
        placed = placed.map((candidate) => (candidate.id === node.id ? { ...candidate, x, y } : candidate));
        pushed.add(node.id);
        changed = true;
      }
    }

    // 1c. Dos nodos apartados no acaban uno encima del otro: el que se movió busca el hueco libre más cercano.
    for (const node of placed) {
      if (!pushed.has(node.id) || !placed.some((other) => other.id !== node.id && overlaps(node, other, 0))) continue;
      const free = resolveCollision(node.id, node, placed, current);
      if (free.x !== node.x || free.y !== node.y) {
        placed = placed.map((candidate) => (candidate.id === node.id ? { ...candidate, ...free } : candidate));
        changed = true;
      }
    }

    // 2. Cada padre contiene a sus hijos (recuadros y nodos) con su margen.
    for (const parent of current) {
      const childZones = current.filter((zone) => tree.get(zone.id) === parent.id);
      const childNodes = placed.filter((node) => owner.get(node.id) === parent.id);
      if (!childZones.length && !childNodes.length) continue;
      const boxes: Box[] = [
        ...childZones,
        ...childNodes.map((node) => ({ x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2, w: NODE_WIDTH, h: NODE_HEIGHT })),
      ];
      // Dentro, aunque sea justo, ya vale: solo crece si algún hijo se sale.
      if (boxes.every((box) => box.x >= parent.x && box.y >= parent.y && right(box) <= right(parent) && bottom(box) <= bottom(parent))) continue;
      const need = {
        x: Math.min(...boxes.map((box) => box.x)) - ZONE_PADDING.side,
        y: Math.min(...boxes.map((box) => box.y)) - ZONE_PADDING.top,
        r: Math.max(...boxes.map(right)) + ZONE_PADDING.side,
        b: Math.max(...boxes.map(bottom)) + ZONE_PADDING.bottom,
      };
      const x = Math.max(0, Math.min(parent.x, need.x));
      const y = Math.max(0, Math.min(parent.y, need.y));
      const r = Math.min(CANVAS_WIDTH, Math.max(right(parent), need.r));
      const b = Math.min(CANVAS_HEIGHT, Math.max(bottom(parent), need.b));
      if (x !== parent.x || y !== parent.y || r !== right(parent) || b !== bottom(parent)) {
        current = current.map((zone) => (zone.id === parent.id ? { ...zone, x, y, w: r - x, h: b - y } : zone));
        changed = true;
      }
    }

    if (!changed) break;
  }
  return { zones: current, nodes: placed };
}

/**
 * ¿Queda algo mal tras reacomodar? Dos hermanos pisándose, o un recuadro encima de un nodo que no es
 * suyo. Ocurre cuando no hay sitio donde apartar: el gesto se detiene ahí en vez de romper el diseño.
 */
export function hasConflict(zones: StudioZone[], nodes: CloudNode[], anchorId: string, parents: Map<string, string | null>, before: { zones: StudioZone[]; nodes: CloudNode[] }): boolean {
  const tree = new Map(parents);
  const anchor = zones.find((zone) => zone.id === anchorId);
  if (anchor) {
    const own = descendants(anchorId, tree);
    const host = zones
      .filter((zone) => zone.id !== anchorId && !own.has(zone.id) && area(zone) > area(anchor) && inside(zone, center(anchor).x, center(anchor).y))
      .sort((a, b) => area(a) - area(b))[0];
    tree.set(anchorId, host?.id ?? null);
  }
  const crossing = (a: Box, b: Box) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
  const siblings = zones.some((a, index) => zones.slice(index + 1).some((b) => (tree.get(a.id) ?? null) === (tree.get(b.id) ?? null) && crossing(a, b)));
  if (siblings) {
    return true;
  }
  const start = new Map(before.nodes.map((node) => [node.id, node]));
  return nodes.some((node) => {
    const owner = ownerOf(start.get(node.id) ?? node, before.zones);
    const allowed = new Set<string>();
    for (let at = owner; at !== null && at !== undefined; at = tree.get(at) ?? null) allowed.add(at);
    const rect = { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2, w: NODE_WIDTH, h: NODE_HEIGHT };
    return zones.some((zone) => !allowed.has(zone.id) && !descendants(zone.id, tree).has(owner ?? '') && crossing(rect, zone));
  });
}
