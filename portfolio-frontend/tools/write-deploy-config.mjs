// Ajusta un build ya hecho a la API de un entorno, sin recompilar:
//   - escribe config.json con la dirección de la API;
//   - pone el origen de esa API en la Content-Security-Policy de _headers (connect-src),
//     porque si no coincide el navegador bloquea las llamadas y la aplicación cae al modo demo.
// Uso: API_BASE_URL=https://api.ejemplo.dev/v1 node tools/write-deploy-config.mjs [carpeta del build]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_ORIGIN = 'https://api.example.com';
const dir = process.argv[2] ?? 'dist/portfolio-frontend/browser';
const raw = (process.env.API_BASE_URL ?? '').trim().replace(/\/+$/, '');

if (!raw) {
  console.error('Falta API_BASE_URL (p. ej. https://api.ejemplo.dev/v1).');
  process.exit(1);
}
let url;
try {
  url = new URL(raw);
} catch {
  console.error(`API_BASE_URL no es una URL válida: ${raw}`);
  process.exit(1);
}
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
  console.error('API_BASE_URL debe ser https, sin credenciales, parámetros ni fragmento.');
  process.exit(1);
}

writeFileSync(join(dir, 'config.json'), `${JSON.stringify({ apiBaseUrl: raw }, null, 2)}\n`);

const headersPath = join(dir, '_headers');
const headers = readFileSync(headersPath, 'utf8');
if (!headers.includes(`connect-src 'self' ${DEFAULT_ORIGIN}`)) {
  console.error(`_headers no contiene "connect-src 'self' ${DEFAULT_ORIGIN}": revisa la plantilla.`);
  process.exit(1);
}
writeFileSync(headersPath, headers.replace(`connect-src 'self' ${DEFAULT_ORIGIN}`, `connect-src 'self' ${url.origin}`));

console.log(`config.json y _headers apuntan a ${raw} (origen ${url.origin}).`);
