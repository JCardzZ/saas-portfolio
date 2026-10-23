import { askCardColumns, wordsOf } from './landing-page.component';

describe('rejilla de proyectos', () => {
  it('la tarjeta del asistente ocupa las columnas que quedan libres en su fila', () => {
    // Filas de 6 columnas: el primer proyecto ocupa 4 y cada uno de los demás 2.
    for (let projects = 0; projects <= 9; projects++) {
      const cells = [...(projects ? [4] : []), ...Array<number>(Math.max(0, projects - 1)).fill(2), askCardColumns(projects)];
      // La última fila queda completa y la tarjeta cabe en ella.
      expect(cells.reduce((sum, cell) => sum + cell, 0) % 6).withContext(`${projects} proyectos`).toBe(0);
    }
  });
});

describe('letras del hero', () => {
  it('agrupa por palabra para partir solo entre palabras y conserva el índice de cada letra', () => {
    const letters = [...'API PLATFORM'].map((c) => (c === ' ' ? '\u00a0' : c));
    const words = wordsOf(letters);
    expect(words.map((word) => word.map((l) => l.letter).join(''))).toEqual(['API\u00a0', 'PLATFORM']);
    expect(words.flat().map((l) => l.index)).toEqual(letters.map((_, i) => i));
  });
});
