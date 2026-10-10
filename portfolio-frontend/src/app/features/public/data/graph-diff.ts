/** Lo que se compara de un grafo: nodos con id y aristas entre dos ids. El resto de campos es libre. */
export interface GraphSnapshot {
  nodes: ({ id: string } & Record<string, unknown>)[];
  links: ({ from: string; to: string } & Record<string, unknown>)[];
}

export interface GraphChange {
  op: 'add' | 'remove' | 'change';
  target: 'node' | 'link';
  /** Id del nodo o `origen>destino` de la arista. */
  id: string;
  /** Lo que había: el elemento entero si se quitó, solo los campos que cambian si se modificó. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/** Nodos y aristas agregados, quitados o modificados entre dos estados del grafo. */
export function diffGraph(before: GraphSnapshot, after: GraphSnapshot): GraphChange[] {
  const linkId = (link: { from: string; to: string }) => `${link.from}>${link.to}`;
  return [
    ...diffItems('node', before.nodes, after.nodes, (node) => node.id, (node) => ({ id: node.id })),
    ...diffItems('link', before.links, after.links, linkId, (link) => ({ from: link.from, to: link.to })),
  ];
}

function diffItems<T extends Record<string, unknown>>(
  target: GraphChange['target'], before: T[], after: T[], idOf: (item: T) => string, identity: (item: T) => Record<string, unknown>,
): GraphChange[] {
  const old = new Map(before.map((item) => [idOf(item), item]));
  const current = new Map(after.map((item) => [idOf(item), item]));
  const changes: GraphChange[] = [];
  for (const [id, item] of old) {
    if (!current.has(id)) {
      changes.push({ op: 'remove', target, id, before: item });
    }
  }
  for (const [id, item] of current) {
    const previous = old.get(id);
    if (!previous) {
      changes.push({ op: 'add', target, id, after: item });
      continue;
    }
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(item)])]
      .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(item[key]));
    if (keys.length) {
      const pick = (source: T) => ({ ...identity(source), ...Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]])) });
      changes.push({ op: 'change', target, id, before: pick(previous), after: pick(item) });
    }
  }
  return changes;
}

export type JsonTokenType = 'key' | 'string' | 'number' | 'literal' | 'punct';
export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}\[\],:])|(\s+)/g;

/** Trocea un texto JSON para colorearlo. Lo que no reconoce se devuelve tal cual, como puntuación. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) {
      tokens.push({ type: 'punct', text: text.slice(last, match.index) });
    }
    last = match.index + match[0].length;
    if (match[1] !== undefined) {
      tokens.push({ type: match[2] ? 'key' : 'string', text: match[1] });
      if (match[2]) {
        tokens.push({ type: 'punct', text: match[2] });
      }
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'number', text: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'literal', text: match[4] });
    } else {
      tokens.push({ type: 'punct', text: match[0] });
    }
  }
  if (last < text.length) {
    tokens.push({ type: 'punct', text: text.slice(last) });
  }
  return tokens;
}

export interface DiffLine {
  sign: '+' | '-';
  /** La línea forma parte de una modificación, no de un alta o una baja. */
  changed: boolean;
  label: string;
  tokens: JsonToken[];
}

const LABELS: Record<GraphChange['target'], string> = { node: 'nodo', link: 'arista' };

/** Las líneas de un diff: `-` lo que había y `+` lo que hay, una por elemento. */
export function diffLines(changes: GraphChange[]): DiffLine[] {
  return changes.flatMap((change): DiffLine[] => {
    const line = (sign: DiffLine['sign'], value: Record<string, unknown>): DiffLine =>
      ({ sign, changed: change.op === 'change', label: LABELS[change.target], tokens: tokenizeJson(JSON.stringify(value)) });
    return [...(change.before ? [line('-', change.before)] : []), ...(change.after ? [line('+', change.after)] : [])];
  });
}

/** Resumen en una frase: «2 nodos agregados, 1 arista modificada». */
export function summarize(changes: GraphChange[]): string {
  const words: Record<GraphChange['op'], [string, string]> = { add: ['agregado', 'agregada'], remove: ['quitado', 'quitada'], change: ['modificado', 'modificada'] };
  const parts: string[] = [];
  for (const target of ['node', 'link'] as const) {
    for (const op of ['add', 'remove', 'change'] as const) {
      const count = changes.filter((change) => change.target === target && change.op === op).length;
      if (count) {
        const noun = target === 'node' ? (count === 1 ? 'nodo' : 'nodos') : (count === 1 ? 'arista' : 'aristas');
        parts.push(`${count} ${noun} ${words[op][target === 'node' ? 0 : 1]}${count === 1 ? '' : 's'}`);
      }
    }
  }
  return parts.join(', ');
}
