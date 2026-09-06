/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          darkest: 'rgb(var(--bg-darkest) / <alpha-value>)',
          darker: 'rgb(var(--bg-darker) / <alpha-value>)',
          dark: 'rgb(var(--bg-dark) / <alpha-value>)',
          light: 'rgb(var(--bg-light) / <alpha-value>)',
        },
        brand: {
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
        },
        online: '#23a55a',
        idle: '#f0b232',
        dnd: '#f23f43',
        offline: '#80848e',
      },
    },
  },
  plugins: [],
};
