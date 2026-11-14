/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: {
          950: '#03060f',
          900: '#050b1a',
          800: '#081326',
          700: '#0c1d38',
          600: '#112a4d',
          500: '#173b6b',
          400: '#1f5093',
          300: '#2a6bc4',
          200: '#4a93e0',
          100: '#7fb8f0',
          50: '#c4e0ff',
        },
        foam: {
          50: '#eef7fb',
          100: '#d4ecf5',
          200: '#a8d9eb',
          300: '#6fbcd9',
          400: '#3f9bc0',
          500: '#24789f',
          600: '#195f80',
          700: '#134962',
          800: '#0e3548',
          900: '#09232f',
        },
        coral: {
          400: '#ff8c6b',
          500: '#f06848',
          600: '#d04a2c',
        },
        pearl: '#e8f1f8',
        muted: '#8ba3bd',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        'read-inter': ['"Inter"', 'system-ui', 'sans-serif'],
        'read-lexend': ['"Lexend"', 'system-ui', 'sans-serif'],
        'read-atkinson': ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        'read-comic': ['"Comic Neue"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'wave-slow': 'wave 18s ease-in-out infinite',
        'drift': 'drift 12s ease-in-out infinite',
        'fade-in-up': 'fadeInUp 0.8s ease-out both',
        'fade-in': 'fadeIn 1s ease-out both',
        'pulse-glow': 'pulseGlow 4s ease-in-out infinite',
        'shimmer': 'shimmer 3s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'translateY(0) scaleX(1)' },
          '50%': { transform: 'translateY(-12px) scaleX(1.02)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(20px, -10px)' },
          '66%': { transform: 'translate(-15px, 8px)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
