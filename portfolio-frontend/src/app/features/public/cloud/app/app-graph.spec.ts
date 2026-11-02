import { defaultSystemDesign } from '../system/system-design';
import { APP_PIECES } from './app-catalog.data';
import {
  AppGraph, addBox, addNode, connect, cycleProtocol, graphFromDesign, linkKey, moveBox, removeNode, sanitizeGraph,
} from './app-graph';
import { connectionVerdict } from './app-protocols';

const empty = (): AppGraph => ({ nodes: [], links: [], boxes: [] });

describe('application studio rules', () => {
  it('lets a service talk to each kind of data with its own protocol', () => {
    expect(connectionVerdict('monolith', 'sql')).toEqual({ allowed: true, protocols: ['SQL'] });
    expect(connectionVerdict('microservice', 'cache')).toEqual({ allowed: true, protocols: ['RESP'] });
    expect(connectionVerdict('worker', 'queue')).toEqual({ allowed: true, protocols: ['Eventos'] });
    expect(connectionVerdict('queue', 'worker')).toEqual({ allowed: true, protocols: ['Eventos'] });
    expect(connectionVerdict('microservice', 'microservice')).toEqual({ allowed: true, protocols: ['gRPC', 'REST', 'GraphQL'] });
  });

  it('refuses what an architect would refuse, and says what to do instead', () => {
    const client = connectionVerdict('spa', 'sql');
    expect(client.allowed).toBeFalse();
    expect(client.allowed ? '' : client.suggestion).toContain('API o un BFF');
    const backwards = connectionVerdict('sql', 'monolith');
    expect(backwards.allowed ? '' : backwards.suggestion).toContain('al revés');
    const loop = connectionVerdict('microservice', 'gateway');
    expect(loop.allowed).toBeFalse();
  });

  it('has an answer for every pair of pieces', () => {
    for (const from of APP_PIECES) {
      for (const to of APP_PIECES) {
        const verdict = connectionVerdict(from.type, to.type);
        expect(verdict.allowed ? verdict.protocols.length > 0 : !!verdict.reason && !!verdict.suggestion).withContext(`${from.type}>${to.type}`).toBeTrue();
      }
    }
  });
});

describe('application graph', () => {
  it('starts from the design decisions with a request path that follows the rules', () => {
    const design = defaultSystemDesign();
    design.choices.cache = 'redis';
    design.choices.queue = 'queue';
    const graph = graphFromDesign(design);
    const types = new Map(graph.nodes.map((node) => [node.id, node.type]));

    expect(graph.nodes.map((node) => node.id)).toEqual(['client', 'entry', 'backend', 'database', 'cache', 'queue', 'worker']);
    for (const link of graph.links) {
      const verdict = connectionVerdict(types.get(link.from)!, types.get(link.to)!);
      expect(verdict.allowed && verdict.protocols.includes(link.protocol)).withContext(linkKey(link)).toBeTrue();
    }
  });

  it('places a dropped piece without landing on another and connects with the default protocol', () => {
    let graph = addNode(empty(), 'monolith', { x: 300, y: 300 }).graph;
    const second = addNode(graph, 'sql', { x: 300, y: 300 });
    graph = second.graph;
    const [a, b] = graph.nodes;
    expect(Math.abs(a.x - b.x) >= 128 || Math.abs(a.y - b.y) >= 72).toBeTrue();

    const result = connect(graph, 'monolith-1', 'sql-1');
    expect(result.ok && result.link.protocol).toBe('SQL');
    if (result.ok) {
      const again = connect(result.graph, 'monolith-1', 'sql-1');
      expect(again.ok).toBeFalse();
    }
  });

  it('cycles a link through the protocols its ends admit, and forgets links with a removed piece', () => {
    let graph = addNode(addNode(empty(), 'spa', { x: 100, y: 100 }).graph, 'gateway', { x: 400, y: 100 }).graph;
    const result = connect(graph, 'spa-1', 'gateway-1');
    graph = result.ok ? result.graph : graph;
    expect(graph.links[0].protocol).toBe('HTTPS');
    graph = cycleProtocol(graph, 'spa-1>gateway-1');
    expect(graph.links[0].protocol).toBe('REST');

    expect(removeNode(graph, 'gateway-1').links).toEqual([]);
  });

  it('moves a box together with the pieces inside it', () => {
    let graph = addBox(empty(), 'domain');
    const box = graph.boxes[0];
    graph = addNode(graph, 'microservice', { x: box.x + 100, y: box.y + 100 }).graph;
    const before = graph;
    const moved = moveBox(graph, box.id, 40, 20, before);

    expect(moved.boxes[0].x).toBe(box.x + 40);
    expect(moved.nodes[0].x).toBe(before.nodes[0].x + 40);
    expect(moved.nodes[0].y).toBe(before.nodes[0].y + 20);
  });

  it('only restores what the canvas understands', () => {
    expect(sanitizeGraph('nada')).toBeNull();
    const graph = sanitizeGraph({
      nodes: [{ id: 'a', type: 'monolith', x: 10, y: 10 }, { id: 'b', type: 'teleport', x: 1, y: 1 }],
      links: [{ from: 'a', to: 'b', protocol: 'REST' }],
      boxes: [{ id: 'x', kind: 'nowhere', x: 0, y: 0, w: 1, h: 1 }],
    })!;
    expect(graph.nodes.map((node) => node.id)).toEqual(['a']);
    expect(graph.nodes[0].x).toBeGreaterThan(10);
    expect(graph.links).toEqual([]);
    expect(graph.boxes).toEqual([]);
  });
});
