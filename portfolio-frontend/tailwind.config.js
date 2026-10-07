/** @type {import('tailwindcss').Config} */
const spring = 'cubic-bezier(0.16, 1, 0.3, 1)';

module.exports = {
  darkMode: 'class',
  // Los estilos hover solo se aplican donde existe hover real: en táctil no se quedan "pegados" tras un toque.
  future: { hoverOnlyWhenSupported: true },
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        accent: { DEFAULT: '#0a84ff', hover: '#409cff' },
      },
      transitionTimingFunction: { spring },
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
  plugins: [],
};
