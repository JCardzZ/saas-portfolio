import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { displayName, namePattern, workflowGraph } from './workflows.mjs';

const SAMPLE = `
name: Demo
on: push
jobs:
  changes:
    name: 🔍 Cambios
    runs-on: ubuntu-24.04
  lint:
    needs: changes
    runs-on: ubuntu-24.04
  test:
    name: 🧪 Frontend (\${{ matrix.shard }}/3)
    needs: [changes, lint]
    strategy:
      matrix:
        shard: [1, 2, 3]
    runs-on: ubuntu-24.04
  scan:
    name: 🛡️ Scan
    runs-on: ubuntu-24.04
  gate:
    name: ✅ Gate
    needs: [test, scan]
    runs-on: ubuntu-24.04
`;

test('lee jobs, dependencias y etapas (camino más largo)', () => {
  const graph = workflowGraph(SAMPLE);
  const stage = Object.fromEntries(graph.jobs.map((job) => [job.id, job.stage]));

  assert.equal(graph.name, 'Demo');
  assert.deepEqual(graph.jobs.map((job) => job.id), ['changes', 'lint', 'test', 'scan', 'gate']);
  assert.deepEqual(stage, { changes: 0, lint: 1, test: 2, scan: 0, gate: 3 });
  assert.deepEqual(graph.jobs.find((job) => job.id === 'test').needs, ['changes', 'lint']);
  assert.deepEqual(graph.jobs.find((job) => job.id === 'lint').needs, ['changes']);
});

test('un job sin nombre se llama como su id y uno con matriz lo indica', () => {
  const graph = workflowGraph(SAMPLE);

  assert.equal(graph.jobs.find((job) => job.id === 'lint').name, 'lint');
  assert.equal(graph.jobs.find((job) => job.id === 'test').matrix, true);
  assert.equal(graph.jobs.find((job) => job.id === 'gate').matrix, false);
});

test('el nombre para mostrar no lleva las expresiones de la matriz', () => {
  assert.equal(displayName('🧪 Frontend (${{ matrix.shard }}/3)'), '🧪 Frontend');
  assert.equal(displayName('🛡️ CodeQL (${{ matrix.language }})'), '🛡️ CodeQL');
  assert.equal(displayName('📦 Imagen + Trivy'), '📦 Imagen + Trivy');
});

test('el patrón reconoce cada ejecución de la matriz y nada más', () => {
  const pattern = new RegExp(namePattern('🧪 Frontend (${{ matrix.shard }}/3)'), 'u');

  assert.ok(pattern.test('🧪 Frontend (1/3)'));
  assert.ok(pattern.test('🧪 Frontend (3/3)'));
  assert.ok(!pattern.test('🧪 Frontend'));
  assert.ok(!pattern.test('📦 Build front'));
  assert.ok(new RegExp(namePattern('📦 Imagen + Trivy'), 'u').test('📦 Imagen + Trivy'));
});

test('rechaza dependencias que no existen y ciclos', () => {
  assert.throws(() => workflowGraph('jobs:\n  a:\n    needs: nope\n'), /no existe/);
  assert.throws(() => workflowGraph('jobs:\n  a:\n    needs: b\n  b:\n    needs: a\n'), /circular/);
  assert.throws(() => workflowGraph('name: x\n'), /no es un workflow/);
});

test('los workflows reales del repositorio se leen sin errores', () => {
  const dir = join(import.meta.dirname, '../../../.github/workflows');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.yml'))) {
    const graph = workflowGraph(readFileSync(join(dir, file), 'utf8'));
    assert.ok(graph.jobs.length > 0, file);
    assert.ok(graph.jobs.every((job) => job.name.length > 0 && !job.name.includes('${{')), file);
  }
});
