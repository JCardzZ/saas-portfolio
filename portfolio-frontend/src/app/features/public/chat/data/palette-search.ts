/** Grupos de resultados de la paleta, en el orden en que se muestran. */
export const PALETTE_GROUPS = ['secciones', 'proyectos', 'tecnologias', 'plantillas', 'articulos'] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

export const GROUP_LABELS: Record<PaletteGroup, string> = {
  secciones: 'Secciones',
  proyectos: 'Proyectos',
  tecnologias: 'Tecnologías',
  plantillas: 'Plantillas',
  articulos: 'Artículos',
};

/** Sección de la página que acompaña a los resultados cuando la búsqueda se limita a un grupo. */
const GROUP_SECTION: Partial<Record<PaletteGroup, string>> = { proyectos: 'proyectos', plantillas: 'cloud' };

export interface PaletteEntry {
  id: string;
  group: PaletteGroup;
  title: string;
  /** Texto secundario: se muestra bajo el título y también se busca en él. */
  text: string;
  /** `id` del elemento de la página al que lleva. */
  target: string;
}

export interface PaletteResultGroup {
  group: PaletteGroup;
  label: string;
  entries: PaletteEntry[];
}

export const MAX_PER_GROUP = 5;

/** Minúsculas y sin tildes ni diéresis: «Tecnologías» y «tecnologias» son lo mismo al buscar. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const words = (text: string): string[] => fold(text).split(/[^a-z0-9ñ+#.]+/).filter(Boolean);

/** Distancia de edición (inserción, borrado, sustitución y letras vecinas cambiadas de sitio). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...new Array<number>(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/** Errores que se perdonan según lo larga que sea la palabra escrita: en una corta, ninguno. */
const tolerance = (token: string): number => (token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0);

/** Qué tan bien encaja una palabra escrita con una del texto: 0 si no encaja. */
function wordScore(token: string, word: string): number {
  if (word === token) {
    return 100;
  }
  if (word.startsWith(token)) {
    return 80;
  }
  if (token.length >= 3 && word.includes(token)) {
    return 60;
  }
  const allowed = tolerance(token);
  if (allowed === 0) {
    return 0;
  }
  // Se compara con el comienzo de la palabra: quien escribe «kuberntes» aún no ha terminado «kubernetes».
  const distance = Math.min(
    ...[-1, 0, 1].map((extra) => editDistance(token, word.slice(0, Math.max(1, token.length + extra)))),
  );
  return distance <= allowed ? 40 - distance * 10 : 0;
}

const best = (token: string, candidates: string[]): number =>
  candidates.reduce((max, word) => Math.max(max, wordScore(token, word)), 0);

/** Puntuación de una entrada para lo escrito: 0 si alguna palabra no aparece ni en el título ni en el texto. */
export function scoreEntry(entry: PaletteEntry, query: string): number {
  const tokens = words(query);
  if (tokens.length === 0) {
    return 0;
  }
  const title = words(entry.title);
  const text = words(entry.text);
  let total = 0;
  for (const token of tokens) {
    // El título pesa el doble que el texto secundario.
    const score = Math.max(best(token, title) * 2, best(token, text));
    if (score === 0) {
      return 0;
    }
    total += score;
  }
  return total;
}

/**
 * Resultados agrupados. Con `scope`, solo ese grupo (más la sección de la página que le
 * corresponde), y sin texto escrito se listan todas sus entradas.
 */
export function searchPalette(entries: readonly PaletteEntry[], query: string, scope: PaletteGroup | null = null): PaletteResultGroup[] {
  const hasQuery = words(query).length > 0;
  if (!hasQuery && scope === null) {
    return [];
  }
  const inScope = (entry: PaletteEntry): boolean =>
    scope === null || entry.group === scope || (entry.group === 'secciones' && entry.target === GROUP_SECTION[scope]);
  const limit = scope === null ? MAX_PER_GROUP : Number.POSITIVE_INFINITY;

  return PALETTE_GROUPS.map((group) => {
    const ranked = entries
      .filter((entry) => entry.group === group && inScope(entry))
      .map((entry, index) => ({ entry, index, score: hasQuery ? scoreEntry(entry, query) : 1 }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return { group, label: GROUP_LABELS[group], entries: ranked.slice(0, limit).map((candidate) => candidate.entry) };
  }).filter((result) => result.entries.length > 0);
}
