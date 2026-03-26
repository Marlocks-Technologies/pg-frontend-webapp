import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-raleway)', 'Raleway', 'sans-serif'],
      },
      colors: {
        charcoal: '#2C2C2E',
      },
      keyframes: {
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        blink: 'blink 0.8s step-end infinite',
      },
    },
  },
  plugins: [],
  // Safelist the dynamic blink class used in MessageBubble
  safelist: [
    'animate-[blink_0.8s_step-end_infinite]',
  ],
};

export default config;
