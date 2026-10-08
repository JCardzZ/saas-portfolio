import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_DEPLOYMENTS, deploymentsOf, mergeMetrics, mergeStatus, withDeployments, workflowStatus } from './pipeline-status.mjs';

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

const cd = (overrides = {}) => ({
  runId: 50, runNumber: 9, sha: 'aaa', finishedAt: '2026-10-08T03:01:00Z',
  jobs: [
    { id: 'frontend-deploy', status: 'success', metrics: { deployedSha: 'bbb', healthy: true, deploymentId: 'dep-1' } },
    { id: 'deploy', status: 'skipped' },
  ],
  ...overrides,
});

test('una ejecución del CD deja en la línea de tiempo solo lo que de verdad desplegó', () => {
  const entries = deploymentsOf(cd(), { by: 'alguien' });

  assert.deepEqual(entries, [{
    target: 'frontend', kind: 'deploy', at: '2026-10-08T03:01:00Z', by: 'alguien', runId: 50, runNumber: 9,
    sha: 'bbb', healthy: true, deploymentId: 'dep-1',
  }]);
  assert.deepEqual(deploymentsOf(cd({ jobs: [{ id: 'frontend-deploy', status: 'failure' }] })), []);
});

test('el backend desplegado toma su salud de las pruebas de humo', () => {
  const entries = deploymentsOf(cd({
    jobs: [{ id: 'deploy', status: 'success', metrics: { digest: 'sha256:abc' } }, { id: 'smoke', status: 'failure' }],
  }));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].target, 'backend');
  assert.equal(entries[0].healthy, false);
  assert.equal(entries[0].digest, 'sha256:abc');
});

test('la línea de tiempo va del más reciente al más antiguo, sin repetir ejecuciones y con tope', () => {
  const base = mergeStatus(null, 'cd', { runId: 1 }, { repository: 'o/r', isPublic: false, now: 't' });
  assert.deepEqual(base.deployments, { frontend: [], backend: [] });

  const entry = (runId, at) => ({ target: 'frontend', kind: 'deploy', runId, at, sha: `s${runId}` });
  let status = withDeployments(base, [entry(1, '2026-10-01T00:00:00Z')]);
  status = withDeployments(status, [entry(2, '2026-10-02T00:00:00Z')]);
  status = withDeployments(status, [entry(2, '2026-10-02T00:00:00Z')]);
  assert.deepEqual(status.deployments.frontend.map((item) => item.runId), [2, 1]);
  assert.equal('target' in status.deployments.frontend[0], false);

  for (let run = 3; run < 40; run++) {
    status = withDeployments(status, [entry(run, `2026-11-${String(run).padStart(2, '0')}T00:00:00Z`)]);
  }
  assert.equal(status.deployments.frontend.length, MAX_DEPLOYMENTS);
  assert.equal(status.deployments.frontend[0].runId, 39);
  // Publicar otro workflow conserva la línea de tiempo.
  assert.equal(mergeStatus(status, 'ci', { runId: 9 }, { repository: 'o/r', isPublic: false, now: 't' }).deployments.frontend.length, MAX_DEPLOYMENTS);
});

test('un rollback se anota como tal junto a los despliegues', () => {
  const base = mergeStatus(null, null, null, { repository: 'o/r', isPublic: false, now: 't' });
  const status = withDeployments(base, [{ target: 'frontend', kind: 'rollback', runId: 7, at: '2026-10-09T00:00:00Z', sha: 'old', by: 'x', healthy: true }]);

  assert.deepEqual(status.workflows, {});
  assert.equal(status.deployments.frontend[0].kind, 'rollback');
});
