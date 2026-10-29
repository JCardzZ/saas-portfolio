// Decisiones de arquitectura (docs/adr): de los Markdown con cabecera a los datos que pinta /decisiones.

export const AREAS = ['Arquitectura', 'API', 'Infraestructura', 'Datos', 'Resiliencia', 'IA', 'Entrega', 'Producto'];
/** Las áreas en inglés, en el mismo orden: el sitio filtra por un id común. */
export const AREAS_EN = ['Architecture', 'API', 'Infrastructure', 'Data', 'Resilience', 'AI', 'Delivery', 'Product'];
const AREA_IDS = ['architecture', 'api', 'infrastructure', 'data', 'resilience', 'ai', 'delivery', 'product'];
const REQUIRED = ['number', 'slug', 'title', 'status', 'date', 'area', 'summary', 'gains', 'costs', 'revisit'];
const SECTIONS = { context: ['Contexto', 'Context'], options: ['Opciones', 'Options'], decision: ['Decisión', 'Decision'], consequences: ['Consecuencias', 'Consequences'], revisit: ['Cuándo revisarla', 'When to revisit'] };

/** Cabecera `clave: valor` entre `---` y el cuerpo en Markdown. */
export function parseAdr(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!match) throw new Error(`${file}: falta la cabecera entre ---`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const key of REQUIRED) if (!meta[key]) throw new Error(`${file}: falta «${key}» en la cabecera`);
  if (!/^\d{4}$/.test(meta.number)) throw new Error(`${file}: «number» debe tener 4 cifras`);
  if (!/^\d{4}-\d{2}$/.test(meta.date)) throw new Error(`${file}: «date» debe ser AAAA-MM`);
  const areaIndex = Math.max(AREAS.indexOf(meta.area), AREAS_EN.indexOf(meta.area));
  if (areaIndex < 0) throw new Error(`${file}: área desconocida «${meta.area}»`);
  const sections = splitSections(match[2], file);
  const { gainsDetail, costsDetail, rest } = splitTradeoffs(sections.consequences, file);
  sections.consequences = rest;
  return {
    number: meta.number, slug: meta.slug, title: meta.title, status: meta.status, date: meta.date,
    area: AREA_IDS[areaIndex], summary: meta.summary, gains: meta.gains, costs: meta.costs, revisit: meta.revisit,
    evidence: (meta.evidence ?? '').split(',').map((path) => path.trim()).filter(Boolean),
    gainsDetail, costsDetail, sections,
  };
}

/** Las consecuencias se escriben como «**Gana:** …» y «**Cuesta:** …»: cada una va a su tarjeta. */
function splitTradeoffs(consequences, file) {
  const paragraphs = consequences.split(/\n{2,}/);
  const take = (labels) => {
    const index = paragraphs.findIndex((paragraph) => labels.some((label) => paragraph.startsWith(`**${label}:**`)));
    if (index < 0) throw new Error(`${file}: las consecuencias necesitan «**${labels[0]}:**»`);
    const [paragraph] = paragraphs.splice(index, 1);
    const text = paragraph.replace(/^\*\*[^*]+:\*\*\s*/, '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const gainsDetail = take(['Gana', 'Gains']);
  const costsDetail = take(['Cuesta', 'Costs']);
  return { gainsDetail, costsDetail, rest: paragraphs.join('\n\n').trim() };
}

/** Parte el cuerpo por sus secciones `##`; las cinco son obligatorias para que una decisión esté completa. */
function splitSections(body, file) {
  const out = {};
  const parts = body.split(/^## +/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    const heading = part.slice(0, newline).trim();
    const key = Object.keys(SECTIONS).find((name) => SECTIONS[name].includes(heading));
    if (key) out[key] = unwrap(part.slice(newline + 1).trim());
  }
  for (const key of Object.keys(SECTIONS)) if (out[key] === undefined) throw new Error(`${file}: falta la sección «${SECTIONS[key][0]}»`);
  return out;
}

/**
 * Une las líneas de cada párrafo: los archivos se escriben a 100 columnas, pero el sitio renderiza
 * con saltos de línea literales. Tablas, listas, citas, títulos y bloques de código no se tocan.
 */
export function unwrap(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let fence = false;
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const structural = fence || /^```/.test(line) || line.trim() === '' || /^\s*([|>#]|[-*] |\d+\. )/.test(line);
    const previous = out[out.length - 1];
    const previousIsProse = previous !== undefined && previous.trim() !== '' && !/^\s*([|>#]|[-*] |\d+\. |```)/.test(previous);
    if (!structural && previousIsProse && !fence) out[out.length - 1] = `${previous} ${line.trim()}`;
    else out.push(line);
  }
  return out.join('\n');
}

/** Junta las dos lenguas por número y comprueba que cuentan lo mismo (mismo número, slug y área). */
export function pairAdrs(es, en) {
  const byNumber = new Map(en.map((adr) => [adr.number, adr]));
  if (es.length !== en.length) throw new Error(`Hay ${es.length} ADR en español y ${en.length} en inglés.`);
  return es.sort((a, b) => a.number.localeCompare(b.number)).map((adr) => {
    const other = byNumber.get(adr.number);
    if (!other) throw new Error(`Falta la versión en inglés del ADR ${adr.number}.`);
    if (other.slug !== adr.slug || other.area !== adr.area) throw new Error(`El ADR ${adr.number} no coincide entre idiomas (slug o área).`);
    return { number: adr.number, slug: adr.slug, date: adr.date, area: adr.area, evidence: adr.evidence, es: localized(adr), en: localized(other) };
  });
}

function localized(adr) {
  const { title, status, summary, gains, costs, revisit, gainsDetail, costsDetail, sections } = adr;
  return { title, status, summary, gains, costs, revisit, gainsDetail, costsDetail, sections };
}
