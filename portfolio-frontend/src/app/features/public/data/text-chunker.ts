export interface TextChunk {
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Trocea por líneas completas conservando el rango de líneas, con el mismo algoritmo que
 * `TextChunker.java` en el backend (allí con 60 líneas y 1800 caracteres por fragmento).
 */
export function chunkText(text: string, maxLines: number, maxChars: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  const lines = text.split('\n');
  let current: string[] = [];
  let currentLength = 0;
  let startLine = 1;

  const flush = (endLine: number) => {
    const content = current.join('\n');
    if (content.trim()) {
      chunks.push({ content, startLine, endLine });
    }
    current = [];
    currentLength = 0;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Una línea más larga que un fragmento entero se parte por caracteres.
    if (line.length > maxChars) {
      flush(lineNumber - 1);
      for (let offset = 0; offset < line.length; offset += maxChars) {
        chunks.push({ content: line.slice(offset, offset + maxChars), startLine: lineNumber, endLine: lineNumber });
      }
      startLine = lineNumber + 1;
      return;
    }

    const full = current.length >= maxLines || currentLength + line.length + 1 > maxChars;
    if (full && current.length > 0) {
      flush(lineNumber - 1);
      startLine = lineNumber;
    }
    current.push(line);
    currentLength += line.length + 1;
  });
  flush(lines.length);
  return chunks;
}

/**
 * Vector ilustrativo derivado de un hash del texto: mismo texto, mismo vector. NO es un
 * embedding semántico; solo muestra la forma del dato que devolvería el modelo.
 */
export function illustrativeEmbedding(text: string, dimensions: number): number[] {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) {
    seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  }
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const raw = Array.from({ length: dimensions }, () => random() * 2 - 1);
  const peak = Math.max(...raw.map(Math.abs)) || 1;
  return raw.map((value) => value / peak);
}
