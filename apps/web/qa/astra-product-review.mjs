import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});

try {
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.getByRole('heading', { name: 'Choose a stock. Separate a year of dividends.' })).toBeVisible();
  await expect(page.getByTestId('product-asset-KOx')).toContainText('Historical factors · test term dates');
  await expect(page.getByTestId('product-asset-KOon')).toContainText('Dividend data pending');

  await page.getByTestId('product-asset-KOx').click();
  await expect(page.getByTestId('product-year')).toHaveValue('2027');
  await expect(page.getByTestId('mint-result')).toContainText('PT-KOx-2027');
  await expect(page.getByTestId('mint-result')).toContainText('DR-KOx-2027');
  await expect(page.getByText(/Historical factors · test term dates\. One historical factor example/)).toBeVisible();
  await page.getByText('Details & sources').click();
  await expect(page.getByText('Not present in this source fixture')).toBeVisible();
  await expect(page.getByText(/not a complete annual payout or a 2027 forecast/)).toBeVisible();
  await page.getByTestId('product-split-action').click();
  await page.locator('.after-split').getByRole('button', { name: 'Open series' }).click();
  await expect(page.getByText(/Historical factors · test term dates\. One historical factor example/)).toBeVisible();
  await page.getByText('Preview controls').click();
  await page.getByRole('button', { name: 'Start year · close deposits' }).click();
  await page.getByRole('button', { name: 'Replay example dividend' }).click();
  await expect(page.getByTestId('series-status')).toContainText('Collecting dividends');
  await expect(page.getByRole('heading', { name: 'Redeem PT and DR separately.' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sell 40% DR to Dividend buyer' }).click();
  await expect(page.locator('.cash-ledger')).toContainText('You 30.00 · Buyer 970.00 · Total 1000.00');
  const combine = page.locator('.amount-control').first();
  await combine.getByRole('button', { name: 'Max' }).click();
  await combine.getByRole('button', { name: 'Combine & return stock' }).click();
  await page.getByRole('button', { name: 'End year' }).click();
  await expect(page.getByTestId('series-status')).toContainText('awaiting finalization');
  await page.getByRole('button', { name: 'View Dividend buyer' }).click();
  await expect(page.locator('.your-tokens')).toContainText('39.279928');
  await page.getByRole('button', { name: 'Finalize test journal' }).click();
  await expect(page.locator('.your-tokens')).toContainText('39.279928');
  const buyerDr = page.locator('.redemption-control').nth(1);
  await buyerDr.getByRole('button', { name: 'Max' }).click();
  await buyerDr.getByRole('button', { name: 'Redeem', exact: true }).click();
  await page.getByRole('button', { name: 'View Your test balance' }).click();
  const sellerPt = page.locator('.redemption-control').first();
  await sellerPt.getByRole('button', { name: 'Max' }).click();
  await sellerPt.getByRole('button', { name: 'Redeem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All of this annual series has been redeemed.' })).toBeVisible();

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await page.goto('http://127.0.0.1:4174/rehearsal/');
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No demo position yet.' })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS independent annual product review: exact 2027 claims, missing-ex-date disclosure, replay lock, conserved paid DR sale, post-maturity no-forfeiture, final redemption, four-width layout, preserved rehearsal, no page errors.');
} finally {
  await browser.close();
}
