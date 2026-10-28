// version.json: la versión que sirve el sitio y sus novedades. Lo usa tools/write-version.mjs con lo
// que calcula .github/scripts/release-info.sh; lo lee core/release/release.ts.

export const MAX_NOTES = 8;
const MAX_TEXT = 160;
const VERSION = /^v\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
// Solo lo que nota quien visita el sitio: lo nuevo, lo corregido y lo más rápido.
const SUBJECT = /^(feat|fix|perf)(?:\(([^)]{1,32})\))?!?: (.+)$/;
const TYPE_ORDER = { feat: 0, fix: 1, perf: 2 };
// Ámbitos internos: aunque sean feat o fix, no cambian nada visible.
const INTERNAL_SCOPES = new Set(['ci', 'cd', 'build', 'deps', 'deps-dev', 'test', 'tests']);

/** Asuntos de commits (Conventional Commits, del más reciente al más antiguo) → novedades. */
export function releaseNotes(subjects) {
  return subjects
    .map((subject) => SUBJECT.exec(subject.trim()))
    .filter((match) => match && !INTERNAL_SCOPES.has((match[2] ?? '').toLowerCase()))
    .map(([, type, scope, text]) => ({ type, scope: scope ?? null, text: sentence(text) }))
    // sort es estable: dentro de cada tipo se conserva el orden del más reciente al más antiguo.
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .slice(0, MAX_NOTES);
}

function sentence(text) {
  const clean = text.trim().replace(/\s+/g, ' ');
  const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
  return capitalized.length > MAX_TEXT ? `${capitalized.slice(0, MAX_TEXT - 1)}…` : capitalized;
}

/** El contenido de version.json; lanza un error si lo calculado no tiene la forma esperada. */
export function versionFile(info, deployedAt) {
  if (!VERSION.test(info?.version ?? '')) throw new Error(`Versión no válida: ${info?.version}`);
  if (info.previous !== null && !VERSION.test(info.previous ?? '')) throw new Error(`Versión anterior no válida: ${info.previous}`);
  if (!SHA.test(info.sha ?? '')) throw new Error(`Commit no válido: ${info.sha}`);
  if (!REPOSITORY.test(info.repository ?? '')) throw new Error(`Repositorio no válido: ${info.repository}`);
  if (!Array.isArray(info.subjects)) throw new Error('Faltan los asuntos de los commits.');
  return {
    schema: 1,
    version: info.version,
    previous: info.previous,
    sha: info.sha,
    repository: info.repository,
    deployedAt: deployedAt.toISOString(),
    notes: releaseNotes(info.subjects),
  };
}
