import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { scanDesign } from './design-lint.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { totals, byFile } = scanDesign(root);
const filesWith = (key) => Object.entries(byFile).filter(([, counts]) => counts[key]).map(([file, counts]) => `${file} (${counts[key]})`);

test('la vista pública solo usa colores de los tokens', () => {
  assert.deepEqual(filesWith('rawPalette'), [], 'clases de la paleta de Tailwind: usar bg-surface-*, text-ink-*, text-status-*…');
  assert.deepEqual(filesWith('legacyAccent'), [], 'el acento es text-accent-text / bg-accent-solid');
});

test('ningún texto baja de 12 px con una clase', () => {
  assert.deepEqual(filesWith('smallTextClass'), []);
});

test('los radios salen de la escala: mark, control, panel, card o full', () => {
  assert.deepEqual(filesWith('offScaleRadius'), []);
});

// Lo que queda es deuda conocida y acotada: no puede crecer ni aparecer en otros archivos.

test('los únicos hex a mano son los del resplandor de marca de los logos (excepción de docs/DESIGN.md §2.4)', () => {
  const allowed = new Set([
    'src/app/shared/ui/icon-pop-layer.component.ts',
    'src/app/features/public/widgets/architecture-canvas.component.ts',
    'src/app/features/public/widgets/resilience-pipeline.component.ts',
  ]);
  const elsewhere = Object.entries(byFile).filter(([file, counts]) => counts.hex && !allowed.has(file)).map(([file]) => file);
  assert.deepEqual(elsewhere, []);
  assert.ok(totals.hex <= 8, `hex a mano: ${totals.hex} (máximo 8)`);
});

test('el texto de menos de 12 px que queda es el de tres rótulos del lienzo del Estudio', () => {
  assert.deepEqual(filesWith('smallTextCss'), ['src/app/features/public/cloud/cloud-infra.component.css (3)']);
});
