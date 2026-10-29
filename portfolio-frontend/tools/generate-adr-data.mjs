// Genera los datos de /decisiones a partir de docs/adr/{es,en}/*.md.
// Uso: node tools/generate-adr-data.mjs [--check]   (con --check falla si el archivo no está al día)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pairAdrs, parseAdr } from './lib/adr.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'portfolio-frontend/src/app/features/public/decisions/generated/adrs.json');

const read = (lang) => {
  const dir = join(root, 'docs/adr', lang);
  return readdirSync(dir).filter((file) => /^\d{4}-.+\.md$/.test(file)).map((file) => parseAdr(readFileSync(join(dir, file), 'utf8'), `${lang}/${file}`));
};

let json;
try {
  json = `${JSON.stringify(pairAdrs(read('es'), read('en')), null, 2)}\n`;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== json) {
    console.error('adrs.json no está al día: ejecuta "node tools/generate-adr-data.mjs" y sube el resultado.');
    process.exit(1);
  }
  console.log('adrs.json al día.');
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log('Generado adrs.json');
}
