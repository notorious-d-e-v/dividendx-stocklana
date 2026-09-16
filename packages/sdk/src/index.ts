export type IssuerId = 'xstocks' | 'backpack' | 'ondo';
export type WalletId = 'seller' | 'buyer';
export type ClaimSide = 'pt' | 'dr';
export type SeriesPhase = 'open' | 'closed' | 'settled' | 'complete' | 'cancelled';
export type DemoCondition = 'ready' | 'stale' | 'paused' | 'rejected_event';
export type ReplayClockStatus = 'before_event' | 'at_event';

export interface AssetCapabilities {
  recognized: boolean;
  mintObserved: boolean;
  dividendDocumented: boolean;
  custodyTested: boolean;
  executionTested: boolean;
  liveEnabled: boolean;
}

export interface AssetDescriptor {
  id: string;
  company: string;
  underlying: string;
  symbol: string;
  issuerId: IssuerId;
  mint: string;
  decimals: number;
  tokenProgram: string;
  snapshotAt: string;
  observedSlot: number | null;
  effectiveMultiplier: string;
  sourceUrls: string[];
  evidencePaths: string[];
  capabilities: AssetCapabilities;
  eventFixtureId: string | null;
  statusDetail: string;
  issuerControlNote: string;
}

export interface EventDescriptor {
  id: string;
  assetId: string;
  issuerEventId: string | null;
  revision: string | number | null;
  kind: string;
  evidenceKind: string;
  m0: string;
  m1: string;
  actualEventAt: string;
  snapshotAt: string;
  issuerRecordStatus: string | null;
  companyPaymentDate: string | null;
  netCashflowUsd: string | null;
  referencePriceUsd: string | null;
  sourceUrls: string[];
  evidencePaths: string[];
  sourceDigest: string;
  finality: string;
}

export interface ClaimBalance { pt: bigint; dr: bigint }
export interface DemoWallet {
  collateral: Record<string, bigint>;
  usdc: bigint;
  claims: Record<string, ClaimBalance>;
}

export interface DemoSeries {
  id: string;
  assetId: string;
  eventId: string;
  phase: SeriesPhase;
  accountedCollateralRaw: bigint;
  originalSupplyRaw: bigint;
  originalPtPoolRaw: bigint;
  originalDrPoolRaw: bigint;
  ptPoolRaw: bigint;
  drPoolRaw: bigint;
  ptSupplyRaw: bigint;
  drSupplyRaw: bigint;
  cumulativePtBurnedRaw: bigint;
  cumulativeDrBurnedRaw: bigint;
  replayClock: ReplayClockStatus;
}

export interface AmountChange {
  walletId?: WalletId;
  assetId?: string;
  seriesId?: string;
  field: 'collateral' | 'usdc' | 'pt' | 'dr' | 'accounted_collateral';
  delta: bigint;
}

export type DemoAction = 'deposit' | 'sale' | 'close_deposits' | 'settle' | 'redeem' | 'recombine';
export interface DemoReceipt {
  id: `demo-${string}`;
  kind: 'demo';
  action: DemoAction;
  seriesId: string;
  timestamp: number;
  summary: string;
  changes: AmountChange[];
}

export interface DemoState {
  version: number;
  condition: DemoCondition;
  wallets: Record<WalletId, DemoWallet>;
  series: Record<string, DemoSeries>;
  receipts: DemoReceipt[];
}

export interface AllocationPreview {
  assetId: string;
  eventId: string;
  input: string;
  collateralRaw: bigint;
  ptPoolRaw: bigint;
  drPoolRaw: bigint;
  pairedClaimRaw: bigint;
}

export interface SaleQuote {
  id: string;
  seriesId: string;
  seller: 'seller';
  buyer: 'buyer';
  drRaw: bigint;
  usdcTotalRaw: bigint;
  version: number;
  expiresAt: number;
}

export type DemoErrorCode =
  | 'INVALID_AMOUNT' | 'MISSING_ASSET' | 'MISSING_EVENT' | 'INVALID_FIXTURE'
  | 'INSUFFICIENT_BALANCE' | 'STALE_DATA' | 'PAUSED_COLLATERAL'
  | 'REJECTED_EVENT' | 'DEPOSITS_CLOSED' | 'WRONG_PHASE'
  | 'STALE_QUOTE' | 'EXPIRED_QUOTE' | 'MISSING_QUOTE' | 'USER_REJECTED'
  | 'ZERO_PAYOUT' | 'ALREADY_SETTLED';

export class DemoError extends Error {
  readonly code: DemoErrorCode;
  constructor(code: DemoErrorCode, message: string) {
    super(message);
    this.name = 'DemoError';
    this.code = code;
  }
}

export interface DemoClient {
  getState(): DemoState;
  preview(assetId: string, stockAmount: string): AllocationPreview;
  deposit(assetId: string, stockAmount: string): Promise<DemoReceipt>;
  quoteSale(seriesId: string, drRaw: bigint, usdcTotalRaw: bigint): SaleQuote;
  acceptSale(quoteId: string, options?: { reject?: boolean }): Promise<DemoReceipt>;
  closeDeposits(seriesId: string): Promise<DemoReceipt>;
  settle(seriesId: string): Promise<DemoReceipt>;
  previewRedemption(seriesId: string, walletId: WalletId, side: ClaimSide, claimRaw: bigint): bigint;
  redeem(seriesId: string, walletId: WalletId, side: ClaimSide, claimRaw: bigint): Promise<DemoReceipt>;
  recombine(seriesId: string, walletId: WalletId, claimRaw: bigint): Promise<DemoReceipt>;
  setCondition(condition: DemoCondition): void;
  reset(): void;
}

const U64_MAX = 18_446_744_073_709_551_615n;
const FACTOR_MAX_LENGTH = 64;
const QUOTE_TTL_MS = 60_000;

function fail(code: DemoErrorCode, message: string): never {
  throw new DemoError(code, message);
}

function pow10(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 36) {
    fail('INVALID_AMOUNT', `Invalid decimal precision: ${exponent}`);
  }
  return 10n ** BigInt(exponent);
}

function assertRaw(value: bigint, allowZero = true): void {
  if (typeof value !== 'bigint' || value < 0n || (!allowZero && value === 0n) || value > U64_MAX) {
    fail('INVALID_AMOUNT', 'Raw amount must be an unsigned u64 value');
  }
}

export function parseDecimal(value: string): { numerator: bigint; denominator: bigint } {
  if (typeof value !== 'string' || value.length === 0 || value.length > FACTOR_MAX_LENGTH || !/^\d+(?:\.\d+)?$/.test(value)) {
    fail('INVALID_AMOUNT', 'Amount must be an unsigned plain decimal string');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 18) fail('INVALID_AMOUNT', 'Decimal precision exceeds 18 places');
  const denominator = pow10(fraction.length);
  return { numerator: BigInt(whole + fraction), denominator };
}

function factor(value: string): { numerator: bigint; denominator: bigint } {
  const parsed = parseDecimal(value);
  if (parsed.numerator === 0n) fail('INVALID_AMOUNT', 'Multiplier must be positive');
  return parsed;
}

export function toRawAmount(display: string, decimals: number, multiplier: string): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    fail('INVALID_AMOUNT', 'Asset decimals must be an integer from 0 to 18');
  }
  const fractionLength = display.includes('.') ? display.length - display.indexOf('.') - 1 : 0;
  if (fractionLength > decimals) fail('INVALID_AMOUNT', `Amount exceeds the asset's ${decimals}-decimal precision`);
  const amount = parseDecimal(display);
  const scale = factor(multiplier);
  const raw = amount.numerator * pow10(decimals) * scale.denominator /
    (amount.denominator * scale.numerator);
  assertRaw(raw);
  return raw;
}

function formatRounded(numerator: bigint, denominator: bigint, places: number, trim: boolean): string {
  if (!Number.isSafeInteger(places) || places < 0 || places > 36) {
    fail('INVALID_AMOUNT', 'Formatting precision must be an integer from 0 to 36');
  }
  const unit = pow10(places);
  const rounded = (numerator * unit * 2n + denominator) / (denominator * 2n);
  const whole = rounded / unit;
  if (places === 0) return whole.toString();
  let fraction = (rounded % unit).toString().padStart(places, '0');
  if (trim) fraction = fraction.replace(/0+$/, '');
  return fraction.length ? `${whole}.${fraction}` : whole.toString();
}

export function formatUnits(raw: bigint, decimals: number, places?: number): string {
  assertRaw(raw);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    fail('INVALID_AMOUNT', 'Asset decimals must be an integer from 0 to 18');
  }
  return formatRounded(raw, pow10(decimals), places ?? decimals, places === undefined);
}

export function formatScaled(raw: bigint, decimals: number, multiplier: string, places?: number): string {
  assertRaw(raw);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    fail('INVALID_AMOUNT', 'Asset decimals must be an integer from 0 to 18');
  }
  const scale = factor(multiplier);
  return formatRounded(raw * scale.numerator, pow10(decimals) * scale.denominator, places ?? decimals, places === undefined);
}

export function allocate(raw: bigint, m0: string, m1: string): { ptPoolRaw: bigint; drPoolRaw: bigint } {
  assertRaw(raw);
  const before = factor(m0);
  const after = factor(m1);
  const increaseNumerator = after.numerator * before.denominator - before.numerator * after.denominator;
  if (increaseNumerator < 0n) fail('INVALID_FIXTURE', 'Event multiplier must not decrease');
  const drPoolRaw = raw * increaseNumerator / (after.numerator * before.denominator);
  return { ptPoolRaw: raw - drPoolRaw, drPoolRaw };
}

export function parseUsdc(display: string): bigint {
  return toRawAmount(display, 6, '1');
}

export function formatUsdc(raw: bigint, places?: number): string {
  return formatUnits(raw, 6, places);
}

function cloneWallet(wallet: DemoWallet): DemoWallet {
  return {
    collateral: { ...wallet.collateral },
    usdc: wallet.usdc,
    claims: Object.fromEntries(Object.entries(wallet.claims).map(([id, claims]) => [id, { ...claims }])),
  };
}

function cloneSeries(series: DemoSeries): DemoSeries {
  return { ...series };
}

function cloneReceipt(receipt: DemoReceipt): DemoReceipt {
  return { ...receipt, changes: receipt.changes.map((change) => ({ ...change })) };
}

function cloneQuote(quote: SaleQuote): SaleQuote {
  return { ...quote };
}

function validateFixtures(assets: readonly AssetDescriptor[], events: readonly EventDescriptor[]): void {
  const assetsById = new Map<string, AssetDescriptor>();
  for (const asset of assets) {
    if (!asset.id || assetsById.has(asset.id)) fail('INVALID_FIXTURE', `Duplicate or empty asset ID: ${asset.id}`);
    if (asset.issuerId !== 'xstocks' && asset.issuerId !== 'backpack' && asset.issuerId !== 'ondo') {
      fail('INVALID_FIXTURE', `Unsupported issuer for asset ${asset.id}`);
    }
    if (asset.id !== `${asset.issuerId}:${asset.mint}`) fail('INVALID_FIXTURE', `Asset ${asset.id} does not match issuer and mint identity`);
    if (!Number.isSafeInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 18) fail('INVALID_FIXTURE', `Invalid decimals for ${asset.id}`);
    factor(asset.effectiveMultiplier);
    assetsById.set(asset.id, asset);
  }

  const eventsById = new Map<string, EventDescriptor>();
  const assetEventCounts = new Map<string, number>();
  for (const event of events) {
    if (!event.id || eventsById.has(event.id)) fail('INVALID_FIXTURE', `Duplicate or empty event ID: ${event.id}`);
    const asset = assetsById.get(event.assetId);
    if (!asset) fail('INVALID_FIXTURE', `Event ${event.id} references unknown asset ${event.assetId}`);
    if (asset.eventFixtureId !== event.id) fail('INVALID_FIXTURE', `Event ${event.id} is not pinned by asset ${asset.id}`);
    if (event.kind !== 'cash_dividend') fail('INVALID_FIXTURE', `Unsupported event kind: ${event.kind}`);
    if (event.finality !== 'trusted_frozen_replay') fail('INVALID_FIXTURE', `Event ${event.id} is not a trusted frozen replay`);
    if (!event.sourceDigest || event.sourceUrls.length === 0 || event.evidencePaths.length === 0) {
      fail('INVALID_FIXTURE', `Event ${event.id} is missing source evidence`);
    }
    const pools = allocate(1_000_000_000_000n, event.m0, event.m1);
    if (pools.drPoolRaw === 0n) fail('INVALID_FIXTURE', `Event ${event.id} has no positive dividend allocation`);
    assetEventCounts.set(event.assetId, (assetEventCounts.get(event.assetId) ?? 0) + 1);
    eventsById.set(event.id, event);
  }
  for (const asset of assets) {
    if (asset.eventFixtureId !== null && !eventsById.has(asset.eventFixtureId)) {
      fail('INVALID_FIXTURE', `Asset ${asset.id} references missing event ${asset.eventFixtureId}`);
    }
    if ((assetEventCounts.get(asset.id) ?? 0) > 1) fail('INVALID_FIXTURE', `Asset ${asset.id} has duplicate events`);
  }
}

export function createDemoClient(
  sourceAssets: readonly AssetDescriptor[],
  sourceEvents: readonly EventDescriptor[],
  options: { now?: () => number } = {},
): DemoClient {
  validateFixtures(sourceAssets, sourceEvents);
  const now = options.now ?? Date.now;
  const assets = new Map(sourceAssets.map((asset) => [asset.id, {
    ...asset,
    capabilities: { ...asset.capabilities },
    sourceUrls: [...asset.sourceUrls],
    evidencePaths: [...asset.evidencePaths],
  }]));
  const events = new Map(sourceEvents.map((event) => [event.id, {
    ...event,
    sourceUrls: [...event.sourceUrls],
    evidencePaths: [...event.evidencePaths],
  }]));
  const eventForAsset = new Map(sourceEvents.map((event) => [event.assetId, event.id]));
  const quotes = new Map<string, SaleQuote>();
  let generation = 1;
  let quoteCounter = 0;
  let receiptCounter = 0;

  const makeInitialState = (): DemoState => {
    const sellerCollateral: Record<string, bigint> = {};
    const buyerCollateral: Record<string, bigint> = {};
    for (const asset of assets.values()) {
      const eventId = eventForAsset.get(asset.id);
      sellerCollateral[asset.id] = eventId ? toRawAmount('1000', asset.decimals, events.get(eventId)!.m0) : 0n;
      buyerCollateral[asset.id] = 0n;
    }
    return {
      version: 0,
      condition: 'ready',
      wallets: {
        seller: { collateral: sellerCollateral, usdc: 0n, claims: {} },
        buyer: { collateral: buyerCollateral, usdc: parseUsdc('1000'), claims: {} },
      },
      series: {},
      receipts: [],
    };
  };
  let state = makeInitialState();

  const snapshot = (): DemoState => ({
    version: state.version,
    condition: state.condition,
    wallets: { seller: cloneWallet(state.wallets.seller), buyer: cloneWallet(state.wallets.buyer) },
    series: Object.fromEntries(Object.entries(state.series).map(([id, series]) => [id, cloneSeries(series)])),
    receipts: state.receipts.map(cloneReceipt),
  });

  const requireAssetEvent = (assetId: string): { asset: AssetDescriptor; event: EventDescriptor } => {
    const asset = assets.get(assetId);
    if (!asset) fail('MISSING_ASSET', `Unknown asset: ${assetId}`);
    const eventId = eventForAsset.get(assetId);
    if (!eventId) fail('MISSING_EVENT', `No frozen replay event exists for ${asset.symbol}`);
    return { asset, event: events.get(eventId)! };
  };

  const requireSeries = (seriesId: string): DemoSeries => {
    const series = state.series[seriesId];
    if (!series) fail('MISSING_EVENT', `Unknown series: ${seriesId}`);
    return series;
  };

  const requireReady = (): void => {
    if (state.condition === 'stale') fail('STALE_DATA', 'Frozen event evidence is marked stale');
    if (state.condition === 'paused') fail('PAUSED_COLLATERAL', 'Collateral movements are paused');
    if (state.condition === 'rejected_event') fail('REJECTED_EVENT', 'The event is rejected');
  };

  const receipt = (action: DemoAction, seriesId: string, summary: string, changes: AmountChange[]): DemoReceipt => {
    const value: DemoReceipt = {
      id: `demo-${generation}-${++receiptCounter}`,
      kind: 'demo', action, seriesId, timestamp: now(), summary,
      changes: changes.map((change) => ({ ...change })),
    };
    state.receipts.push(value);
    return cloneReceipt(value);
  };

  const claimsFor = (walletId: WalletId, seriesId: string): ClaimBalance => {
    return state.wallets[walletId].claims[seriesId] ?? { pt: 0n, dr: 0n };
  };

  const preview = (assetId: string, stockAmount: string): AllocationPreview => {
    const { asset, event } = requireAssetEvent(assetId);
    const collateralRaw = toRawAmount(stockAmount, asset.decimals, event.m0);
    const pools = allocate(collateralRaw, event.m0, event.m1);
    return {
      assetId, eventId: event.id, input: stockAmount, collateralRaw,
      ptPoolRaw: pools.ptPoolRaw, drPoolRaw: pools.drPoolRaw, pairedClaimRaw: collateralRaw,
    };
  };

  const previewRedemption = (seriesId: string, walletId: WalletId, side: ClaimSide, claimRaw: bigint): bigint => {
    assertRaw(claimRaw, false);
    const series = requireSeries(seriesId);
    if (series.phase !== 'settled') fail('WRONG_PHASE', 'Series must be settled before redemption');
    const balance = claimsFor(walletId, seriesId)[side];
    if (balance < claimRaw) fail('INSUFFICIENT_BALANCE', `${walletId} has insufficient ${side.toUpperCase()}`);
    const burned = side === 'pt' ? series.cumulativePtBurnedRaw : series.cumulativeDrBurnedRaw;
    const pool = side === 'pt' ? series.originalPtPoolRaw : series.originalDrPoolRaw;
    const payout = (burned + claimRaw) * pool / series.originalSupplyRaw - burned * pool / series.originalSupplyRaw;
    if (payout === 0n) fail('ZERO_PAYOUT', 'This claim amount is too small to produce a raw collateral payout');
    return payout;
  };

  return {
    getState: snapshot,
    preview,

    async deposit(assetId, stockAmount) {
      requireReady();
      const allocation = preview(assetId, stockAmount);
      if (allocation.collateralRaw === 0n) fail('INVALID_AMOUNT', 'Deposit must be at least one raw collateral unit');
      const seller = state.wallets.seller;
      if ((seller.collateral[assetId] ?? 0n) < allocation.collateralRaw) fail('INSUFFICIENT_BALANCE', 'Seller has insufficient demo collateral');
      let series = state.series[allocation.eventId];
      if (series && series.phase !== 'open') fail('DEPOSITS_CLOSED', 'Deposits are permanently closed for this series');
      const currentAccounted = series?.accountedCollateralRaw ?? 0n;
      const nextAccounted = currentAccounted + allocation.collateralRaw;
      assertRaw(nextAccounted);
      const { event } = requireAssetEvent(assetId);
      if (allocate(nextAccounted, event.m0, event.m1).drPoolRaw === 0n) {
        fail('INVALID_AMOUNT', 'Deposit is too small to produce a dividend allocation');
      }
      const priorClaims = claimsFor('seller', allocation.eventId);
      const nextPt = priorClaims.pt + allocation.collateralRaw;
      const nextDr = priorClaims.dr + allocation.collateralRaw;
      assertRaw(nextPt); assertRaw(nextDr);
      if (!series) {
        series = state.series[allocation.eventId] = {
          id: allocation.eventId, assetId, eventId: allocation.eventId, phase: 'open',
          accountedCollateralRaw: 0n, originalSupplyRaw: 0n,
          originalPtPoolRaw: 0n, originalDrPoolRaw: 0n, ptPoolRaw: 0n, drPoolRaw: 0n,
          ptSupplyRaw: 0n, drSupplyRaw: 0n,
          cumulativePtBurnedRaw: 0n, cumulativeDrBurnedRaw: 0n, replayClock: 'before_event',
        };
      }
      seller.collateral[assetId] -= allocation.collateralRaw;
      seller.claims[series.id] = { pt: nextPt, dr: nextDr };
      series.accountedCollateralRaw = nextAccounted;
      series.ptSupplyRaw += allocation.collateralRaw;
      series.drSupplyRaw += allocation.collateralRaw;
      state.version++;
      return receipt('deposit', series.id, `Deposited ${allocation.collateralRaw} raw ${assetId} and created paired claims`, [
        { walletId: 'seller', assetId, field: 'collateral', delta: -allocation.collateralRaw },
        { walletId: 'seller', seriesId: series.id, field: 'pt', delta: allocation.collateralRaw },
        { walletId: 'seller', seriesId: series.id, field: 'dr', delta: allocation.collateralRaw },
        { seriesId: series.id, field: 'accounted_collateral', delta: allocation.collateralRaw },
      ]);
    },

    quoteSale(seriesId, drRaw, usdcTotalRaw) {
      requireReady();
      assertRaw(drRaw, false); assertRaw(usdcTotalRaw, false);
      const series = requireSeries(seriesId);
      if (series.phase !== 'open') fail('WRONG_PHASE', 'DR sale quotes are only available while deposits are open');
      if (claimsFor('seller', seriesId).dr < drRaw) fail('INSUFFICIENT_BALANCE', 'Seller has insufficient DR');
      if (state.wallets.buyer.usdc < usdcTotalRaw) fail('INSUFFICIENT_BALANCE', 'Buyer has insufficient test USDC');
      const value: SaleQuote = {
        id: `quote-${generation}-${++quoteCounter}`, seriesId, seller: 'seller', buyer: 'buyer',
        drRaw, usdcTotalRaw, version: state.version, expiresAt: now() + QUOTE_TTL_MS,
      };
      quotes.set(value.id, cloneQuote(value));
      return cloneQuote(value);
    },

    async acceptSale(quoteId, acceptOptions = {}) {
      if (acceptOptions.reject) {
        if (quotes.has(quoteId)) quotes.delete(quoteId);
        fail('USER_REJECTED', 'The buyer rejected the demo sale');
      }
      const quoteGeneration = /^quote-(\d+)-\d+$/.exec(quoteId)?.[1];
      if (quoteGeneration !== undefined && Number(quoteGeneration) !== generation) fail('STALE_QUOTE', 'Quote belongs to an earlier demo session');
      const quote = quotes.get(quoteId);
      if (!quote) fail('MISSING_QUOTE', 'Quote does not exist or was already consumed');
      requireReady();
      if (now() >= quote.expiresAt) fail('EXPIRED_QUOTE', 'Quote has expired');
      if (quote.version !== state.version) fail('STALE_QUOTE', 'Quote is stale because demo state changed');
      const series = requireSeries(quote.seriesId);
      if (series.phase !== 'open') fail('WRONG_PHASE', 'DR sales are only available while deposits are open');
      const sellerClaims = claimsFor('seller', quote.seriesId);
      const buyerClaims = claimsFor('buyer', quote.seriesId);
      if (sellerClaims.dr < quote.drRaw) fail('INSUFFICIENT_BALANCE', 'Seller has insufficient DR');
      if (state.wallets.buyer.usdc < quote.usdcTotalRaw) fail('INSUFFICIENT_BALANCE', 'Buyer has insufficient test USDC');
      const nextBuyerDr = buyerClaims.dr + quote.drRaw;
      const nextSellerUsdc = state.wallets.seller.usdc + quote.usdcTotalRaw;
      assertRaw(nextBuyerDr); assertRaw(nextSellerUsdc);
      sellerClaims.dr -= quote.drRaw;
      buyerClaims.dr = nextBuyerDr;
      state.wallets.seller.claims[quote.seriesId] = sellerClaims;
      state.wallets.buyer.claims[quote.seriesId] = buyerClaims;
      state.wallets.buyer.usdc -= quote.usdcTotalRaw;
      state.wallets.seller.usdc += quote.usdcTotalRaw;
      quotes.delete(quoteId);
      state.version++;
      return receipt('sale', quote.seriesId, `Sold ${quote.drRaw} raw DR for ${quote.usdcTotalRaw} raw test USDC`, [
        { walletId: 'seller', seriesId: quote.seriesId, field: 'dr', delta: -quote.drRaw },
        { walletId: 'buyer', seriesId: quote.seriesId, field: 'dr', delta: quote.drRaw },
        { walletId: 'buyer', field: 'usdc', delta: -quote.usdcTotalRaw },
        { walletId: 'seller', field: 'usdc', delta: quote.usdcTotalRaw },
      ]);
    },

    async closeDeposits(seriesId) {
      const series = requireSeries(seriesId);
      if (series.phase !== 'open') fail('WRONG_PHASE', 'Only an open series can close deposits');
      series.phase = 'closed';
      series.replayClock = 'at_event';
      state.version++;
      return receipt('close_deposits', seriesId, 'Closed deposits and advanced the local replay clock to the event', []);
    },

    async settle(seriesId) {
      requireReady();
      const series = requireSeries(seriesId);
      if (series.phase === 'settled' || series.phase === 'complete') fail('ALREADY_SETTLED', 'Series allocation is already settled');
      if (series.phase !== 'closed') fail('WRONG_PHASE', 'Series must be closed before settlement');
      const event = events.get(series.eventId);
      const asset = assets.get(series.assetId);
      if (!event || !asset || asset.eventFixtureId !== series.eventId || event.assetId !== series.assetId) {
        fail('INVALID_FIXTURE', 'Series no longer matches its pinned event fixture');
      }
      const pools = allocate(series.accountedCollateralRaw, event.m0, event.m1);
      if (pools.drPoolRaw === 0n) fail('INVALID_FIXTURE', 'A zero-dividend event cannot be settled in this rehearsal');
      if (series.ptSupplyRaw !== series.accountedCollateralRaw || series.drSupplyRaw !== series.accountedCollateralRaw) {
        fail('INVALID_FIXTURE', 'Paired claim supply does not match accounted collateral');
      }
      series.originalSupplyRaw = series.accountedCollateralRaw;
      series.originalPtPoolRaw = pools.ptPoolRaw;
      series.originalDrPoolRaw = pools.drPoolRaw;
      series.ptPoolRaw = pools.ptPoolRaw;
      series.drPoolRaw = pools.drPoolRaw;
      series.phase = 'settled';
      state.version++;
      return receipt('settle', seriesId, `Froze PT pool ${pools.ptPoolRaw} and DR pool ${pools.drPoolRaw}`, []);
    },

    previewRedemption,

    async redeem(seriesId, walletId, side, claimRaw) {
      if (state.condition === 'paused') fail('PAUSED_COLLATERAL', 'Collateral movements are paused');
      const payout = previewRedemption(seriesId, walletId, side, claimRaw);
      const series = requireSeries(seriesId);
      const balance = claimsFor(walletId, seriesId);
      const remainingPool = side === 'pt' ? series.ptPoolRaw : series.drPoolRaw;
      if (payout > remainingPool) fail('INVALID_FIXTURE', 'Redemption exceeds the remaining frozen pool');
      const nextCollateral = (state.wallets[walletId].collateral[series.assetId] ?? 0n) + payout;
      assertRaw(nextCollateral);
      balance[side] -= claimRaw;
      state.wallets[walletId].claims[seriesId] = balance;
      state.wallets[walletId].collateral[series.assetId] = nextCollateral;
      if (side === 'pt') {
        series.ptSupplyRaw -= claimRaw;
        series.ptPoolRaw -= payout;
        series.cumulativePtBurnedRaw += claimRaw;
      } else {
        series.drSupplyRaw -= claimRaw;
        series.drPoolRaw -= payout;
        series.cumulativeDrBurnedRaw += claimRaw;
      }
      series.accountedCollateralRaw -= payout;
      if (series.ptSupplyRaw === 0n && series.drSupplyRaw === 0n && series.ptPoolRaw === 0n && series.drPoolRaw === 0n) series.phase = 'complete';
      state.version++;
      return receipt('redeem', seriesId, `Burned ${claimRaw} raw ${side.toUpperCase()} for ${payout} raw collateral`, [
        { walletId, seriesId, field: side, delta: -claimRaw },
        { walletId, assetId: series.assetId, field: 'collateral', delta: payout },
        { seriesId, field: 'accounted_collateral', delta: -payout },
      ]);
    },

    async recombine(seriesId, walletId, claimRaw) {
      if (state.condition === 'paused') fail('PAUSED_COLLATERAL', 'Collateral movements are paused');
      assertRaw(claimRaw, false);
      const series = requireSeries(seriesId);
      if (series.phase !== 'open' && series.phase !== 'closed') fail('WRONG_PHASE', 'Claims can only recombine before settlement');
      const balance = claimsFor(walletId, seriesId);
      if (balance.pt < claimRaw || balance.dr < claimRaw) fail('INSUFFICIENT_BALANCE', `${walletId} must own equal PT and DR to recombine`);
      const remainingAccounted = series.accountedCollateralRaw - claimRaw;
      const nextCollateral = (state.wallets[walletId].collateral[series.assetId] ?? 0n) + claimRaw;
      assertRaw(nextCollateral);
      if (remainingAccounted > 0n) {
        const event = events.get(series.eventId)!;
        if (allocate(remainingAccounted, event.m0, event.m1).drPoolRaw === 0n) {
          fail('INVALID_AMOUNT', 'Recombination would leave a series too small to settle');
        }
      }
      balance.pt -= claimRaw;
      balance.dr -= claimRaw;
      state.wallets[walletId].claims[seriesId] = balance;
      state.wallets[walletId].collateral[series.assetId] = nextCollateral;
      series.ptSupplyRaw -= claimRaw;
      series.drSupplyRaw -= claimRaw;
      series.accountedCollateralRaw = remainingAccounted;
      if (series.accountedCollateralRaw === 0n) series.phase = 'cancelled';
      state.version++;
      return receipt('recombine', seriesId, `Recombined ${claimRaw} paired claims for raw collateral`, [
        { walletId, seriesId, field: 'pt', delta: -claimRaw },
        { walletId, seriesId, field: 'dr', delta: -claimRaw },
        { walletId, assetId: series.assetId, field: 'collateral', delta: claimRaw },
        { seriesId, field: 'accounted_collateral', delta: -claimRaw },
      ]);
    },

    setCondition(condition) {
      if (condition !== 'ready' && condition !== 'stale' && condition !== 'paused' && condition !== 'rejected_event') {
        fail('INVALID_FIXTURE', `Unknown demo condition: ${condition}`);
      }
      state.condition = condition;
      state.version++;
    },

    reset() {
      generation++;
      quotes.clear();
      state = makeInitialState();
    },
  };
}
