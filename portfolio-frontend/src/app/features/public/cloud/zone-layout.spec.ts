import { CANVAS_HEIGHT, CANVAS_WIDTH, CloudNode, NODE_HEIGHT, NODE_WIDTH } from './cloud-topology.data';
import { BASE_ZONES, STUDIO_PRESETS, StudioZone, ZONE_MIN_SIZE, referenceProject } from './studio-project';
import {
  COLUMN_STEP, ROW_STEP, contentBounds, directNodes, fits, heightForRows, minimumSize, reflow, resizeToContent, rowsThatFit, settled,
} from './zone-layout';

const zone = (x: number, y: number, w: number, h: number): StudioZone => ({ id: 'z', kind: 'private', role: 'compute', x, y, w, h });
const at = (id: string, x: number, y: number) => ({ id, x, y });

function expectInsideWithoutOverlap(nodes: { x: number; y: number }[], box: { x: number; y: number; w: number; h: number }): void {
  expect(settled(nodes, box)).withContext(JSON.stringify({ nodes, box })).toBeTrue();
}

describe('zone layout (responsive canvas)', () => {
  describe('how much fits', () => {
    it('counts rows and columns on the same grid as auto-arrange', () => {
      // Las subredes de la arquitectura de referencia: 140 × 406, una columna de cuatro filas.
      expect(rowsThatFit(406)).toBe(4);
      expect(fits(4, 140, 406)).toBeTrue();
      expect(fits(5, 140, 406)).toBeFalse();
      expect(fits(8, 280, 406)).toBeTrue();
      expect(fits(0, 10, 10)).toBeTrue();
    });

    it('lets a strip hold a single centred row', () => {
      expect(rowsThatFit(ZONE_MIN_SIZE)).toBe(1);
      expect(heightForRows(1)).toBe(ZONE_MIN_SIZE);
      expect(fits(3, 3 * COLUMN_STEP, ZONE_MIN_SIZE)).toBeTrue();
    });

    it('asks for more height the narrower the zone is', () => {
      expect(minimumSize(6, 3 * COLUMN_STEP).h).toBe(heightForRows(2));
      expect(minimumSize(6, COLUMN_STEP).h).toBe(heightForRows(6));
      expect(minimumSize(6, 10).w).toBe(COLUMN_STEP);
      expect(minimumSize(0, 10)).toEqual({ w: ZONE_MIN_SIZE, h: ZONE_MIN_SIZE });
    });
  });

  describe('resizing a zone', () => {
    const origin = zone(300, 100, 2 * COLUMN_STEP, heightForRows(3));

    it('behaves like a plain resize while the content still fits', () => {
      const grown = resizeToContent(origin, 'se', 60, 40, 4, []);

      expect(grown).toEqual({ ...origin, w: origin.w + 60, h: origin.h + 40 });
    });

    it('stops at the size of its nodes instead of leaving them outside', () => {
      const squeezed = resizeToContent(origin, 'se', -1000, -1000, 4, []);

      expect(squeezed.w).toBe(COLUMN_STEP);
      expect(squeezed.h).toBe(heightForRows(4));
      expect(fits(4, squeezed.w, squeezed.h)).toBeTrue();
    });

    it('keeps the opposite corner still whichever corner is pulled', () => {
      const right = origin.x + origin.w;
      const bottom = origin.y + origin.h;

      const fromNorthWest = resizeToContent(origin, 'nw', 1000, 1000, 2, []);

      expect(fromNorthWest.x + fromNorthWest.w).toBe(right);
      expect(fromNorthWest.y + fromNorthWest.h).toBe(bottom);
      expect(fits(2, fromNorthWest.w, fromNorthWest.h)).toBeTrue();
    });

    it('never shrinks past the zones it contains', () => {
      const inner = { x: 320, y: 140, w: 200, h: 180 };

      const squeezed = resizeToContent(origin, 'se', -1000, -1000, 0, [inner]);

      expect(squeezed.x + squeezed.w).toBeGreaterThanOrEqual(inner.x + inner.w);
      expect(squeezed.y + squeezed.h).toBeGreaterThanOrEqual(inner.y + inner.h);
    });

    it('widens when the rows it needs do not fit below, and gives up if nothing fits', () => {
      const low = zone(300, CANVAS_HEIGHT - 200, 3 * COLUMN_STEP, 190);
      // Tres nodos en una fila: al estrecharlo harían falta tres filas, que no caben hasta el borde inferior.
      const widened = resizeToContent(low, 'se', -1000, 0, 3, []);
      expect(widened.y + widened.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
      expect(widened.w).toBe(3 * COLUMN_STEP);
      expect(fits(3, widened.w, widened.h)).toBeTrue();

      // 40 nodos no caben de ninguna forma en lo que queda de lienzo: el recuadro no cambia.
      const corner = zone(CANVAS_WIDTH - 200, CANVAS_HEIGHT - 200, 190, 190);
      expect(resizeToContent(corner, 'se', -50, -50, 40, [])).toEqual(corner);
    });

    it('still respects the canvas and the minimum size without content', () => {
      const empty = resizeToContent(origin, 'se', -1000, -1000, 0, []);
      expect(empty.w).toBe(ZONE_MIN_SIZE);
      expect(empty.h).toBe(ZONE_MIN_SIZE);

      const huge = resizeToContent(origin, 'se', 5000, 5000, 1, []);
      expect(huge.x + huge.w).toBe(CANVAS_WIDTH);
      expect(huge.y + huge.h).toBe(CANVAS_HEIGHT);
    });
  });

  describe('reflowing the nodes', () => {
    it('leaves them alone while they are inside and apart', () => {
      const box = zone(300, 100, 300, 400);
      const nodes = [at('a', 380, 180), at('b', 520, 300)];

      expect(reflow(nodes, box)).toBe(nodes);
    });

    it('brings back inside what a smaller zone left out, without overlaps', () => {
      const start = zone(300, 100, 3 * COLUMN_STEP, heightForRows(2));
      const nodes = [at('a', 370, 168), at('b', 510, 168), at('c', 650, 168), at('d', 370, 258), at('e', 510, 258)];
      const next = resizeToContent(start, 'se', -1000, 0, nodes.length, []);

      const placed = reflow(nodes, next);

      expectInsideWithoutOverlap(placed, next);
      expect(placed.map((node) => node.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('keeps the reading order: by columns, top to bottom', () => {
      const box = zone(300, 100, COLUMN_STEP, heightForRows(3));
      const nodes = [at('bottom', 700, 400), at('top', 700, 120), at('middle', 700, 260)];

      const placed = reflow(nodes, box);
      const ys = Object.fromEntries(placed.map((node) => [node.id, node.y]));

      expect(ys['top']).toBeLessThan(ys['middle']);
      expect(ys['middle']).toBeLessThan(ys['bottom']);
      expect(ys['middle'] - ys['top']).toBe(ROW_STEP);
    });

    it('separates nodes that ended up on top of each other', () => {
      const box = zone(300, 100, 2 * COLUMN_STEP, heightForRows(2));
      const nodes = [at('a', 400, 200), at('b', 410, 205), at('c', 405, 210)];

      expectInsideWithoutOverlap(reflow(nodes, box), box);
    });

    it('centres a single row in a strip', () => {
      const strip = zone(300, 100, 3 * COLUMN_STEP, ZONE_MIN_SIZE);
      const placed = reflow([at('a', 0, 0), at('b', 10, 0), at('c', 20, 0)], strip);

      expect(new Set(placed.map((node) => node.y))).toEqual(new Set([strip.y + strip.h / 2]));
      expectInsideWithoutOverlap(placed, strip);
    });

    it('fits every size between the minimum and the canvas for any number of nodes', () => {
      for (let count = 1; count <= 12; count++) {
        const start = zone(40, 40, 6 * COLUMN_STEP, heightForRows(6));
        const nodes = Array.from({ length: count }, (_, index) => at(`n${index}`, 110 + (index % 6) * COLUMN_STEP, 108 + Math.floor(index / 6) * ROW_STEP));
        for (const [dx, dy] of [[-1000, 0], [0, -1000], [-1000, -1000], [-300, -200], [200, 100]]) {
          const next = resizeToContent(start, 'se', dx, dy, count, []);
          expectInsideWithoutOverlap(reflow(nodes, next), next);
        }
      }
    });
  });

  describe('only the direct nodes of a zone', () => {
    it('ignores the nodes that sit in a smaller zone inside it', () => {
      const project = referenceProject();
      const network = project.zones.find((candidate) => candidate.id === 'network')!;
      const subnet = project.zones.find((candidate) => candidate.id === 'subnet-app')!;

      const inSubnet = directNodes(subnet, project.nodes, project.zones);
      const inNetwork = directNodes(network, project.nodes, project.zones);

      expect(inSubnet.length).toBeGreaterThan(0);
      expect(inNetwork.some((node) => inSubnet.includes(node))).toBeFalse();
    });
  });

  describe('templates', () => {
    it('could all be resized: no zone starts smaller than what it holds', () => {
      for (const preset of [{ id: 'reference', project: referenceProject() }, ...STUDIO_PRESETS.map((entry) => ({ id: entry.id, project: entry.build() }))]) {
        for (const box of preset.project.zones) {
          const count = directNodes(box, preset.project.nodes as CloudNode[], preset.project.zones).length;
          expect(fits(count, box.w, box.h)).withContext(`${preset.id} · ${box.id} (${count} nodos en ${box.w}×${box.h})`).toBeTrue();
        }
      }
    });
  });

  describe('fit to screen', () => {
    it('shows the whole canvas when there is nothing on it', () => {
      expect(contentBounds([], [])).toEqual({ x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
    });

    it('frames nodes and zones with some air and never leaves the canvas', () => {
      const bounds = contentBounds([at('a', 600, 300), at('b', 900, 500)], [zone(500, 200, 300, 200)]);

      expect(bounds.x).toBeLessThanOrEqual(500);
      expect(bounds.y).toBeLessThanOrEqual(200);
      expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(900 + NODE_WIDTH / 2);
      expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(500 + NODE_HEIGHT / 2);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.w).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(bounds.y + bounds.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
    });

    it('does not zoom into a lone node', () => {
      const bounds = contentBounds([at('a', 20, 20)], []);

      expect(bounds.w).toBe(480);
      expect(bounds.x).toBe(0);
    });

    it('covers the reference architecture', () => {
      const project = referenceProject();
      const bounds = contentBounds(project.nodes, BASE_ZONES);

      for (const node of project.nodes) {
        expect(node.x).toBeGreaterThan(bounds.x);
        expect(node.x).toBeLessThan(bounds.x + bounds.w);
      }
    });
  });
});
