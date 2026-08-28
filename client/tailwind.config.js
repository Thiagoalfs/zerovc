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
          darkest: '#1e1f22',
          darker: '#2b2d31',
          dark: '#313338',
          light: '#383a40',
        },
        brand: {
          500: '#5865F2',
          600: '#4752C4',
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
