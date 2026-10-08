// Resume los resultados de Lighthouse CI como Markdown, para el resumen del job.
// Uso: node tools/lighthouse-summary.mjs [carpeta de informes]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? '.lighthouseci/report';
const config = JSON.parse(readFileSync('lighthouserc.json', 'utf8')).ci.assert.assertions;
const runs = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const run = runs.find((item) => item.isRepresentativeRun) ?? runs[0];
const labels = {
  performance: 'Rendimiento', accessibility: 'Accesibilidad', 'best-practices': 'Buenas prácticas', seo: 'SEO',
};

console.log('### Lighthouse');
console.log('');
console.log('| Categoría | Puntaje | Mínimo | |');
console.log('| --- | ---: | ---: | :---: |');
for (const [key, label] of Object.entries(labels)) {
  const score = Math.round((run.summary[key] ?? 0) * 100);
  const minimum = Math.round((config[`categories:${key}`]?.[1]?.minScore ?? 0) * 100);
  console.log(`| ${label} | ${score} | ${minimum} | ${score >= minimum ? '✅' : '❌'} |`);
}
console.log('');
console.log(`Mediana de ${runs.length} ejecuciones sobre el build de producción, servido en local y en modo demo.`);

// Para pipeline-status.json: los puntajes, de 0 a 100.
if (process.env.LIGHTHOUSE_METRICS) {
  const score = (key) => Math.round((run.summary[key] ?? 0) * 100);
  writeFileSync(process.env.LIGHTHOUSE_METRICS, JSON.stringify({
    performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo'),
  }));
}
