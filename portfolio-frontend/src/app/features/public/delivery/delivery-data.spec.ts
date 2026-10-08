import {
  CARD, PILL, TOPOLOGY, WORKFLOWS, WORKFLOW_KEYS, edgePath, essentialEdges, formatDuration, formatDurationShort, layoutStages,
  parsePipelineStatus, plainJobName,
} from './delivery-data';
import { JOB_NOTES } from './job-notes';

const run = (overrides: Record<string, unknown> = {}) => ({
  runId: 10, runNumber: 3, sha: 'abcdef1234567', event: 'push', startedAt: '2026-10-08T03:00:00Z',
  finishedAt: '2026-10-08T03:10:00Z', durationSeconds: 600, conclusion: 'success',
  jobs: [{ id: 'gate', status: 'success', durationSeconds: 5, runs: 1, metrics: { tests: 12, digest: 'sha256:ab' } }],
  ...overrides,
});
const file = (overrides: Record<string, unknown> = {}) => ({
  schema: 1, repository: 'owner/repo', public: false, updatedAt: '2026-10-08T03:10:00Z', workflows: { ci: run() }, ...overrides,
});

describe('parsePipelineStatus', () => {
  it('reads the runs of the known workflows', () => {
    const status = parsePipelineStatus(file({ workflows: { ci: run(), cd: run({ runId: 11 }), other: run() } }))!;

    expect(Object.keys(status.workflows)).toEqual(['ci', 'cd']);
    expect(status.workflows.ci!.jobs[0]).toEqual({
      id: 'gate', status: 'success', durationSeconds: 5, runs: 1, metrics: { tests: 12, digest: 'sha256:ab' },
    });
    expect(status.public).toBeFalse();
    expect(status.repository).toBe('owner/repo');
  });

  it('rejects what is not a pipeline status file', () => {
    expect(parsePipelineStatus(null)).toBeNull();
    expect(parsePipelineStatus('<!doctype html>')).toBeNull();
    expect(parsePipelineStatus(file({ schema: 2 }))).toBeNull();
    expect(parsePipelineStatus(file({ repository: 'https://evil.example/x' }))).toBeNull();
  });

  it('drops runs and jobs with invalid data instead of showing them', () => {
    const status = parsePipelineStatus(file({
      workflows: {
        ci: run({
          jobs: [
            { id: 'ok', status: 'success', durationSeconds: 1 },
            { id: 'bad status', status: 'success' },
            { id: 'weird', status: 'exploded' },
            'nope',
          ],
        }),
        cd: run({ sha: 'not-a-sha' }),
      },
    }))!;

    expect(status.workflows.ci!.jobs.map((job) => job.id)).toEqual(['ok']);
    expect(status.workflows.cd).toBeUndefined();
  });

  it('keeps only simple metric values and never treats the file as public unless it says so', () => {
    const status = parsePipelineStatus(file({
      public: 'yes',
      workflows: { ci: run({ jobs: [{ id: 'a', status: 'success', metrics: { n: 1, flag: true, text: 'x'.repeat(500), obj: { a: 1 }, 'bad key!': 1 } }] }) },
    }))!;
    const metrics = status.workflows.ci!.jobs[0].metrics;

    expect(Object.keys(metrics)).toEqual(['n', 'flag', 'text']);
    expect((metrics['text'] as string).length).toBe(120);
    expect(status.public).toBeFalse();
  });
});

describe('graph layout', () => {
  it('puts each stage in a column, in stage order, and centres shorter columns', () => {
    const layout = layoutStages([{ id: 'a', stage: 0 }, { id: 'd', stage: 3 }, { id: 'b', stage: 1 }, { id: 'c', stage: 1 }], PILL);

    expect(layout.stages).toEqual([['a'], ['b', 'c'], ['d']]);
    expect(layout.stageNumbers).toEqual([0, 1, 3]);
    expect(layout.positions['a'].x).toBe(0);
    expect(layout.positions['b'].x).toBe(PILL.width + PILL.columnGap);
    expect(layout.positions['b'].x).toBe(layout.positions['c'].x);
    expect(layout.positions['d'].x).toBe(2 * (PILL.width + PILL.columnGap));
    // Una columna de un nodo queda a media altura de la de dos.
    expect(layout.positions['a'].y).toBe((layout.positions['b'].y + layout.positions['c'].y) / 2);
    expect(layout.height).toBe(2 * PILL.height + PILL.rowGap);
    expect(layout.width).toBe(3 * PILL.width + 2 * PILL.columnGap);
  });

  it('leaves room above the columns for their names and keeps every node on the 4 px grid', () => {
    const layout = layoutStages(TOPOLOGY.nodes, CARD);

    for (const position of Object.values(layout.positions)) {
      expect(position.y).toBeGreaterThanOrEqual(CARD.top);
      expect(position.x % 8).toBe(0);
      expect(position.y % 4).toBe(0);
    }
  });

  it('draws a straight line between nodes at the same height', () => {
    expect(edgePath({ x: 0, y: 32 }, { x: 208, y: 32 }, CARD)).toBe(`M${CARD.width} 58 H208`);
  });

  it('turns with rounded corners in the gap after the source column', () => {
    const path = edgePath({ x: 0, y: 0 }, { x: 208, y: 100 }, CARD);
    const bend = CARD.width + CARD.columnGap / 2;

    expect(path).toBe(`M${CARD.width} 26 H${bend - 8} Q${bend} 26 ${bend} 34 V118 Q${bend} 126 ${bend + 8} 126 H208`);
  });

  it('joins two nodes of the same column with a vertical line', () => {
    expect(edgePath({ x: 0, y: 0 }, { x: 0, y: 68 }, CARD)).toBe(`M${CARD.width / 2} 52 V68`);
  });

  it('draws only the dependencies that are not implied by others', () => {
    const edges = essentialEdges([
      { id: 'a', needs: [] }, { id: 'b', needs: ['a'] }, { id: 'c', needs: ['a', 'b'] }, { id: 'd', needs: ['a', 'b', 'c'] },
    ]);

    expect(edges).toEqual([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }]);
  });
});

describe('formatDuration', () => {
  it('writes seconds and minutes the way a person reads them', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(120)).toBe('2 min');
    expect(formatDuration(94)).toBe('1 min 34 s');
    expect(formatDuration(null)).toBe('');
  });

  it('has a short form for the pills and strips the stage emoji from a job name', () => {
    expect(formatDurationShort(94)).toBe('1m 34s');
    expect(formatDurationShort(45)).toBe('45s');
    expect(formatDurationShort(120)).toBe('2m');
    expect(plainJobName('🧪 Backend unit')).toBe('Backend unit');
    expect(plainJobName('🛡️ CodeQL')).toBe('CodeQL');
    expect(plainJobName('sin emoji')).toBe('sin emoji');
  });
});

describe('generated delivery data', () => {
  it('has the three workflows, each with jobs whose dependencies exist', () => {
    for (const key of WORKFLOW_KEYS) {
      const ids = WORKFLOWS[key].jobs.map((job) => job.id);
      expect(ids.length).withContext(key).toBeGreaterThan(0);
      for (const job of WORKFLOWS[key].jobs) {
        expect(job.needs.every((need) => ids.includes(need))).withContext(`${key}/${job.id}`).toBeTrue();
        expect(job.name).not.toContain('${{');
      }
    }
  });

  it('explains every job: a new job in a workflow needs its note', () => {
    for (const key of WORKFLOW_KEYS) {
      for (const job of WORKFLOWS[key].jobs) {
        expect(JOB_NOTES[key][job.id]?.what).withContext(`${key}/${job.id}`).toBeTruthy();
        expect(JOB_NOTES[key][job.id]?.why).withContext(`${key}/${job.id}`).toBeTruthy();
      }
    }
  });

  it('marks every piece of the topology as live or planned, with its reason', () => {
    expect(TOPOLOGY.nodes.length).toBeGreaterThan(4);
    for (const node of TOPOLOGY.nodes) {
      expect(['live', 'planned']).withContext(node.id).toContain(node.status);
      expect(node.why.length).withContext(node.id).toBeGreaterThan(20);
    }
    const ids = TOPOLOGY.nodes.map((node) => node.id);
    expect(TOPOLOGY.links.every((link) => ids.includes(link.from) && ids.includes(link.to))).toBeTrue();
  });
});
