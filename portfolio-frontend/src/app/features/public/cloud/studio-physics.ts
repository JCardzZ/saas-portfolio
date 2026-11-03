import { CANVAS_HEIGHT, CANVAS_WIDTH, NODE_HEIGHT, NODE_WIDTH, ZoneId } from './cloud-topology.data';
import { GRAPH_RULES, GraphRules, endpointOf } from './graph-rules';
import { StudioZone, zoneAt } from './studio-project';

/**
 * «Física» del lienzo inteligente (flag `studio.smart-rules`), en funciones puras:
 *   - los nodos no se montan unos sobre otros: al soltar uno encima de otro, va al hueco libre más
 *     cercano dentro del mismo recuadro;
 *   - una pieza no entra donde las reglas no la dejan (una base de datos en una subred pública):
 *     el lienzo ofrece resistencia, dice por qué y, al soltar, la devuelve a su sitio;
 *   - la vista se acerca y aleja alrededor del cursor, dentro de unos límites.
 */

/** Separación mínima entre dos nodos, en unidades del lienzo. */
export const NODE_GAP = 12;
/** Cuánto avanza el nodo, respecto al puntero, dentro de una zona que no lo admite. */
export const FRICTION = 0.3;

export interface Point { x: number; y: number }

/** ¿Se tocan dos nodos (con su separación mínima)? */
export function overlaps(a: Point, b: Point, gap = NODE_GAP): boolean {
  return Math.abs(a.x - b.x) < NODE_WIDTH + gap && Math.abs(a.y - b.y) < NODE_HEIGHT + gap;
}

function insideCanvas(point: Point): boolean {
  return point.x >= NODE_WIDTH / 2 + 4 && point.x <= CANVAS_WIDTH - NODE_WIDTH / 2 - 4
    && point.y >= NODE_HEIGHT / 2 + 4 && point.y <= CANVAS_HEIGHT - NODE_HEIGHT / 2 - 4;
}

/**
 * Dónde dejar el nodo `id` si al soltarlo en `drop` pisa a otro: el punto libre más cercano que
 * sigue dentro del mismo recuadro (así no cambia de zona de red sin querer). Si no pisa a nadie,
 * `drop` tal cual; si el recuadro está lleno, también (mejor encima que en otra zona).
 */
export function resolveCollision(id: string, drop: Point, nodes: (Point & { id: string })[], zones: Pick<StudioZone, 'id' | 'x' | 'y' | 'w' | 'h'>[]): Point {
  const others = nodes.filter((node) => node.id !== id);
  // Solo si de verdad se monta encima: los diseños de partida tienen nodos más juntos que la separación.
  if (!others.some((node) => overlaps(drop, node, 0))) {
    return drop;
  }
  const home = zoneAt(zones, drop.x, drop.y)?.id ?? null;
  const step = NODE_GAP;
  // Anillos cuadrados cada vez más amplios alrededor del punto de soltado; en cada anillo, el más cercano.
  for (let ring = 1; ring <= 60; ring++) {
    const candidates: Point[] = [];
    for (let i = -ring; i <= ring; i++) {
      for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        candidates.push({ x: Math.round(drop.x + dx * step), y: Math.round(drop.y + dy * step) });
      }
    }
    const free = candidates
      .filter((point) => insideCanvas(point) && (zoneAt(zones, point.x, point.y)?.id ?? null) === home && !others.some((node) => overlaps(point, node)))
      .sort((a, b) => Math.hypot(a.x - drop.x, a.y - drop.y) - Math.hypot(b.x - drop.x, b.y - drop.y));
    if (free.length) {
      return free[0];
    }
  }
  return drop;
}

export interface PlacementVerdict {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

/** ¿Puede estar una pieza de este tipo en esta zona de red? Las mismas reglas que avisan al guardar. */
export function placementVerdict(type: string, name: string, zone: ZoneId, rules: GraphRules = GRAPH_RULES): PlacementVerdict {
  const endpoint = endpointOf(type, rules);
  const rule = rules.placement.find((candidate) => candidate.endpoints.includes(endpoint) && candidate.zones.includes(zone));
  return rule
    ? { allowed: false, reason: rule.message.replaceAll('{node}', name), suggestion: rule.suggestion.replaceAll('{node}', name) }
    : { allowed: true };
}

/** Posición con resistencia: dentro de una zona prohibida, el nodo solo sigue al puntero en parte. */
export function withFriction(lastAllowed: Point, target: Point, friction = FRICTION): Point {
  return { x: Math.round(lastAllowed.x + (target.x - lastAllowed.x) * friction), y: Math.round(lastAllowed.y + (target.y - lastAllowed.y) * friction) };
}

export interface View { x: number; y: number; w: number; h: number }

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
export const FULL_VIEW: View = { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };

/**
 * Acerca (`factor` > 1) o aleja la vista alrededor de `focus`, que queda quieto en pantalla.
 * El zoom se limita entre MIN_ZOOM y MAX_ZOOM respecto a `base`: el ancho que se ve al 100 %
 * (el lienzo completo, o el encuadre del diagrama).
 */
export function zoomView(view: View, factor: number, focus: Point, base = CANVAS_WIDTH): View {
  const zoom = base / view.w;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  const scale = zoom / next;
  const w = view.w * scale, h = view.h * scale;
  return clampView({ x: focus.x - (focus.x - view.x) * scale, y: focus.y - (focus.y - view.y) * scale, w, h });
}

/** Desplaza la vista (en unidades del lienzo). */
export function panView(view: View, dx: number, dy: number): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy });
}

/** La vista no se aleja del lienzo más de medio ancho: siempre queda algo del diagrama a la vista. */
export function clampView(view: View): View {
  const marginX = view.w / 2, marginY = view.h / 2;
  return {
    ...view,
    x: Math.min(CANVAS_WIDTH - marginX, Math.max(-marginX, view.x)),
    y: Math.min(CANVAS_HEIGHT - marginY, Math.max(-marginY, view.y)),
  };
}

export function zoomLevel(view: View): number {
  return Math.round((CANVAS_WIDTH / view.w) * 100);
}
