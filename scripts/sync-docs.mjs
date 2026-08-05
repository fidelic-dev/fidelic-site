// Mirrors docs OWNED by the sfemu repo into this site's content collection.
//
// The site is a consumer: sfemu/docs/ is the source of truth (versioned in the
// same commits that change the behaviour it documents). This script copies those
// files in at build time and stamps a GENERATED banner. The outputs are
// git-ignored — never edit them here; edit the source in sfemu and rebuild.
//
// Source resolution, per doc, first hit wins:
//   1. $SFEMU_REPO/docs/<src>              — explicit repo path
//   2. ../sfemu/docs/<src>                 — sibling checkout (dev default)
//   3. GitHub raw @ $SFEMU_DOCS_REF        — private repo via $SFEMU_DOCS_TOKEN (CI/Vercel)
//
// Add a future mirrored doc by appending to DOCS below. Repo owns, site renders.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// `src` is a path relative to the sfemu repo root (docs live under docs/, but
// QUICKSTART.md sits at the root — so the manifest carries the full repo-relative path).
const DOCS = [
  {
    src: 'QUICKSTART.md',
    dest: 'src/content/docs/quickstart.md',
    frontmatter: {
      title: 'Quickstart — run the emulator on your own org',
      description:
        'Run your real Apex triggers against a fake Salesforce org on localhost, inject failures a real org never lets you reproduce, and test unapproved changes before they ship.',
      order: 5,
    },
  },
  {
    // The demo transcript. Mirrored rather than copied by hand for the same reason as the
    // rest: the video and this text are both generated from demo/npsp.tape, and a
    // hand-maintained transcript would drift from the recording the first time it is re-cut.
    src: 'demo/npsp-transcript.md',
    dest: 'src/content/docs/demo-transcript.md',
    frontmatter: {
      title: 'What the demo shows — and what it does not',
      description:
        'Full text of the 60-second Fidelic demo: every command, every output, and an explicit list of the claims the video does NOT make.',
      order: 6,
    },
  },
  {
    src: 'docs/API.md',
    dest: 'src/content/docs/api.md',
    frontmatter: {
      title: 'API & options reference',
      description:
        'Every endpoint, flag, environment variable, and fault the Fidelic emulator supports.',
      order: 10,
    },
  },
];

const REPO = 'fidelic-dev/sfemu';
const REF = process.env.SFEMU_DOCS_REF || 'main';

async function fetchSource(src) {
  // 1. explicit repo path
  if (process.env.SFEMU_REPO) {
    const p = resolve(process.env.SFEMU_REPO, src);
    if (existsSync(p)) return { from: p, text: await readFile(p, 'utf8') };
  }
  // 2. sibling checkout
  const sibling = resolve(ROOT, '..', 'sfemu', src);
  if (existsSync(sibling)) return { from: sibling, text: await readFile(sibling, 'utf8') };

  // 3. GitHub raw (private repo needs a token)
  const token = process.env.SFEMU_DOCS_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${src}`;
    const res = await fetch(url, { headers: { Authorization: `token ${token}` } });
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`);
    return { from: url, text: await res.text() };
  }

  throw new Error(
    `cannot locate ${src}: no $SFEMU_REPO, no ../sfemu sibling, and no ` +
      `$SFEMU_DOCS_TOKEN for a GitHub fetch. Set one so the site can render the doc.`,
  );
}

function frontmatter(fm) {
  const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const lines = Object.entries(fm).map(([k, v]) =>
    typeof v === 'number' ? `${k}: ${v}` : `${k}: ${esc(v)}`,
  );
  return `---\n${lines.join('\n')}\n---`;
}

const BANNER = (src) =>
  `<!--\n  GENERATED — DO NOT EDIT.\n  Source of truth: sfemu/${src}. Edit there; ` +
  `this file is overwritten on every build (scripts/sync-docs.mjs).\n-->`;

// The page template renders the title from frontmatter, so drop the source's
// own leading H1 to avoid a duplicate heading.
const stripLeadingH1 = (text) => text.trimStart().replace(/^#\s+.*\r?\n+/, '');

// Repo-relative links (../QUICKSTART.md, docs/API.md) are correct for someone reading
// the file on GitHub and a 404 for someone reading it here. Rewrite them to site paths
// at sync time so the source stays right for BOTH audiences — the alternative is
// breaking the repo's own links to satisfy the site.
const DOC_LINK_MAP = {
  'QUICKSTART.md': '/docs/quickstart',
  'API.md': '/docs/api',
};
const rewriteDocLinks = (text) =>
  text.replace(/\]\(([^)]+?\.md)(#[^)]*)?\)/g, (whole, target, hash = '') => {
    const base = target.split('/').pop();
    const dest = DOC_LINK_MAP[base];
    return dest ? `](${dest}${hash})` : whole;
  });

for (const doc of DOCS) {
  const { from, text } = await fetchSource(doc.src);
  const out = `${frontmatter(doc.frontmatter)}\n\n${BANNER(doc.src)}\n\n${rewriteDocLinks(stripLeadingH1(text))}`;
  const dest = resolve(ROOT, doc.dest);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, out);
  console.log(`docs: ${doc.dest}  <-  ${from}`);
}
