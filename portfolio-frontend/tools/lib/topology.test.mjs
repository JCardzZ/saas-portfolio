import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { readTopology } from './topology.mjs';

const EN = { role: 'r', what: 'what', why: 'why' };
const node = (overrides = {}) => ({
  id: 'a', label: 'A', role: 'r', stage: 0, status: 'live', what: 'qué', why: 'por qué', col: 0, row: 0, en: EN, ...overrides,
});
const link = (overrides = {}) => ({ from: 'a', to: 'b', label: 'usa', flow: 'request', ...overrides });

test('acepta nodos live y planned, con zona, celda y textos en inglés, y descarta lo que no conoce', () => {
  const topology = readTopology({
    $comment: 'x',
    stages: ['Uno', 'Dos'],
    zones: [{ id: 'gh', label: 'GitHub', icon: 'github' }],
    nodes: [node({ zone: 'gh' }), node({ id: 'b', status: 'planned', stage: 1, col: 1, extra: 'se ignora' })],
    links: [link({ labelEn: 'uses' })],
  });

  assert.deepEqual(topology.nodes.map((item) => item.status), ['live', 'planned']);
  assert.equal('extra' in topology.nodes[1], false);
  assert.deepEqual(topology.links, [{ from: 'a', to: 'b', label: 'usa', labelEn: 'uses', flow: 'request' }]);
  assert.deepEqual(topology.stages, ['Uno', 'Dos']);
  assert.deepEqual(topology.zones, [{ id: 'gh', label: 'GitHub', labelEn: 'GitHub', icon: 'github' }]);
  assert.equal(topology.nodes[0].zone, 'gh');
  // Sin nombre propio en inglés, se usa el mismo.
  assert.equal(topology.nodes[0].en.label, 'A');
});

test('rechaza estados inventados, nodos repetidos, campos vacíos y conexiones colgadas', () => {
  const two = { stages: ['Uno'], nodes: [node(), node({ id: 'b', col: 1 })] };
  assert.throws(() => readTopology({ nodes: [node({ status: 'beta' })], links: [] }), /live o planned/);
  assert.throws(() => readTopology({ stages: ['Uno'], nodes: [node({ stage: 1 })], links: [] }), /nombres de etapa/);
  assert.throws(() => readTopology({ stages: ['Uno'], nodes: [node(), node()], links: [] }), /repetido/);
  assert.throws(() => readTopology({ stages: ['Uno'], nodes: [node({ why: ' ' })], links: [] }), /le falta "why"/);
  assert.throws(() => readTopology({ ...two, links: [link({ to: 'zz' })] }), /no existe/);
  assert.throws(() => readTopology({ stages: ['Uno'], nodes: [node({ stage: -1 })], links: [] }), /etapa/);
  assert.throws(() => readTopology({}), /nodes/);
});

test('rechaza lo que rompería el lienzo: celdas repetidas, zonas inexistentes, recorridos sin tipo y textos sin traducir', () => {
  const two = (b) => ({ stages: ['Uno'], nodes: [node(), node({ id: 'b', col: 1, ...b })], links: [] });
  assert.throws(() => readTopology(two({ col: 0 })), /misma celda/);
  assert.throws(() => readTopology(two({ zone: 'aws' })), /no existe/);
  assert.throws(() => readTopology(two({ row: -1 })), /"col" y "row"/);
  assert.throws(() => readTopology(two({ en: { role: 'r', what: 'w' } })), /en\.why/);
  assert.throws(() => readTopology({ ...two({}), links: [link({ flow: 'otro' })] }), /request o delivery/);
});

test('la topología real del repositorio es válida y cada pieza explica su porqué en los dos idiomas', () => {
  const real = JSON.parse(readFileSync(join(import.meta.dirname, '../../../deploy/topology.json'), 'utf8'));
  const topology = readTopology(real);

  assert.ok(topology.nodes.length >= 5);
  assert.ok(topology.nodes.some((item) => item.status === 'live'));
  assert.ok(topology.nodes.every((item) => item.why.length > 20 && item.en.why.length > 20));
});
