import { CloudLink, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { STUDIO_PRESETS } from './studio-project';
import { SYSTEM_TEMPLATES } from './system/system-templates';
import { breathe } from './zone-breathe';
import { assignPorts, countCrossings, labelPoint, nodeRect, roundedPath, routeAll, routeWire, sidesFor } from './wire-router';

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
    // El cable nace con un poco de aire respecto al borde del nodo.
    expect(points[0]).toEqual([from.x + NODE_WIDTH / 2 + 3, from.y]);
  });

  it('routes wires together so that two that would cross take separate lanes', () => {
    // Dos cables en Z con los destinos cambiados: cada uno por su cuenta se cruzaría.
    const nodes = new Map([['a', node('a', 0, 100)], ['b', node('b', 0, 300)], ['c', node('c', 500, 300)], ['d', node('d', 500, 100)], ['e', node('e', 250, 200)]]);
    const routes = routeAll([link('a', 'c'), link('b', 'd')], nodes);

    expect(countCrossings([...routes.values()])).toBeLessThanOrEqual(1);
    for (const points of routes.values()) {
      expect(crosses(points, nodeRect(nodes.get('e')!, 0))).toBeFalse();
    }
  });

  it('does not stack parallel wires leaving the same node on one line', () => {
    const nodes = new Map([['a', node('a', 0, 200)], ['b', node('b', 500, 60)], ['c', node('c', 500, 200)], ['d', node('d', 500, 340)]]);
    const routes = [...routeAll([link('a', 'b'), link('a', 'c'), link('a', 'd')], nodes).values()];
    // Tramos verticales: dos en la misma x no pueden pisarse (que uno suba y otro baje es correcto).
    const verticals = routes.map((points) => points.slice(1).flatMap((point, index) => (point[0] === points[index][0] && point[1] !== points[index][1]
      ? [{ x: point[0], from: Math.min(point[1], points[index][1]), to: Math.max(point[1], points[index][1]) }] : [])));
    for (const [index, wire] of verticals.entries()) {
      for (const other of verticals.slice(index + 1).flat()) {
        expect(wire.some((run) => run.x === other.x && run.from < other.to && other.from < run.to)).toBeFalse();
      }
    }
  });

  it('crosses far less than routing each wire on its own, in every design the studio ships', () => {
    let alone = 0;
    let together = 0;
    for (const project of [...STUDIO_PRESETS.map((preset) => preset.build()), ...SYSTEM_TEMPLATES.map((template) => template.build())]) {
      const { nodes } = breathe(project.zones, project.nodes);
      const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
      const links = project.links.filter((candidate) => byId.has(candidate.from) && byId.has(candidate.to));
      const ports = assignPorts(links, byId);
      alone += countCrossings([...ports].map(([key, port]) => {
        const [from, to] = key.split('>');
        return routeWire(port.from, port.to, port.sides, nodes.filter((candidate) => candidate.id !== from && candidate.id !== to).map((candidate) => nodeRect(candidate)));
      }));
      together += countCrossings([...routeAll(links, byId).values()]);
    }
    expect(together).toBeLessThan(alone / 2);
  });

  it('draws rounded corners and places the label on the longest stretch', () => {
    const d = roundedPath([[0, 0], [100, 0], [100, 100]]);
    expect(d).toContain('Q100 0');
    expect(labelPoint([[0, 0], [10, 0], [10, 200]])).toEqual([10, 93]);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
  });
});
