// Cuenta lo que el sistema de diseño (docs/DESIGN.md) no admite en la vista pública: clases de
// color fuera de los tokens, texto de menos de 12 px, radios fuera de escala y hex sueltos.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Carpetas de la vista pública. La administración (clara) queda fuera. */
export const SCOPES = ['src/app/features/public', 'src/app/shared/ui'];
export const EXTRA_FILES = ['src/app/app.component.ts'];

// Datos, no estilo: colores de marca de los iconos y catálogos.
// `alert.component.ts` es de la administración, que es clara.
const SKIPPED = (name) => name.endsWith('.spec.ts') || name === 'tech-icons.ts' || name === 'alert.component.ts' || name.endsWith('.data.ts') || name.endsWith('.json');

const TOKEN = String.raw`(?<![\w/\-\[\].#])`;
const PATTERNS = {
  /** Paleta de Tailwind en vez de tokens (text-zinc-400, bg-emerald-400/10…). */
  rawPalette: new RegExp(TOKEN + String.raw`(?:text|bg|border|ring|divide|placeholder|outline|fill|stroke)-(?:zinc|slate|gray|neutral|emerald|red|amber|sky|violet|teal|indigo|blue|green|yellow|orange|purple|pink)-\d+`, 'g'),
  /** El acento anterior al sistema (bg-accent, text-accent, …-accent-hover). */
  legacyAccent: new RegExp(TOKEN + String.raw`(?:text|bg|border|ring)-accent(?:-hover)?(?![\w-])`, 'g'),
  /** Texto por debajo de 12 px con una clase de Tailwind. */
  smallTextClass: new RegExp(TOKEN + String.raw`text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]`, 'g'),
  /** Radios fuera de la escala (mark, control, panel, card, full). */
  offScaleRadius: new RegExp(TOKEN + String.raw`rounded(?:-[trbl]{1,2})?-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\])(?![\w-])`, 'g'),
  /** Texto por debajo de 12 px en CSS escrito a mano o en un atributo de SVG. */
  smallTextCss: /font-size(?:="|:\s*)(?:(?:[0-9]|1[01])(?:\.\d+)?(?:px)?(?=[";\s])|0?\.(?:[0-6]\d*|7[0-4]\d*)rem)/g,
  /** Colores escritos a mano. */
  hex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
};

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (/\.(ts|html|css)$/.test(name) && !SKIPPED(name)) {
      out.push(path);
    }
  }
  return out;
}

/** @returns {{ totals: Record<string, number>, byFile: Record<string, Record<string, number>> }} */
export function scanDesign(root) {
  const files = [...SCOPES.flatMap((scope) => walk(join(root, scope), [])), ...EXTRA_FILES.map((file) => join(root, file))];
  const totals = Object.fromEntries(Object.keys(PATTERNS).map((key) => [key, 0]));
  const byFile = {};
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const [key, pattern] of Object.entries(PATTERNS)) {
      const count = (text.match(pattern) ?? []).length;
      if (count) {
        totals[key] += count;
        (byFile[relative(root, file)] ??= {})[key] = count;
      }
    }
  }
  return { totals, byFile };
}
