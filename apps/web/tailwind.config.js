/** @type {import('tailwindcss').Config} */

// Every colour resolves through a CSS variable holding space-separated RGB
// channels, so a single `.dark` class flips the whole product between the
// light and dark design systems. Keeping the original token NAMES (gov, gold,
// slate, emerald, rose, amber, sky) means existing components stay valid and
// become theme-aware without being rewritten.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces (page -> raised -> sunken) and structural lines
        gov: {
          950: v('--surface-sunken'),
          900: v('--surface-page'),
          850: v('--surface-1'),
          800: v('--surface-2'),
          700: v('--surface-3'),
          600: v('--surface-4'),
          500: v('--surface-5'),
        },
        // Brand accent: a restrained professional indigo/blue
        gold: {
          600: v('--accent-600'),
          500: v('--accent-500'),
          400: v('--accent-400'),
          300: v('--accent-300'),
        },
        brand: {
          600: v('--accent-600'),
          500: v('--accent-500'),
          400: v('--accent-400'),
          300: v('--accent-300'),
        },
        // Text + border ramp. In light mode this ramp is inverted so that
        // `text-slate-100` stays "primary text" and `border-slate-800` stays
        // "a visible hairline" in both themes.
        slate: {
          50: v('--n-50'),
          100: v('--n-100'),
          200: v('--n-200'),
          300: v('--n-300'),
          400: v('--n-400'),
          500: v('--n-500'),
          600: v('--n-600'),
          700: v('--n-700'),
          800: v('--n-800'),
          900: v('--n-900'),
          950: v('--n-950'),
        },
        emerald: {
          300: v('--pass-300'),
          400: v('--pass-400'),
          500: v('--pass-500'),
          600: v('--pass-600'),
          950: v('--pass-950'),
        },
        rose: {
          300: v('--fail-300'),
          400: v('--fail-400'),
          500: v('--fail-500'),
          600: v('--fail-600'),
          950: v('--fail-950'),
        },
        red: {
          400: v('--fail-400'),
          500: v('--fail-500'),
        },
        amber: {
          300: v('--warn-300'),
          400: v('--warn-400'),
          500: v('--warn-500'),
          600: v('--warn-600'),
          950: v('--warn-950'),
        },
        sky: {
          300: v('--info-300'),
          400: v('--info-400'),
          500: v('--info-500'),
        },
        blue: {
          500: v('--accent-500'),
          600: v('--accent-600'),
          700: v('--accent-700'),
        },
        teal: {
          500: v('--pass-500'),
          600: v('--pass-600'),
        },
        verdict: {
          pass: v('--pass-500'),
          fail: v('--fail-500'),
          review: v('--warn-500'),
          na: v('--n-500'),
        },
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(var(--shadow-color) / 0.05)',
        sm: '0 1px 3px 0 rgb(var(--shadow-color) / 0.08), 0 1px 2px -1px rgb(var(--shadow-color) / 0.06)',
        DEFAULT: '0 1px 3px 0 rgb(var(--shadow-color) / 0.08), 0 1px 2px -1px rgb(var(--shadow-color) / 0.06)',
        md: '0 4px 8px -2px rgb(var(--shadow-color) / 0.10), 0 2px 4px -2px rgb(var(--shadow-color) / 0.06)',
        lg: '0 10px 20px -5px rgb(var(--shadow-color) / 0.12), 0 4px 8px -4px rgb(var(--shadow-color) / 0.07)',
        xl: '0 18px 32px -10px rgb(var(--shadow-color) / 0.16)',
        '2xl': '0 24px 48px -12px rgb(var(--shadow-color) / 0.22)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'fade-in-up': 'fade-in-up 200ms ease-out',
        'scale-in': 'scale-in 140ms ease-out',
        'slide-down': 'slide-down 160ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}
