import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output; no adapters. Mermaid diagrams are rendered CLIENT-SIDE (see the blog
// post layout) — build-time rendering needs a headless browser that the deploy build
// can't run, so it's rendered in the visitor's browser instead. Everything else ships
// zero client JS; the mermaid script is lazy-loaded only on posts that contain diagrams.
export default defineConfig({
  // www is what actually serves: the apex 308-redirects to www at the edge. The config
  // must match the infrastructure, or every canonical tag, sitemap entry and og:url
  // points at a URL that immediately redirects.
  site: 'https://www.fidelic.dev',
  output: 'static',
  // 'always', matching vercel.json's trailingSlash. Astro writes every internal link,
  // canonical, og:url and sitemap entry with the slash; Vercel 308s the slashless form to
  // it at the edge. Both halves are required: Astro alone would emit canonical URLs the
  // edge does not enforce, and Vercel alone would redirect to URLs the HTML never links to.
  trailingSlash: 'always',
  // Exclude /thanks — post-submit confirmation, noindex'd, no search value.
  // Filter compares against the FULL url built from `site`, so this string has to track
  // it — hardcoding the apex here would have silently stopped excluding /thanks the
  // moment `site` moved to www.
  integrations: [sitemap({ filter: (page) => !page.endsWith('/thanks/') })],
});
