import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_NOTES, releaseNotes, versionFile } from './release-info.mjs';

const info = {
  version: 'v0.2.0', previous: 'v0.1.0', sha: 'a'.repeat(40), repository: 'JCardzZ/saas-portfolio', isNew: true,
  subjects: [
    'fix(frontend): keep the caret visible while streaming',
    'chore: bump wrangler',
    'feat(frontend): turn the assistant into a live chat',
    'feat(ci): cache the gradle wrapper',
    'perf: lazy-load the chat thread',
    'feat!: drop the legacy search',
  ],
};

test('se queda con lo que nota quien visita: lo nuevo primero, luego correcciones y rendimiento', () => {
  assert.deepEqual(releaseNotes(info.subjects), [
    { type: 'feat', scope: 'frontend', text: 'Turn the assistant into a live chat' },
    { type: 'feat', scope: null, text: 'Drop the legacy search' },
    { type: 'fix', scope: 'frontend', text: 'Keep the caret visible while streaming' },
    { type: 'perf', scope: null, text: 'Lazy-load the chat thread' },
  ]);
});

test('limita el número y el largo de las novedades', () => {
  const many = Array.from({ length: 20 }, (_, i) => `feat: change ${i} ${'x'.repeat(200)}`);
  const notes = releaseNotes(many);
  assert.equal(notes.length, MAX_NOTES);
  assert.equal(notes[0].text.length, 160);
  assert.ok(notes[0].text.endsWith('…'));
});

test('escribe version.json con la fecha del despliegue y sin campos de más', () => {
  const file = versionFile(info, new Date('2026-10-28T14:05:00Z'));
  assert.deepEqual(Object.keys(file), ['schema', 'version', 'previous', 'sha', 'repository', 'deployedAt', 'notes']);
  assert.equal(file.deployedAt, '2026-10-28T14:05:00.000Z');
  assert.equal(file.previous, 'v0.1.0');
  assert.equal(versionFile({ ...info, previous: null }, new Date()).previous, null);
});

test('rechaza lo que no tiene la forma esperada', () => {
  assert.throws(() => versionFile({ ...info, version: '1.0' }, new Date()), /Versión no válida/);
  assert.throws(() => versionFile({ ...info, sha: 'abc' }, new Date()), /Commit no válido/);
  assert.throws(() => versionFile({ ...info, repository: 'x/y/z' }, new Date()), /Repositorio no válido/);
  assert.throws(() => versionFile({ ...info, subjects: undefined }, new Date()), /asuntos/);
});
