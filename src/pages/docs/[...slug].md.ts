import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Raw-markdown twin of every doc: /docs/<slug>.md
//
// The blog has had one of these since the AI-crawlability commit; the docs did not, which
// meant the pages an agent most needs — the quickstart, the API reference, the demo
// transcript — were the ones only available as HTML it had to de-chrome.
//
// Same reasoning as the blog twin: the markdown IS the source (mirrored from the sfemu repo
// by scripts/sync-docs.mjs), so serve it directly rather than making a model strip a header,
// a footer and syntax-highlighting spans to recover prose that already exists in plain form.
//
// STATIC BUILD NOTE: Astro writes the body to disk and discards the Response headers below;
// the host serves by extension, and .md is served as text/markdown. The headers are kept so
// the intent survives an eventual move to SSR.

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const { doc } = props as { doc: Awaited<ReturnType<typeof getCollection<'docs'>>>[number] };
  const origin = String(site ?? 'https://www.fidelic.dev').replace(/\/$/, '');
  const url = `${origin}/docs/${doc.id}`;
  const header = [
    `# ${doc.data.title}`,
    '',
    `> ${doc.data.description ?? ''}`,
    '',
    `Canonical: ${url}`,
    `Source: Fidelic (${origin})`,
    '',
    '---',
    '',
  ].join('\n');

  return new Response(header + doc.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'all',
    },
  });
};
