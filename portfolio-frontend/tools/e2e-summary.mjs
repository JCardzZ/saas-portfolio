// Resume el resultado de Playwright (reporter json) como Markdown, para el resumen del job.
// Uso: node tools/e2e-summary.mjs [e2e-results/results.json]
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2] ?? 'e2e-results/results.json', 'utf8'));
const projects = new Map();
const failures = [];

function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const stats = projects.get(test.projectName) ?? { passed: 0, failed: 0, flaky: 0 };
      if (test.status === 'expected') stats.passed++;
      else if (test.status === 'flaky') stats.flaky++;
      else if (test.status === 'unexpected') {
        stats.failed++;
        failures.push(`${test.projectName} › ${spec.title}`);
      }
      projects.set(test.projectName, stats);
    }
  }
  (suite.suites ?? []).forEach(visit);
}
report.suites.forEach(visit);

console.log('### Móviles y tabletas (Playwright)');
console.log('');
console.log('| Perfil | Correctos | Fallidos | Inestables |');
console.log('| --- | ---: | ---: | ---: |');
for (const [name, stats] of [...projects].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`| ${name} | ${stats.passed} | ${stats.failed} | ${stats.flaky} |`);
}
if (failures.length > 0) {
  console.log('');
  console.log('**Fallidos:**');
  failures.slice(0, 40).forEach((failure) => console.log(`- ${failure}`));
}
console.log('');
console.log('Las capturas de cada sección, por perfil, están en el artefacto de capturas de este job.');
