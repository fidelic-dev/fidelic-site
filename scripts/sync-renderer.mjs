// Mirrors the trace renderer OWNED by the sfemu repo into this site.
//
// Same contract as sync-docs.mjs: sfemu owns it, the site renders it, and the copy here is
// gitignored so nobody edits the mirror. The playground, the homepage still and /trace must
// draw a document the same way — three implementations would drift the first week.
//
// Source resolution, first hit wins:
//   1. $SFEMU_REPO/cmd/playground/web/trace-render.js
//   2. ../sfemu/cmd/playground/web/trace-render.js        (sibling checkout)
//   3. GitHub raw @ $SFEMU_DOCS_REF with $SFEMU_DOCS_TOKEN (CI/Vercel, private repo)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'cmd/playground/web/trace-render.js';
const DEST = resolve(ROOT, 'src/lib/trace-render.js');

const candidates = [
  process.env.SFEMU_REPO && resolve(process.env.SFEMU_REPO, REL),
  resolve(ROOT, '..', 'sfemu', REL),
].filter(Boolean);

let src = null, from = null;
for (const c of candidates) {
  if (existsSync(c)) { src = readFileSync(c, 'utf8'); from = c; break; }
}
if (!src && process.env.SFEMU_DOCS_TOKEN) {
  const ref = process.env.SFEMU_DOCS_REF || 'main';
  const url = `https://api.github.com/repos/fidelic-dev/sfemu/contents/${REL}?ref=${ref}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SFEMU_DOCS_TOKEN}`,
               Accept: 'application/vnd.github.raw' },
  });
  if (!r.ok) {
    console.error(`sync-renderer: ${url} -> HTTP ${r.status}`);
    process.exit(1);
  }
  src = await r.text(); from = url;
}
// FAIL, NEVER FALL BACK TO A STALE COPY. A build that silently shipped last week's renderer
// is the same class of defect as a page that silently shipped last week's numbers.
if (!src) {
  console.error('sync-renderer: cannot find ' + REL + '. Set SFEMU_REPO, keep a sibling '
    + 'checkout at ../sfemu, or provide SFEMU_DOCS_TOKEN.');
  process.exit(1);
}
mkdirSync(dirname(DEST), { recursive: true });
writeFileSync(DEST, src);
console.log(`renderer: ${DEST}  <-  ${from}`);
