/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cyberpunk theme
        cyber: {
          dark: '#0a0a0f',
          darker: '#050508',
          surface: '#12121a',
          border: '#1a1a25',
        },
        neon: {
          cyan: '#00ffff',
          magenta: '#ff0080',
          green: '#00ff41',
          yellow: '#ffff00',
          purple: '#bf00ff',
        }
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'typing': 'typing 1s steps(3) infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 20px currentColor' },
          '50%': { opacity: '0.7', boxShadow: '0 0 40px currentColor' },
        },
        'typing': {
          '0%': { content: '.' },
          '33%': { content: '..' },
          '66%': { content: '...' },
        }
      },
      boxShadow: {
        'neon': '0 0 20px currentColor, 0 0 40px currentColor',
        'neon-sm': '0 0 10px currentColor',
      }
    },
  },
  plugins: [],
}
