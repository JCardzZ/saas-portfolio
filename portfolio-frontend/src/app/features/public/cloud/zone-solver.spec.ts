import { CloudNode } from './cloud-topology.data';
import { BASE_ZONES, StudioZone, referenceProject } from './studio-project';
import { ZONE_GAP, hasConflict, settleZones, zoneParents } from './zone-solver';

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

  it('leaves an untouched design exactly as it was', () => {
    const project = referenceProject();
    for (const zone of BASE_ZONES) {
      const settled = settleZones(project.zones, project.nodes, zone.id, zoneParents(project.zones));
      expect(settled.zones).toEqual(project.zones);
      expect(settled.nodes).toEqual(project.nodes);
    }
  });

  it('widens a box: the neighbours slide along whole and the loose column moves together', () => {
    const project = referenceProject();
    const before = { zones: project.zones, nodes: project.nodes };
    const grown = project.zones.map((candidate) => (candidate.id === 'subnet-app' ? { ...candidate, w: 200 } : candidate));
    const { zones, nodes } = settleZones(grown, project.nodes, 'subnet-app', zoneParents(project.zones), before);
    const of = (id: string) => zones.find((candidate) => candidate.id === id)!;
    const start = (id: string) => project.zones.find((candidate) => candidate.id === id)!;

    // La de datos se desplaza sin cambiar de tamaño; la pública ni se entera.
    expect(of('subnet-data').w).toBe(start('subnet-data').w);
    expect(of('subnet-public')).toEqual(start('subnet-public'));
    // Los servicios gestionados se apartan juntos: misma x y misma altura que tenían.
    const managed = nodes.filter((candidate) => candidate.zone === 'managed');
    expect(new Set(managed.map((candidate) => candidate.x)).size).toBe(1);
    expect(managed.map((candidate) => candidate.y)).toEqual(project.nodes.filter((candidate) => candidate.zone === 'managed').map((candidate) => candidate.y));
    expect(hasConflict(zones, nodes, 'subnet-app', zoneParents(project.zones), before)).toBeFalse();
  });

  it('never throws a loose node to the far side of a box: without room it stays, and that is a conflict', () => {
    const wall = zone('wall', 100, 100, 200, 200);
    const stuck = node('stuck', 1040, 200);
    const grown = { ...wall, w: 900 };
    const parents = new Map<string, string | null>([['wall', null]]);
    const before = { zones: [wall], nodes: [stuck] };
    const { nodes } = settleZones([grown], [stuck], 'wall', parents, before);

    expect(nodes[0].x).toBe(1040);
    expect(hasConflict([grown], nodes, 'wall', parents, before)).toBeTrue();
  });

  it('reports when there is no room left, so the gesture can stop there', () => {
    const before = { zones: [left, middle], nodes: [] as CloudNode[] };
    expect(hasConflict([left, middle], [], 'left', new Map([['left', null], ['middle', null]]), before)).toBeFalse();
    expect(hasConflict([{ ...left, w: 260 }, middle], [], 'left', new Map([['left', null], ['middle', null]]), before)).toBeTrue();
    const loose = node('loose', 500, 250);
    expect(hasConflict([{ ...middle, w: 300 }], [loose], 'middle', new Map([['middle', null]]), { zones: [middle], nodes: [loose] })).toBeTrue();
  });

  it('changes nothing when nothing overlaps', () => {
    const { zones } = settleZones(before, [], 'left', parents);
    expect(zones).toEqual(before);
  });
});
