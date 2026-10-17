/** @type {import('tailwindcss').Config} */
let formsPlugin;
try {
  formsPlugin = require('@tailwindcss/forms');
} catch (e) {
  try {
    formsPlugin = require(require.resolve('@tailwindcss/forms', { paths: [__dirname, require('path').join(__dirname, '..')] }));
  } catch (err) {
    formsPlugin = null;
  }
}

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [
    ...(formsPlugin ? [formsPlugin] : []),
  ],
  important: true,
} 