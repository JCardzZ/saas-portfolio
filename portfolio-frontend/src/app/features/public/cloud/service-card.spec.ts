import { CLOUD_LINKS, CLOUD_NODES, CloudNode, CloudProviderId } from './cloud-topology.data';
import { CardContext, buildServiceCard, placeCard, serviceTooltip } from './service-card';
import { BASE_ZONES, placed } from './studio-project';

const ALL: CloudProviderId[] = ['aws', 'gcp', 'azure', 'oci'];

function context(provider: CloudProviderId, extra: Partial<CardContext> = {}): CardContext {
  return { nodes: structuredClone(CLOUD_NODES), links: structuredClone(CLOUD_LINKS), zones: structuredClone(BASE_ZONES), provider, providers: ALL, ...extra };
}
const node = (ctx: CardContext, id: string): CloudNode => ctx.nodes.find((candidate) => candidate.id === id)!;

describe('service card', () => {
  it('describes a node with its fact sheet in the active cloud', () => {
    const ctx = context('aws');
    const card = buildServiceCard(node(ctx, 'postgres'), ctx);

    expect(card.officialName).toBe('Amazon RDS for PostgreSQL');
    expect(card.what).toContain('PostgreSQL');
    expect(card.uses.length).toBeGreaterThanOrEqual(2);
    expect(card.docs).toEqual({ url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html', host: 'docs.aws.amazon.com' });
    expect(card.equivalence).toEqual({ direct: true, tradeoff: null });
    expect(card.cloudAgnostic).toBeFalse();
  });

  it('works out who it receives from, who it sends to and the zone it sits in', () => {
    const ctx = context('aws');
    const api = buildServiceCard(node(ctx, 'api'), ctx);

    expect(api.context.receivesFrom).toEqual(ctx.links.filter((link) => link.to === 'api').map((link) => buildServiceCard(node(ctx, link.from), ctx).title));
    expect(api.context.sendsTo.length).toBe(ctx.links.filter((link) => link.from === 'api').length);
    expect(api.context.sendsTo).toContain('RDS PostgreSQL');
    expect(api.context.zone).toBe('Subred privada · aplicación');
    expect(buildServiceCard(node(ctx, 'users'), ctx).context.zone).toBe('Fuera de la red de la nube');
  });

  it('offers the equivalents in the other clouds the visitor can switch to', () => {
    const ctx = context('gcp', { providers: ['aws', 'gcp', 'azure'] });
    const card = buildServiceCard(node(ctx, 'postgres'), ctx);

    expect(card.equivalents).toEqual([
      { provider: 'aws', cloud: 'AWS', name: 'Amazon RDS for PostgreSQL', direct: true },
      { provider: 'azure', cloud: 'Azure', name: 'Azure Database for PostgreSQL', direct: true },
    ]);
  });

  it('says when a cloud has no direct equivalent and gives the trade-off', () => {
    const ctx = context('oci');
    ctx.nodes.push(placed('workflow', 'wf', 880, 300));
    const card = buildServiceCard(node(ctx, 'wf'), ctx);

    expect(card.equivalence.direct).toBeFalse();
    expect(card.equivalence.tradeoff).toContain('Sin equivalente directo');
    expect(card.equivalents.every((equivalent) => equivalent.direct)).toBeTrue();

    const inAws = buildServiceCard(node(ctx, 'wf'), { ...ctx, provider: 'aws' });
    expect(inAws.equivalence.direct).toBeTrue();
    expect(inAws.equivalents.find((equivalent) => equivalent.provider === 'oci')!.direct).toBeFalse();
  });

  it('treats a cloud-agnostic product as the same everywhere', () => {
    const ctx = context('azure');
    const card = buildServiceCard(node(ctx, 'edge'), ctx);

    expect(card.officialName).toBe('Cloudflare');
    expect(card.cloudAgnostic).toBeTrue();
    expect(card.equivalents).toEqual([]);
    expect(card.docs?.host).toBe('developers.cloudflare.com');
  });

  it('labels the cost as a list price, a rough figure or no estimate', () => {
    const ctx = context('azure');
    const costs = new Map([['postgres', { label: '$13/mes', live: true }], ['redis', { label: '$40/mes', live: false }], ['api', { label: 'sin estimación', live: false }]]);
    const withCosts = { ...ctx, costs };

    expect(buildServiceCard(node(ctx, 'postgres'), withCosts).cost).toEqual({ label: '$13/mes', kind: 'live', tag: 'Precio de lista' });
    expect(buildServiceCard(node(ctx, 'redis'), withCosts).cost).toEqual({ label: '$40/mes', kind: 'rough', tag: 'Cifra orientativa' });
    expect(buildServiceCard(node(ctx, 'api'), withCosts).cost.kind).toBe('none');
    expect(buildServiceCard(node(ctx, 'users'), withCosts).cost).toEqual({ label: 'Sin estimación', kind: 'none', tag: 'Sin estimación' });
  });

  it('carries the graph warnings of the node', () => {
    const ctx = context('aws', { warnings: new Map([['postgres', ['La base de datos queda expuesta']]]) });

    expect(buildServiceCard(node(ctx, 'postgres'), ctx).context.warnings).toEqual(['La base de datos queda expuesta']);
    expect(buildServiceCard(node(ctx, 'api'), ctx).context.warnings).toEqual([]);
  });

  it('describes a piece that is not in the catalog with what the node itself says', () => {
    const ctx = context('aws');
    const legacy: CloudNode = { id: 'as400', type: 'custom-as400', x: 20, y: 20, zone: 'external', role: 'Core bancario', service: 'IBM AS/400', icon: null, terraform: null, why: 'Sistema central del banco.', custom: true };
    ctx.nodes.push(legacy);
    const card = buildServiceCard(legacy, ctx);

    expect(card.officialName).toBe('IBM AS/400');
    expect(card.what).toBe('Sistema central del banco.');
    expect(card.uses).toEqual([]);
    expect(card.docs).toBeNull();
    expect(card.cloudAgnostic).toBeTrue();
  });

  it('gives the tooltip a name and one sentence', () => {
    const ctx = context('gcp');
    expect(serviceTooltip(node(ctx, 'redis'), ctx)).toEqual({ name: 'Memorystore', what: jasmine.stringContaining('caché') });
  });
});

describe('card placement', () => {
  const viewport = { width: 1280, height: 800 };
  const card = { width: 360, height: 420 };
  const inside = (placement: { x: number; y: number }) =>
    placement.x >= 8 && placement.y >= 8 && placement.x + card.width <= viewport.width - 8 && placement.y + card.height <= viewport.height - 8;
  const overlaps = (anchor: { x: number; y: number; width: number; height: number }, placement: { x: number; y: number }) =>
    placement.x < anchor.x + anchor.width && placement.x + card.width > anchor.x && placement.y < anchor.y + anchor.height && placement.y + card.height > anchor.y;

  it('goes to the right of the node, centred on it, when there is room', () => {
    const anchor = { x: 300, y: 300, width: 128, height: 72 };
    const placement = placeCard(anchor, card, viewport);

    expect(placement.side).toBe('right');
    expect(placement.x).toBe(440);
    expect(placement.y).toBe(126);
    expect(placement.arrow).toBe(210);
  });

  it('moves to another side instead of leaving the window or covering the node', () => {
    for (const anchor of [
      { x: 1100, y: 300, width: 128, height: 72 },
      { x: 600, y: 10, width: 128, height: 72 },
      { x: 600, y: 700, width: 128, height: 72 },
      { x: 10, y: 10, width: 128, height: 72 },
      { x: 1140, y: 720, width: 128, height: 72 },
    ]) {
      const placement = placeCard(anchor, card, viewport);
      expect(inside(placement)).withContext(`dentro de la ventana: ${JSON.stringify(anchor)}`).toBeTrue();
      expect(overlaps(anchor, placement)).withContext(`sin tapar el nodo: ${JSON.stringify(anchor)}`).toBeFalse();
    }
    expect(placeCard({ x: 1100, y: 300, width: 128, height: 72 }, card, viewport).side).toBe('left');
  });

  it('keeps the arrow pointing at the node and inside the rounded corners', () => {
    const top = placeCard({ x: 300, y: 10, width: 128, height: 72 }, card, viewport);
    expect(top.side).toBe('right');
    expect(top.y).toBe(8);
    expect(top.arrow).toBe(38);

    const corner = placeCard({ x: 300, y: 0, width: 128, height: 20 }, card, viewport);
    expect(corner.arrow).toBe(16);
  });

  it('still fits the window when no side has room, on the side with most space', () => {
    const small = { width: 400, height: 500 };
    const placement = placeCard({ x: 136, y: 214, width: 128, height: 72 }, card, small);

    expect(placement.x).toBeGreaterThanOrEqual(8);
    expect(placement.x + card.width).toBeLessThanOrEqual(small.width - 8);
  });
});
