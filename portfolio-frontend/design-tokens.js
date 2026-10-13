// Tokens del sistema de diseño del sitio público (docs/DESIGN.md). Única fuente: de aquí salen las
// utilidades de Tailwind y las variables CSS de :root (tailwind.config.js), y lo que comprueba
// tools/lib/design-tokens.test.mjs (contraste AA, mínimo de 12 px, rejilla de 4/8 px).

/**
 * Dos temas con las mismas claves. El oscuro es el de siempre (negro, «terminal») y el claro, una
 * galería gris clara; los une el mismo acento lima. `accent.on` es el texto sobre `accent.solid`.
 * Las utilidades de Tailwind leen variables CSS, así que cambiar de tema es cambiar las variables.
 */
const themes = {
  dark: {
    canvas: '#000000',
    surface: { 1: '#0C0E0D', 2: '#151816', 3: '#1E2320' },
    line: { subtle: '#232824', strong: '#3A423C', control: '#6B766E' },
    ink: { 1: '#EEF6EC', 2: '#A9B4AA', 3: '#88938A', disabled: '#566059' },
    accent: { text: '#8FF06F', solid: '#7FEE64', 'solid-hover': '#9AF283', on: '#07120A' },
    status: { ok: '#4ADE9A', warn: '#F5B94A', danger: '#FF7B7B' },
  },
  light: {
    canvas: '#ECEDEA',
    surface: { 1: '#F5F5F2', 2: '#FFFFFF', 3: '#E4E6E1' },
    line: { subtle: '#D8DBD4', strong: '#B9BEB4', control: '#737A70' },
    ink: { 1: '#0B0D0B', 2: '#454B44', 3: '#575E56', disabled: '#9AA097' },
    accent: { text: '#2C6B1A', solid: '#7FEE64', 'solid-hover': '#6CDB51', on: '#07120A' },
    status: { ok: '#17703F', warn: '#8A4D00', danger: '#B3261E' },
  },
};

/** Paleta del tema oscuro: la de referencia para lo que no depende del tema. */
const color = themes.dark;

/** Sombra de lo que flota, por tema: sobre negro hace falta más. */
const shadows = {
  dark: { floating: '0 16px 40px rgb(0 0 0 / 0.6)' },
  light: { floating: '0 16px 40px rgb(16 24 16 / 0.14)' },
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

/** En Tailwind la sombra lee su variable: cambia con el tema. */
const shadow = { floating: 'var(--shadow-floating)' };

const duration = { fast: 120, base: 200, slow: 320, layout: 480 };

const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const layer = { nav: 40, 'focus-backdrop': 42, 'focus-card': 43, theater: 45, dialog: 50 };

const rem = (px) => `${px / 16}rem`;

const flat = (palette) => {
  const out = {};
  for (const [group, value] of Object.entries(palette)) {
    if (typeof value === 'string') out[group] = value;
    else for (const [step, hex] of Object.entries(value)) out[`${group}-${step}`] = hex;
  }
  return out;
};

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(' ');

/**
 * Variables de color de un tema. `--c-<token>` son los canales («r g b», para que Tailwind pueda
 * añadir opacidad) y las de siempre (`--bg-surface-1`, `--text-3`…) el color entero, para el CSS
 * escrito a mano y los SVG.
 */
function themeVariables(name) {
  const palette = themes[name];
  const vars = { 'color-scheme': name, '--shadow-floating': shadows[name].floating };
  for (const [token, hex] of Object.entries(flat(palette))) vars[`--c-${token}`] = rgb(hex);
  vars['--bg-canvas'] = palette.canvas;
  for (const [step, value] of Object.entries(palette.surface)) vars[`--bg-surface-${step}`] = value;
  for (const [key, value] of Object.entries(palette.line)) vars[`--border-${key}`] = value;
  for (const [key, value] of Object.entries(palette.ink)) vars[`--text-${key}`] = value;
  for (const [key, value] of Object.entries(palette.accent)) vars[`--accent-${key}`] = value;
  for (const [key, value] of Object.entries(palette.status)) vars[`--status-${key}`] = value;
  return vars;
}

/** Variables CSS de :root: las del tema oscuro más las que no dependen del tema. */
function cssVariables() {
  const vars = {
    ...themeVariables('dark'),
    '--font-sans': fontFamily.sans.join(', '),
    '--font-mono': fontFamily.mono.join(', '),
  };
  for (const [name, value] of Object.entries(radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(duration)) vars[`--duration-${name}`] = `${value}ms`;
  for (const [name, value] of Object.entries(easing)) vars[`--ease-${name}`] = value;
  return vars;
}

/** Colores de Tailwind: cada token lee su variable, con la opacidad que pida la clase. */
function tailwindColors() {
  const out = {};
  for (const [group, value] of Object.entries(color)) {
    if (typeof value === 'string') {
      out[group] = `rgb(var(--c-${group}) / <alpha-value>)`;
    } else {
      out[group] = Object.fromEntries(Object.keys(value).map((step) => [step, `rgb(var(--c-${group}-${step}) / <alpha-value>)`]));
    }
  }
  return out;
}

/** La parte de `theme.extend` de Tailwind que sale de los tokens. */
function tailwindTheme() {
  return {
    fontFamily,
    colors: tailwindColors(),
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

module.exports = { themes, color, shadows, themeVariables, badgeTint, fontFamily, type, space, radius, shadow, duration, easing, layer, cssVariables, tailwindTheme };
