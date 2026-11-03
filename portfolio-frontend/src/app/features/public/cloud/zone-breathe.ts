import { CANVAS_HEIGHT, CANVAS_WIDTH, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { StudioZone } from './studio-project';
import { ZONE_PADDING } from './zone-solver';

/**
 * Aire del lienzo inteligente (flag `studio.smart-rules`): las plantillas colocan las columnas casi
 * pegadas y una flecha no tiene dónde trazarse. Al cargar un diseño, sin cambiar su estructura:
 *   - se inserta espacio entre las columnas de recuadros hermanos, como una costura vertical: todo lo
 *     que queda a su derecha se desplaza junto, así que nada puede acabar encima de otra cosa;
 *   - las piezas apiladas en una columna se reparten en el alto que tienen disponible.
 * Es idempotente: un diseño con aire no cambia.
 */

/** Hueco que se busca entre dos columnas de recuadros y entre dos piezas apiladas. */
export const COLUMN_AIR = 60;
export const ROW_AIR = 44;
/** Sitio que deja arriba un recuadro contenedor para su rótulo y el de las piezas sueltas. */
const LABEL_ROOM = 66;
const EDGE = 20;

type Box = { x: number; y: number; w: number; h: number };

const right = (box: Box) => box.x + box.w;
const bottom = (box: Box) => box.y + box.h;
const contains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);
const holds = (zone: Box, node: { x: number; y: number }) => node.x >= zone.x && node.x <= right(zone) && node.y >= zone.y && node.y <= bottom(zone);
const smallest = <T extends Box>(boxes: T[]) => [...boxes].sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;

export function breathe(zones: StudioZone[], nodes: CloudNode[]): { zones: StudioZone[]; nodes: CloudNode[] } {
  const spread = spreadColumns(zones, nodes);
  return { zones: spread.zones, nodes: spreadRows(spread.zones, spread.nodes) };
}

/** Costuras verticales entre columnas de recuadros hermanos. */
function spreadColumns(zones: StudioZone[], nodes: CloudNode[]): { zones: StudioZone[]; nodes: CloudNode[] } {
  const isContainer = (zone: StudioZone) => zones.some((other) => other.id !== zone.id && contains(zone, other));
  const parentOf = (zone: StudioZone) => smallest(zones.filter((other) => other.id !== zone.id && contains(other, zone)))?.id ?? null;
  const leaves = zones.filter((zone) => !isContainer(zone)).sort((a, b) => a.x - b.x);

  const seams = new Map<number, number>();
  leaves.forEach((zone, index) => {
    const next = leaves.slice(index + 1).find((other) => parentOf(other) === parentOf(zone) && other.y < bottom(zone) && zone.y < bottom(other));
    if (next && next.x - right(zone) < COLUMN_AIR && next.x >= right(zone)) {
      seams.set(next.x, Math.max(seams.get(next.x) ?? 0, COLUMN_AIR - (next.x - right(zone))));
    }
  });
  const wanted = [...seams.values()].reduce((sum, need) => sum + need, 0);
  if (!wanted) {
    return { zones, nodes };
  }
  // Lo que cabe: el aire se reparte en proporción si no hay sitio para todo.
  const rightmost = Math.max(...nodes.map((node) => node.x + NODE_WIDTH / 2), ...leaves.map(right));
  const scale = Math.min(1, Math.max(0, CANVAS_WIDTH - EDGE - ZONE_PADDING.side - rightmost) / wanted);
  const shiftAt = (x: number) => Math.round([...seams].reduce((sum, [at, need]) => sum + (x >= at ? need * scale : 0), 0));

  const movedNodes = nodes.map((node) => ({ ...node, x: node.x + shiftAt(node.x) }));
  const moved = new Map<string, StudioZone>(leaves.map((zone) => [zone.id, { ...zone, x: zone.x + shiftAt(zone.x) }]));
  // Contenedores, de menor a mayor: solo crecen lo justo para seguir conteniendo lo suyo.
  for (const zone of zones.filter(isContainer).sort((a, b) => a.w * a.h - b.w * b.h)) {
    const children = [...zones.filter((other) => other.id !== zone.id && contains(zone, other)).map((other) => moved.get(other.id)!)];
    const held = nodes.filter((node) => holds(zone, node) && !zones.some((other) => other.id !== zone.id && contains(zone, other) && holds(other, node)))
      .map((node) => movedNodes.find((candidate) => candidate.id === node.id)!);
    const x = zone.x + shiftAt(zone.x);
    const reach = Math.max(...children.map(right), ...held.map((node) => node.x + NODE_WIDTH / 2)) + ZONE_PADDING.side;
    moved.set(zone.id, { ...zone, x, w: Math.max(right(zone), reach) - x });
  }
  return { zones: zones.map((zone) => moved.get(zone.id)!), nodes: movedNodes };
}

/** Reparte las piezas apiladas en una misma columna en el alto de lo que las contiene. */
function spreadRows(zones: StudioZone[], nodes: CloudNode[]): CloudNode[] {
  const ownerOf = (node: CloudNode) => smallest(zones.filter((zone) => holds(zone, node)));
  const columns = new Map<string, CloudNode[]>();
  for (const node of nodes) {
    const key = `${ownerOf(node)?.id ?? ''}|${Math.round(node.x / 16)}`;
    columns.set(key, [...(columns.get(key) ?? []), node]);
  }
  const next = new Map(nodes.map((node) => [node.id, node.y]));
  for (const column of columns.values()) {
    if (column.length < 2) {
      continue;
    }
    const stack = [...column].sort((a, b) => a.y - b.y);
    const tightest = Math.min(...stack.slice(1).map((node, index) => node.y - stack[index].y)) - NODE_HEIGHT;
    if (tightest >= ROW_AIR) {
      continue;
    }
    const owner = ownerOf(stack[0]);
    const limit = (owner ? bottom(owner) - ZONE_PADDING.bottom : CANVAS_HEIGHT - EDGE) - NODE_HEIGHT / 2;
    // Una columna suelta dentro de un contenedor también aprovecha el alto de arriba, si nadie lo ocupa.
    const leaf = owner && !zones.some((zone) => zone.id !== owner.id && contains(owner, zone));
    const others = nodes.filter((node) => !stack.includes(node) && Math.abs(node.x - stack[0].x) < NODE_WIDTH);
    const ceiling = owner && !leaf ? Math.max(owner.y + LABEL_ROOM + NODE_HEIGHT / 2, ...others.filter((node) => node.y < stack[0].y).map((node) => node.y + NODE_HEIGHT + ROW_AIR)) : stack[0].y;
    const top = Math.min(stack[0].y, ceiling);
    const step = Math.min(NODE_HEIGHT + ROW_AIR, (limit - top) / (stack.length - 1));
    if (step <= NODE_HEIGHT + tightest) {
      continue;
    }
    stack.forEach((node, index) => next.set(node.id, Math.round(top + index * step)));
  }
  return nodes.map((node) => ({ ...node, y: next.get(node.id)! }));
}
