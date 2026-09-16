import { expect, test, type Page } from '@playwright/test';

async function openKox(page: Page) {
  await page.goto('/');
  await page.getByTestId('product-asset-KOx').click();
  await expect(page.getByRole('heading', { name: 'One stock. Two annual tokens.' })).toBeVisible();
}

async function splitKox(page: Page, amount = '100', year: '2027' | '2028' = '2027') {
  await openKox(page);
  await page.getByTestId('product-year').selectOption(year);
  await page.getByTestId('product-split-amount').fill(amount);
  await page.getByTestId('product-split-action').click();
  await expect(page.getByText('Your annual claims', { exact: true })).toBeVisible();
}

async function openSeries(page: Page) {
  await page.locator('.after-split').getByRole('button', { name: 'Open series' }).click();
  await expect(page.getByRole('heading', { name: 'Get the current stock token back.' })).toBeVisible();
  await page.getByText('Preview controls').click();
}

async function startAndReplay(page: Page) {
  await page.getByRole('button', { name: 'Start year · close deposits' }).click();
  await expect(page.getByTestId('series-status')).toContainText('Collecting dividends');
  await page.getByRole('button', { name: 'Replay example dividend' }).click();
  await expect(page.getByRole('status')).toContainText('redemption remains locked');
}

async function endAndFinalize(page: Page) {
  await page.getByRole('button', { name: 'End year' }).click();
  await expect(page.getByTestId('series-status')).toContainText('Year ended · awaiting finalization');
  await page.getByRole('button', { name: 'Finalize test journal' }).click();
  await expect(page.getByTestId('series-status')).toContainText('Ready to redeem');
  await expect(page.getByRole('heading', { name: 'Redeem PT and DR separately.' })).toBeVisible();
}

test('company hierarchy preserves pending Ondo and identifies historical factors as test-term examples', async ({ page }) => {
  await page.goto('/');
  const cocaCola = page.locator('.company-section').filter({ has: page.getByRole('heading', { name: 'Coca-Cola' }) });
  await expect(cocaCola.getByTestId('product-asset-KOx')).toContainText('Historical factors · test term dates');
  await page.getByPlaceholder('Coca-Cola, KO…').fill('Apple');
  await page.getByRole('button', { name: 'Ondo', exact: true }).click();
  await expect(page.getByTestId('product-asset-AAPLon')).toContainText('A verified Ondo dividend event is still needed.');
  await page.getByTestId('product-asset-AAPLon').click();
  await expect(page.getByTestId('product-split-action')).toBeDisabled();
  await expect(page.getByText('Choose a token with a reviewed historical factor example.')).toBeVisible();
});

test('split chooses an exact annual series and mints equal named PT and DR claims', async ({ page }) => {
  await openKox(page);
  await expect(page.getByTestId('product-year')).toHaveValue('2027');
  const result = page.getByTestId('mint-result');
  await expect(result).toContainText('98.199821 PT');
  await expect(result).toContainText('98.199821 DR');
  await expect(result).toContainText('PT-KOx-2027');
  await expect(result).toContainText('DR-KOx-2027');
  await expect(page.getByText('Historical factors · test term dates. One historical factor example, not a full-year payout or forecast.')).toBeVisible();
  await page.getByText('Details & sources').click();
  await expect(page.getByText('PT-KOx-2027 · DR-KOx-2027', { exact: true })).toBeVisible();
  await expect(page.getByText('2028-01-01 00:00 UTC', { exact: true })).toBeVisible();
  await expect(page.getByText('Not present in this source fixture', { exact: true })).toBeVisible();
  await expect(page.getByText('One sourced dividend example, not a complete annual payout or a 2027 forecast.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Wallet transfer/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Trade on AMM/ })).toBeDisabled();
});

test('replay accrues an allocation but year end alone cannot enable independent redemption', async ({ page }) => {
  await splitKox(page);
  await openSeries(page);
  await expect(page.getByText('Historical factors · test term dates. One historical factor example, not a full-year payout or forecast.')).toBeVisible();
  await startAndReplay(page);
  await expect(page.getByRole('heading', { name: 'Redeem PT and DR separately.' })).toHaveCount(0);
  await page.getByText('Details & sources').click();
  await expect(page.getByText('PT 9779376057 · DR 40606027 raw', { exact: true })).toBeVisible();
  await expect(page.getByText('2027-03-15 · test only', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'End year' }).click();
  await expect(page.getByTestId('series-status')).toContainText('Year ended · awaiting finalization');
  await expect(page.getByRole('heading', { name: 'Redeem PT and DR separately.' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Get the current stock token back.' })).toBeVisible();
});

test('paired recombination remains available after the first dividend', async ({ page }) => {
  await splitKox(page);
  await openSeries(page);
  await startAndReplay(page);
  const combine = page.locator('.amount-control').first();
  await combine.getByRole('button', { name: '50%' }).click();
  await combine.getByRole('button', { name: 'Combine & return stock' }).click();
  await expect(page.locator('.p-success')).toContainText('No chain receipt was created');
  await expect(page.getByTestId('series-status')).toContainText('Collecting dividends');
  await expect(page.getByText(/Matching PT-KOx-2027 \+ DR-KOx-2027/)).toBeVisible();
});

test('paid 40% DR sale conserves cash, limits recombination, and DR survives maturity', async ({ page }) => {
  await splitKox(page);
  await openSeries(page);
  await startAndReplay(page);
  await page.getByRole('button', { name: 'Sell 40% DR to Dividend buyer' }).click();
  await expect(page.getByRole('status')).toContainText('paid 30 test USDC');
  await expect(page.locator('.cash-ledger')).toContainText('You 30.00 · Buyer 970.00 · Total 1000.00');
  const combine = page.locator('.amount-control').first();
  await combine.getByRole('button', { name: 'Max' }).click();
  await combine.getByRole('button', { name: 'Combine & return stock' }).click();
  await expect(page.getByText(/Matching PT-KOx-2027 \+ DR-KOx-2027/)).toBeVisible();
  await page.getByRole('button', { name: 'End year' }).click();
  await page.getByRole('button', { name: 'View Dividend buyer' }).click();
  await expect(page.locator('.your-tokens')).toContainText('39.279928');
  await expect(page.getByTestId('series-status')).toContainText('awaiting finalization');
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
});

test('finalization enables independent PT and DR redemption', async ({ page }) => {
  await splitKox(page);
  await openSeries(page);
  await startAndReplay(page);
  await endAndFinalize(page);
  const pt = page.locator('.redemption-control').first();
  const dr = page.locator('.redemption-control').nth(1);
  await pt.getByRole('button', { name: 'Max' }).click();
  await pt.getByRole('button', { name: 'Redeem', exact: true }).click();
  await dr.getByRole('button', { name: 'Max' }).click();
  await dr.getByRole('button', { name: 'Redeem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All of this annual series has been redeemed.' })).toBeVisible();
});

test('zero-DR closure requires separate explicit consent', async ({ page }) => {
  await splitKox(page, '25', '2028');
  await openSeries(page);
  await page.getByRole('button', { name: 'Start year · close deposits' }).click();
  await page.getByRole('button', { name: 'End year' }).click();
  await page.getByRole('button', { name: 'Finalize test journal' }).click();
  const dr = page.locator('.redemption-control').nth(1);
  await dr.getByRole('button', { name: 'Max' }).click();
  await expect(dr.getByRole('button', { name: 'Redeem', exact: true })).toBeDisabled();
  const close = dr.getByRole('button', { name: 'Close zero-value DR claims' });
  await expect(close).toBeDisabled();
  await dr.getByRole('checkbox').check();
  await close.click();
  await expect(page.locator('.p-success')).toContainText('explicit consent');
});

test('recovered stock becomes spendable for a later year without double counting', async ({ page }) => {
  await splitKox(page, '100', '2027');
  await openSeries(page);
  const combine = page.locator('.amount-control').first();
  await combine.getByRole('button', { name: 'Max' }).click();
  await combine.getByRole('button', { name: 'Combine & return stock' }).click();
  await expect(page.getByText(/Current test stock balance · 200\.000000 KOx/)).toBeVisible();
  await page.getByRole('button', { name: 'Market', exact: true }).click();
  await page.getByTestId('product-asset-KOx').click();
  await page.getByTestId('product-year').selectOption('2028');
  await page.getByTestId('product-split-amount').fill('150');
  await expect(page.getByTestId('product-split-action')).toBeEnabled();
  await page.getByTestId('product-split-action').click();
  await expect(page.getByText(/Current test stock balance · 50\.0000 KOx/)).toBeVisible();
  await expect(page.locator('.after-split')).toContainText('PT-KOx-2028');
});

test('2027 and 2028 series remain isolated', async ({ page }) => {
  await splitKox(page, '25', '2027');
  await page.getByRole('button', { name: 'Market', exact: true }).click();
  await page.getByTestId('product-asset-KOx').click();
  await page.getByTestId('product-year').selectOption('2028');
  await page.getByTestId('product-split-amount').fill('25');
  await page.getByTestId('product-split-action').click();
  await openSeries(page);
  await startAndReplay(page);
  const picker = page.getByLabel('Annual token series');
  await expect(picker.locator('option')).toHaveCount(2);
  await picker.selectOption({ label: 'Coca-Cola · KOx · 2027' });
  await expect(page.getByTestId('series-status')).toContainText('Deposits open · year not started');
  await page.getByText('Details & sources').click();
  await expect(page.getByText('PT 2454995521 · DR 0 raw', { exact: true })).toBeVisible();
});

test('reset and legacy rehearsal state isolation work', async ({ page }) => {
  await splitKox(page);
  await page.getByText('Preview controls').click();
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a stock. Separate a year of dividends.' })).toBeVisible();
  await page.goto('/rehearsal/');
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No demo position yet.' })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`annual product keyboard and overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId('product-asset-KOx').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId('product-split-action').click();
    await page.locator('.after-split').getByRole('button', { name: 'Open series' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('capture annual Market, Split and collecting Redeem at desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: 'apps/web/qa/product-market-1440.png', fullPage: true });
  await page.getByTestId('product-asset-KOx').click();
  await page.screenshot({ path: 'apps/web/qa/product-split-1440.png', fullPage: true });
  await page.getByTestId('product-split-action').click();
  await page.locator('.after-split').getByRole('button', { name: 'Open series' }).click();
  if (!(await page.locator('.simulation-controls').evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.getByText('Preview controls').click();
  }
  await startAndReplay(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: 'apps/web/qa/product-redeem-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'apps/web/qa/product-market-390.png', fullPage: true });
  await page.getByTestId('product-asset-KOx').click();
  await page.screenshot({ path: 'apps/web/qa/product-split-390.png', fullPage: true });
  await page.getByTestId('product-split-action').click();
  await page.locator('.after-split').getByRole('button', { name: 'Open series' }).click();
  if (!(await page.locator('.simulation-controls').evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.getByText('Preview controls').click();
  }
  await startAndReplay(page);
  await page.screenshot({ path: 'apps/web/qa/product-redeem-390.png', fullPage: true });
});
