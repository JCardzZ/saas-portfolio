import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { readTopology } from './topology.mjs';

const node = (overrides = {}) => ({
  id: 'a', label: 'A', role: 'r', stage: 0, status: 'live', what: 'qué', why: 'por qué', ...overrides,
});

test('acepta nodos live y planned y descarta lo que no conoce', () => {
  const topology = readTopology({
    $comment: 'x',
    nodes: [node(), node({ id: 'b', status: 'planned', stage: 1, extra: 'se ignora' })],
    links: [{ from: 'a', to: 'b', label: 'usa' }],
  });

  assert.deepEqual(topology.nodes.map((item) => item.status), ['live', 'planned']);
  assert.equal('extra' in topology.nodes[1], false);
  assert.deepEqual(topology.links, [{ from: 'a', to: 'b', label: 'usa' }]);
});

test('rechaza estados inventados, nodos repetidos, campos vacíos y conexiones colgadas', () => {
  assert.throws(() => readTopology({ nodes: [node({ status: 'beta' })], links: [] }), /live o planned/);
  assert.throws(() => readTopology({ nodes: [node(), node()], links: [] }), /repetido/);
  assert.throws(() => readTopology({ nodes: [node({ why: ' ' })], links: [] }), /le falta "why"/);
  assert.throws(() => readTopology({ nodes: [node()], links: [{ from: 'a', to: 'zz' }] }), /no existe/);
  assert.throws(() => readTopology({ nodes: [node({ stage: -1 })], links: [] }), /etapa/);
  assert.throws(() => readTopology({}), /nodes/);
});

test('la topología real del repositorio es válida y cada pieza explica su porqué', () => {
  const real = JSON.parse(readFileSync(join(import.meta.dirname, '../../../deploy/topology.json'), 'utf8'));
  const topology = readTopology(real);

  assert.ok(topology.nodes.length >= 5);
  assert.ok(topology.nodes.some((item) => item.status === 'live'));
  assert.ok(topology.nodes.every((item) => item.why.length > 20));
});
