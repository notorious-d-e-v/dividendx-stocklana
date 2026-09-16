import { expect, test, type Page } from '@playwright/test';

async function openKox(page: Page) {
  await page.goto('/');
  await page.getByTestId('product-asset-KOx').click();
  await expect(page.getByRole('heading', { name: 'One stock. Two tokens.' })).toBeVisible();
}

async function splitKox(page: Page) {
  await openKox(page);
  await page.getByTestId('product-split-action').click();
  await expect(page.getByText('Your tokens', { exact: true })).toBeVisible();
}

async function openRedeem(page: Page) {
  await splitKox(page);
  await page.locator('.after-split').getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByRole('heading', { name: 'Get your stock token back.' })).toBeVisible();
}

test('company parents contain subordinate token children and pending Ondo cannot split', async ({ page }) => {
  await page.goto('/');
  const cocaCola = page.locator('.company-section').filter({ has: page.getByRole('heading', { name: 'Coca-Cola' }) });
  await expect(cocaCola.locator('header')).toContainText('Company');
  await expect(cocaCola.locator('.token-children')).toContainText('Available stock tokens');
  await expect(cocaCola.getByTestId('product-asset-KOx')).toContainText('Try split');
  await page.getByPlaceholder('Coca-Cola, KO…').fill('Apple');
  await page.getByRole('button', { name: 'Ondo', exact: true }).click();
  await page.getByTestId('product-asset-AAPLon').click();
  await expect(page.getByTestId('product-split-action')).toBeDisabled();
  await expect(page.getByText('Choose a token with a reviewed historical example.')).toBeVisible();
});

test('split shows equal minted claim quantities rather than unequal redemption allocations', async ({ page }) => {
  await openKox(page);
  const result = page.getByTestId('mint-result');
  await expect(result).toContainText('98.199821 PT');
  await expect(result).toContainText('98.199821 DR');
  await page.getByText('Details & sources').click();
  await expect(page.getByText('9819982084 raw PT + DR', { exact: true })).toBeVisible();
  await expect(page.getByText('PT 9779376057 · DR 40606027 raw', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Transfer/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Trade/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Provide liquidity/ })).toBeDisabled();
  await expect(page.getByText('No live market connected')).toBeVisible();
});

test('split can be partially and fully recombined with exact Max', async ({ page }) => {
  await openRedeem(page);
  const combine = page.locator('.amount-control');
  await combine.getByRole('button', { name: '50%' }).click();
  await combine.getByRole('button', { name: 'Combine & redeem stock' }).click();
  await expect(page.getByRole('status')).toContainText('You received');
  await page.locator('.amount-control').getByRole('button', { name: 'Max' }).click();
  await page.locator('.amount-control').getByRole('button', { name: 'Combine & redeem stock' }).click();
  await expect(page.getByRole('heading', { name: 'Stock token returned.' })).toBeVisible();
  await expect(page.getByText('No tokens remain in this series.')).toBeVisible();
});

test('paid partial DR sale limits recombination, then seller PT and buyer DR redeem independently', async ({ page }) => {
  await openRedeem(page);
  await page.getByText('Preview controls').click();
  await page.getByRole('button', { name: 'Sell 40% DR to Dividend buyer' }).click();
  await expect(page.getByRole('status')).toContainText('paid 30 test USDC');
  await expect(page.getByText(/combine up to 58\.919893 pairs/)).toBeVisible();
  await page.locator('.amount-control').getByRole('button', { name: 'Max' }).click();
  await page.locator('.amount-control').getByRole('button', { name: 'Combine & redeem stock' }).click();
  await expect(page.getByText(/combine up to 0\.000000 pairs/)).toBeVisible();

  await page.getByRole('button', { name: 'Show dividend payout ready' }).click();
  await expect(page.getByRole('heading', { name: 'Redeem each token separately.' })).toBeVisible();
  const sellerPt = page.locator('.amount-control').first();
  await sellerPt.getByRole('button', { name: 'Max' }).click();
  await sellerPt.getByRole('button', { name: 'Redeem' }).click();
  await page.getByRole('button', { name: 'View Dividend buyer' }).click();
  await expect(page.getByText(/Dividend buyer/).first()).toBeVisible();
  const buyerDr = page.locator('.amount-control').nth(1);
  await buyerDr.getByRole('button', { name: 'Max' }).click();
  await buyerDr.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByRole('heading', { name: 'All of this series has been redeemed.' })).toBeVisible();
});

test('reset and entry-point state isolation work', async ({ page }) => {
  await splitKox(page);
  await page.getByText('Preview controls').click();
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a stock. Separate its dividends.' })).toBeVisible();
  await splitKox(page);
  await page.goto('/rehearsal/');
  await page.getByRole('button', { name: 'Positions' }).click();
  await expect(page.getByRole('heading', { name: 'No demo position yet.' })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`product keyboard and overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId('product-asset-KOx').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId('product-split-action').click();
    await page.locator('.after-split').getByRole('button', { name: 'Redeem' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('capture product Market, Split and Redeem at desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: 'apps/web/qa/product-market-1440.png', fullPage: true });
  await page.getByTestId('product-asset-KOx').click();
  await page.screenshot({ path: 'apps/web/qa/product-split-1440.png', fullPage: true });
  await page.getByTestId('product-split-action').click();
  await page.locator('.after-split').getByRole('button', { name: 'Redeem' }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: 'apps/web/qa/product-redeem-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Market' }).click();
  await page.screenshot({ path: 'apps/web/qa/product-market-390.png', fullPage: true });
  await page.getByTestId('product-asset-KOx').click();
  await page.screenshot({ path: 'apps/web/qa/product-split-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Redeem' }).first().click();
  await page.screenshot({ path: 'apps/web/qa/product-redeem-390.png', fullPage: true });
});
