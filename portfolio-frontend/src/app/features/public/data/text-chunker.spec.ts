import { chunkText, illustrativeEmbedding } from './text-chunker';

describe('chunkText', () => {
  const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n');

  it('keeps short text as one chunk with its line range', () => {
    expect(chunkText('uno\ndos\ntres', 6, 260)).toEqual([{ content: 'uno\ndos\ntres', startLine: 1, endLine: 3 }]);
  });

  it('splits by line count into contiguous ranges that cover every line', () => {
    const text = lines(15);

    const chunks = chunkText(text, 6, 260);

    expect(chunks.map((chunk) => `${chunk.startLine}-${chunk.endLine}`)).toEqual(['1-6', '7-12', '13-15']);
    expect(chunks.map((chunk) => chunk.content).join('\n')).toBe(text);
  });

  it('splits before exceeding the character budget and hard-splits an oversized line', () => {
    const long = 'x'.repeat(100);
    expect(chunkText([long, long, long].join('\n'), 60, 210).map((chunk) => `${chunk.startLine}-${chunk.endLine}`))
      .toEqual(['1-2', '3-3']);

    const chunks = chunkText(`antes\n${'y'.repeat(25)}\ndespués`, 60, 10);
    expect(chunks.map((chunk) => `${chunk.startLine}-${chunk.endLine}`)).toEqual(['1-1', '2-2', '2-2', '2-2', '3-3']);
  });

  it('produces no chunks for blank text', () => {
    expect(chunkText('\n   \n', 6, 260)).toEqual([]);
  });
});

describe('illustrativeEmbedding', () => {
  it('is deterministic, bounded and different for different text', () => {
    const a = illustrativeEmbedding('redis', 48);

    expect(a.length).toBe(48);
    expect(a).toEqual(illustrativeEmbedding('redis', 48));
    expect(a).not.toEqual(illustrativeEmbedding('postgres', 48));
    expect(a.every((value) => value >= -1 && value <= 1)).toBeTrue();
  });
});
