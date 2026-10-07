import { CloudLink, CloudNode, NODE_WIDTH, ZONE_SLOTS, ZoneId } from './cloud-topology.data';
import { StudioZone, zoneAt } from './studio-project';

/** Separación entre filas y entre columnas de la rejilla en la que quedan alineados los nodos. */
const ROW_STEP = 90;
const COLUMN_STEP = 154;
const FIRST_ROW_OFFSET = 68;
/** Un recuadro más bajo que esto es una franja: sus nodos van en fila, no en columna. */
const STRIP_HEIGHT = 150;
const SLOT_XS = [402, 556, 710, 865, 1005, 196, 64];

/** Orden en que se colocan los grupos: de donde entra el tráfico hacia dentro, como se lee el diagrama. */
const RANK: Record<ZoneId, number> = { outside: 0, public: 1, compute: 2, data: 3, managed: 4, global: 5, external: 6 };

interface Group {
  rank: number;
  role: ZoneId;
  zone: StudioZone | null;
  nodes: CloudNode[];
}

/**
 * Ordena el lienzo por capas. Cada nodo se queda en su recuadro (o en su zona de red, si no
 * está dentro de ninguno) y se alinea a una rejilla: las subredes en columnas, las franjas y lo
 * que queda fuera de la red en filas. Dentro de cada grupo, el orden lo decide la posición de
 * los nodos con los que se conecta (baricentro), que es lo que evita cruces de cables
 * innecesarios. Sin recuadros, las capas salen de las propias conexiones, de izquierda a derecha.
 */
export function autoLayout(nodes: CloudNode[], links: CloudLink[], zones: StudioZone[]): CloudNode[] {
  if (nodes.length === 0) {
    return nodes;
  }
  if (zones.length === 0) {
    return layered(nodes, links);
  }

  const groups = new Map<string, Group>();
  for (const node of nodes) {
    const container = zoneAt(zones, node.x, node.y);
    const zone = container?.role ? container : null;
    const role = zone?.role ?? node.zone;
    const key = zone ? `zone:${zone.id}` : `role:${role}`;
    const group = groups.get(key) ?? { rank: RANK[role], role, zone, nodes: [] };
    group.nodes.push(node);
    groups.set(key, group);
  }

  const placed = new Map<string, { x: number; y: number }>();
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const neighbours = (id: string) => links.flatMap((link) => (link.from === id ? [link.to] : link.to === id ? [link.from] : []));
  const barycentre = (id: string, axis: 'x' | 'y'): number | null => {
    const points = neighbours(id).flatMap((other) => (placed.has(other) ? [placed.get(other)![axis]] : []));
    return points.length ? points.reduce((sum, value) => sum + value, 0) / points.length : null;
  };

  for (const group of [...groups.values()].sort((a, b) => a.rank - b.rank)) {
    if (group.role === 'outside' && !group.zone) {
      placeByDepth(group.nodes, links, placed);
    } else if (isStrip(group)) {
      placeInRow(group, barycentre, placed, index);
    } else {
      placeInColumns(group, barycentre, placed, index);
    }
  }
  return nodes.map((node) => ({ ...node, ...placed.get(node.id)! }));
}

function isStrip(group: Group): boolean {
  return group.zone ? group.zone.h < STRIP_HEIGHT : group.role === 'global' || group.role === 'external';
}

/** Internet: una columna por salto (visitantes, borde...), todas alineadas con la primera fila de la red. */
function placeByDepth(nodes: CloudNode[], links: CloudLink[], placed: Map<string, { x: number; y: number }>): void {
  const depths = longestPaths(nodes, links);
  const rows = new Map<number, number>();
  for (const node of [...nodes].sort((a, b) => a.y - b.y)) {
    const depth = depths.get(node.id)!;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    placed.set(node.id, { x: 64 + depth * 132, y: 250 + row * 95 });
  }
}

/** Una o varias columnas centradas en el recuadro (o los huecos de la zona, si no tiene recuadro propio). */
function placeInColumns(
  group: Group, barycentre: (id: string, axis: 'x' | 'y') => number | null, placed: Map<string, { x: number; y: number }>,
  index: Map<string, number>,
): void {
  const ordered = [...group.nodes].sort((a, b) =>
    (barycentre(a.id, 'y') ?? a.y) - (barycentre(b.id, 'y') ?? b.y) || index.get(a.id)! - index.get(b.id)!);
  const zone = group.zone;
  if (!zone) {
    // Sin recuadro propio (p. ej. los servicios gestionados): se respetan las columnas en las
    // que ya están y cada una se rellena de arriba abajo; lo que no quepa pasa a la siguiente.
    const slots = ZONE_SLOTS[group.role];
    const columnXs = [...new Set(slots.map(([x]) => x))];
    const rowsOf = (x: number) => slots.filter(([slotX]) => slotX === x).map(([, y]) => y);
    const nearest = (x: number) => columnXs.reduce((best, candidate) => (Math.abs(candidate - x) < Math.abs(best - x) ? candidate : best));
    const queue = columnXs.flatMap((x) => ordered.filter((node) => nearest(node.x) === x).map((node) => ({ node, x })));
    const used = new Map<number, number>();
    for (const { node, x } of queue) {
      let column = columnXs.indexOf(x);
      while (column < columnXs.length - 1 && (used.get(columnXs[column]) ?? 0) >= rowsOf(columnXs[column]).length) {
        column++;
      }
      const columnX = columnXs[column];
      const row = used.get(columnX) ?? 0;
      used.set(columnX, row + 1);
      const rows = rowsOf(columnX);
      placed.set(node.id, { x: columnX, y: rows[row] ?? rows[rows.length - 1] + (row - rows.length + 1) * ROW_STEP });
    }
    return;
  }
  const capacity = Math.max(1, Math.floor((zone.h - FIRST_ROW_OFFSET - 36) / ROW_STEP) + 1);
  const columns = Math.ceil(ordered.length / capacity);
  ordered.forEach((node, position) => {
    const column = Math.floor(position / capacity);
    placed.set(node.id, {
      x: Math.round(zone.x + zone.w / 2 + (column - (columns - 1) / 2) * (NODE_WIDTH + 12)),
      y: zone.y + FIRST_ROW_OFFSET + (position % capacity) * ROW_STEP,
    });
  });
}

/** Una fila: cada nodo, en la columna más cercana a los nodos con los que se conecta que siga libre. */
function placeInRow(
  group: Group, barycentre: (id: string, axis: 'x' | 'y') => number | null, placed: Map<string, { x: number; y: number }>,
  index: Map<string, number>,
): void {
  const zone = group.zone;
  const y = zone ? Math.round(zone.y + zone.h / 2) : ZONE_SLOTS[group.role][0][1];
  const inside = (x: number) => !zone || (x - NODE_WIDTH / 2 >= zone.x && x + NODE_WIDTH / 2 <= zone.x + zone.w);
  const candidates = (group.role === 'global' ? ZONE_SLOTS.global.map(([x]) => x) : SLOT_XS).filter(inside);
  const taken = new Set<number>();
  for (const node of [...group.nodes].sort((a, b) => index.get(a.id)! - index.get(b.id)!)) {
    const wanted = barycentre(node.id, 'x') ?? node.x;
    const free = candidates.filter((x) => !taken.has(x));
    // A igual distancia gana la columna de la derecha: el diagrama se lee de izquierda a derecha.
    const x = free.sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || b - a)[0]
      ?? (Math.max(...taken, candidates[0] ?? 402) + COLUMN_STEP);
    taken.add(x);
    placed.set(node.id, { x, y });
  }
}

/** Sin recuadros: capas por el camino más largo desde los nodos sin entradas, ordenadas por baricentro. */
function layered(nodes: CloudNode[], links: CloudLink[]): CloudNode[] {
  const depths = longestPaths(nodes, links);
  const layers: CloudNode[][] = [];
  for (const node of nodes) {
    (layers[depths.get(node.id)!] ??= []).push(node);
  }
  const position = new Map<string, number>();
  const placed = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, depth) => {
    const before = (id: string) => {
      const rows = links.flatMap((link) => (link.to === id && position.has(link.from) ? [position.get(link.from)!] : []));
      return rows.length ? rows.reduce((sum, row) => sum + row, 0) / rows.length : null;
    };
    const ordered = [...layer].sort((a, b) => (before(a.id) ?? a.y) - (before(b.id) ?? b.y));
    ordered.forEach((node, row) => {
      const y = 358 + (row - (ordered.length - 1) / 2) * 96;
      position.set(node.id, y);
      placed.set(node.id, { x: 110 + depth * 176, y: Math.round(y) });
    });
  });
  return nodes.map((node) => ({ ...node, ...placed.get(node.id)! }));
}

/** Profundidad de cada nodo: el camino más largo hasta él siguiendo las conexiones entre los nodos dados. */
function longestPaths(nodes: CloudNode[], links: CloudLink[]): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id));
  const inner = links.filter((link) => ids.has(link.from) && ids.has(link.to) && link.from !== link.to);
  const depths = new Map(nodes.map((node) => [node.id, 0]));
  // Tantas pasadas como nodos como mucho: un ciclo no puede hacer crecer las capas sin fin.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const link of inner) {
      const next = depths.get(link.from)! + 1;
      if (next > depths.get(link.to)! && next < nodes.length) {
        depths.set(link.to, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  return depths;
}
