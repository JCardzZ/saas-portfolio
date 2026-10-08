import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeMetrics, mergeStatus, workflowStatus } from './pipeline-status.mjs';

const graph = {
  jobs: [
    { id: 'changes', namePattern: '^🔍 Cambios$' },
    { id: 'frontend-test', namePattern: '^🧪 Frontend \\(.+/3\\)$' },
    { id: 'preview', namePattern: '^📦 Preview URL$' },
    { id: 'status', namePattern: '^📊 Estado del pipeline$' },
  ],
};
const run = { id: 7, run_number: 42, head_sha: 'abc', event: 'push', run_started_at: '2026-10-08T10:00:00Z' };
const job = (name, conclusion, start, end, status = 'completed') => ({
  name, conclusion, status, started_at: `2026-10-08T10:${start}Z`, completed_at: `2026-10-08T10:${end}Z`,
});

test('resume cada job con su estado y duración, y junta las ejecuciones de una matriz', () => {
  const status = workflowStatus(run, [
    job('🔍 Cambios', 'success', '00:05', '00:15'),
    job('🧪 Frontend (1/3)', 'success', '01:00', '02:00'),
    job('🧪 Frontend (2/3)', 'success', '01:00', '03:30'),
    job('🧪 Frontend (3/3)', 'success', '01:00', '02:10'),
    job('📦 Preview URL', 'skipped', '04:00', '04:00'),
    job('📊 Estado del pipeline', null, '05:00', '05:00', 'in_progress'),
  ], graph, { 'frontend-test': { tests: 288 } }, '2026-10-08T10:05:30Z');

  assert.deepEqual(status.jobs, [
    { id: 'changes', status: 'success', durationSeconds: 10, runs: 1 },
    { id: 'frontend-test', status: 'success', durationSeconds: 150, runs: 3, metrics: { tests: 288 } },
    { id: 'preview', status: 'skipped', durationSeconds: null, runs: 1 },
  ]);
  assert.equal(status.conclusion, 'success');
  assert.equal(status.durationSeconds, 330);
  assert.equal(status.runId, 7);
  assert.equal(status.sha, 'abc');
});

test('un fallo en cualquier ejecución de la matriz marca el job y la ejecución', () => {
  const status = workflowStatus(run, [
    job('🧪 Frontend (1/3)', 'success', '01:00', '02:00'),
    job('🧪 Frontend (2/3)', 'failure', '01:00', '02:00'),
  ], graph);

  assert.equal(status.jobs[0].status, 'failure');
  assert.equal(status.conclusion, 'failure');
});

test('al publicar un workflow se conservan los demás', () => {
  const first = mergeStatus(null, 'ci', { runId: 1 }, { repository: 'o/r', isPublic: false, now: 't1' });
  const second = mergeStatus(first, 'cd', { runId: 2 }, { repository: 'o/r', isPublic: true, now: 't2' });

  assert.deepEqual(second.workflows, { ci: { runId: 1 }, cd: { runId: 2 } });
  assert.equal(second.public, true);
  assert.equal(second.updatedAt, 't2');
  // Un archivo de otro formato no se mezcla.
  assert.deepEqual(mergeStatus({ schema: 99, workflows: { x: 1 } }, 'ci', { runId: 3 }, { repository: 'o/r', isPublic: false, now: 't' }).workflows, { ci: { runId: 3 } });
});

test('las métricas de una matriz suman sus recuentos y conservan lo demás', () => {
  assert.deepEqual(mergeMetrics({ tests: 100, failed: 0, profiles: 12 }, { tests: 88, failed: 1 }), { tests: 188, failed: 1, profiles: 12 });
  assert.deepEqual(mergeMetrics(undefined, { tests: 5 }), { tests: 5 });
});
