import {
  siAngular, siFlutter, siGo, siGraphql, siJsonwebtokens, siKotlin, siMongodb, siNestjs, siNodedotjs, siOpenid, siPostgresql, siReact, siRedis,
  siSpringboot, siSwift,
} from 'simple-icons';

/**
 * Logos de las tecnologías de la vista de Aplicación (trazados de Simple Icons, en el color de su
 * marca). Viven aquí y no en el registro general para que viajen con el Estudio, que se carga
 * bajo demanda, y no en el arranque de la página.
 *
 * Decisión del autor (2026-10-12, docs/brand-usage.md): se muestran para identificar cada
 * tecnología, con un aviso de marcas junto al diagrama, aunque varias guías de marca piden
 * permiso para usar el logo. Siempre van con el nombre en texto al lado.
 */
export interface BrandLogo {
  title: string;
  path: string;
  color: string;
}

/** Color del texto principal (un token): con él se pinta un logo casi negro. */
const LIGHT = 'var(--text-1)';

/** Una marca casi negra no se vería sobre el fondo oscuro: se pinta en blanco. */
function readable(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 70 ? LIGHT : `#${hex}`;
}

const logo = (source: { title: string; hex: string; path: string }, title = source.title): BrandLogo =>
  ({ title, path: source.path, color: readable(source.hex) });

/** Logos de cada opción del catálogo (`SystemOption.id`). Una opción genérica no tiene ninguno. */
export const OPTION_LOGOS: Readonly<Record<string, BrandLogo[]>> = {
  'web-spa': [logo(siAngular), logo(siReact)],
  'mobile-native': [logo(siSwift), logo(siKotlin)],
  'mobile-cross': [logo(siFlutter), logo(siReact, 'React Native')],
  'spring-boot': [logo(siSpringboot)],
  node: [logo(siNodedotjs), logo(siNestjs)],
  go: [logo(siGo)],
  graphql: [logo(siGraphql)],
  'oidc-managed': [logo(siOpenid, 'OpenID Connect')],
  'jwt-own': [logo(siJsonwebtokens, 'JWT')],
  postgresql: [logo(siPostgresql)],
  document: [logo(siMongodb)],
  redis: [logo(siRedis)],
};

/** Aviso que acompaña a los logos. */
export const TRADEMARK_NOTICE =
  'Los logotipos y nombres son marcas de sus respectivos dueños. Se muestran solo para identificar cada tecnología; este sitio no está afiliado a ellos ni cuenta con su patrocinio.';

/** Atribuciones que la política de una marca pide textualmente cuando aparece su logo. */
export const REQUIRED_ATTRIBUTIONS: Readonly<Record<string, string>> = {
  redis: 'Redis is a registered trademark of Redis Ltd. Any rights therein are reserved to Redis Ltd.',
  'spring-boot': 'Spring is a trademark of Broadcom Inc. and/or its subsidiaries.',
  postgresql: 'Postgres, PostgreSQL and the Slonik Logo are trademarks or registered trademarks of the PostgreSQL Community Association of Canada.',
};
