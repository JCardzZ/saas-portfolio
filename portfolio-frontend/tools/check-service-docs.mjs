// Comprueba los enlaces de documentación de las fichas de servicio (service-info.data.ts): pide
// cada página y muestra su estado y su título, para contrastarlo a mano con el nombre del servicio.
// Necesita red, así que no corre en la CI:  node tools/check-service-docs.mjs
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(tmpdir(), `service-info-${process.pid}.mjs`);
await build({
  entryPoints: [join(root, 'src/app/features/public/cloud/service-info.data.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error',
});
const { serviceDocLinks } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

async function check(link) {
  try {
    const response = await fetch(link.docs, {
      redirect: 'follow', signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'Mozilla/5.0 (docs link check)', 'accept-language': 'en' },
    });
    const html = response.ok ? (await response.text()).slice(0, 200_000) : '';
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    return { ...link, status: response.status, title, moved: response.url !== link.docs ? response.url : '' };
  } catch (error) {
    return { ...link, status: 0, title: String(error.cause?.code ?? error.name), moved: '' };
  }
}

const links = serviceDocLinks();
const results = [];
for (let i = 0; i < links.length; i += 8) {
  results.push(...await Promise.all(links.slice(i, i + 8).map(check)));
}
let failed = 0;
for (const result of results) {
  const ok = result.status >= 200 && result.status < 300;
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'ok ' : 'ERR'} ${result.status} ${result.type}/${result.provider} · ${result.name} · «${result.title}»${result.moved ? ` → ${result.moved}` : ''}`);
}
console.log(`${results.length} enlaces, ${failed} con error`);
process.exit(failed ? 1 : 0);
