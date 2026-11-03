import {
  siAngular, siApachekafka, siCloudflare, siFlutter, siGo, siGooglebigquery, siGrafana, siKeycloak, siKong, siKotlin, siMongodb, siNestjs,
  siNextdotjs, siNginx, siOpensearch, siOpentelemetry, siPostgresql, siReact, siRedis, siSpringboot, siStripe, siSwift, siVault,
} from 'simple-icons';
import { TECH_ICONS, TechIconKey } from '../../../../shared/ui/tech-icons';
import { CloudProviderId } from '../cloud-topology.data';
import { BrandLogo, REQUIRED_ATTRIBUTIONS, logo } from '../system/system-icons';

/**
 * Logos del Estudio de Aplicación (flag `studio.app-canvas`), según la tecnología que dice cada
 * pieza. Misma decisión del autor que `system-icons.ts` (docs/brand-usage.md): identifican la
 * tecnología, siempre junto a su nombre y con el aviso de marcas bajo el lienzo. Si una marca pide
 * retirarlo, se quita de aquí y la pieza vuelve a su símbolo genérico.
 */
export interface PieceLogo {
  title: string;
  /** Trazado de Simple Icons, en el color de su marca. */
  path?: string;
  color?: string;
  /** Icono oficial de arquitectura, sin modificar: se pinta como imagen. */
  image?: string;
  /** Clave de la frase de atribución que pide la marca, si la pide. */
  attribution?: string;
}

const brand = (source: BrandLogo, attribution?: string): PieceLogo => ({ title: source.title, path: source.path, color: source.color, ...(attribution ? { attribution } : {}) });

/** De lo más concreto a lo más general: «Next.js» no debe caer en «React». */
const BRANDS: readonly [RegExp, PieceLogo][] = [
  [/next/, brand(logo(siNextdotjs))],
  [/angular/, brand(logo(siAngular))],
  [/react/, brand(logo(siReact))],
  [/flutter/, brand(logo(siFlutter))],
  [/swift/, brand(logo(siSwift))],
  [/kotlin/, brand(logo(siKotlin))],
  [/kong/, brand(logo(siKong))],
  [/nest/, brand(logo(siNestjs))],
  [/nginx/, brand(logo(siNginx))],
  [/spring/, brand(logo(siSpringboot), 'spring-boot')],
  [/^go\b/, brand(logo(siGo))],
  [/postgres/, brand(logo(siPostgresql), 'postgresql')],
  [/mongo/, brand(logo(siMongodb))],
  [/redis/, brand(logo(siRedis), 'redis')],
  [/opensearch/, brand(logo(siOpensearch))],
  [/bigquery/, brand(logo(siGooglebigquery))],
  [/kafka/, brand(logo(siApachekafka))],
  [/keycloak/, brand(logo(siKeycloak))],
  [/vault/, brand(logo(siVault))],
  [/grafana/, brand(logo(siGrafana))],
  [/opentelemetry/, brand(logo(siOpentelemetry))],
  [/stripe/, brand(logo(siStripe))],
  [/cloudflare/, brand(logo(siCloudflare))],
];

/** Servicios de una nube: su icono oficial de arquitectura, y solo en un diseño de esa nube. */
const CLOUD_SERVICES: readonly [RegExp, TechIconKey][] = [
  [/cloudfront/, 'awsCloudFront'], [/\bwaf\b/, 'awsWaf'], [/^alb$|load balanc/, 'awsElb'], [/lambda/, 'awsLambda'],
  [/^s3$|amazon s3/, 'awsS3'], [/\bsqs\b/, 'awsSqs'], [/\bsns\b/, 'awsSns'], [/route ?53/, 'awsRoute53'], [/api gateway/, 'awsApiGateway'],
];

/** Logo de la tecnología de una pieza en esta nube; `null` si no tiene (queda su símbolo genérico). */
export function logoFor(tech: string, provider: CloudProviderId): PieceLogo | null {
  const text = tech.trim().toLowerCase();
  const service = CLOUD_SERVICES.find(([pattern]) => pattern.test(text));
  if (service) {
    const icon = TECH_ICONS[service[1]];
    return icon.family === provider ? { title: icon.title, image: icon.image } : null;
  }
  return BRANDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** Frases de atribución que piden las marcas de estos logos, sin repetir. */
export function attributionsFor(logos: (PieceLogo | null)[]): string[] {
  const keys = new Set(logos.flatMap((item) => (item?.attribution ? [item.attribution] : [])));
  return [...keys].map((key) => REQUIRED_ATTRIBUTIONS[key]);
}
