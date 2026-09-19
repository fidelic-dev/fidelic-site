// RULER: no docs page may scroll sideways on a phone.
//
// This shipped broken for weeks and nothing noticed, because nothing was looking. Every docs
// page pushed its own document 752px wide on a 375px screen: the table-of-contents nav is a grid
// item, `min-width` computes to `auto`, and a grid item will not shrink below its content — so
// the nav dragged the content column out with it. Two long inline `<code>` REST paths on
// /docs/api did the same thing at a smaller scale, being single unbreakable ~400px tokens.
//
// Both are invisible to every server-side check we run: the HTML is correct, the CSS parses, the
// page returns 200. Only laying it out at a real viewport answers the question.
//
// Run:  node scripts/docs-overflow.test.mjs          (against ./dist — run `npm run build` first)
//       LIVE=https://www.fidelic.dev node scripts/docs-overflow.test.mjs
// SKIPS cleanly without puppeteer-core or Chrome: a ruler that reds on its own missing
// dependency teaches people to ignore it.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('  SKIP: puppeteer-core not installed (npm i -D puppeteer-core)'); process.exit(0); }
if (!existsSync(CHROME)) { console.log(`  SKIP: no Chrome at ${CHROME}`); process.exit(0); }

const LIVE = process.env.LIVE || '';
if (!LIVE && !existsSync(DIST)) { console.log('  SKIP: no dist/ — run `npm run build` first'); process.exit(0); }

const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml' };
let base = LIVE, srv;
if (!LIVE) {
  srv = createServer((req, res) => {
    let p = join(DIST, req.url.split('?')[0]);
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'text/plain' });
    res.end(readFileSync(p));
  });
  await new Promise(r => srv.listen(0, r));
  base = `http://127.0.0.1:${srv.address().port}`;
}

const PAGES = ['/docs', '/docs/quickstart', '/docs/api', '/docs/ci-github-actions', '/docs/ci-gitlab'];
// Both orientations of each phone. Landscape is not a nicety: it is 844px wide, so it misses
// every width breakpoint, and it is the orientation people rotate into in order to read a table.
const DEVICES = [
  ['iPhone SE',        375, 667, true],
  ['iPhone 12/13/14',  390, 844, true],
  ['Pixel 7',          412, 915, true],
  ['iPhone Pro Max',   430, 932, true],
  ['desktop',         1280, 800, false],
];

let failures = 0, combos = 0;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
for (const [name, pw, ph, isPhone] of DEVICES) {
  for (const [orient, w, h] of (isPhone ? [['portrait', pw, ph], ['landscape', ph, pw]] : [['', pw, ph]])) {
    combos++;
    const label = `${name}${orient ? ' ' + orient : ''} (${w}x${h})`;
    const bad = [];
    for (const path of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: isPhone, hasTouch: isPhone });
      await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 45000 });
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        // Report the OUTERMOST offenders — elements sticking out with no scrolling ancestor.
        // Everything inside a <pre> or a wide table is allowed to exceed the viewport; that is
        // what its scroll container is for, and reporting those buries the real cause.
        const scrolls = el => {
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const o = getComputedStyle(a).overflowX;
            if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
          }
          return false;
        };
        const out = [];
        document.querySelectorAll('body *').forEach(e => {
          const b = e.getBoundingClientRect();
          if (b.right > de.clientWidth + 1 && !scrolls(e)) {
            out.push(`${e.tagName}${e.className ? '.' + String(e.className).slice(0, 18) : ''} ` +
                     `w=${Math.round(b.width)} "${(e.textContent || '').trim().slice(0, 34)}"`);
          }
        });
        return { over: de.scrollWidth > de.clientWidth, sw: de.scrollWidth, cw: de.clientWidth, out: out.slice(0, 3) };
      });
      if (r.over) { bad.push(`${path} scrollWidth ${r.sw} > ${r.cw}${r.out.length ? ' | ' + r.out.join(' | ') : ''}`); failures++; }
      await page.close();
    }
    console.log(`  ${bad.length ? 'FAIL' : 'ok  '} ${label}${bad.length ? '\n      ' + bad.join('\n      ') : ''}`);
  }
}
await browser.close();
if (srv) srv.close();
console.log(`\n  ${combos} device combinations x ${PAGES.length} docs pages — ` +
            (failures ? `${failures} OVERFLOWING` : 'none scroll sideways'));
process.exit(failures ? 1 : 0);
