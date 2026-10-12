import { flowOrder, verticalFlow } from './vertical-flow';

const IDS = ['visitor', 'admin', 'system', 'neon', 'upstash', 'gemini'];
const LINKS: [string, string][] = [['visitor', 'system'], ['admin', 'system'], ['system', 'neon'], ['system', 'upstash'], ['system', 'gemini']];

/** Todos los números de una ruta SVG, por parejas x, y. */
function points(path: string): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [, command, args] of path.matchAll(/([MHVQ])([^MHVQ]*)/g)) {
    const values = args.trim().split(/[\s,]+/).map(Number);
    if (command === 'H') {
      xs.push(...values);
    } else if (command === 'V') {
      ys.push(...values);
    } else {
      values.forEach((value, index) => (index % 2 === 0 ? xs : ys).push(value));
    }
  }
  return { xs, ys };
}

describe('vertical flow layout', () => {
  it('orders the nodes so that every link points downwards', () => {
    const order = flowOrder(IDS, LINKS);
    for (const [from, to] of LINKS) {
      expect(order.indexOf(from)).withContext(`${from} → ${to}`).toBeLessThan(order.indexOf(to));
    }
    // Sin dependencias entre ellos, se respeta el orden en que están escritos.
    expect(order).toEqual(IDS);
    expect(flowOrder(['api', 'spa', 'db'], [['spa', 'api'], ['api', 'db']])).toEqual(['spa', 'api', 'db']);
  });

  it('sends the nodes nothing connects to after the flow', () => {
    expect(flowOrder(['secrets', 'users', 'logs', 'api'], [['users', 'api']])).toEqual(['users', 'api', 'secrets', 'logs']);
  });

  it('keeps the given order when the links form a cycle', () => {
    expect(flowOrder(['a', 'b'], [['a', 'b'], ['b', 'a']])).toEqual(['a', 'b']);
  });

  for (const width of [200, 222, 342, 520]) {
    it(`stacks full-width nodes and keeps every node and line inside ${width} px`, () => {
      const layout = verticalFlow(IDS, LINKS, width, { nodeHeight: 52 });

      expect(layout.boxes.length).toBe(IDS.length);
      layout.boxes.forEach((box, index) => {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w).toBeLessThanOrEqual(width);
        expect(box.w).withContext('ancho del nodo').toBeGreaterThan(width * 0.75);
        if (index > 0) {
          const previous = layout.boxes[index - 1];
          expect(box.y).withContext('sin solaparse').toBeGreaterThanOrEqual(previous.y + previous.h + 16);
        }
      });
      expect(layout.edges.length).toBe(LINKS.length);
      for (const edge of layout.edges) {
        const { xs, ys } = points(edge.path);
        expect(Math.min(...xs)).withContext(edge.path).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).withContext(edge.path).toBeLessThanOrEqual(width);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...ys)).toBeLessThanOrEqual(layout.height);
      }
    });
  }

  it('joins neighbours with a straight segment and sends the rest down a lane on the left', () => {
    const layout = verticalFlow(IDS, LINKS, 342, { nodeHeight: 52 });
    const path = (from: string, to: string): string => layout.edges.find((edge) => edge.from === from && edge.to === to)!.path;

    expect(path('admin', 'system')).toMatch(/^M[\d.]+ [\d.]+ V[\d.]+$/);
    expect(path('system', 'neon')).toMatch(/^M[\d.]+ [\d.]+ V[\d.]+$/);
    expect(path('visitor', 'system')).toContain('Q');
    // Lo que sale del mismo nodo comparte carril; lo que llega va por otro distinto.
    const laneOf = (from: string, to: string): number => Math.min(...points(path(from, to)).xs);
    expect(laneOf('system', 'upstash')).toBe(laneOf('system', 'gemini'));
    expect(laneOf('visitor', 'system')).toBe(laneOf('system', 'gemini'));
  });

  it('gives no gutter to a simple chain', () => {
    const layout = verticalFlow(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], 300, { nodeHeight: 48 });
    expect(layout.boxes.every((box) => box.x === 1 && box.w === 298)).toBeTrue();
    expect(layout.height).toBe(1 + 3 * 48 + 2 * 20 + 1);
  });

  it('ignores links to nodes it does not know', () => {
    expect(verticalFlow(['a', 'b'], [['a', 'zzz'], ['a', 'b']], 300, { nodeHeight: 48 }).edges.length).toBe(1);
  });
});
