// node web/snapshot.mjs <page.html> <out.png> [width] [height] [mode]
// mode "card" (default) renders the shareable 4:5 card; "page" screenshots the viewer.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = await import('playwright'); }
const { chromium } = playwright;

const [page, out, w = '1080', h = '1350', mode = 'card'] = process.argv.slice(2);
const opts = {};
if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(opts);
try {
  if (mode === 'card') {
    const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
    await p.goto(pathToFileURL(page).href + `?card=1&w=${w}&h=${h}`);
    await p.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
    await p.locator('#cardOut').screenshot({ path: out });
  } else {
    const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2,
      colorScheme: mode === 'page-dark' ? 'dark' : 'light' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
    await p.goto(pathToFileURL(page).href);
    await p.waitForSelector('body[data-viewer-ready="1"]');
    await p.waitForTimeout(1200);
    await p.screenshot({ path: out, fullPage: true });
  }
} finally {
  await browser.close();
}
