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
      // The design system tints ink by opacity in fine steps. Tailwind only
      // generates slash-opacities (text-white/88 etc.) for values on this
      // scale — omitting one silently drops the class and the element
      // inherits its color instead.
      opacity: {
        '3': '0.03',
        '4': '0.04',
        '6': '0.06',
        '7': '0.07',
        '8': '0.08',
        '9': '0.09',
        '12': '0.12',
        '14': '0.14',
        '16': '0.16',
        '18': '0.18',
        '22': '0.22',
        '28': '0.28',
        '32': '0.32',
        '38': '0.38',
        '42': '0.42',
        '48': '0.48',
        '58': '0.58',
        '72': '0.72',
        '78': '0.78',
        '82': '0.82',
        '88': '0.88',
        '92': '0.92',
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
