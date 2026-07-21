import { defineConfig } from 'astro/config';

// Static output; no adapters, no client runtime. The only interactive element is
// the waitlist form, which posts to an external endpoint with plain HTML.
export default defineConfig({
  site: 'https://fidelic.dev',
  output: 'static',
  trailingSlash: 'ignore',
});
