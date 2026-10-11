/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');
const tokens = require('./design-tokens');

const theme = tokens.tailwindTheme();
const spring = tokens.easing.emphasized;

module.exports = {
  darkMode: 'class',
  // Los estilos hover solo se aplican donde existe hover real: en táctil no se quedan "pegados" tras un toque.
  future: { hoverOnlyWhenSupported: true },
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      ...theme,
      // `ease-spring` es el nombre anterior de `ease-emphasized`.
      transitionTimingFunction: { ...theme.transitionTimingFunction, spring },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleUp: {
          from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // Paleta de comandos: los accesos rápidos se despliegan y, en móvil, la hoja baja desde arriba.
        palettePop: { from: { opacity: '0', transform: 'scale(0.8)' }, to: { opacity: '1', transform: 'scale(1)' } },
        sheetDown: { from: { opacity: '0', transform: 'translateY(-24px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        typing: {
          '0%, 60%, 100%': { opacity: '0.25', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-3px)' },
        },
      },
      animation: {
        'fade-in': `fadeIn 0.4s ${spring} backwards`,
        'slide-up': `slideUp 0.55s ${spring} backwards`,
        'scale-up': `scaleUp 0.4s ${spring} backwards`,
        'palette-pop': `palettePop ${tokens.duration.base}ms ${spring} backwards`,
        'sheet-down': `sheetDown ${tokens.duration.slow}ms ${spring} backwards`,
        typing: 'typing 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // Los mismos tokens como variables CSS, para SVG y estilos de componente.
    plugin(({ addBase }) => addBase({ ':root': tokens.cssVariables() })),
  ],
};
