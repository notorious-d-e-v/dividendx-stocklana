import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const macOSChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(macOSChrome) ? macOSChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/');
  const company = page.locator('.company-section').filter({ has: page.getByRole('heading', { name: 'Coca-Cola', exact: true }) });
  assert(await company.locator('header').evaluate(e => e.getBoundingClientRect().bottom <= e.parentElement.querySelector('.token-children').getBoundingClientRect().top));
  await expect(page.getByRole('button', { name: 'Show dividend payout ready' })).not.toBeVisible();
  await page.getByTestId('product-asset-MU.US').click();
  await expect(page.getByTestId('mint-result')).toContainText('100.000000 PT');
  await expect(page.getByTestId('mint-result')).toContainText('100.000000 DR');
  await page.locator('.split-button').click();
  await page.locator('.after-split').getByRole('button', { name: 'Redeem' }).click();
  await page.locator('.amount-control').getByRole('button', { name: '50%' }).click();
  await expect(page.locator('.amount-control')).toContainText('50.000000 MU.US');
  await page.getByRole('button', { name: 'Combine & redeem stock' }).click();
  await page.locator('.amount-control').getByRole('button', { name: 'Max' }).click();
  await page.getByRole('button', { name: 'Combine & redeem stock' }).click();
  await expect(page.getByRole('heading', { name: 'Stock token returned.' })).toBeVisible();
  await page.getByText('Preview controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await page.getByTestId('product-asset-KOx').click();
  await page.getByTestId('product-split-amount').fill('0.00001');
  await page.locator('.split-button').click();
  await page.locator('.after-split').getByRole('button', { name: 'Redeem' }).click();
  if (!(await page.locator('.simulation-controls').evaluate(e => e.open))) await page.getByText('Preview controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Show dividend payout ready' }).click();
  const dr = page.locator('.separate-controls .amount-control').nth(1);
  await dr.getByRole('button', { name: 'Max' }).click();
  await expect(dr).toContainText('<0.000001 KOx');
  await expect(dr.getByRole('button', { name: 'Redeem', exact: true })).toBeEnabled();
  await dr.getByRole('button', { name: 'Redeem', exact: true }).click();
  const pt = page.locator('.separate-controls .amount-control').first();
  await pt.getByRole('button', { name: 'Max' }).click();
  await pt.getByRole('button', { name: 'Redeem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All of this series has been redeemed.' })).toBeVisible();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await expect(page.locator('.sim-message')).toHaveCount(0);
  await page.goto('http://127.0.0.1:4174/rehearsal/');
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No demo position yet.' })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS independent product review: company hierarchy, hidden simulation controls, MU split and partial/full recombination, positive tiny KOx payout redemption, four-width completion layout, preserved independent rehearsal, no page errors.');
} finally { await browser.close(); }
