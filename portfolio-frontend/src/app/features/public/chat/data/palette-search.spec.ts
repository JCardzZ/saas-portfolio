import { PaletteEntry, editDistance, fold, scoreEntry, searchPalette } from './palette-search';

const ENTRIES: PaletteEntry[] = [
  { id: 's-tec', group: 'secciones', title: 'Tecnologías', text: 'Tecnologías y stack', target: 'tecnologias' },
  { id: 's-cloud', group: 'secciones', title: 'Cloud', text: 'Estudio de arquitectura multi-cloud', target: 'cloud' },
  { id: 's-pro', group: 'secciones', title: 'Proyectos', text: 'Proyectos del portafolio', target: 'proyectos' },
  { id: 'p-1', group: 'proyectos', title: 'Plataforma de pagos', text: 'Pagos con idempotencia sobre Kubernetes', target: 'proyecto-1' },
  { id: 'p-2', group: 'proyectos', title: 'Portal electoral', text: 'Resultados en tiempo real', target: 'proyecto-2' },
  { id: 't-k8s', group: 'tecnologias', title: 'Kubernetes', text: 'Infraestructura', target: 'tecnologias' },
  { id: 't-pg', group: 'tecnologias', title: 'PostgreSQL', text: 'Bases de datos', target: 'tecnologias' },
  { id: 'pl-cdc', group: 'plantillas', title: 'CDC en tiempo real', text: 'OLTP → CDC → almacén de datos', target: 'cloud' },
  { id: 'a-1', group: 'articulos', title: 'Caché que no tumba la API', text: 'Redis best-effort', target: 'articulos' },
];

const ids = (query: string, scope: Parameters<typeof searchPalette>[2] = null): string[] =>
  searchPalette(ENTRIES, query, scope).flatMap((group) => group.entries.map((entry) => entry.id));

describe('palette search', () => {
  it('ignores accents and case', () => {
    expect(fold('Tecnologías ÁÉÍÓÚ Ü')).toBe('tecnologias aeiou u');
    expect(ids('tecnologias')).toContain('s-tec');
    expect(ids('TECNOLOGÍAS')).toContain('s-tec');
    expect(ids('cache')).toEqual(['a-1']);
  });

  it('forgives a small typo in a long word but not in a short one', () => {
    expect(editDistance('kuberntes', 'kubernetes')).toBe(1);
    expect(editDistance('postgers', 'postgres')).toBe(1);
    expect(ids('kuberntes')).toContain('t-k8s');
    expect(ids('postgers')).toEqual(['t-pg']);
    expect(ids('proyetcos')).toContain('s-pro');
    // Tres letras con una cambiada encajarían con cualquier cosa: no se perdona.
    expect(ids('cdx')).toEqual([]);
  });

  it('matches while the word is still being typed', () => {
    expect(ids('kub')).toEqual(['p-1', 't-k8s']);
    expect(ids('elect')).toEqual(['p-2']);
  });

  it('needs every word typed to appear in the entry', () => {
    expect(ids('pagos kubernetes')).toEqual(['p-1']);
    expect(ids('pagos electoral')).toEqual([]);
  });

  it('ranks a match in the title above one in the secondary text', () => {
    const kubernetes = ENTRIES.find((entry) => entry.id === 't-k8s')!;
    const payments = ENTRIES.find((entry) => entry.id === 'p-1')!;
    expect(scoreEntry(kubernetes, 'kubernetes')).toBeGreaterThan(scoreEntry(payments, 'kubernetes'));
  });

  it('groups the results in a fixed order and returns nothing for an empty query', () => {
    expect(searchPalette(ENTRIES, 'tiempo real').map((group) => group.label)).toEqual(['Proyectos', 'Plantillas']);
    expect(searchPalette(ENTRIES, '   ')).toEqual([]);
  });

  it('limits a scoped search to its group plus the section it belongs to', () => {
    expect(ids('', 'proyectos')).toEqual(['s-pro', 'p-1', 'p-2']);
    expect(ids('', 'plantillas')).toEqual(['s-cloud', 'pl-cdc']);
    expect(ids('electoral', 'proyectos')).toEqual(['p-2']);
    expect(ids('kubernetes', 'plantillas')).toEqual([]);
  });

  it('shows at most five results per group in an open search', () => {
    const many: PaletteEntry[] = Array.from({ length: 9 }, (_, index) => (
      { id: `t-${index}`, group: 'tecnologias', title: `Spring módulo ${index}`, text: '', target: 'tecnologias' }));
    expect(searchPalette(many, 'spring')[0].entries.length).toBe(5);
    expect(searchPalette(many, '', 'tecnologias')[0].entries.length).toBe(9);
  });
});
