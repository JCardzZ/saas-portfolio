// Tokens del sistema de diseño del sitio público (docs/DESIGN.md). Única fuente: de aquí salen las
// utilidades de Tailwind y las variables CSS de :root (tailwind.config.js), y lo que comprueba
// tools/lib/design-tokens.test.mjs (contraste AA, mínimo de 12 px, rejilla de 4/8 px).

const color = {
  canvas: '#000000',
  surface: { 1: '#0E0F12', 2: '#16181D', 3: '#1F2229' },
  line: { subtle: '#23262D', strong: '#3A3F4A', control: '#6B7280' },
  ink: { 1: '#F4F5F7', 2: '#A9AFBA', 3: '#858C99', disabled: '#565C68' },
  accent: { text: '#6FA8FF', solid: '#2F6FE4', 'solid-hover': '#2861CC' },
  status: { ok: '#4ADE9A', warn: '#F5B94A', danger: '#FF7B7B' },
};

/** Porcentaje del color de estado que tiñe el fondo de una insignia, sobre surface-2. */
const badgeTint = 0.14;

const fontFamily = {
  sans: ['Inter', '"Inter Fallback"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
  mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
};

/** Rol → [tamaño, interlínea, peso, tracking], en px. En el CSS salen en rem (16 px = 1 rem). */
const type = {
  display: [64, 68, 600, '-0.025em'],
  'display-sm': [40, 44, 600, '-0.025em'],
  'title-1': [32, 40, 600, '-0.02em'],
  'title-1-sm': [28, 36, 600, '-0.02em'],
  'title-2': [20, 28, 600, '-0.01em'],
  'title-3': [16, 24, 600, '0'],
  'body-lg': [18, 28, 400, '0'],
  body: [16, 24, 400, '0'],
  'body-sm': [14, 20, 400, '0'],
  caption: [12, 16, 500, '0'],
  overline: [12, 16, 500, '0.06em'],
  mono: [13, 20, 400, '0'],
  'mono-sm': [12, 18, 400, '0'],
};

/** Rejilla de 8 px con medio paso de 4. La clave es la de la escala de Tailwind (n × 4 px). */
const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96, 32: 128 };

/** Rectángulo redondeado = acción o contenedor; píldora (full) = estado o etiqueta. */
const radius = { mark: 4, control: 8, panel: 12, card: 16 };

const shadow = { floating: '0 16px 40px rgb(0 0 0 / 0.6)' };

const duration = { fast: 120, base: 200, slow: 320, layout: 480 };

const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const layer = { nav: 40, 'focus-backdrop': 42, 'focus-card': 43, theater: 45, dialog: 50 };

const rem = (px) => `${px / 16}rem`;

/** Variables CSS de :root, para el CSS escrito a mano (SVG, estilos de componente). */
function cssVariables() {
  const vars = {
    '--bg-canvas': color.canvas,
    '--font-sans': fontFamily.sans.join(', '),
    '--font-mono': fontFamily.mono.join(', '),
    '--shadow-floating': shadow.floating,
  };
  for (const [step, value] of Object.entries(color.surface)) vars[`--bg-surface-${step}`] = value;
  for (const [name, value] of Object.entries(color.line)) vars[`--border-${name}`] = value;
  for (const [name, value] of Object.entries(color.ink)) vars[`--text-${name}`] = value;
  for (const [name, value] of Object.entries(color.accent)) vars[`--accent-${name}`] = value;
  for (const [name, value] of Object.entries(color.status)) vars[`--status-${name}`] = value;
  for (const [name, value] of Object.entries(radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(duration)) vars[`--duration-${name}`] = `${value}ms`;
  for (const [name, value] of Object.entries(easing)) vars[`--ease-${name}`] = value;
  return vars;
}

/** La parte de `theme.extend` de Tailwind que sale de los tokens. */
function tailwindTheme() {
  return {
    fontFamily,
    colors: color,
    fontSize: Object.fromEntries(
      Object.entries(type).map(([role, [size, lineHeight, fontWeight, letterSpacing]]) => [
        role,
        [rem(size), { lineHeight: rem(lineHeight), fontWeight: String(fontWeight), letterSpacing }],
      ]),
    ),
    borderRadius: Object.fromEntries(Object.entries(radius).map(([name, value]) => [name, `${value}px`])),
    boxShadow: shadow,
    transitionDuration: Object.fromEntries(Object.entries(duration).map(([name, value]) => [name, `${value}ms`])),
    transitionTimingFunction: easing,
    zIndex: Object.fromEntries(Object.entries(layer).map(([name, value]) => [name, String(value)])),
  };
}

module.exports = { color, badgeTint, fontFamily, type, space, radius, shadow, duration, easing, layer, cssVariables, tailwindTheme };
