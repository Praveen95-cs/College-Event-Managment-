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
        sans: ['"Instrument Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        chrome: '#12110f',
        canvas: '#161513',
        surface: '#1c1a18',
        raised: '#262421',
        ink: {
          primary: '#efe9de',
          secondary: '#aaa398',
          muted: '#8a847a',
        },
        beacon: {
          DEFAULT: '#e09132',
          hover: '#eb9f44',
          text: '#ebb05d',
        },
        positive: '#4cc38a',
        negative: '#e5484d',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [
    ...(formsPlugin ? [formsPlugin] : []),
  ],
  important: true,
} 