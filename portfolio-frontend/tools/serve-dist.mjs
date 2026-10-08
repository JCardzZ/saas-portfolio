// Sirve un build ya hecho como lo hace el hosting: archivos estáticos, cualquier otra ruta
// devuelve index.html (SPA) y la Content-Security-Policy de _headers. Para los tests de Playwright.
// Uso: node tools/serve-dist.mjs [carpeta del build] [puerto]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist/portfolio-frontend/browser');
const port = Number(process.argv[3] ?? 4310);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.txt': 'text/plain',
};
const headersFile = join(root, '_headers');
const csp = existsSync(headersFile) ? readFileSync(headersFile, 'utf8').match(/Content-Security-Policy: (.*)/)?.[1] : null;

createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  let file = join(root, path);
  // Nada fuera de la carpeta del build, y lo que no es un archivo lo resuelve la aplicación.
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  response.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    ...(csp ? { 'Content-Security-Policy': csp } : {}),
  });
  response.end(readFileSync(file));
}).listen(port, () => console.log(`Sirviendo ${root} en http://localhost:${port}`));
