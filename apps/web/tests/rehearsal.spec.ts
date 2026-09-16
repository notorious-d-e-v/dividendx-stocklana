import { expect, test, type Page } from '@playwright/test';

async function chooseKox(page: Page) {
  await page.goto('/rehearsal/');
  await page.getByTestId('asset-KOx').click();
  await expect(page.getByRole('heading', { name: 'Coca-Cola KOx' })).toBeVisible();
}

async function startKox(page: Page) {
  await chooseKox(page);
  await page.getByTestId('start-split').click();
  await expect(page.getByTestId('sale-stage')).toBeVisible();
}

test('catalog search, issuer filter, KOx allocation, Ondo pending, and Backpack event factor', async ({ page }) => {
  await page.goto('/rehearsal/');
  await page.getByPlaceholder('Coca-Cola, KO…').fill('apple');
  await expect(page.getByRole('heading', { name: 'Apple' })).toBeVisible();
  await page.getByRole('button', { name: 'Ondo', exact: true }).click();
  await expect(page.getByText('Dividend data pending')).toBeVisible();
  await page.getByTestId('asset-AAPLon').click();
  await expect(page.getByRole('button', { name: /Split from Seller/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Market' }).click();
  await page.getByPlaceholder('Coca-Cola, KO…').fill('KO');
  await page.getByTestId('asset-KOx').click();
  await expect(page.getByTestId('allocation')).toContainText('100.0000');
  await expect(page.getByTestId('allocation')).toContainText('0.4152');
  await page.getByText('Raw allocation values').click();
  await expect(page.getByText('9,819,982,084', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('9,779,376,057', { exact: true })).toBeVisible();
  await expect(page.getByText('40,606,027', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Market' }).click();
  await page.getByPlaceholder('Coca-Cola, KO…').fill('Micron');
  await page.getByTestId('asset-MU.US').click();
  await page.getByText('Accounting & source inspector').click();
  await expect(page.getByText('1.000106726714702', { exact: true })).toBeVisible();
});

test('rejected quote is atomic, fractional sale completes, replay settles, and both owners redeem', async ({ page }) => {
  await startKox(page);
  const initialSellerCash = await page.locator('.wallet-ledger > div').nth(1).locator('strong').first().textContent();
  const initialBuyerCash = await page.locator('.wallet-ledger > div').nth(1).locator('strong').nth(1).textContent();
  await page.getByTestId('sale-amount').fill('40');
  await page.getByRole('button', { name: /Review Buyer/ }).click();
  await expect(page.getByTestId('quote-review')).toContainText('Buyer pays Seller');
  await page.getByRole('button', { name: 'Reject offer' }).click();
  await expect(page.getByRole('alert')).toContainText('rejected');
  await expect(page.locator('.wallet-ledger > div').nth(1).locator('strong').first()).toHaveText(initialSellerCash ?? '0.00');
  await expect(page.locator('.wallet-ledger > div').nth(1).locator('strong').nth(1)).toHaveText(initialBuyerCash ?? '1,000.00');

  await page.getByRole('button', { name: /Review Buyer/ }).click();
  await page.getByRole('button', { name: 'Accept as Buyer' }).click();
  await expect(page.getByText('Dividend rights sold', { exact: true })).toBeVisible();
  await expect(page.getByText('60.00%', { exact: true })).toBeVisible();
  await expect(page.getByText('40.00%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Replay dividend/ }).click();
  await expect(page.getByRole('heading', { name: 'Redeem your share.' })).toBeVisible();

  const sellerPt = page.locator('.redeem-control.pt');
  await sellerPt.getByRole('button', { name: '50%' }).click();
  await sellerPt.getByRole('button', { name: /Redeem/ }).click();
  await sellerPt.getByRole('button', { name: 'Max' }).click();
  await sellerPt.getByRole('button', { name: /Redeem/ }).click();
  const sellerDr = page.locator('.redeem-control.dr');
  await sellerDr.getByRole('button', { name: 'Max' }).click();
  await sellerDr.getByRole('button', { name: /Redeem/ }).click();

  await page.getByLabel('Demo account').selectOption('buyer');
  const buyerDr = page.locator('.redeem-control.dr');
  await buyerDr.getByRole('button', { name: 'Max' }).click();
  await buyerDr.getByRole('button', { name: /Redeem/ }).click();
  await expect(page.getByText('Dividend rights redeemed', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'All claims redeemed.' })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: 'apps/web/qa/positions-complete-desktop.png', fullPage: true });
});

test('stale, paused, rejected event, empty offer and loading demo controls are reachable', async ({ page }) => {
  await startKox(page);
  await page.getByText('Demo controls & error states').click();
  await page.getByRole('button', { name: 'Stale data' }).click();
  await page.getByRole('button', { name: /Review Buyer/ }).click();
  await expect(page.getByRole('alert')).toContainText('stale');
  await page.getByRole('button', { name: 'Paused collateral' }).click();
  await page.getByRole('button', { name: /Review Buyer/ }).click();
  await expect(page.getByRole('alert')).toContainText('paused');
  await page.getByRole('button', { name: 'Rejected event' }).click();
  await page.getByRole('button', { name: /Review Buyer/ }).click();
  await expect(page.getByRole('alert')).toContainText('rejected');
  await page.getByRole('button', { name: 'Ready' }).click();
  await page.getByRole('button', { name: 'Empty offer' }).click();
  await expect(page.getByRole('button', { name: /Review Buyer/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview loading' }).click();
  await expect(page.getByText(/Loading loading/)).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`keyboard and horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/rehearsal/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('capture review views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/rehearsal/');
  await page.screenshot({ path: 'apps/web/qa/market-desktop.png', fullPage: true });
  await page.getByTestId('asset-KOx').click();
  await page.screenshot({ path: 'apps/web/qa/split-desktop.png', fullPage: true });
  await page.getByTestId('start-split').click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: 'apps/web/qa/positions-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Split' }).click();
  await page.screenshot({ path: 'apps/web/qa/split-mobile.png', fullPage: true });
});

test('assets, source links, and console remain clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await chooseKox(page);
  const brokenImages = await page.locator('img').evaluateAll((images) => images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length);
  expect(brokenImages).toBe(0);
  await page.getByText('Accounting & source inspector').click();
  const hrefs = await page.locator('.source-links a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect(() => new URL(href)).not.toThrow();
  expect(errors).toEqual([]);
});
