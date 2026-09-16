const { chromium } = require('/Users/node/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const guideRoot = __dirname;
const pageUrl = pathToFileURL(path.join(guideRoot, 'index.html')).href;
const outputDir = path.join(guideRoot, 'previews');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const capture = async (name, width, height) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    const failures = [];
    page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(pageUrl, { waitUntil: 'load' });
    await page.evaluate(() => document.querySelectorAll('img').forEach((image) => { image.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));

    const failedImages = await page.evaluate(() => [...document.images]
      .filter((image) => image.naturalWidth === 0)
      .map((image) => image.getAttribute('src')));
    assert.deepEqual(failedImages, [], `${name} has images that did not load`);
    assert.deepEqual(failures, [], `${name} has failed requests`);

    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth
    }));
    assert.equal(dimensions.document, dimensions.viewport, `${name} has horizontal overflow`);

    await page.screenshot({ path: path.join(outputDir, name), animations: 'disabled' });
    return { context, page };
  };

  const desktop = await capture('desktop-guide-composability.png', 1440, 1100);
  await desktop.page.evaluate(() => document.activeElement?.blur());
  const sectionCaptureStyle = await desktop.page.addStyleTag({ content: '.topbar, .skip-link { display: none !important; }' });
  await desktop.page.locator('#system').screenshot({ path: path.join(outputDir, 'foundation-system.png'), animations: 'disabled' });
  await desktop.page.locator('#construction').screenshot({ path: path.join(outputDir, 'construction.png'), animations: 'disabled' });
  await desktop.page.locator('#library').screenshot({ path: path.join(outputDir, 'asset-library-five-assets.png'), animations: 'disabled' });
  await desktop.page.locator('#both-sides').screenshot({ path: path.join(outputDir, 'both-sides-desktop.png'), animations: 'disabled' });
  await sectionCaptureStyle.evaluate((element) => element.remove());
  await desktop.context.close();

  const mobile = await capture('mobile-guide-composability.png', 390, 1600);
  const mobileCaptureStyle = await mobile.page.addStyleTag({ content: '.topbar, .skip-link { display: none !important; }' });
  await mobile.page.locator('#both-sides').screenshot({ path: path.join(outputDir, 'both-sides-mobile.png'), animations: 'disabled' });
  await mobileCaptureStyle.evaluate((element) => element.remove());
  await mobile.context.close();

  const labContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce'
  });
  const labPage = await labContext.newPage();
  await labPage.goto(pageUrl, { waitUntil: 'load' });
  const assetCases = [
    ['Coupon', '../../presentation/assets/illustrated-v1/stock-dividend-coupon.png'],
    ['Dividend claim', '../../presentation/assets/illustrated-v1/claim-composability.png'],
    ['Both claims', 'assets/stock-and-dividend-composability-v1.png'],
    ['Custody', 'assets/issuer-separated-custody-v1.png'],
    ['Fractional', 'assets/fractional-dividend-v1.png']
  ];
  for (const [label, expectedSrc] of assetCases) {
    await labPage.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await labPage.locator('#lab-image').getAttribute('src'), expectedSrc);
    await labPage.locator('#lab-image').evaluate((image) => image.decode());
  }
  await labPage.getByRole('button', { name: 'Both claims' }).click();
  await labPage.getByRole('button', { name: 'Warm' }).click();
  await labPage.getByRole('button', { name: '480 px' }).click();

  assert.equal(await labPage.getByRole('button', { name: 'Both claims' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await labPage.getByRole('button', { name: 'Warm' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await labPage.locator('#lab-image').getAttribute('src'), 'assets/stock-and-dividend-composability-v1.png');
  assert.doesNotMatch(await labPage.locator('#lab-warning').textContent(), /undersized|light panel/);

  await labPage.setViewportSize({ width: 390, height: 1000 });
  assert.match(await labPage.locator('#lab-caption strong').textContent(), /480 px requested, \d+ px rendered/);
  await labPage.setViewportSize({ width: 1440, height: 1000 });
  await labPage.waitForFunction(() => !document.querySelector('#lab-caption strong')?.textContent?.includes('requested'));
  assert.equal(await labPage.locator('#lab-caption strong').textContent(), 'Both sides are composable · scene study · 480 px rendered · warm canvas.');
  await labPage.locator('.lab-shell').screenshot({ path: path.join(outputDir, 'asset-lab-both-claims-warm.png'), animations: 'disabled' });

  await labPage.getByRole('button', { name: 'Dividend claim' }).focus();
  await labPage.keyboard.press('Tab');
  assert.equal(await labPage.evaluate(() => document.activeElement?.textContent?.trim()), 'Both claims');
  await labContext.close();

  await browser.close();
  console.log('Illustration guide QA passed: all five assets loaded, no horizontal overflow at 1440/390, both-sides desktop/mobile placement, lab controls and keyboard order verified.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
