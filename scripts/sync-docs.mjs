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

const DOCS = [
  {
    src: 'API.md',
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
    const p = resolve(process.env.SFEMU_REPO, 'docs', src);
    if (existsSync(p)) return { from: p, text: await readFile(p, 'utf8') };
  }
  // 2. sibling checkout
  const sibling = resolve(ROOT, '..', 'sfemu', 'docs', src);
  if (existsSync(sibling)) return { from: sibling, text: await readFile(sibling, 'utf8') };

  // 3. GitHub raw (private repo needs a token)
  const token = process.env.SFEMU_DOCS_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    const url = `https://raw.githubusercontent.com/${REPO}/${REF}/docs/${src}`;
    const res = await fetch(url, { headers: { Authorization: `token ${token}` } });
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`);
    return { from: url, text: await res.text() };
  }

  throw new Error(
    `cannot locate docs/${src}: no $SFEMU_REPO, no ../sfemu sibling, and no ` +
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

const BANNER = (from) =>
  `<!--\n  GENERATED — DO NOT EDIT.\n  Source of truth: sfemu/docs/${from}. Edit there; ` +
  `this file is overwritten on every build (scripts/sync-docs.mjs).\n-->`;

// The page template renders the title from frontmatter, so drop the source's
// own leading H1 to avoid a duplicate heading.
const stripLeadingH1 = (text) => text.trimStart().replace(/^#\s+.*\r?\n+/, '');

for (const doc of DOCS) {
  const { from, text } = await fetchSource(doc.src);
  const out = `${frontmatter(doc.frontmatter)}\n\n${BANNER(doc.src)}\n\n${stripLeadingH1(text)}`;
  const dest = resolve(ROOT, doc.dest);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, out);
  console.log(`docs: ${doc.dest}  <-  ${from}`);
}
