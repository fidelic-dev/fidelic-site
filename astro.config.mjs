import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output; no adapters, no client runtime. The only interactive element is
// the waitlist form, which posts to an external endpoint with plain HTML.
export default defineConfig({
  site: 'https://fidelic.dev',
  output: 'static',
  trailingSlash: 'ignore',
  // Exclude /thanks — it's a post-submit confirmation (reached only via the form's
  // _next redirect) with no search value, and it's noindex'd. Keeping it out of the
  // sitemap avoids advertising a page we're telling crawlers not to index, and stops
  // a direct-from-search hit from firing a false signup conversion.
  integrations: [sitemap({ filter: (page) => page !== 'https://fidelic.dev/thanks/' })],
});
