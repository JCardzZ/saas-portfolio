import { SERVICE_CATALOG } from './cloud-catalog.data';
import { CLOUD_NODES, CloudProviderId } from './cloud-topology.data';
import { SERVICE_INFO, localized, serviceDocLinks } from './service-info.data';

const CLOUDS: CloudProviderId[] = ['aws', 'gcp', 'azure', 'oci'];
/** Dominios de documentación oficial de cada nube. */
const OFFICIAL: Record<CloudProviderId, RegExp> = {
  aws: /^https:\/\/docs\.aws\.amazon\.com\//,
  gcp: /^https:\/\/cloud\.google\.com\//,
  azure: /^https:\/\/learn\.microsoft\.com\//,
  oci: /^https:\/\/docs\.oracle\.com\//,
};

/** Cada pieza que puede aparecer en un lienzo: las del catálogo y las de la arquitectura de referencia. */
const PIECES = [
  ...SERVICE_CATALOG.flatMap((category) => category.items.map((item) => ({ type: item.type, service: item.service }))),
  ...CLOUD_NODES.map((node) => ({ type: node.type, service: node.service })),
];

describe('service fact sheets', () => {
  it('describe every service of the catalog and of the reference architecture', () => {
    const missing = [...new Set(PIECES.map((piece) => piece.type))].filter((type) => !SERVICE_INFO[type]);
    expect(missing).withContext('tipos sin ficha en service-info.data.ts').toEqual([]);
  });

  it('say what each one is in one sentence and give two or three uses', () => {
    for (const [type, info] of Object.entries(SERVICE_INFO)) {
      const what = localized(info.what);
      expect(what.length).withContext(`${type}: «qué es»`).toBeGreaterThan(20);
      expect(what.endsWith('.')).withContext(`${type}: «qué es» es una frase`).toBeTrue();
      expect(what.split('. ').length).withContext(`${type}: una sola frase`).toBe(1);
      expect(info.uses.length).withContext(`${type}: usos`).toBeGreaterThanOrEqual(2);
      expect(info.uses.length).withContext(`${type}: usos`).toBeLessThanOrEqual(3);
      for (const use of info.uses) {
        expect(localized(use).trim().length).withContext(`${type}: uso vacío`).toBeGreaterThan(5);
      }
    }
  });

  it('give every cloud service its official name and a link to its official documentation, in the four clouds', () => {
    for (const piece of PIECES.filter((candidate) => typeof candidate.service !== 'string')) {
      const info = SERVICE_INFO[piece.type];
      expect(info.providers).withContext(`${piece.type}: es un servicio de nube y necesita su ficha por nube`).toBeDefined();
      expect(info.product).withContext(`${piece.type}: no es un producto independiente`).toBeUndefined();
      for (const cloud of CLOUDS) {
        const own = info.providers![cloud];
        expect(own).withContext(`${piece.type} en ${cloud}`).toBeDefined();
        expect(own.name.trim().length).withContext(`${piece.type} en ${cloud}: nombre oficial`).toBeGreaterThan(2);
        expect(own.docs).withContext(`${piece.type} en ${cloud}: enlace oficial`).toMatch(OFFICIAL[cloud]);
      }
    }
  });

  it('give every cloud-agnostic product its name and a link to its own documentation', () => {
    for (const piece of PIECES.filter((candidate) => typeof candidate.service === 'string' && candidate.type !== 'users')) {
      const info = SERVICE_INFO[piece.type];
      expect(info.providers).withContext(`${piece.type}: es el mismo producto en cualquier nube`).toBeUndefined();
      expect(info.product?.name.trim().length).withContext(`${piece.type}: nombre`).toBeGreaterThan(2);
      expect(info.product?.docs).withContext(`${piece.type}: enlace`).toMatch(/^https:\/\/[a-z0-9.-]+\//);
    }
    // Los visitantes no son un servicio: no tienen documentación que enlazar.
    expect(SERVICE_INFO['users'].product).toBeUndefined();
  });

  it('use only https links and keep the fact sheets free of orphans', () => {
    const known = new Set(PIECES.map((piece) => piece.type));
    expect(Object.keys(SERVICE_INFO).filter((type) => !known.has(type))).withContext('fichas de tipos que ya no existen').toEqual([]);
    for (const link of serviceDocLinks()) {
      expect(link.docs.startsWith('https://')).withContext(`${link.type}/${link.provider}`).toBeTrue();
    }
  });

  it('fall back to Spanish while a text has no English version', () => {
    expect(localized({ es: 'Hola' }, 'en')).toBe('Hola');
    expect(localized({ es: 'Hola', en: 'Hello' }, 'en')).toBe('Hello');
  });
});
