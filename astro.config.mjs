import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output; no adapters. Mermaid diagrams are rendered CLIENT-SIDE (see the blog
// post layout) — build-time rendering needs a headless browser that the deploy build
// can't run, so it's rendered in the visitor's browser instead. Everything else ships
// zero client JS; the mermaid script is lazy-loaded only on posts that contain diagrams.
export default defineConfig({
  site: 'https://fidelic.dev',
  output: 'static',
  trailingSlash: 'ignore',
  // Exclude /thanks — post-submit confirmation, noindex'd, no search value.
  integrations: [sitemap({ filter: (page) => page !== 'https://fidelic.dev/thanks/' })],
});
