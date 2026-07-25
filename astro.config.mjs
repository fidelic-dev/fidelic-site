import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkMermaid from 'remark-mermaidjs';

// Wrap each build-time mermaid <svg> in a <figure class="mermaid-figure"> so the CSS
// can give wide diagrams (e.g. sequence diagrams) an overflow-x scroll container on
// narrow screens instead of overflowing the column.
function rehypeWrapMermaid() {
  const wrap = (node) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      wrap(child);
      const isMermaid =
        child.type === 'element' &&
        child.tagName === 'svg' &&
        String(child.properties?.id ?? '').startsWith('mermaid');
      return isMermaid
        ? { type: 'element', tagName: 'figure', properties: { className: ['mermaid-figure'] }, children: [child] }
        : child;
    });
  };
  return (tree) => wrap(tree);
}

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
  markdown: {
    // Mermaid → build-time inline SVG (zero client JS; matches the no-runtime principle
    // and the Lighthouse budget), neutral theme to match the site. remark-mermaidjs runs
    // BEFORE Astro's Shiki step, so the `mermaid` fence is converted before highlighting
    // — code blocks in the docs keep their syntax highlighting, mermaid becomes SVG.
    remarkPlugins: [[remarkMermaid, { mermaidConfig: { theme: 'neutral' } }]],
    rehypePlugins: [rehypeWrapMermaid],
  },
});
