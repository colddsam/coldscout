import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import { theme } from '../frontend/tailwind.theme';

/**
 * Reuse the exact Vite/Android theme (colors, fonts, animations) from the shared
 * pure-data module and only repoint the `content` globs at this app's tree + the
 * shared source in ../frontend/src. The typography plugin is imported from THIS
 * app's own node_modules so a web-only install resolves it correctly (the old
 * `import baseConfig from '../frontend/tailwind.config'` made the plugin resolve
 * from frontend/, which a web-only CI install does not populate).
 */
export default {
  content: [
    './src/**/*.{ts,tsx}',
    '../frontend/src/**/*.{ts,tsx}',
  ],
  theme,
  plugins: [typography],
} satisfies Config;
