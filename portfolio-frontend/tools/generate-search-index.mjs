// Índice de búsqueda de la paleta de comandos (⌘K): lo que se conoce al compilar, es decir, las
// secciones de la página y las plantillas del Estudio. Proyectos, tecnologías y artículos son
// contenido del CMS y se añaden al índice en el navegador, cuando llegan de la API.
//   node tools/generate-search-index.mjs           escribe el archivo
//   node tools/generate-search-index.mjs --check   falla si el archivo no está al día
import { build } from 'esbuild';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET = join(root, 'src/app/features/public/chat/generated/search-index.json');

/** @returns {Promise<{ id: string, group: string, title: string, text: string, target: string }[]>} */
export async function buildSearchIndex() {
  const bundle = join(tmpdir(), `search-index-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: "export { PAGE_SECTIONS } from './src/app/features/public/navbar/page-sections'; export { STUDIO_PRESETS } from './src/app/features/public/cloud/studio-project'; export { DATA_BLUEPRINTS } from './src/app/features/public/cloud/data-blueprints';",
      resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error',
  });
  try {
    const { PAGE_SECTIONS, STUDIO_PRESETS, DATA_BLUEPRINTS } = await import(pathToFileURL(bundle).href);
    return [
      ...PAGE_SECTIONS.map((section) => ({
        id: `seccion-${section.id}`, group: 'secciones', title: section.label, text: section.about, target: section.id,
      })),
      // Una plantilla se abre desde el menú del Estudio: el resultado lleva hasta él.
      ...[...STUDIO_PRESETS, ...DATA_BLUEPRINTS].map((template) => ({
        id: `plantilla-${template.id}`, group: 'plantillas', title: template.name,
        text: template.summary ?? template.problem ?? '', target: 'cloud',
      })),
    ];
  } finally {
    rmSync(bundle, { force: true });
  }
}

export const serialize = (entries) => JSON.stringify(entries, null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const expected = serialize(await buildSearchIndex());
  if (process.argv.includes('--check')) {
    if (readFileSync(TARGET, 'utf8') !== expected) {
      console.error('search-index.json no está al día: ejecuta npm run generate:search');
      process.exit(1);
    }
    console.log('search-index.json está al día');
  } else {
    writeFileSync(TARGET, expected);
    console.log(`${JSON.parse(expected).length} entradas escritas en ${TARGET}`);
  }
}
