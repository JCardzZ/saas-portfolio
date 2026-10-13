import { CLOUD_NODES, CloudNode } from '../cloud-topology.data';
import { SYSTEM_CATALOG } from './system-catalog.data';
import { SystemDesign, defaultSystemDesign, withChoice } from './system-design';
import { OPTION_LOGOS, REQUIRED_ATTRIBUTIONS, TRADEMARK_NOTICE } from './system-icons';
import { DiagramNode, GLYPHS, MIN_NODE_W, NODE_H, NODE_W, SHORT_NAMES, SystemDiagram, buildSystemDiagram } from './system-diagram';

const infra = (): CloudNode[] => structuredClone(CLOUD_NODES);
const full = (): SystemDesign => {
  let design = defaultSystemDesign();
  for (const [category, option] of [['cache', 'cdn'], ['bff', 'gateway'], ['auth', 'oidc-managed'], ['queue', 'queue'], ['push', 'websocket']] as const) {
    design = withChoice(design, category, option);
  }
  return design;
};
const ids = (diagram: SystemDiagram) => diagram.nodes.map((node) => node.id);
const edge = (diagram: SystemDiagram, id: string) => diagram.edges.find((candidate) => candidate.id === id)!;
const overlap = (a: DiagramNode, b: DiagramNode) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('system diagram', () => {
  it('draws the default system in three layers, with the request path labelled by its API style', () => {
    const diagram = buildSystemDiagram(defaultSystemDesign(), infra(), 'aws');

    expect(diagram.lanes.map((lane) => lane.label)).toEqual(['Cliente', 'Aplicación', 'Datos']);
    expect(ids(diagram)).toEqual(['client', 'backend', 'auth', 'database']);
    expect(diagram.edges.map((item) => `${item.from}>${item.to}:${item.label}`)).toEqual(['client>backend:REST', 'backend>database:SQL', 'backend>auth:JWT']);
    expect(edge(diagram, 'client-backend').kind).toBe('request');
  });

  it('adds each piece and its connections as soon as it is chosen', () => {
    const before = buildSystemDiagram(defaultSystemDesign(), infra(), 'aws');
    const withCache = buildSystemDiagram(withChoice(defaultSystemDesign(), 'cache', 'redis'), infra(), 'aws');
    const withQueue = buildSystemDiagram(withChoice(withChoice(defaultSystemDesign(), 'cache', 'redis'), 'queue', 'stream'), infra(), 'aws');

    expect(ids(before)).not.toContain('cache');
    expect(withCache.nodes.find((node) => node.id === 'cache')!.lane).toBe('data');
    expect(edge(withCache, 'backend-cache').label).toBe('caché');
    expect(edge(withQueue, 'backend-queue')).toEqual(jasmine.objectContaining({ label: 'eventos', kind: 'async' }));
    // Cambiar de opción renueva la pieza (su clave cambia), para que el dibujo la vuelva a presentar.
    const mongo = buildSystemDiagram(withChoice(defaultSystemDesign(), 'database', 'document'), infra(), 'aws');
    expect(mongo.nodes.find((node) => node.id === 'database')!.key).not.toBe(before.nodes.find((node) => node.id === 'database')!.key);
    expect(edge(mongo, 'backend-database').label).toBe('docs');
  });

  it('puts what sits in front of the backend in its own layer and routes the request through it', () => {
    const diagram = buildSystemDiagram(full(), infra(), 'aws');

    expect(diagram.lanes.map((lane) => lane.id)).toEqual(['client', 'entry', 'app', 'data']);
    expect(diagram.nodes.filter((node) => node.lane === 'entry').map((node) => node.id)).toEqual(['cache', 'bff', 'auth', 'push']);
    expect(diagram.edges.map((item) => item.id)).toEqual([
      'client-cache', 'cache-bff', 'bff-backend', 'backend-database', 'backend-queue', 'client-auth', 'backend-auth', 'backend-push', 'push-client',
    ]);
    expect(edge(diagram, 'client-auth').kind).toBe('auth');
    // Los rótulos van en el hueco entre capas: tienen que caber en él.
    for (const item of diagram.edges) {
      expect(item.label.length).withContext(item.id).toBeLessThanOrEqual(7);
    }
  });

  it('keeps every piece inside its layer, without overlaps, and everything inside the drawing', () => {
    for (const vertical of [false, true]) {
      for (const design of [defaultSystemDesign(), full()]) {
        const diagram = buildSystemDiagram(design, infra(), 'aws', vertical);
        for (const node of diagram.nodes) {
          const lane = diagram.lanes.find((candidate) => candidate.id === node.lane)!;
          expect(node.x >= lane.x && node.x + node.w <= lane.x + lane.w && node.y >= lane.y && node.y + node.h <= lane.y + lane.h)
            .withContext(`${node.id} dentro de ${lane.id}`).toBeTrue();
          expect(node.w).toBe(NODE_W);
          expect(node.h).toBe(NODE_H);
          expect(diagram.nodes.filter((other) => other !== node && overlap(node, other))).withContext(`${node.id} no se solapa`).toEqual([]);
        }
        for (const lane of diagram.lanes) {
          expect(lane.x >= 0 && lane.y >= 0 && lane.x + lane.w <= diagram.width && lane.y + lane.h <= diagram.height).withContext(lane.id).toBeTrue();
        }
      }
    }
  });

  it('routes a connection that skips a layer under the layers instead of across their pieces', () => {
    const design = withChoice(defaultSystemDesign(), 'auth', 'oidc-managed');
    const diagram = buildSystemDiagram(design, infra(), 'aws');
    const bottom = Math.max(...diagram.lanes.map((lane) => lane.y + lane.h));

    // Cliente → Backend salta la capa de entrada, donde está el proveedor de identidad.
    expect(edge(diagram, 'client-backend').labelAt[1]).toBeGreaterThan(bottom);
    expect(diagram.height).toBeGreaterThan(bottom + 16);
    expect(edge(diagram, 'client-auth').labelAt[1]).toBeLessThan(bottom);
  });

  it('stacks the layers top to bottom when asked to, without shrinking the pieces, narrow enough for a phone', () => {
    const wide = buildSystemDiagram(full(), infra(), 'aws');
    const stacked = buildSystemDiagram(full(), infra(), 'aws', true);

    expect(stacked.vertical).toBeTrue();
    expect(stacked.width).toBeLessThanOrEqual(240);
    // En un hueco muy estrecho las piezas se ajustan a él, sin bajar de su ancho mínimo.
    const tight = buildSystemDiagram(full(), infra(), 'aws', true, 206);
    expect(tight.width).toBeLessThanOrEqual(206);
    expect(tight.nodes.every((node) => node.w >= MIN_NODE_W)).toBeTrue();
    expect(buildSystemDiagram(full(), infra(), 'aws', true, 120).nodes[0].w).toBe(MIN_NODE_W);
    expect(ids(stacked)).toEqual(ids(wide));
    expect(stacked.edges.map((item) => item.id)).toEqual(wide.edges.map((item) => item.id));
    const tops = stacked.lanes.map((lane) => lane.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });

  it('shows under each piece the cloud service it is deployed on, with the official architecture icon of that cloud', () => {
    const design: SystemDesign = { ...defaultSystemDesign(), deployments: { backend: 'api', database: 'postgres' } };
    const aws = buildSystemDiagram(design, infra(), 'aws');
    const azure = buildSystemDiagram(design, infra(), 'azure');
    const backend = (diagram: SystemDiagram) => diagram.nodes.find((node) => node.id === 'backend')!;

    expect(backend(aws).deployedOn).toEqual({ name: 'ECS Fargate', image: jasmine.stringContaining('cloud-icons/aws/') });
    expect(backend(aws).pending).toBeFalse();
    expect(backend(azure).deployedOn!.name).toBe('Container Apps');
    expect(backend(azure).deployedOn!.image).toContain('cloud-icons/azure/');
    // Sin desplegar todavía, o que no se despliega en la nube: lo dice en vez de un servicio.
    expect(aws.nodes.find((node) => node.id === 'client')).toEqual(jasmine.objectContaining({ deployedOn: null, note: 'Sin desplegar', pending: true }));
    expect(aws.nodes.find((node) => node.id === 'auth')).toEqual(jasmine.objectContaining({ note: 'Dentro del backend', pending: false }));
    const mobile = buildSystemDiagram(withChoice(defaultSystemDesign(), 'client', 'mobile-native'), infra(), 'aws');
    expect(mobile.nodes.find((node) => node.id === 'client')!.note).toBe('En las tiendas de apps');
  });

  it('gives every piece its technology logo or, for a generic option, a role glyph, always with a short text name', () => {
    for (const option of SYSTEM_CATALOG.filter((category) => category.id !== 'api').flatMap((category) => category.options)) {
      expect(SHORT_NAMES[option.id]).withContext(`${option.id}: nombre corto`).toBeDefined();
      expect(SHORT_NAMES[option.id].length).withContext(`${option.id}: cabe en el nodo`).toBeLessThanOrEqual(20);
    }
    for (const api of SYSTEM_CATALOG.find((category) => category.id === 'api')!.options) {
      expect(SHORT_NAMES[api.id].length).withContext(`${api.id}: rótulo de la conexión`).toBeLessThanOrEqual(10);
    }
    const diagram = buildSystemDiagram({ ...full(), deployments: { backend: 'api', database: 'postgres', cache: 'edge' } }, infra(), 'aws');
    const piece = (id: string) => diagram.nodes.find((node) => node.id === id)!;

    expect(piece('backend').logos.map((logo) => logo.title)).toEqual(['Spring Boot']);
    expect(piece('database').logos.map((logo) => logo.title)).toEqual(['PostgreSQL']);
    expect(piece('client').logos.map((logo) => logo.title)).toEqual(['Angular', 'React']);
    expect(piece('auth').logos.map((logo) => logo.title)).toEqual(['OpenID Connect']);
    // Una opción genérica (una CDN, una cola, un gateway) no es de ninguna marca: lleva su símbolo.
    for (const id of ['cache', 'queue', 'bff', 'push']) {
      expect(piece(id).logos).withContext(id).toEqual([]);
      expect(GLYPHS[piece(id).glyph]).withContext(id).toBeDefined();
    }
    for (const node of diagram.nodes) {
      expect(node.title.trim().length).withContext(`${node.id}: nombre en texto`).toBeGreaterThan(1);
      expect(node.logos.length).withContext(`${node.id}: caben en el nodo`).toBeLessThanOrEqual(2);
      // Bajo la pieza, la única imagen posible es el icono de arquitectura de una nube.
      expect(node.deployedOn?.image ?? 'cloud-icons/').toContain('cloud-icons/');
    }
    expect(piece('cache').deployedOn).toEqual({ name: 'Cloudflare', image: null });
  });

  it('paints a logo that is nearly black with the text colour token, so it reads on the dark canvas', () => {
    const colors = Object.values(OPTION_LOGOS).flat().map((logo) => logo.color);
    expect(colors).toContain('var(--text-1)');
    for (const color of colors.filter((candidate) => candidate.startsWith('#'))) {
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16));
      expect(0.299 * r + 0.587 * g + 0.114 * b).withContext(color).toBeGreaterThanOrEqual(70);
    }
  });

  it('has the attribution line of every brand whose policy asks for one', () => {
    expect(Object.keys(REQUIRED_ATTRIBUTIONS).every((option) => OPTION_LOGOS[option]?.length)).toBeTrue();
    expect(TRADEMARK_NOTICE).toContain('marcas de sus respectivos dueños');
    expect(TRADEMARK_NOTICE).toContain('no está afiliado');
  });
});
