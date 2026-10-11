import { askCardColumns } from './landing-page.component';

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
