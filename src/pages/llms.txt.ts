import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// /llms.txt — the llmstxt.org convention: a single markdown index that tells a model
// what this site is and where the good text lives, without making it crawl and
// de-chrome every page first.
//
// GENERATED from the content collections rather than hand-written, for the same reason
// everything else here is: a hand-maintained index of pages silently goes stale the
// first time someone adds a post, and a stale index is worse than none — it tells a
// model, confidently, that a page it cannot find is the whole story.
//
// Blog entries point at the RAW MARKDOWN (/blog/<slug>.md), not the HTML.
//
// Every claim below is one the site already makes and can back. The "what it does not
// do" section is deliberate: a model summarising Fidelic will state limits either way,
// and it should state ours rather than invent them.

export const GET: APIRoute = async (context) => {
  // Derived from astro.config `site` rather than hardcoded — a second copy of the origin
  // is a second thing to forget when the canonical host changes.
  const SITE = String(context.site ?? 'https://www.fidelic.dev').replace(/\/$/, '');
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const docs = (await getCollection('docs')).sort((a, b) => a.data.order - b.data.order);

  const body = `# Fidelic

> A Salesforce API emulator: a 14MB Docker container that loads a real org's schema,
> runs that org's real Apex triggers, and injects failures no real org will let you
> reproduce — row locks, rate limits, latency — so Salesforce integrations can be
> tested in CI like any other dependency.

Fidelic answers a subset of the Salesforce REST API on localhost. Point a client that
speaks Salesforce REST at it and CRUD, SOQL, validation rules and trigger side effects
behave as they do against an org. Failure injection is a config flag. State is wiped
between tests, and instances are disposable, so suites can run in parallel.

## How it reports what it can and cannot do

Every trigger is classified at load time, before the first request, into one of four
verdicts, and the classification is printed at boot:

- EXECUTE — the trigger runs as written.
- SIMULATED — it runs, but a platform semantic is deliberately approximated (async
  drained inline, HTTP callouts served from a mock registry, platform events captured
  rather than delivered). Labeled per trigger.
- RECORDED-ONLY — the body is executable, but its entry point cannot occur locally
  (a platform-event or Change Data Capture subscriber).
- REFUSED — with a named reason and a file:line. Never a silent guess.

Unsupported constructs are refused, never approximated quietly. That is the project's
central design rule.

## Verification

- [Public conformance suite](https://github.com/fidelic-dev/fidelic-conformance): the
  YAML tests Fidelic is built against, each citing Salesforce's public documentation.
  Scorecard against the emulator: 66/66 pass, 5 skipped (they need a real org's custom
  schema), 2 pending real-org verification. Clone it and run the scorecard yourself.

## Docs

${docs.map((d) => `- [${d.data.title}](${SITE}/docs/${d.id}): ${d.data.description}`).join('\n')}

## Blog (raw markdown)

${posts
  .map(
    (p) =>
      `- [${p.data.title}](${SITE}/blog/${p.id}.md): ${p.data.description} Published ${p.data.date
        .toISOString()
        .slice(0, 10)}. HTML: ${SITE}/blog/${p.id}`,
  )
  .join('\n')}

## What Fidelic does not do

- It is not a Salesforce runtime and does not aim for literal parity. Some Apex is
  refused by design.
- It does not do real async scheduling, real network egress, or real sharing/FLS
  enforcement — those are permanently out of scope and refused with named reasons.
- Governor limits are approximate and off by default; they are not represented as
  faithful.
- It is not affiliated with or endorsed by Salesforce.

## Contact

- hello@fidelic.dev
- [Site](${SITE}) · [Blog index](${SITE}/blog) · [RSS](${SITE}/rss.xml)
`;

  // Static build: these headers are discarded and the host serves by extension
  // (verified: /llms.txt comes back as text/plain). Kept for a possible SSR future.
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'all',
    },
  });
};
