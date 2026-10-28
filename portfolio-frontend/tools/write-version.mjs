// Escribe version.json en un build ya hecho, sin recompilar: la versión de este despliegue (la calcula
// el job Origen de cd.yml con .github/scripts/release-info.sh), cuándo se desplegó y sus novedades.
// Uso: node tools/write-version.mjs <carpeta del build> <release.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { versionFile } from './lib/release-info.mjs';

const [dir, source] = process.argv.slice(2);
if (!dir || !source) {
  console.error('Uso: node tools/write-version.mjs <carpeta del build> <release.json>');
  process.exit(1);
}

let file;
try {
  file = versionFile(JSON.parse(readFileSync(source, 'utf8')), new Date());
} catch (error) {
  console.error(`No se pudo escribir version.json: ${error.message}`);
  process.exit(1);
}
writeFileSync(join(dir, 'version.json'), `${JSON.stringify(file, null, 2)}\n`);
console.log(`version.json: ${file.version} (${file.sha.slice(0, 7)}), ${file.notes.length} novedades.`);
