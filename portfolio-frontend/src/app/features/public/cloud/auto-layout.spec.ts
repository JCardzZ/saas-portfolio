import { autoLayout } from './auto-layout';
import { CLOUD_LINKS, CLOUD_NODES, CloudLink, CloudNode } from './cloud-topology.data';
import { BASE_ZONES, STUDIO_PRESETS, StudioZone, resizeZone, roleAt } from './studio-project';

const positions = (nodes: CloudNode[]) => Object.fromEntries(nodes.map((node) => [node.id, [node.x, node.y]]));
const plain = (id: string, x: number, y: number, zone: CloudNode['zone'] = 'external'): CloudNode =>
  ({ id, type: 't', x, y, zone, role: '', service: id, icon: null, terraform: null, why: '' });

describe('autoLayout', () => {
  it('leaves the reference architecture and every preset exactly where they were drawn', () => {
    expect(positions(autoLayout(CLOUD_NODES, CLOUD_LINKS, BASE_ZONES))).toEqual(positions(CLOUD_NODES));
    for (const preset of STUDIO_PRESETS.filter((candidate) => candidate.id !== 'blank')) {
      const { nodes, links, zones } = preset.build();
      expect(positions(autoLayout(nodes, links, zones))).withContext(preset.id).toEqual(positions(nodes));
    }
  });

  it('snaps scattered nodes back onto the grid of their own zone, without changing their zone', () => {
    const scattered = CLOUD_NODES.map((node, index) => ({ ...node, x: node.x + ((index * 7) % 19) - 9, y: node.y + ((index * 5) % 23) - 11 }));
    // Sigue cada uno dentro de su recuadro.
    expect(scattered.every((node) => roleAt(BASE_ZONES, node.x, node.y, node.zone) === node.zone)).toBeTrue();

    const arranged = autoLayout(scattered, CLOUD_LINKS, BASE_ZONES);

    expect(positions(arranged)).toEqual(positions(CLOUD_NODES));
    expect(arranged.every((node) => roleAt(BASE_ZONES, node.x, node.y, node.zone) === node.zone)).toBeTrue();
  });

  it('orders each column after the nodes it is wired to, so wires do not cross', () => {
    const column = (id: string, x: number, y: number, zone: CloudNode['zone']) => plain(id, x, y, zone);
    const nodes = [
      column('a1', 556, 250, 'compute'), column('a2', 556, 340, 'compute'),
      // Dibujadas al revés que las APIs a las que sirven.
      column('db-of-a2', 710, 250, 'data'), column('db-of-a1', 710, 340, 'data'),
    ];
    const links: CloudLink[] = [{ from: 'a1', to: 'db-of-a1' }, { from: 'a2', to: 'db-of-a2' }];

    const arranged = positions(autoLayout(nodes, links, BASE_ZONES));

    expect(arranged['db-of-a1']).toEqual([710, 250]);
    expect(arranged['db-of-a2']).toEqual([710, 340]);
  });

  it('uses more than one column when a subnet has more nodes than rows, and spreads strips in a row', () => {
    const small: StudioZone = { id: 'z', kind: 'private', role: 'compute', x: 400, y: 100, w: 320, h: 250 };
    const strip: StudioZone = { id: 's', kind: 'region', role: 'external', x: 100, y: 500, w: 700, h: 90 };
    const nodes = [
      ...[0, 1, 2, 3, 4].map((index) => plain(`n${index}`, 450 + index * 3, 150 + index * 4, 'compute')),
      plain('mq', 300, 545), plain('core', 310, 545),
    ];
    const arranged = autoLayout(nodes, [{ from: 'n0', to: 'mq' }, { from: 'mq', to: 'core' }], [small, strip]);
    const at = positions(arranged);

    // Caben dos filas: tres columnas centradas en el recuadro.
    expect([at['n0'], at['n1'], at['n2'], at['n3'], at['n4']]).toEqual([[420, 168], [420, 258], [560, 168], [560, 258], [700, 168]]);
    // La franja: una fila a media altura, cada nodo en una columna distinta.
    expect(at['mq'][1]).toBe(545);
    expect(at['core'][1]).toBe(545);
    expect(at['mq'][0]).not.toBe(at['core'][0]);
  });

  it('lays out a canvas without zones in layers that follow the connections, even with a cycle', () => {
    const nodes = [plain('c', 0, 0), plain('a', 0, 0), plain('b1', 0, 10), plain('b2', 0, 5), plain('solo', 0, 0)];
    const links: CloudLink[] = [{ from: 'a', to: 'b1' }, { from: 'a', to: 'b2' }, { from: 'b1', to: 'c' }, { from: 'b2', to: 'c' }, { from: 'c', to: 'a' }];

    const at = positions(autoLayout(nodes, links, []));

    expect(new Set(Object.values(at).map(([x]) => x)).size).toBeGreaterThan(2);
    expect(at['b1'][0]).toBe(at['b2'][0]);
    expect(at['b1'][1]).not.toBe(at['b2'][1]);
    expect(Object.values(at).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x <= 1110)).toBeTrue();
    expect(autoLayout([], [], [])).toEqual([]);
  });
});

describe('resizeZone', () => {
  const zone: StudioZone = { id: 'z', kind: 'vpc', role: null, x: 200, y: 200, w: 300, h: 200 };

  it('moves only the dragged corner', () => {
    expect(resizeZone(zone, 'se', 40, 30)).toEqual({ ...zone, w: 340, h: 230 });
    expect(resizeZone(zone, 'nw', -50, 20)).toEqual({ ...zone, x: 150, y: 220, w: 350, h: 180 });
    expect(resizeZone(zone, 'ne', 10, -100)).toEqual({ ...zone, y: 100, w: 310, h: 300 });
    expect(resizeZone(zone, 'sw', 100, 10)).toEqual({ ...zone, x: 300, w: 200, h: 210 });
  });

  it('never goes below the minimum size or outside the canvas', () => {
    expect(resizeZone(zone, 'nw', 9999, 9999)).toEqual({ ...zone, x: 410, y: 310, w: 90, h: 90 });
    expect(resizeZone(zone, 'nw', -9999, -9999)).toEqual({ ...zone, x: 0, y: 0, w: 500, h: 400 });
    expect(resizeZone(zone, 'se', 9999, 9999)).toEqual({ ...zone, w: 910, h: 516 });
    expect(resizeZone(zone, 'se', -9999, -9999)).toEqual({ ...zone, w: 90, h: 90 });
  });
});
