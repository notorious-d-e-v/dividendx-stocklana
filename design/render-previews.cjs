const { chromium } = require('/Users/node/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const pageUrl = pathToFileURL(path.join(root, 'design', 'index.html')).href;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const captures = [
    { name: 'desktop-app.png', width: 1440, height: 1100, query: '?capture=app' },
    { name: 'mobile-app.png', width: 390, height: 1600, query: '?capture=app' },
    { name: 'pitch-specimen.png', width: 1600, height: 900, query: '?capture=slide' }
  ];

  for (const capture of captures) {
    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    await page.goto(pageUrl + capture.query, { waitUntil: 'load' });
    const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(width.document, width.viewport, `${capture.name} has horizontal overflow`);

    if (capture.query === '?capture=app') {
      const amount = page.locator('#scenario-amount');
      assert.equal(await page.locator('#pt-display').textContent(), '100.0000');
      assert.equal(await page.locator('#dr-display').textContent(), '0.4152');
      await amount.fill('0');
      assert.equal(await page.locator('#pt-display').textContent(), '0.0000');
      assert.equal(await page.locator('#dr-display').textContent(), '0.0000');
      await amount.fill('12.34567890');
      assert.equal(await page.locator('#raw-q').textContent(), '1,212,343,456');
      assert.equal(await page.locator('#dr-display').textContent(), '0.0513');
      await amount.fill('12.345678901');
      assert.equal(await amount.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#pt-display').textContent(), '—');
      await amount.fill('100');

      await page.getByRole('tab', { name: 'Market' }).focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('tab', { name: 'Split' }).getAttribute('aria-selected'), 'true');
      await page.getByRole('tab', { name: 'Market' }).click();
    }
    await page.screenshot({
      path: path.join(root, 'design', 'previews', capture.name),
      animations: 'disabled'
    });
    await context.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
