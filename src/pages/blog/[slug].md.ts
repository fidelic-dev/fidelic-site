import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Raw-markdown twin of every post: /blog/<slug>.md
//
// An agent reading the HTML has to strip a header, a footer, nav chrome and syntax
// highlighting spans to recover the prose — and every one of those is a chance to
// mangle a code block or drop a link. The markdown IS the source, so serve it directly
// and let the model read what was actually written. llms.txt points at these, not at
// the HTML.
//
// NOTE on content type: this is a STATIC build, so Astro writes the body to disk and
// DISCARDS the Response headers below — the host serves the file by extension. Verified
// against the production build: .md is served as `text/markdown; charset=utf-8`, which
// is what an agent wants anyway. The headers are kept only so the intent survives if
// this ever moves to SSR; they are not doing anything today.

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts
    .filter((p) => !p.data.draft)
    .map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const { post } = props as { post: Awaited<ReturnType<typeof getCollection<'blog'>>>[number] };
  const origin = String(site ?? 'https://www.fidelic.dev').replace(/\/$/, '');
  const url = `${origin}/blog/${post.id}`;
  // A short provenance header, so a model that quotes this can attribute and date it
  // without having to guess from the prose.
  const header = [
    `# ${post.data.title}`,
    '',
    `> ${post.data.description}`,
    '',
    `Published: ${post.data.date.toISOString().slice(0, 10)}`,
    `Canonical: ${url}`,
    `Source: Fidelic (${origin})`,
    '',
    '---',
    '',
  ].join('\n');

  return new Response(header + post.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'all',
    },
  });
};
