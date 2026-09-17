import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

// Run Vite preview on port 4174 before this read-only production check.
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let page;
const errors = [];
try {
  page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (event.type() === 'error') errors.push(event.text()); });
  await page.goto('http://127.0.0.1:4174/app/');
  assert(await page.locator('script[type="module"][src^="/assets/"]').count(), 'Serve the production build with Vite preview, not the development entry.');
  await page.getByTestId('temporary-wallet').click({ timeout: 30_000 });
  await expect(page.locator('.wallet-connect code')).toBeVisible();
  for (const [asset, company] of [['xstocks-test-kox', 'Coca-Cola'], ['backpack-test-mu', 'Micron'], ['ondo-test-ibm', 'IBM']]) {
    await page.getByLabel('Exact local stock token').selectOption(asset);
    await expect(page.locator('.wallet-position h1')).toContainText(company);
    await expect(page.locator('.wallet-balances > div b')).toHaveText(['0', '0', '0']);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  assert.deepEqual(errors, []);
  console.log('PASS production bundle: actual runtime identity, temporary wallet and all three asset snapshots; no mutation or browser errors.');
} catch (error) {
  console.error('Production browser errors:', errors, 'Page:', await page?.locator('body').innerText());
  throw error;
} finally { await browser.close(); }
