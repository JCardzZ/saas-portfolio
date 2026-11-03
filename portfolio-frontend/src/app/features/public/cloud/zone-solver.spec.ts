import { CloudNode } from './cloud-topology.data';
import { StudioZone } from './studio-project';
import { ZONE_GAP, settleZones, zoneParents } from './zone-solver';

const zone = (id: string, x: number, y: number, w: number, h: number): StudioZone => ({ id, kind: 'private', role: 'data', x, y, w, h });
const node = (id: string, x: number, y: number): CloudNode => ({ id, type: 'compute', x, y, zone: 'data' } as unknown as CloudNode);
const overlap = (a: StudioZone, b: StudioZone) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('zone solver', () => {
  const vpc = zone('vpc', 100, 100, 600, 400);
  const left = zone('left', 120, 140, 150, 300);
  const middle = zone('middle', 290, 140, 150, 300);
  const before = [vpc, left, middle];
  const parents = zoneParents(before);

  it('knows which box contains which', () => {
    expect(parents.get('left')).toBe('vpc');
    expect(parents.get('vpc')).toBeNull();
  });

  it('pushes a sibling (and what it holds) out of the way when a box grows into it', () => {
    const grown = { ...left, w: 260 };
    const inMiddle = node('n', 360, 250);
    const { zones, nodes } = settleZones([vpc, grown, middle], [inMiddle], 'left', parents);
    const [l, m] = [zones.find((z) => z.id === 'left')!, zones.find((z) => z.id === 'middle')!];
    expect(l.w).toBe(260);
    expect(overlap(l, m)).toBeFalse();
    expect(m.x).toBeGreaterThanOrEqual(l.x + l.w + ZONE_GAP - 1);
    // El nodo viaja con su recuadro y sigue dentro de él.
    expect(nodes[0].x).toBeGreaterThan(inMiddle.x);
    expect(nodes[0].x > m.x && nodes[0].x < m.x + m.w).toBeTrue();
  });

  it('grows the parent so its children still fit inside', () => {
    const grown = { ...left, w: 560 };
    const { zones } = settleZones([vpc, grown, middle], [], 'left', parents);
    const [v, m] = [zones.find((z) => z.id === 'vpc')!, zones.find((z) => z.id === 'middle')!];
    expect(m.x + m.w).toBeLessThanOrEqual(v.x + v.w);
  });

  it('slides a moved box off the one it was dropped on', () => {
    const moved = { ...middle, x: 200 };
    const { zones } = settleZones([vpc, left, moved], [], 'middle', parents);
    expect(overlap(zones.find((z) => z.id === 'left')!, zones.find((z) => z.id === 'middle')!)).toBeFalse();
    expect(zones.find((z) => z.id === 'middle')!.x).toBe(200);
  });

  it('moves a loose node out from under a box that grew over it', () => {
    const loose = node('loose', 640, 300);
    const grown = { ...vpc };
    const wide = { ...middle, w: 400 };
    const { nodes, zones } = settleZones([grown, left, wide], [loose], 'middle', parents, { zones: before, nodes: [loose] });
    const m = zones.find((z) => z.id === 'middle')!;
    const n = nodes[0];
    expect(n.x - 64 >= m.x + m.w || n.x + 64 <= m.x || n.y - 36 >= m.y + m.h || n.y + 36 <= m.y).toBeTrue();
  });

  it('changes nothing when nothing overlaps', () => {
    const { zones } = settleZones(before, [], 'left', parents);
    expect(zones).toEqual(before);
  });
});
