import { CANVAS_WIDTH, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { FULL_VIEW, MAX_ZOOM, MIN_ZOOM, overlaps, placementVerdict, resolveCollision, withFriction, zoomLevel, zoomView } from './studio-physics';
import { StudioZone } from './studio-project';

const node = (id: string, x: number, y: number, type = 'compute'): CloudNode => ({ id, type, x, y, zone: 'data' } as unknown as CloudNode);
const zone: StudioZone = { id: 'z', kind: 'private', role: 'data', x: 0, y: 0, w: 700, h: 500 };

describe('studio physics', () => {
  it('detects when two nodes touch', () => {
    expect(overlaps({ x: 100, y: 100 }, { x: 100 + NODE_WIDTH / 2, y: 100 })).toBeTrue();
    expect(overlaps({ x: 100, y: 100 }, { x: 100 + NODE_WIDTH + 20, y: 100 })).toBeFalse();
  });

  it('moves a dropped node to the nearest free spot inside the same box', () => {
    const nodes = [node('a', 200, 200), node('b', 0, 0)];
    const placed = resolveCollision('b', { x: 210, y: 205 }, nodes, [zone]);
    expect(overlaps(placed, nodes[0])).toBeFalse();
    expect(placed.x <= 700 && placed.y <= 500).withContext('sigue dentro de su recuadro').toBeTrue();
    expect(Math.hypot(placed.x - 210, placed.y - 205)).toBeLessThan(NODE_WIDTH + NODE_HEIGHT);
  });

  it('does not rearrange nodes that are close but not on top of each other', () => {
    const nodes = [node('a', 200, 200), node('b', 0, 0)];
    const close = { x: 200 + NODE_WIDTH + 4, y: 200 };
    expect(resolveCollision('b', close, nodes, [zone])).toEqual(close);
  });

  it('leaves a node where it is dropped when nothing is in the way', () => {
    expect(resolveCollision('b', { x: 500, y: 400 }, [node('a', 100, 100), node('b', 0, 0)], [zone])).toEqual({ x: 500, y: 400 });
  });

  it('says why a database cannot go into a public subnet, and allows it in a private one', () => {
    const refused = placementVerdict('postgres', 'RDS', 'public');
    expect(refused.allowed).toBeFalse();
    expect(refused.reason).toContain('RDS');
    expect(refused.suggestion).toContain('privada');
    expect(placementVerdict('postgres', 'RDS', 'data').allowed).toBeTrue();
    expect(placementVerdict('compute', 'ECS', 'public').allowed).toBeTrue();
  });

  it('resists inside a forbidden zone', () => {
    expect(withFriction({ x: 0, y: 0 }, { x: 100, y: 50 })).toEqual({ x: 30, y: 15 });
  });

  it('zooms around the cursor within limits', () => {
    const closer = zoomView(FULL_VIEW, 2, { x: CANVAS_WIDTH / 2, y: 300 });
    expect(zoomLevel(closer)).toBe(200);
    expect(closer.x + closer.w / 2).toBeCloseTo(CANVAS_WIDTH / 2, 0);
    expect(zoomLevel(zoomView(FULL_VIEW, 100, { x: 0, y: 0 }))).toBe(MAX_ZOOM * 100);
    expect(zoomLevel(zoomView(FULL_VIEW, 0.01, { x: 0, y: 0 }))).toBe(MIN_ZOOM * 100);
  });
});
