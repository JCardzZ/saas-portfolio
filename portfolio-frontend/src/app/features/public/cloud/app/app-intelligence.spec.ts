import { CANVAS_WIDTH, NODE_WIDTH } from '../cloud-topology.data';
import { defaultSystemDesign } from '../system/system-design';
import { reviewGraph, applyFix } from './app-advisor';
import { AppGraph, addBox, addNode, connect, graphFromDesign } from './app-graph';
import { drawnJourney } from './app-journey';
import { autoArrange, collisions, membersOf, settle } from './app-layout';
import { APP_PIECES } from './app-catalog.data';
import { PIECE_LESSONS } from './app-learn.data';

const empty = (): AppGraph => ({ nodes: [], links: [], boxes: [] });

function build(types: string[], links: [number, number][]): AppGraph {
  let graph = empty();
  types.forEach((type, index) => (graph = addNode(graph, type, { x: 100 + index * 150, y: 300 }).graph));
  for (const [from, to] of links) {
    const result = connect(graph, graph.nodes[from].id, graph.nodes[to].id);
    if (result.ok) {
      graph = result.graph;
    }
  }
  return graph;
}

describe('application studio layout', () => {
  it('pushes a piece dropped on another out of the way, keeping the one just moved', () => {
    let graph = build(['monolith', 'sql'], []);
    graph = { ...graph, nodes: graph.nodes.map((node, index) => (index === 1 ? { ...node, x: graph.nodes[0].x + 20, y: graph.nodes[0].y } : node)) };
    const settled = settle(graph, graph.nodes[1].id);

    expect(collisions(settled)).toBe(0);
    expect(settled.nodes[1].x).toBe(graph.nodes[1].x);
  });

  it('grows a box to hold its pieces and moves a sibling box out of the way', () => {
    let graph = addBox(empty(), 'domain');
    const domain = graph.boxes[0];
    graph = addNode(graph, 'microservice', { x: domain.x + 60, y: domain.y + 60 }).graph;
    // La pieza se sale por la derecha: la caja crece para contenerla.
    graph = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, x: domain.x + domain.w + 20 })) };
    graph = { ...graph, boxes: graph.boxes.map((box) => ({ ...box, w: box.w + 200 })) };
    let settled = settle(graph);
    expect(settled.boxes[0].x + settled.boxes[0].w).toBeGreaterThanOrEqual(settled.nodes[0].x + 64);

    settled = addBox(settled, 'domain');
    const second = settled.boxes[1];
    settled = { ...settled, boxes: settled.boxes.map((box) => (box.id === second.id ? { ...box, x: settled.boxes[0].x + 20, y: settled.boxes[0].y + 20 } : box)) };
    expect(collisions(settle(settled))).toBe(0);
  });

  it('does not let a growing box swallow a piece that was outside it', () => {
    let graph = addBox(empty(), 'vpc');
    const vpc = graph.boxes[0];
    graph = addNode(graph, 'microservice', { x: vpc.x + 80, y: vpc.y + 80 }).graph;
    graph = addNode(graph, 'spa', { x: vpc.x + vpc.w + 90, y: vpc.y + 80 }).graph;
    // La pieza de dentro se acerca al borde derecho: la caja crece hacia el cliente de fuera.
    graph = { ...graph, nodes: graph.nodes.map((node) => (node.type === 'microservice' ? { ...node, x: vpc.x + vpc.w - 10 } : node)) };
    const settled = settle(graph, 'microservice-1');

    expect(membersOf(settled, settled.boxes[0]).map((node) => node.id)).toEqual(['microservice-1']);
  });

  it('arranges the canvas in columns by layer with nothing overlapping', () => {
    const design = defaultSystemDesign();
    design.choices.cache = 'redis';
    design.choices.queue = 'queue';
    design.choices.auth = 'oidc-managed';
    const arranged = autoArrange(graphFromDesign(design));
    const x = (id: string) => arranged.nodes.find((node) => node.id === id)!.x;

    expect(collisions(arranged)).toBe(0);
    expect(x('client')).toBeLessThan(x('entry'));
    expect(x('entry')).toBeLessThan(x('backend'));
    expect(x('backend')).toBeLessThan(x('database'));
    expect(x('idp')).toBeGreaterThan(x('database'));
    // Con pocas columnas, el ancho sobrante va entre ellas: cabe la pastilla del protocolo entre dos piezas.
    expect(x('entry') - x('client') - NODE_WIDTH).toBeGreaterThanOrEqual(90);
    expect(Math.max(...arranged.nodes.map((node) => node.x)) + NODE_WIDTH / 2).toBeLessThanOrEqual(CANVAS_WIDTH);
  });
});

describe('application studio advisor', () => {
  it('flags a client that enters a service directly and fixes it with a gateway', () => {
    const graph = build(['spa', 'monolith', 'sql'], [[0, 1], [1, 2]]);
    const finding = reviewGraph(graph).findings.find((item) => item.id.startsWith('no-entry'))!;
    expect(finding.level).toBe('warn');
    expect(finding.learn).toContain('gateway');

    const fixed = applyFix(graph, finding);
    expect(fixed.nodes.some((node) => node.type === 'gateway')).toBeTrue();
    expect(reviewGraph(fixed).findings.some((item) => item.id.startsWith('no-entry'))).toBeFalse();
    expect(collisions(fixed)).toBe(0);
  });

  it('warns about a queue nobody consumes, a database shared by microservices and a long synchronous chain', () => {
    const queue = build(['monolith', 'queue'], [[0, 1]]);
    const consumer = reviewGraph(queue).findings.find((item) => item.id.startsWith('no-consumer'))!;
    expect(consumer.level).toBe('risk');
    expect(reviewGraph(applyFix(queue, consumer)).findings.some((item) => item.id.startsWith('no-consumer'))).toBeFalse();

    const shared = build(['microservice', 'microservice', 'sql'], [[0, 2], [1, 2]]);
    expect(reviewGraph(shared).findings.find((item) => item.id.startsWith('shared-db'))!.learn).toContain('dueño de sus datos');

    const chain = build(['microservice', 'microservice', 'microservice'], [[0, 1], [1, 2]]);
    const long = reviewGraph(chain).findings.find((item) => item.id === 'long-chain')!;
    expect(long.learn).toContain('99,7');
  });

  it('adds the missing identity, observability and secrets, each connected with the right protocol', () => {
    let graph = build(['spa', 'gateway', 'monolith', 'microservice', 'sql'], [[0, 1], [1, 2], [2, 3], [3, 4]]);
    for (const id of ['no-identity', 'no-observability', 'no-secrets']) {
      const finding = reviewGraph(graph).findings.find((item) => item.id === id)!;
      graph = applyFix(graph, finding);
    }
    const ids = reviewGraph(graph).findings.map((item) => item.id);
    expect(ids).not.toContain('no-identity');
    expect(ids).not.toContain('no-observability');
    expect(ids).not.toContain('no-secrets');
    expect(graph.links.filter((link) => link.protocol === 'OTLP').length).toBe(2);
    expect(graph.links.some((link) => link.protocol === 'OIDC')).toBeTrue();
  });

  it('puts exposed data inside the private network and assigns where each piece runs', () => {
    const graph = build(['monolith', 'sql'], [[0, 1]]);
    const outside = reviewGraph(graph).findings.find((item) => item.id === 'data-outside')!;
    const fixed = applyFix(graph, outside);
    expect(fixed.boxes.length).toBe(1);
    expect(reviewGraph(fixed).findings.some((item) => item.id === 'data-outside')).toBeFalse();

    const infra = [{ id: 'api', type: 'containers', name: 'ECS Fargate' }, { id: 'db', type: 'postgres', name: 'RDS PostgreSQL' }];
    const deploy = reviewGraph(fixed, infra).findings.find((item) => item.id === 'not-deployed')!;
    const deployed = applyFix(fixed, deploy);
    expect(deployed.nodes.map((node) => node.runsOn)).toEqual(['api', 'db']);
  });

  it('marks risks and improvements on the canvas but not the ideas, and says when all is well', () => {
    const graph = build(['monolith', 'queue'], [[0, 1]]);
    const review = reviewGraph(graph);
    expect(review.marks.get('queue-1')).toBe('risk');
    expect(review.verdict).toBe('risk');
    expect(reviewGraph(empty()).headline).toBe('Lienzo vacío');
  });

  it('teaches every piece of the catalog', () => {
    for (const piece of APP_PIECES) {
      const lesson = PIECE_LESSONS[piece.type];
      expect(lesson && lesson.what && lesson.when && lesson.avoid && lesson.failure.impact).withContext(piece.type).toBeTruthy();
    }
  });
});

describe('application studio journey', () => {
  it('follows the deepest synchronous path to the data and keeps the queue after the response', () => {
    const graph = build(['spa', 'gateway', 'monolith', 'sql', 'queue', 'worker'], [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5]]);
    const journey = drawnJourney(graph)!;

    expect(journey.hops.filter((hop) => !hop.async).map((hop) => hop.nodeId)).toEqual(['spa-1', 'gateway-1', 'monolith-1', 'sql-1']);
    expect(journey.hops.filter((hop) => hop.async).map((hop) => hop.nodeId)).toEqual(['queue-1', 'worker-1']);
    expect(journey.totalMs).toBe(journey.networkMs + journey.hops.filter((hop) => !hop.async).reduce((sum, hop) => sum + hop.ms, 0));
    expect(journey.hops[3].protocol).toBe('SQL');
  });

  it('has no journey without a connected client', () => {
    expect(drawnJourney(build(['monolith', 'sql'], [[0, 1]]))).toBeNull();
  });
});
