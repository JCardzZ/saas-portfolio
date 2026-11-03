import { NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { referenceProject } from './studio-project';
import { COLUMN_AIR, ROW_AIR, breathe } from './zone-breathe';
import { hasConflict, zoneParents } from './zone-solver';

describe('zone breathe', () => {
  const project = referenceProject();
  const { zones, nodes } = breathe(project.zones, project.nodes);
  const zone = (id: string) => zones.find((candidate) => candidate.id === id)!;

  it('opens room between the columns so a wire has somewhere to go', () => {
    expect(zone('subnet-app').x - (zone('subnet-public').x + zone('subnet-public').w)).toBeGreaterThanOrEqual(COLUMN_AIR - 1);
    expect(zone('subnet-data').x - (zone('subnet-app').x + zone('subnet-app').w)).toBeGreaterThanOrEqual(COLUMN_AIR - 1);
    // Las subredes no cambian de tamaño, y la red crece para seguir conteniéndolas.
    expect(zone('subnet-app').w).toBe(project.zones.find((candidate) => candidate.id === 'subnet-app')!.w);
    expect(zone('network').x + zone('network').w).toBeGreaterThan(zone('subnet-data').x + zone('subnet-data').w);
  });

  it('keeps everything inside its box and nothing on top of anything', () => {
    const parents = zoneParents(project.zones);
    expect(hasConflict(zones, nodes, 'cloud', parents, { zones: project.zones, nodes: project.nodes })).toBeFalse();
    for (const [index, a] of nodes.entries()) {
      for (const b of nodes.slice(index + 1)) {
        expect(Math.abs(a.x - b.x) >= NODE_WIDTH || Math.abs(a.y - b.y) >= NODE_HEIGHT).withContext(`${a.id}/${b.id}`).toBeTrue();
      }
    }
    const cloud = zone('cloud');
    for (const node of nodes.filter((candidate) => candidate.zone === 'managed')) {
      expect(node.x + NODE_WIDTH / 2).toBeLessThanOrEqual(cloud.x + cloud.w);
    }
  });

  it('spreads a stack of pieces over the height it has', () => {
    const managed = nodes.filter((candidate) => candidate.zone === 'managed').sort((a, b) => a.y - b.y);
    const gaps = managed.slice(1).map((node, index) => node.y - managed[index].y - NODE_HEIGHT);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ROW_AIR - 1);
  });

  it('fits the boxes to what they hold, keeping the subnets of a row aligned', () => {
    const before = project.zones.find((candidate) => candidate.id === 'subnet-public')!;
    expect(zone('subnet-public').h).toBeLessThan(before.h);
    expect(zone('subnet-public').h).toBe(zone('subnet-app').h);
    expect(zone('subnet-app').h).toBe(zone('subnet-data').h);
    // Las piezas siguen dentro, y los contenedores siguen conteniendo.
    for (const node of nodes.filter((candidate) => candidate.zone === 'data')) {
      expect(node.y + NODE_HEIGHT / 2).toBeLessThanOrEqual(zone('subnet-data').y + zone('subnet-data').h);
    }
    expect(zone('network').y + zone('network').h).toBeGreaterThanOrEqual(zone('subnet-app').y + zone('subnet-app').h);
    expect(zone('cloud').y + zone('cloud').h).toBeGreaterThanOrEqual(zone('network').y + zone('network').h);
  });

  it('leaves empty boxes alone', () => {
    const result = breathe(project.zones, []);
    expect(result.zones.find((candidate) => candidate.id === 'subnet-public')!.h).toBe(project.zones.find((candidate) => candidate.id === 'subnet-public')!.h);
  });

  it('changes nothing the second time', () => {
    const again = breathe(zones, nodes);
    expect(again.zones).toEqual(zones);
    expect(again.nodes).toEqual(nodes);
  });

  it('shares out what fits when the canvas has no room for all of it', () => {
    const wide = project.zones.map((candidate) => (candidate.id === 'cloud' ? { ...candidate, w: 816 } : candidate));
    const crowded = project.nodes.map((node) => (node.zone === 'managed' ? { ...node, x: 1020 } : node));
    const result = breathe(wide, crowded);
    expect(Math.max(...result.nodes.map((node) => node.x + NODE_WIDTH / 2))).toBeLessThanOrEqual(1110);
    expect(Math.max(...result.zones.map((candidate) => candidate.x + candidate.w))).toBeLessThanOrEqual(1110);
  });
});
