// Escribe los proyectos de ejemplo que usan las pruebas e2e del Estudio, con el serializador
// real (studio-project.ts). Ejecútalo si cambia el formato:  node tools/export-e2e-fixtures.mjs
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = join(tmpdir(), `studio-fixtures-${process.pid}.mjs`);
await build({
  entryPoints: ['src/app/features/public/cloud/studio-project.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error',
});
const { referenceProject, serializeProject } = await import(pathToFileURL(bundle).href);
rmSync(bundle);

// Guardado antes de las reglas inteligentes: la base de datos, en la subred pública y
// conectada directamente con los visitantes. Tiene que seguir abriendo; las reglas solo avisan.
const exposed = referenceProject();
exposed.nodes = exposed.nodes.map((node) => (node.id === 'postgres' ? { ...node, zone: 'public' } : node));
exposed.links = [...exposed.links, { from: 'users', to: 'postgres' }];

const target = resolve('e2e/fixtures');
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'studio-project-v2-exposed-database.json'), JSON.stringify(JSON.parse(serializeProject(exposed)), null, 2) + '\n');
console.log(`proyectos de ejemplo exportados a ${target}`);
