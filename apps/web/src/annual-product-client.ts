import {
  toRawAmount,
  type AssetDescriptor,
  type EventDescriptor,
} from '@dividendx/sdk';
import {
  AnnualReferenceModel,
  type AnnualAllocation,
  type AnnualClaimSide,
  type AnnualEventRecord,
  type AnnualReferenceState,
  type AnnualTermIdentity,
} from '../../../packages/sdk/src/annual-reference';

export type ProductAccount = 'seller' | 'buyer';
export type ProductYear = 2027 | 2028;
export type AnnualStage = 'deposits_open' | 'collecting' | 'year_ended' | 'finalized';

export interface ProductAnnualSeries {
  id: string;
  assetId: string;
  sourceEventId: string;
  year: ProductYear;
  stage: AnnualStage;
  sourceReplayed: boolean;
  sourceTestExDate: string | null;
  syntheticAdded: boolean;
  syntheticTestExDate: string | null;
  saleCompleted: boolean;
  activeFactor: string;
  allocation: AnnualAllocation;
  model: AnnualReferenceState;
}

export interface AnnualProductState {
  series: Record<string, ProductAnnualSeries>;
  stockRaw: Record<ProductAccount, Record<string, bigint>>;
  cashUsdcRaw: Record<ProductAccount, bigint>;
}

interface Session {
  asset: AssetDescriptor;
  source: EventDescriptor;
  model: AnnualReferenceModel;
  stage: AnnualStage;
  sourceReplayed: boolean;
  sourceTestExDate: string | null;
  syntheticAdded: boolean;
  syntheticTestExDate: string | null;
  saleCompleted: boolean;
  activeFactor: string;
}

const accounts: ProductAccount[] = ['seller', 'buyer'];
const USDC = 1_000_000n;

function addHalfPercent(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  const denominatorPlaces = fraction.length + 3;
  const numerator = BigInt(whole + fraction) * 1_005n;
  const digits = numerator.toString().padStart(denominatorPlaces + 1, '0');
  const result = `${digits.slice(0, -denominatorPlaces)}.${digits.slice(-denominatorPlaces)}`;
  return result.replace(/\.?0+$/, '');
}

function testExDate(source: EventDescriptor, year: ProductYear): string {
  return source.evidenceKind === 'issuer_api' ? `${year}-03-15` : `${year}-07-15`;
}

function termFor(asset: AssetDescriptor, year: ProductYear): AnnualTermIdentity {
  return { chain: 'solana', issuer: asset.issuerId, mint: asset.mint, symbol: asset.symbol, year };
}

export class AnnualProductClient {
  private readonly assets: AssetDescriptor[];
  private readonly sources: EventDescriptor[];
  private readonly sessions = new Map<string, Session>();
  private stockRaw: AnnualProductState['stockRaw'] = { seller: {}, buyer: {} };
  private cashUsdcRaw: AnnualProductState['cashUsdcRaw'] = { seller: 0n, buyer: 1_000n * USDC };

  constructor(assets: AssetDescriptor[], sources: EventDescriptor[]) {
    this.assets = assets;
    this.sources = sources;
    this.reset();
  }

  reset(): void {
    this.sessions.clear();
    this.stockRaw = { seller: {}, buyer: {} };
    for (const asset of this.assets) {
      const source = this.sourceFor(asset);
      this.stockRaw.seller[asset.id] = source ? toRawAmount('200', asset.decimals, source.m0) : 0n;
      this.stockRaw.buyer[asset.id] = 0n;
    }
    this.cashUsdcRaw = { seller: 0n, buyer: 1_000n * USDC };
  }

  getState(): AnnualProductState {
    const series: Record<string, ProductAnnualSeries> = {};
    for (const [id, session] of this.sessions) {
      series[id] = {
        id,
        assetId: session.asset.id,
        sourceEventId: session.source.id,
        year: session.model.term.year as ProductYear,
        stage: session.stage,
        sourceReplayed: session.sourceReplayed,
        sourceTestExDate: session.sourceTestExDate,
        syntheticAdded: session.syntheticAdded,
        syntheticTestExDate: session.syntheticTestExDate,
        saleCompleted: session.saleCompleted,
        activeFactor: session.activeFactor,
        allocation: session.model.previewAllocation(),
        model: session.model.getState(),
      };
    }
    return {
      series,
      stockRaw: {
        seller: { ...this.stockRaw.seller },
        buyer: { ...this.stockRaw.buyer },
      },
      cashUsdcRaw: { ...this.cashUsdcRaw },
    };
  }

  seriesId(asset: AssetDescriptor, year: ProductYear): string {
    return new AnnualReferenceModel(termFor(asset, year), accounts).seriesId;
  }

  previewDeposit(asset: AssetDescriptor, display: string): bigint {
    const source = this.requireSource(asset);
    const raw = toRawAmount(display, asset.decimals, source.m0);
    if (raw > (this.stockRaw.seller[asset.id] ?? 0n)) throw new Error('Amount exceeds your test stock balance.');
    return raw;
  }

  deposit(asset: AssetDescriptor, year: ProductYear, display: string): string {
    const source = this.requireSource(asset);
    const raw = this.previewDeposit(asset, display);
    const model = new AnnualReferenceModel(termFor(asset, year), accounts);
    const id = model.seriesId;
    if (this.sessions.has(id)) throw new Error('This annual series already has a test deposit.');
    model.deposit('seller', raw, model.startSeconds - 1);
    this.stockRaw.seller[asset.id] -= raw;
    this.sessions.set(id, {
      asset,
      source,
      model,
      stage: 'deposits_open',
      sourceReplayed: false,
      sourceTestExDate: null,
      syntheticAdded: false,
      syntheticTestExDate: null,
      saleCompleted: false,
      activeFactor: source.m0,
    });
    return id;
  }

  startYear(id: string): void {
    const session = this.requireSession(id);
    if (session.stage !== 'deposits_open') throw new Error('The test year has already started.');
    session.stage = 'collecting';
  }

  replaySource(id: string): void {
    const session = this.requireSession(id);
    if (session.stage !== 'collecting') throw new Error('Start the test year before replaying its example dividend.');
    if (session.sourceReplayed) throw new Error('The sourced example has already been replayed.');
    const exDate = testExDate(session.source, session.model.term.year as ProductYear);
    session.model.recordEvent(this.sourceRecord(session, exDate));
    session.sourceReplayed = true;
    session.sourceTestExDate = exDate;
    session.activeFactor = session.source.m1;
  }

  addSyntheticDividend(id: string): void {
    const session = this.requireSession(id);
    if (session.stage !== 'collecting') throw new Error('Synthetic events can only be added while the test year is collecting.');
    if (!session.sourceReplayed) throw new Error('Replay the sourced factor example first.');
    if (session.syntheticAdded) throw new Error('The synthetic second dividend has already been added.');
    const year = session.model.term.year as ProductYear;
    const m0 = session.activeFactor;
    const m1 = addHalfPercent(m0);
    const exDate = `${year}-09-15`;
    session.model.recordEvent({
      id: `${session.model.seriesId}:synthetic-dividend-2`,
      revision: 1,
      chain: session.model.term.chain,
      issuer: session.model.term.issuer,
      mint: session.model.term.mint,
      exDate,
      status: 'qualified',
      m0,
      m1,
      finalized: true,
    });
    session.syntheticAdded = true;
    session.syntheticTestExDate = exDate;
    session.activeFactor = m1;
  }

  endYear(id: string): void {
    const session = this.requireSession(id);
    if (session.stage !== 'collecting') throw new Error('Start the test year before ending it.');
    session.stage = 'year_ended';
  }

  finalize(id: string): void {
    const session = this.requireSession(id);
    if (session.stage !== 'year_ended') throw new Error('End the test year before finalizing its synthetic journal.');
    session.model.finalize(session.model.maturitySeconds, true);
    session.stage = 'finalized';
  }

  sellFortyPercentDr(id: string): { raw: bigint; cashRaw: bigint } {
    const session = this.requireSession(id);
    if (session.saleCompleted) throw new Error('The 40% test sale has already been completed.');
    const seller = session.model.getState().accounts.seller;
    const raw = seller.drRaw * 40n / 100n;
    const cashRaw = BigInt(session.asset.issuerId === 'backpack' ? 5 : 30) * USDC;
    if (raw <= 0n) throw new Error('No DR balance is available to sell.');
    if (this.cashUsdcRaw.buyer < cashRaw) throw new Error('The test buyer has insufficient USDC.');
    session.model.transfer('seller', 'buyer', 'dr', raw);
    this.cashUsdcRaw.buyer -= cashRaw;
    this.cashUsdcRaw.seller += cashRaw;
    session.saleCompleted = true;
    return { raw, cashRaw };
  }

  recombine(id: string, account: ProductAccount, raw: bigint): bigint {
    const session = this.requireSession(id);
    session.model.recombine(account, raw);
    this.stockRaw[account][session.asset.id] = (this.stockRaw[account][session.asset.id] ?? 0n) + raw;
    return raw;
  }

  previewRedemption(id: string, account: ProductAccount, side: AnnualClaimSide, raw: bigint): bigint {
    return this.requireSession(id).model.previewRedemption(account, side, raw);
  }

  redeem(id: string, account: ProductAccount, side: AnnualClaimSide, raw: bigint): bigint {
    const session = this.requireSession(id);
    const payout = session.model.redeem(account, side, raw);
    this.stockRaw[account][session.asset.id] = (this.stockRaw[account][session.asset.id] ?? 0n) + payout;
    return payout;
  }

  closeZero(id: string, account: ProductAccount, side: AnnualClaimSide, raw: bigint): bigint {
    const session = this.requireSession(id);
    const payout = session.model.redeem(account, side, raw, { allowZero: true });
    this.stockRaw[account][session.asset.id] = (this.stockRaw[account][session.asset.id] ?? 0n) + payout;
    return payout;
  }

  sourceEvent(id: string): EventDescriptor {
    return this.requireSession(id).source;
  }

  private sourceRecord(session: Session, exDate: string): AnnualEventRecord {
    return {
      id: `${session.model.seriesId}:historical-factor-example`,
      revision: 1,
      chain: session.model.term.chain,
      issuer: session.model.term.issuer,
      mint: session.model.term.mint,
      exDate,
      status: 'qualified',
      m0: session.source.m0,
      m1: session.source.m1,
      finalized: true,
    };
  }

  private sourceFor(asset: AssetDescriptor): EventDescriptor | undefined {
    return asset.eventFixtureId ? this.sources.find((source) => source.id === asset.eventFixtureId) : undefined;
  }

  private requireSource(asset: AssetDescriptor): EventDescriptor {
    const source = this.sourceFor(asset);
    if (!source) throw new Error('This stock token still needs a reviewed dividend-factor example.');
    return source;
  }

  private requireSession(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Unknown annual series.');
    return session;
  }
}
