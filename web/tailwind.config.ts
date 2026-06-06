import type { Config } from 'tailwindcss';
import baseConfig from '../frontend/tailwind.config';

/**
 * Reuse the exact Vite/Android theme (colors, fonts, animations, plugins) and
 * only repoint the `content` globs at this app's tree + the shared source in
 * ../frontend/src. Keeping a single theme source means the web and Android UIs
 * never drift.
 */
export default {
  ...baseConfig,
  content: [
    './src/**/*.{ts,tsx}',
    '../frontend/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
