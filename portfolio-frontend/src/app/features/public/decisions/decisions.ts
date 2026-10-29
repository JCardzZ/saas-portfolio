import type { Localized } from '../../../core/i18n/language.service';
import data from './generated/adrs.json';

/** Una decisión de arquitectura (docs/adr), en los dos idiomas. La genera tools/generate-adr-data.mjs. */
export interface AdrText {
  title: string;
  status: string;
  summary: string;
  gains: string;
  costs: string;
  revisit: string;
  /** «Gana» y «Cuesta» completos, de las consecuencias del ADR. */
  gainsDetail: string;
  costsDetail: string;
  sections: { context: string; options: string; decision: string; consequences: string; revisit: string };
}

export interface Adr {
  number: string;
  slug: string;
  date: string;
  area: AreaId;
  evidence: string[];
  es: AdrText;
  en: AdrText;
}

export type AreaId = 'architecture' | 'api' | 'infrastructure' | 'data' | 'resilience' | 'ai' | 'delivery' | 'product';

export const ADRS = data as Adr[];
export const REPOSITORY_URL = 'https://github.com/JCardzZ/saas-portfolio';

/** Nombre e icono de cada área (trazo de 24 × 24, en el estilo de los iconos del sitio). */
export const AREAS: Record<AreaId, { label: Localized; icon: string }> = {
  architecture: { label: { es: 'Arquitectura', en: 'Architecture' }, icon: 'M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5L12 2.5zM12 8.5 8.75 10.4v3.2L12 15.5l3.25-1.9v-3.2L12 8.5z' },
  api: { label: { es: 'API', en: 'API' }, icon: 'M8 4c-2 0-3 1-3 3v2.5c0 1-.75 2-2 2.5 1.25.5 2 1.5 2 2.5V17c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2.5c0 1 .75 2 2 2.5-1.25.5-2 1.5-2 2.5V17c0 2-1 3-3 3M10 12h4' },
  infrastructure: { label: { es: 'Infraestructura', en: 'Infrastructure' }, icon: 'M6.5 18.5h11a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.4 9.1 4.75 4.75 0 0 0 6.5 18.5zM9 15h6' },
  data: { label: { es: 'Datos', en: 'Data' }, icon: 'M4.5 6c0-1.66 3.36-3 7.5-3s7.5 1.34 7.5 3-3.36 3-7.5 3-7.5-1.34-7.5-3zm0 0v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3' },
  resilience: { label: { es: 'Resiliencia', en: 'Resilience' }, icon: 'M12 2.75 4.5 5.5v6c0 4.6 3.1 8.4 7.5 9.75 4.4-1.35 7.5-5.15 7.5-9.75v-6L12 2.75zM8.75 12l2.25 2.25 4.25-4.5' },
  ai: { label: { es: 'IA', en: 'AI' }, icon: 'M12 3c.55 3.9 2.1 5.45 6 6-3.9.55-5.45 2.1-6 6-.55-3.9-2.1-5.45-6-6 3.9-.55 5.45-2.1 6-6zM18.5 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z' },
  delivery: { label: { es: 'Entrega', en: 'Delivery' }, icon: 'M14.5 4.5c2.5-.9 4.4-.9 5-.4.5.6.5 2.5-.4 5l-5.6 5.6-4.2-4.2 5.2-6zM9.3 10.5 6 10.6 3.5 13l3.75.9M13.5 14.7l-.1 3.3L11 20.5l-.9-3.75M6.5 17.5l-2 2' },
  product: { label: { es: 'Producto', en: 'Product' }, icon: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zm8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
};

/** «Aceptada», «Accepted»… → tono del distintivo. */
export function statusTone(status: string): 'ok' | 'warn' | 'muted' {
  if (/^(aceptada|accepted)$/i.test(status)) return 'ok';
  if (/^(propuesta|proposed)$/i.test(status)) return 'warn';
  return 'muted';
}

/** Lo que busca el visitante: en título, resumen, ganancias, costes y área, sin acentos ni mayúsculas. */
export function matchesQuery(adr: Adr, text: AdrText, area: string, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return true;
  return normalize([adr.number, text.title, text.summary, text.gains, text.costs, area].join(' ')).includes(needle);
}

/** ADR que se citan en el texto de otro («ADR 0004»), para enlazarlos como relacionados. */
export function relatedAdrs(adr: Adr, text: AdrText): Adr[] {
  const body = [...Object.values(text.sections), text.gainsDetail, text.costsDetail].join(' ');
  const cited = new Set([...body.matchAll(/ADR (\d{4})/g)].map((match) => match[1]));
  return ADRS.filter((other) => other.number !== adr.number && cited.has(other.number));
}

/** Enlace al archivo en GitHub (rama main). */
export const evidenceUrl = (path: string) => `${REPOSITORY_URL}/blob/main/${path}`;
export const sourceUrl = (adr: Adr, lang: 'es' | 'en') => evidenceUrl(`docs/adr/${lang}/${adr.number}-${adr.slug}.md`);
