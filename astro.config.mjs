import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: 'https://www.virra.app',
  // Exclude the internal /components style guide from the sitemap — it's a
  // developer reference, not public marketing content (also noindex'd).
  integrations: [sitemap({ filter: (page) => !page.includes('/components') })],
  // Inline all page CSS into the HTML to remove the render-blocking
  // stylesheet round trip from the critical path. Site CSS is small (~4KB)
  // so the HTML payload cost is negligible vs the FCP/LCP win on mobile.
  build: { inlineStylesheets: 'always' },
});
