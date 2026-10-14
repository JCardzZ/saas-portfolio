import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import tokens from '../../design-tokens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { color, badgeTint, type, space, radius, duration } = tokens;

const channels = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** Luminancia relativa y contraste de WCAG 2.1. */
function luminance(hex) {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Un color con transparencia, ya compuesto sobre su fondo. */
function over(foreground, background, alpha) {
  const [f, b] = [channels(foreground), channels(background)];
  return `#${f.map((value, index) => Math.round(value * alpha + b[index] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

for (const [themeName, color] of Object.entries(tokens.themes)) {
  const surfaces = { canvas: color.canvas, 'surface-1': color.surface[1], 'surface-2': color.surface[2], 'surface-3': color.surface[3] };
  const texts = {
    'ink-1': color.ink[1], 'ink-2': color.ink[2], 'ink-3': color.ink[3], 'accent-text': color.accent.text,
    'status-ok': color.status.ok, 'status-warn': color.status.warn, 'status-danger': color.status.danger,
  };

  test(`${themeName}: todo color de texto cumple AA (4,5:1) sobre cualquier superficie`, () => {
    for (const [textName, text] of Object.entries(texts)) {
      for (const [surfaceName, surface] of Object.entries(surfaces)) {
        const ratio = contrast(text, surface);
        assert.ok(ratio >= 4.5, `${textName} sobre ${surfaceName}: ${ratio.toFixed(2)}`);
      }
    }
  });

  test(`${themeName}: el texto del botón primario cumple AA, también en hover`, () => {
    assert.ok(contrast(color.accent.on, color.accent.solid) >= 4.5);
    assert.ok(contrast(color.accent.on, color.accent['solid-hover']) >= 4.5);
  });

  test(`${themeName}: el texto de una insignia de color cumple AA sobre su propio tinte`, () => {
    for (const tone of [color.accent.text, color.status.ok, color.status.warn, color.status.danger]) {
      const background = over(tone, color.surface[2], badgeTint);
      assert.ok(contrast(tone, background) >= 4.5, `${tone} sobre ${background}`);
    }
  });

  test(`${themeName}: el borde de los controles y el anillo de foco se distinguen del fondo (3:1)`, () => {
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      assert.ok(contrast(color.line.control, surface) >= 3, `border-control sobre ${surfaceName}`);
      assert.ok(contrast(color.accent.text, surface) >= 3, `foco sobre ${surfaceName}`);
    }
  });
}

test('los dos temas tienen exactamente los mismos tokens', () => {
  const keys = (palette) => JSON.stringify(Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, typeof v === 'string' ? '' : Object.keys(v)])));
  assert.equal(keys(tokens.themes.light), keys(tokens.themes.dark));
});

test('ningún rol tipográfico baja de 12 px y la interlínea es mayor que el tamaño', () => {
  for (const [role, [size, lineHeight]] of Object.entries(type)) {
    assert.ok(size >= 12, `${role}: ${size} px`);
    assert.ok(lineHeight > size, `${role}: interlínea ${lineHeight} para ${size} px`);
  }
});

test('el espaciado sigue la rejilla de 4/8 px y coincide con la escala de Tailwind', () => {
  for (const [key, px] of Object.entries(space)) {
    assert.equal(px % 4, 0, `space-${key}`);
    assert.equal(px, Number(key) * 4, `space-${key} debe ser la clase ${key} de Tailwind`);
  }
});

test('los radios forman una escala creciente y las duraciones también', () => {
  assert.deepEqual(Object.values(radius), [...Object.values(radius)].sort((a, b) => a - b));
  assert.deepEqual(Object.values(duration), [...Object.values(duration)].sort((a, b) => a - b));
});

test('cada token sale como variable CSS y como utilidad de Tailwind', () => {
  const variables = tokens.cssVariables();
  assert.equal(variables['--bg-surface-1'], color.surface[1]);
  assert.equal(variables['--c-surface-1'], '12 14 13');
  assert.equal(tokens.themeVariables('light')['--bg-surface-2'], '#FFFFFF');
  assert.equal(tokens.tailwindTheme().colors.surface[2], 'rgb(var(--c-surface-2) / <alpha-value>)');
  assert.equal(variables['--text-3'], color.ink[3]);
  assert.equal(variables['--accent-solid-hover'], color.accent['solid-hover']);
  assert.equal(variables['--radius-control'], '8px');
  assert.match(variables['--font-sans'], /^Inter,/);
  const theme = tokens.tailwindTheme();
  assert.deepEqual(theme.fontSize.caption, ['0.75rem', { lineHeight: '1rem', fontWeight: '500', letterSpacing: '0' }]);
  assert.equal(theme.borderRadius.card, '16px');
});

test('las fuentes están en el repositorio, con su licencia, y son las que se precargan', () => {
  const css = readFileSync(join(root, 'src/styles/fonts.css'), 'utf8');
  const files = [...css.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((match) => match[1]);
  assert.equal(files.length, 2);
  for (const file of files) {
    assert.ok(existsSync(join(root, 'public', file)), `falta ${file}`);
    assert.ok(existsSync(join(root, 'public', dirname(file), 'OFL.txt')), `falta la licencia de ${file}`);
    assert.ok(readFileSync(join(root, 'public/fonts/README.md'), 'utf8').includes(file.split('/').pop()), `${file} no está en el README`);
  }
  assert.doesNotMatch(css, /https?:/, 'las fuentes no se cargan de otros orígenes');
  const preload = readFileSync(join(root, 'src/index.html'), 'utf8').match(/rel="preload" href="([^"]+)" as="font"/)?.[1];
  assert.ok(files.includes(preload), 'el preload de index.html debe apuntar a una fuente de fonts.css');
});
