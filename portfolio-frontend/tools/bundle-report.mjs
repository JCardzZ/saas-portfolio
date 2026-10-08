// Mide lo que el navegador descarga para pintar la primera pantalla (los scripts, estilos y
// módulos precargados que nombra index.html) y falla si supera el presupuesto.
// Uso: node tools/bundle-report.mjs [carpeta del build] [presupuesto en kB sin comprimir]
// Imprime una tabla Markdown (el CI la añade al resumen del job).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist/portfolio-frontend/browser';
const budgetKb = Number(process.argv[3] ?? 500);
const kb = (bytes) => (bytes / 1000).toFixed(1);

const html = readFileSync(join(dir, 'index.html'), 'utf8');
const initial = [...new Set(
  [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]),
)];
if (initial.length === 0) {
  console.error(`index.html de ${dir} no referencia ningún .js ni .css.`);
  process.exit(1);
}

const rows = initial.map((name) => {
  const content = readFileSync(join(dir, name));
  return { name, raw: content.length, gzip: gzipSync(content).length };
});
const raw = rows.reduce((sum, row) => sum + row.raw, 0);
const gzip = rows.reduce((sum, row) => sum + row.gzip, 0);
const lazy = readdirSync(dir)
  .filter((name) => /\.(js|css)$/.test(name) && !initial.includes(name))
  .reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
const ok = raw <= budgetKb * 1000;

console.log('### Bundle inicial');
console.log('');
console.log('| Archivo | Sin comprimir | gzip |');
console.log('| --- | ---: | ---: |');
for (const row of rows.sort((a, b) => b.raw - a.raw)) {
  console.log(`| \`${row.name}\` | ${kb(row.raw)} kB | ${kb(row.gzip)} kB |`);
}
console.log(`| **Total inicial** | **${kb(raw)} kB** | **${kb(gzip)} kB** |`);
console.log('');
console.log(`${ok ? '✅' : '❌'} Presupuesto: ${budgetKb} kB sin comprimir. Código bajo demanda (no cuenta): ${kb(lazy)} kB.`);

// Para pipeline-status.json: las mismas cifras, como datos.
if (process.env.BUNDLE_METRICS) {
  writeFileSync(process.env.BUNDLE_METRICS, JSON.stringify({ bundleKb: Number(kb(raw)), bundleGzipKb: Number(kb(gzip)) }));
}

if (!ok) {
  console.error(`El bundle inicial (${kb(raw)} kB) supera el presupuesto de ${budgetKb} kB.`);
  process.exit(1);
}
