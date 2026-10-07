// Reparte los archivos de test en grupos para ejecutarlos en paralelo en CI.
// Uso: npx ng test --watch=false $(node tools/shard-specs.mjs <índice desde 1> <total>)
// Imprime un --include por archivo. El reparto es estable: orden alfabético y turno rotatorio,
// así que entre todos los grupos se ejecuta cada archivo exactamente una vez.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const [index, total] = process.argv.slice(2).map(Number);
if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
  console.error('Uso: node tools/shard-specs.mjs <índice desde 1> <total>');
  process.exit(1);
}

function specs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? specs(path) : entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const mine = specs('src').sort().filter((_, position) => position % total === index - 1);
if (mine.length === 0) {
  console.error(`El grupo ${index} de ${total} no tiene tests: hay menos archivos que grupos.`);
  process.exit(1);
}
console.log(mine.map((path) => `--include=${path.replaceAll('\\', '/')}`).join(' '));
