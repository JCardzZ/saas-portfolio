import { diffGraph, diffLines, summarize, tokenizeJson } from './graph-diff';

const graph = (nodes: Record<string, unknown>[], links: Record<string, unknown>[] = []) =>
  ({ nodes: nodes as never, links: links as never });

describe('diffGraph', () => {
  it('finds nothing between two equal graphs', () => {
    const same = graph([{ id: 'a', x: 1 }], [{ from: 'a', to: 'b' }]);
    expect(diffGraph(same, structuredClone(same))).toEqual([]);
  });

  it('reports added, removed and modified nodes and links', () => {
    const before = graph([{ id: 'a', x: 1, role: 'API' }, { id: 'b', x: 2 }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]);
    const after = graph([{ id: 'a', x: 9, role: 'API' }, { id: 'c', x: 3 }], [{ from: 'a', to: 'b', kind: 'EVENT_BUS' }, { from: 'a', to: 'c' }]);
    expect(diffGraph(before, after)).toEqual([
      { op: 'remove', target: 'node', id: 'b', before: { id: 'b', x: 2 } },
      { op: 'change', target: 'node', id: 'a', before: { id: 'a', x: 1 }, after: { id: 'a', x: 9 } },
      { op: 'add', target: 'node', id: 'c', after: { id: 'c', x: 3 } },
      { op: 'remove', target: 'link', id: 'b>a', before: { from: 'b', to: 'a' } },
      // Un campo que aparece: en «antes» solo queda la identidad de la arista.
      { op: 'change', target: 'link', id: 'a>b', before: { from: 'a', to: 'b' }, after: { from: 'a', to: 'b', kind: 'EVENT_BUS' } },
      { op: 'add', target: 'link', id: 'a>c', after: { from: 'a', to: 'c' } },
    ]);
  });

  it('compares nested values by content', () => {
    const before = graph([{ id: 'a', props: { env: 'A=1' } }]);
    expect(diffGraph(before, graph([{ id: 'a', props: { env: 'A=1' } }]))).toEqual([]);
    expect(diffGraph(before, graph([{ id: 'a', props: { env: 'A=2' } }])).map((change) => change.op)).toEqual(['change']);
  });
});

describe('diff presentation', () => {
  const changes = diffGraph(
    graph([{ id: 'a', x: 1 }, { id: 'b' }], [{ from: 'a', to: 'b' }]),
    graph([{ id: 'a', x: 2 }, { id: 'c' }, { id: 'd' }], []),
  );

  it('summarises the change in a sentence', () => {
    expect(summarize(changes)).toBe('2 nodos agregados, 1 nodo quitado, 1 nodo modificado, 1 arista quitada');
    expect(summarize([])).toBe('');
  });

  it('writes one line per side, marking the modified ones', () => {
    const lines = diffLines(changes).map((line) => `${line.changed ? '~' : ''}${line.sign} ${line.label} ${line.tokens.map((token) => token.text).join('')}`);
    expect(lines).toEqual([
      '- nodo {"id":"b"}', '~- nodo {"id":"a","x":1}', '~+ nodo {"id":"a","x":2}', '+ nodo {"id":"c"}', '+ nodo {"id":"d"}',
      '- arista {"from":"a","to":"b"}',
    ]);
  });

  it('tokenises JSON for colouring without losing a character', () => {
    const text = JSON.stringify({ id: 'a "b"', x: -1.5, ok: true, none: null, list: [1, 'dos'] }, null, 2);
    const tokens = tokenizeJson(text);
    expect(tokens.map((token) => token.text).join('')).toBe(text);
    expect(tokens.filter((token) => token.type === 'key').map((token) => token.text)).toEqual(['"id"', '"x"', '"ok"', '"none"', '"list"']);
    expect(tokens.filter((token) => token.type === 'string').map((token) => token.text)).toEqual(['"a \\"b\\""', '"dos"']);
    expect(tokens.filter((token) => token.type === 'number').map((token) => token.text)).toEqual(['-1.5', '1']);
    expect(tokens.filter((token) => token.type === 'literal').map((token) => token.text)).toEqual(['true', 'null']);
    expect(tokenizeJson('no es json').map((token) => token.text).join('')).toBe('no es json');
  });
});
