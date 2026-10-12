import { CANVAS_HEIGHT, CANVAS_WIDTH, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { StudioZone, ZONE_MIN_SIZE, ZoneCorner, resizeZone, zoneAt } from './studio-project';

/**
 * Lienzo responsivo (flag `studio.smart-rules`): al redimensionar un recuadro, lo que contiene
 * se reacomoda dentro, y el recuadro no se puede hacer más pequeño que su contenido.
 *
 * La rejilla es la misma de auto-ordenar (`auto-layout.ts`): columnas cada 140 y filas cada 90,
 * con la primera fila a 68 del borde superior, para que las dos funciones dejen el mismo dibujo.
 */
export const COLUMN_STEP = NODE_WIDTH + 12;
export const ROW_STEP = 90;
export const FIRST_ROW_OFFSET = 68;
/** Aire entre el último nodo y el borde inferior del recuadro. */
const BOTTOM_PAD = 8;
/** Aire alrededor del contenido al ajustar la vista. */
const VIEW_PAD = 24;
/** Por debajo de esta altura un recuadro es una franja: una sola fila, centrada. */
const STRIP_HEIGHT = FIRST_ROW_OFFSET + NODE_HEIGHT / 2 + BOTTOM_PAD;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Nodos que están directamente en el recuadro: no en uno más pequeño que haya dentro. */
export function directNodes(zone: StudioZone, nodes: CloudNode[], zones: StudioZone[]): CloudNode[] {
  return nodes.filter((node) => zoneAt(zones, node.x, node.y)?.id === zone.id);
}

/** Columnas de nodos que caben a lo ancho. */
export function columnsThatFit(width: number): number {
  return Math.max(1, Math.floor(width / COLUMN_STEP));
}

/** Filas de nodos que caben a lo alto. */
export function rowsThatFit(height: number): number {
  return height < STRIP_HEIGHT ? 1 : Math.floor((height - FIRST_ROW_OFFSET - NODE_HEIGHT / 2 - BOTTOM_PAD) / ROW_STEP) + 1;
}

/** Altura mínima para un número de filas. Una sola fila cabe en una franja. */
export function heightForRows(rows: number): number {
  return rows <= 1 ? ZONE_MIN_SIZE : FIRST_ROW_OFFSET + (rows - 1) * ROW_STEP + NODE_HEIGHT / 2 + BOTTOM_PAD;
}

/** ¿Caben `count` nodos, sin solaparse, en un recuadro de ese tamaño? */
export function fits(count: number, width: number, height: number): boolean {
  return count === 0 || (width >= COLUMN_STEP && columnsThatFit(width) * rowsThatFit(height) >= count);
}

/**
 * Tamaño mínimo de un recuadro para lo que contiene, dado el ancho que se le quiere dar: el
 * alto necesario para sus nodos con las columnas que caben en ese ancho.
 */
export function minimumSize(count: number, width: number): { w: number; h: number } {
  if (count === 0) {
    return { w: ZONE_MIN_SIZE, h: ZONE_MIN_SIZE };
  }
  const w = Math.max(width, COLUMN_STEP);
  return { w, h: heightForRows(Math.ceil(count / columnsThatFit(w))) };
}

/**
 * Redimensiona un recuadro tirando de una esquina sin dejarlo más pequeño que su contenido: sus
 * nodos directos (en rejilla) y los recuadros que tiene dentro. La esquina opuesta no se mueve.
 * Si el contenido no cabe en el lienzo con esa esquina fija, el recuadro se queda como estaba.
 */
export function resizeToContent(
  origin: StudioZone, corner: ZoneCorner, dx: number, dy: number, nodeCount: number, innerZones: Rect[],
): StudioZone {
  const wanted = resizeZone(origin, corner, dx, dy);
  const east = corner.endsWith('e');
  const south = corner.startsWith('s');
  // Borde fijo de cada eje: el opuesto a la esquina de la que se tira.
  const fixedX = east ? origin.x : origin.x + origin.w;
  const fixedY = south ? origin.y : origin.y + origin.h;
  const roomX = east ? CANVAS_WIDTH - fixedX : fixedX;
  const roomY = south ? CANVAS_HEIGHT - fixedY : fixedY;

  // Lo que ocupan los recuadros de dentro, medido desde el borde fijo.
  const innerW = Math.max(0, ...innerZones.map((zone) => (east ? zone.x + zone.w - fixedX : fixedX - zone.x)));
  const innerH = Math.max(0, ...innerZones.map((zone) => (south ? zone.y + zone.h - fixedY : fixedY - zone.y)));

  let w = Math.max(wanted.w, innerW, nodeCount > 0 ? COLUMN_STEP : ZONE_MIN_SIZE);
  let h = Math.max(wanted.h, innerH, minimumSize(nodeCount, w).h);
  // Si el alto que piden las filas no cabe en el lienzo, se ensancha hasta que quepa.
  while (h > roomY && w + COLUMN_STEP <= roomX) {
    w += COLUMN_STEP;
    h = Math.max(wanted.h, innerH, minimumSize(nodeCount, w).h);
  }
  if (w > roomX || h > roomY) {
    return origin;
  }
  return {
    ...origin,
    x: Math.round(east ? fixedX : fixedX - w),
    y: Math.round(south ? fixedY : fixedY - h),
    w: Math.round(w),
    h: Math.round(h),
  };
}

function overlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT;
}

function fullyInside(node: { x: number; y: number }, zone: Rect): boolean {
  return node.x - NODE_WIDTH / 2 >= zone.x && node.x + NODE_WIDTH / 2 <= zone.x + zone.w
    && node.y - NODE_HEIGHT / 2 >= zone.y && node.y + NODE_HEIGHT / 2 <= zone.y + zone.h;
}

/** ¿Están todos los nodos enteros dentro del recuadro y sin pisarse? */
export function settled(nodes: { x: number; y: number }[], zone: Rect): boolean {
  return nodes.every((node, index) => fullyInside(node, zone) && nodes.slice(index + 1).every((other) => !overlap(node, other)));
}

/**
 * Coloca los nodos dentro del recuadro. Si ya están enteros dentro y sin solaparse, no los
 * toca: solo se reordena lo que el cambio de tamaño ha dejado fuera o encima de otro. Al
 * reordenar se conserva el orden en que se leían (por columnas, de arriba abajo) y se usan
 * las menos columnas posibles, como hace auto-ordenar.
 */
export function reflow<T extends { id: string; x: number; y: number }>(nodes: T[], zone: Rect): T[] {
  if (nodes.length === 0 || settled(nodes, zone)) {
    return nodes;
  }
  const rows = rowsThatFit(zone.h);
  const columns = Math.min(columnsThatFit(zone.w), Math.ceil(nodes.length / rows));
  const perColumn = Math.ceil(nodes.length / columns);
  const firstY = zone.h < STRIP_HEIGHT ? zone.y + zone.h / 2 : zone.y + FIRST_ROW_OFFSET;
  const ordered = [...nodes].sort((a, b) => Math.round(a.x / (COLUMN_STEP / 2)) - Math.round(b.x / (COLUMN_STEP / 2)) || a.y - b.y);
  const placed = new Map(ordered.map((node, position) => {
    const column = Math.floor(position / perColumn);
    return [node.id, {
      x: Math.round(zone.x + zone.w / 2 + (column - (columns - 1) / 2) * COLUMN_STEP),
      y: Math.round(firstY + (position % perColumn) * ROW_STEP),
    }];
  }));
  return nodes.map((node) => ({ ...node, ...placed.get(node.id)! }));
}

/**
 * Parte del lienzo que ocupa el diagrama (nodos y recuadros), con algo de aire, como `viewBox`.
 * Sin contenido, el lienzo entero. La vista nunca es más estrecha que `minWidth`, para que
 * un diagrama de un solo nodo no se amplíe hasta llenar la pantalla.
 */
export function contentBounds(nodes: { x: number; y: number }[], zones: Rect[], minWidth = 480): Rect {
  const boxes: Rect[] = [
    ...zones,
    // El rótulo del nodo va debajo de su caja: se le deja sitio.
    ...nodes.map((node) => ({ x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2, w: NODE_WIDTH, h: NODE_HEIGHT + 16 })),
  ];
  if (boxes.length === 0) {
    return { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  }
  const left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - VIEW_PAD);
  const top = Math.max(0, Math.min(...boxes.map((box) => box.y)) - VIEW_PAD);
  const right = Math.min(CANVAS_WIDTH, Math.max(...boxes.map((box) => box.x + box.w)) + VIEW_PAD);
  const bottom = Math.min(CANVAS_HEIGHT, Math.max(...boxes.map((box) => box.y + box.h)) + VIEW_PAD);
  const w = Math.max(right - left, Math.min(minWidth, CANVAS_WIDTH));
  // Si hubo que ensanchar hasta el mínimo, se centra el contenido sin salir del lienzo.
  const x = Math.max(0, Math.min(CANVAS_WIDTH - w, left - (w - (right - left)) / 2));
  return { x: Math.round(x), y: Math.round(top), w: Math.round(w), h: Math.round(bottom - top) };
}
