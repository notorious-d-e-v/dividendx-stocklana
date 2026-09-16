import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const macOSChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(macOSChrome) ? macOSChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/rehearsal/');
  await page.getByTestId('asset-MU.US').click();
  await expect(page.getByTestId('allocation')).toContainText('0.0107');
  await page.getByTestId('start-split').click();
  await expect(page.locator('.wallet-ledger')).toContainText('900.0000');
  await expect(page.getByTestId('offer-input')).toHaveValue('5');
  await page.getByRole('button', { name: /Review Buyer/ }).click();
  await page.getByRole('button', { name: 'Accept as Buyer' }).click();
  await page.getByRole('button', { name: /Replay dividend/ }).click();
  const pt = page.locator('.redeem-control.pt');
  await pt.getByRole('button', { name: 'Max' }).click();
  await pt.getByRole('button', { name: /Redeem/ }).click();
  await page.getByLabel('Demo account').selectOption('buyer');
  const dr = page.locator('.redeem-control.dr');
  await dr.getByRole('button', { name: 'Max' }).click();
  await dr.getByRole('button', { name: /Redeem/ }).click();
  await expect(page.getByRole('heading', { name: 'All claims redeemed.' })).toBeVisible();
  assert.deepEqual(errors, []);
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  console.log('Skip link:', await page.locator('.skip-link').evaluate(element => ({ focused: document.activeElement === element, transform: getComputedStyle(element).transform, top: element.getBoundingClientRect().top })));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `Completion overflow at ${width}`);
    await page.screenshot({ path: `apps/web/qa/astra-mu-complete-${width}.png`, fullPage: true });
  }
  console.log('PASS independent Chrome MU flow: event factor, paid sale, seller PT/buyer DR redemption, desktop/mobile completion, no page errors.');
} finally {
  await browser.close();
}
