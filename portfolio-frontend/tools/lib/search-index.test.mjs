import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { TARGET, buildSearchIndex, serialize } from '../generate-search-index.mjs';

test('the committed search index matches the sections and Studio templates', async () => {
  assert.equal(readFileSync(TARGET, 'utf8'), serialize(await buildSearchIndex()),
    'ejecuta npm run generate:search y sube el resultado');
});

test('every entry has a unique id, a title and an anchor to go to', async () => {
  const entries = await buildSearchIndex();
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.title.trim(), entry.id);
    // Una sección (`cloud`) o una pestaña de la de entrega (`entrega-pipeline`).
    assert.match(entry.target, /^[a-z]+(-[a-z]+)?$/, entry.id);
    assert.ok(['secciones', 'plantillas'].includes(entry.group), entry.id);
  }
  assert.ok(entries.some((entry) => entry.group === 'secciones'));
  assert.ok(entries.some((entry) => entry.group === 'plantillas'));
});
