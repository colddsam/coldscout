import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import { theme } from './tailwind.theme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme,
  plugins: [typography],
} satisfies Config;
