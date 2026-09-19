import type { DemoStep } from '../../../../packages/guided-runtime/src/contract';

export interface StepCopy {
  id: DemoStep;
  chapter: 1 | 2 | 3;
  eyebrow: string;
  title: string;
  action: string;
  why: string;
  actor: 'provider' | 'buyer' | 'system';
}

export const DEMO_STEPS: readonly StepCopy[] = [
  { id: 'core-split', chapter: 1, eyebrow: 'Separate the rights', title: 'Split 100 tokenized stocks.', action: 'Split 100 stocks', why: '100 stocks become 100 stock-exposure tokens (PT) and 100 dividend-right tokens (DR). DR count describes claims, not a payout amount.', actor: 'provider' },
  { id: 'core-recombine-partial', chapter: 1, eyebrow: 'Put some back', title: 'Recombine 40 matching pairs.', action: 'Recombine 40 PT + 40 DR', why: '40 PT and 40 DR return 40 stocks before any dividend event. The other 60 pairs remain backed in the vault.', actor: 'provider' },
  { id: 'core-recombine-rest', chapter: 1, eyebrow: 'Complete the round trip', title: 'Recombine the remaining 60 pairs.', action: 'Recombine remaining 60 pairs', why: 'The holder receives all 100 stocks back. The wallet balances below show the completed round trip.', actor: 'provider' },
  { id: 'dividend-split', chapter: 2, eyebrow: 'Start the year', title: 'Split the returned 100 stocks.', action: 'Split 100 stocks for the year', why: 'The holder gets 100 PT and 100 DR again. The next two actions record quarterly dividends.', actor: 'provider' },
  { id: 'dividend-quarter-one', chapter: 2, eyebrow: 'First sample quarter', title: 'Record the first dividend.', action: 'Advance to quarter one', why: 'The dividend changes the stock allocation. A matching PT + DR pair now returns 1.01 stocks, while DR count stays at 100.', actor: 'system' },
  { id: 'dividend-quarter-two', chapter: 2, eyebrow: 'Second sample quarter', title: 'Record the second dividend.', action: 'Advance to quarter two', why: 'After two sample quarters, each matching PT + DR pair returns 1.02 stocks. DR count remains 100.', actor: 'system' },
  { id: 'dividend-recombine', chapter: 2, eyebrow: 'See the dividend effect', title: 'Recombine 40 pairs after two quarters.', action: 'Recombine 40 PT + 40 DR', why: '40 matching pairs return 40.8 stocks in this sample. The holder keeps 60 PT and 60 DR for the market chapter.', actor: 'provider' },
  { id: 'create-pool', chapter: 3, eyebrow: 'Open a market', title: 'Seed a DR / USDC pool.', action: 'Open pool · 24 DR + 4 USDC', why: 'The holder supplies 24 of the remaining 60 DR and 4 USDC to a Raydium pool.', actor: 'provider' },
  { id: 'add-liquidity', chapter: 3, eyebrow: 'Add liquidity', title: 'Add the remaining DR liquidity.', action: 'Add liquidity · up to 36 DR + 6 USDC', why: 'The holder adds up to 36 DR with 6 USDC and receives LP tokens. The pool may leave a tiny DR remainder in the wallet. The annual cutoff has passed, so no new stock deposits occur.', actor: 'provider' },
  { id: 'buy-dr', chapter: 3, eyebrow: 'Trade the dividend right', title: 'A buyer acquires DR through the pool.', action: 'Buy DR with 1 USDC', why: 'A second wallet swaps 1 USDC for DR. A trader may want dividend income; a fund may buy rights to help offset dividend payments it owes. These rights include accrued and remaining dividends for the year.', actor: 'buyer' },
  { id: 'remove-liquidity', chapter: 3, eyebrow: 'Leave the pool', title: 'Withdraw holder-owned liquidity.', action: 'Withdraw holder LP liquidity', why: 'LP tokens withdraw the holder’s pool share. Compare the returned USDC with the 10 USDC supplied; the buyer paid USDC for DR. LP tokens are not dividend claims.', actor: 'provider' },
  { id: 'recombine', chapter: 3, eyebrow: 'Pair recovered claims', title: 'Recombine recovered DR with matching PT.', action: 'Recombine paired PT + DR', why: 'The holder pairs recovered DR with PT before year-end settlement. Buyer and pool-held DR remain backed.', actor: 'provider' },
  { id: 'settle-year', chapter: 3, eyebrow: 'Fast-forward the year', title: 'Finish the dividend year.', action: 'Fast-forward to year end', why: 'Two further quarterly dividends are recorded, then the year is finalized. Stock outside the vault also reflects the changing allocation.', actor: 'system' },
  { id: 'redeem-buyer', chapter: 3, eyebrow: 'Buyer exit', title: 'Buyer redeems purchased DR.', action: 'Redeem buyer DR', why: 'The buyer receives the dividend-derived stock assigned to their DR claims.', actor: 'buyer' },
  { id: 'redeem-provider', chapter: 3, eyebrow: 'Holder exit', title: 'Holder redeems remaining PT.', action: 'Redeem holder PT', why: 'After finalization, the holder redeems remaining PT for its stock-exposure allocation. Pool-held DR stays backed.', actor: 'provider' },
] as const;

export const stepCopy = (step: DemoStep | null): StepCopy | undefined => DEMO_STEPS.find((item) => item.id === step);
