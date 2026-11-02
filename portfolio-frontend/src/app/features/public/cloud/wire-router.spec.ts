import { CloudLink, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { assignPorts, labelPoint, nodeRect, roundedPath, routeWire, sidesFor } from './wire-router';

const node = (id: string, x: number, y: number): CloudNode => ({ id, type: 'compute', x, y, zone: 'data' } as unknown as CloudNode);
const link = (from: string, to: string): CloudLink => ({ from, to } as CloudLink);

const crosses = (points: [number, number][], rect: { x: number; y: number; w: number; h: number }) => points.some((p, i) => {
  if (i === 0) return false;
  const q = points[i - 1];
  return Math.max(p[0], q[0]) > rect.x && Math.min(p[0], q[0]) < rect.x + rect.w && Math.max(p[1], q[1]) > rect.y && Math.min(p[1], q[1]) < rect.y + rect.h;
});

describe('wire router', () => {
  it('leaves through the side that faces the other node', () => {
    expect(sidesFor(node('a', 0, 0), node('b', 300, 10))).toEqual(['right', 'left']);
    expect(sidesFor(node('a', 0, 0), node('b', 10, 300))).toEqual(['bottom', 'top']);
  });

  it('spreads several wires leaving the same side', () => {
    const nodes = new Map([['a', node('a', 0, 200)], ['b', node('b', 400, 100)], ['c', node('c', 400, 200)], ['d', node('d', 400, 300)]]);
    const ports = assignPorts([link('a', 'b'), link('a', 'c'), link('a', 'd')], nodes);
    const ys = ['a>b', 'a>c', 'a>d'].map((key) => ports.get(key)!.from[1]);
    expect(new Set(ys).size).toBe(3);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ports.get('a>c')!.from[0]).toBe(NODE_WIDTH / 2);
  });

  it('goes around a node in the way instead of through it', () => {
    const from = node('a', 100, 200), to = node('b', 700, 200), blocker = node('x', 400, 200);
    const points = routeWire([from.x + NODE_WIDTH / 2, from.y], [to.x - NODE_WIDTH / 2, to.y], ['right', 'left'], [nodeRect(blocker)]);
    expect(crosses(points, nodeRect(blocker, 0))).toBeFalse();
    expect(points[0]).toEqual([from.x + NODE_WIDTH / 2, from.y]);
  });

  it('draws rounded corners and places the label on the longest stretch', () => {
    const d = roundedPath([[0, 0], [100, 0], [100, 100]]);
    expect(d).toContain('Q100 0');
    expect(labelPoint([[0, 0], [10, 0], [10, 200]])).toEqual([10, 93]);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
  });
});
