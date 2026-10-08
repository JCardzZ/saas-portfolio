// Genera los datos de las vistas «Arquitectura en producción» y «Pipeline CI/CD» a partir de sus
// fuentes en el repositorio, para que los diagramas nunca se dibujen a mano:
//   .github/workflows/*.yml  →  src/app/features/public/delivery/generated/workflows.json
//   deploy/topology.json     →  src/app/features/public/delivery/generated/topology.json
//
// Uso: node tools/generate-delivery-data.mjs            (lo ejecuta `npm run build`)
//      node tools/generate-delivery-data.mjs --check    falla si lo generado no está al día
// Si las fuentes no están (build dentro de Docker, cuyo contexto es solo esta carpeta), no hace
// nada y se usa lo que ya hay en el repositorio; la CI comprueba que esté al día.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readTopology } from './lib/topology.mjs';
import { workflowGraph } from './lib/workflows.mjs';

const root = join(import.meta.dirname, '..', '..');
const out = join(import.meta.dirname, '..', 'src/app/features/public/delivery/generated');
/** Workflows que se dibujan, con la clave que usa pipeline-status.json. */
const WORKFLOWS = { ci: 'ci.yml', cd: 'cd.yml', nightly: 'nightly-security.yml' };
const check = process.argv.includes('--check');

const workflowsDir = join(root, '.github/workflows');
const topologyFile = join(root, 'deploy/topology.json');
if (!existsSync(workflowsDir) || !existsSync(topologyFile)) {
  console.log('Fuentes no disponibles (¿build en Docker?): se usan los datos ya generados.');
  process.exit(0);
}

const workflows = Object.fromEntries(Object.entries(WORKFLOWS).map(([key, file]) => {
  const graph = workflowGraph(readFileSync(join(workflowsDir, file), 'utf8'));
  return [key, { file, ...graph }];
}));
const topology = readTopology(JSON.parse(readFileSync(topologyFile, 'utf8')));

let stale = false;
for (const [name, data] of [['workflows.json', workflows], ['topology.json', topology]]) {
  const path = join(out, name);
  const content = `${JSON.stringify(data, null, 2)}\n`;
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
      console.error(`${name} no está al día: ejecuta "node tools/generate-delivery-data.mjs" y sube el resultado.`);
      stale = true;
    }
  } else {
    writeFileSync(path, content);
    console.log(`Generado ${name}`);
  }
}
process.exit(stale ? 1 : 0);
