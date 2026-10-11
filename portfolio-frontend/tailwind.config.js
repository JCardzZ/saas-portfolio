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
      colors: {
        ...theme.colors,
        // `accent` y `accent-hover` son el azul anterior al sistema de diseño: siguen hasta que cada
        // vista pase a `accent-text` / `accent-solid` (fases 2 a 5 de docs/DESIGN.md).
        accent: { ...theme.colors.accent, DEFAULT: '#0a84ff', hover: '#409cff' },
      },
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
        typing: {
          '0%, 60%, 100%': { opacity: '0.25', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-3px)' },
        },
      },
      animation: {
        'fade-in': `fadeIn 0.4s ${spring} backwards`,
        'slide-up': `slideUp 0.55s ${spring} backwards`,
        'scale-up': `scaleUp 0.4s ${spring} backwards`,
        typing: 'typing 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // Los mismos tokens como variables CSS, para SVG y estilos de componente.
    plugin(({ addBase }) => addBase({ ':root': tokens.cssVariables() })),
  ],
};
