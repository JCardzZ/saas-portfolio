import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pairAdrs, parseAdr, unwrap } from './adr.mjs';

const doc = (lang, extra = '') => `---
number: 0001
slug: ejemplo
title: ${lang === 'es' ? 'Ejemplo' : 'Example'}
status: ${lang === 'es' ? 'Aceptada' : 'Accepted'}
date: 2026-10
area: ${lang === 'es' ? 'Arquitectura' : 'Architecture'}
summary: s
gains: g
costs: c
revisit: r
evidence: a/b.java, c/d.ts
${extra}---

## ${lang === 'es' ? 'Contexto' : 'Context'}

Una línea
que sigue.

| A | B |
|---|---|
| 1 | 2 |

## ${lang === 'es' ? 'Opciones' : 'Options'}

- uno
- dos

## ${lang === 'es' ? 'Decisión' : 'Decision'}

D

## ${lang === 'es' ? 'Consecuencias' : 'Consequences'}

**${lang === 'es' ? 'Gana' : 'Gains'}:** G

**${lang === 'es' ? 'Cuesta' : 'Costs'}:** K

## ${lang === 'es' ? 'Cuándo revisarla' : 'When to revisit'}

R
`;

test('lee la cabecera y las cinco secciones, con el área como id común', () => {
  const adr = parseAdr(doc('es'), 'es/0001.md');
  assert.equal(adr.area, 'architecture');
  assert.deepEqual(adr.evidence, ['a/b.java', 'c/d.ts']);
  assert.equal(adr.sections.context.split('\n')[0], 'Una línea que sigue.');
  assert.ok(adr.sections.context.includes('| 1 | 2 |'));
  assert.equal(adr.gainsDetail, 'G');
  assert.equal(adr.costsDetail, 'K');
  assert.equal(adr.sections.consequences, '');
});

test('une los párrafos pero no toca tablas, listas ni código', () => {
  assert.equal(unwrap('a\nb\n\n- x\n- y\n\n```\nq\nw\n```'), 'a b\n\n- x\n- y\n\n```\nq\nw\n```');
});

test('rechaza una decisión incompleta', () => {
  assert.throws(() => parseAdr(doc('es').replace('costs: c\n', ''), 'x.md'), /costs/);
  assert.throws(() => parseAdr(doc('es').replace('## Cuándo revisarla\n\nR\n', ''), 'x.md'), /Cuándo revisarla/);
  assert.throws(() => parseAdr(doc('es').replace('area: Arquitectura', 'area: Otra'), 'x.md'), /área/);
});

test('junta los dos idiomas y exige que coincidan', () => {
  const [adr] = pairAdrs([parseAdr(doc('es'), 'es')], [parseAdr(doc('en'), 'en')]);
  assert.equal(adr.es.title, 'Ejemplo');
  assert.equal(adr.en.title, 'Example');
  assert.throws(() => pairAdrs([parseAdr(doc('es'), 'es')], []), /inglés/);
});
