import type { DemoStep } from '../../../../packages/guided-runtime/src/contract';

export interface StepCopy {
  id: DemoStep;
  eyebrow: string;
  title: string;
  action: string;
  why: string;
  actor: 'provider' | 'buyer' | 'system';
}

export const DEMO_STEPS: readonly StepCopy[] = [
  { id: 'split', eyebrow: 'Create the two claims', title: 'Split 100 test stock into PT and DR.', action: 'Split 100 test stock', why: 'One stock position becomes 100 PT and 100 DR claim units, backed by the same vault. The DR represent rights tied to the deposit, not 100 stock units of dividend payout.', actor: 'provider' },
  { id: 'create-pool', eyebrow: 'Open the market', title: 'Seed a Raydium DR market.', action: 'Open market · 40 DR + 80 quote', why: 'The Stock holder opens a local pool with 40 DR and 80 units of worthless test quote.', actor: 'provider' },
  { id: 'add-liquidity', eyebrow: 'Deepen the market', title: 'Add more DR liquidity.', action: 'Add liquidity · 60 DR + 120 quote', why: 'The Stock holder supplies another 60 DR and 120 test quote and receives LP tokens.', actor: 'provider' },
  { id: 'buy-dr', eyebrow: 'Trade through Raydium', title: 'Buy dividend rights through the pool.', action: 'Buy DR with 20 test quote', why: 'The Dividend buyer signs a swap. The result comes from the actual local pool, so no output is promised in advance.', actor: 'buyer' },
  { id: 'remove-liquidity', eyebrow: 'Withdraw from Raydium', title: 'Withdraw all user-held LP liquidity.', action: 'Withdraw all LP liquidity', why: 'LP tokens withdraw the Stock holder’s share of the pool. LP tokens cannot redeem against DividendX.', actor: 'provider' },
  { id: 'recombine', eyebrow: 'Exit with paired claims', title: 'Recombine recovered DR with matching PT.', action: 'Recombine paired PT + DR', why: 'Matching PT and recovered DR return stock before finalization. The buyer’s DR and Raydium’s locked residual DR stay backed.', actor: 'provider' },
  { id: 'settle-year', eyebrow: 'Accelerate local time', title: 'Fast-forward the local test year.', action: 'Fast-forward test year', why: 'Demo settlement advances the isolated chain through 2027. Four sample dividends are recorded, then each wallet can redeem its share.', actor: 'system' },
  { id: 'redeem-buyer', eyebrow: 'Redeem one side', title: 'Buyer redeems the purchased DR.', action: 'Redeem buyer DR independently', why: 'The buyer owns the dividend rights they purchased and receives the dividend-derived test stock assigned to those claims.', actor: 'buyer' },
  { id: 'redeem-provider', eyebrow: 'Redeem the other side', title: 'Stock holder redeems remaining PT.', action: 'Redeem Stock holder PT independently', why: 'After finalization, PT redeems independently for its stock-exposure allocation. This is different from paired recombination.', actor: 'provider' },
] as const;

export const stepCopy = (step: DemoStep | null): StepCopy | undefined => DEMO_STEPS.find((item) => item.id === step);
