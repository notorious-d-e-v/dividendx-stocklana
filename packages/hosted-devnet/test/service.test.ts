import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonCasStore, VersionedJson } from '@dividendx/hosted-broker/json-store';
import type { RegistryManifest } from '@dividendx/devnet-runtime';
import { Keypair } from '@solana/web3.js';
import {
  FAUCET_LIFETIME_LAMPORTS, FAUCET_RESERVATION_LAMPORTS, OBSERVATION_LIFETIME_LAMPORTS,
  OBSERVATION_RESERVATION_LAMPORTS, PREPARATION_LEASE_MS, emptyLedger, type ChainAdapter, type DurableOperation,
  type FaucetRequest, type PreparedTransaction, type SignedAttempt, type TransactionStatus,
} from '../src/contract.js';
import { ServiceError } from '../src/errors.js';
import { DurableJournal } from '../src/ledger.js';
import { frozenManifest } from '../src/production.js';
import { HostedDevnetService } from '../src/service.js';

class MemoryStore implements JsonCasStore {
  value: unknown = null;
  etag = 0;
  failWrites = false;
  async read<T>(): Promise<VersionedJson<T> | null> {
    return this.value === null ? null : { value: structuredClone(this.value) as T, etag: String(this.etag) };
  }
  async create<T>(_path: string, value: T): Promise<boolean> {
    if (this.failWrites) throw new Error('store unavailable');
    if (this.value !== null) return false;
    this.value = structuredClone(value); this.etag += 1; return true;
  }
  async compareAndSwap<T>(_path: string, etag: string, value: T): Promise<boolean> {
    if (this.failWrites) throw new Error('store unavailable');
    if (etag !== String(this.etag)) return false;
    this.value = structuredClone(value); this.etag += 1; return true;
  }
}

class FakeChain implements ChainAdapter {
  prepareCount = 0;
  sendCount = 0;
  verifyPreparedCount = 0;
  block = 1;
  outcome = true;
  sendThrows = false;
  immediateStatus: TransactionStatus['state'] = 'confirmed';
  prepareError: Error | null = null;
  prepareErrorAt: number | null = null;
  onPrepare: (() => void) | null = null;
  onSend: (() => void | Promise<void>) | null = null;
  statuses = new Map<string, TransactionStatus>();
  sentBytes: string[] = [];

  private prepare(assetId: string): PreparedTransaction {
    this.prepareCount += 1;
    this.onPrepare?.();
    if (this.prepareError && (this.prepareErrorAt === null || this.prepareErrorAt === this.prepareCount)) throw this.prepareError;
    return { signature: `signature-${assetId}-${this.prepareCount}`, blockhash: 'blockhash', lastValidBlockHeight: 100,
      serializedTransactionBase64: Buffer.from(`signed-${assetId}-${this.prepareCount}`).toString('base64'), preparedAt: new Date(0).toISOString(),
      intent: { operation: 'test', assetId } };
  }
  async prepareFaucet(request: FaucetRequest): Promise<PreparedTransaction> { return this.prepare(request.assetId); }
  async prepareObservation(assetId: string): Promise<PreparedTransaction> { return this.prepare(assetId); }
  async verifyPrepared(): Promise<void> { this.verifyPreparedCount += 1; }
  async sendExact(attempt: SignedAttempt): Promise<void> {
    this.sendCount += 1; this.sentBytes.push(attempt.serializedTransactionBase64);
    await this.onSend?.();
    if (this.sendThrows) throw new Error('ambiguous send');
    this.statuses.set(attempt.signature, { state: this.immediateStatus });
  }
  async transactionStatus(attempt: SignedAttempt): Promise<TransactionStatus> { return this.statuses.get(attempt.signature) ?? { state: 'missing' }; }
  async blockHeight(): Promise<number> { return this.block; }
  async verifyOutcome(): Promise<boolean> { return this.outcome; }
}

const OWNER = Keypair.fromSeed(Buffer.alloc(32, 7)).publicKey.toBase58();

function request(manifest: RegistryManifest, assetId = manifest.assets[0]!.id, owner = OWNER): FaucetRequest {
  return { owner, assetId, runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash };
}

function fixture(now = Date.UTC(2026, 8, 18, 0, 0, 0)) {
  const clock = { value: now };
  const store = new MemoryStore(); const chain = new FakeChain(); const manifest = frozenManifest();
  const service = new HostedDevnetService(store, chain, manifest, () => clock.value);
  return { clock, store, chain, manifest, service };
}

test('concurrent duplicate grants reserve once and submit one signed transaction', async () => {
  const { service, store, chain, manifest } = fixture();
  const [first, second] = await Promise.all([
    service.fund(request(manifest), 'visitor-a', 'ip-a'),
    service.fund(request(manifest), 'visitor-a', 'ip-a'),
  ]);
  const final = await service.fund(request(manifest), 'visitor-a', 'ip-a');
  assert.equal(chain.prepareCount, 1); assert.equal(chain.sendCount, 1);
  assert.equal(final.status, 'confirmed');
  assert.ok([first.status, second.status].includes('confirmed'));
  const ledger = await new DurableJournal(store).read();
  assert.equal(ledger.faucetLifetimeLamports, FAUCET_RESERVATION_LAMPORTS);
  assert.equal(Object.keys(ledger.operations).length, 1);
});

test('daily visitor, IP, global, rollover, and lifetime reservations are enforced', async () => {
  const { store, clock } = fixture();
  const journal = new DurableJournal(store, () => clock.value);
  await journal.reserveGrant(OWNER, 'asset-1', 'visitor', 'ip');
  await journal.reserveGrant(OWNER, 'asset-2', 'visitor', 'ip');
  await journal.reserveGrant(OWNER, 'asset-3', 'visitor', 'ip');
  await assert.rejects(journal.reserveGrant('GgBaCs3N2bGNxE9azXy3CqB8n7VQG4GzVJ5mPz6LhK2', 'asset-1', 'visitor', 'ip'), /visitor/i);
  clock.value += 24 * 60 * 60_000;
  await journal.reserveGrant(OWNER, 'asset-1', 'visitor', 'ip');
  const ledger = await journal.read();
  assert.equal(Object.keys(ledger.daily).length, 2);
  assert.equal(ledger.faucetLifetimeLamports, 4 * FAUCET_RESERVATION_LAMPORTS);
});

test('IP and global daily counters reject the first operation beyond their limits', async () => {
  const ipFixture = fixture();
  const ipJournal = new DurableJournal(ipFixture.store, () => ipFixture.clock.value);
  for (let index = 0; index < 12; index += 1) {
    await ipJournal.reserveGrant(`owner-${index}`, `asset-${index}`, `visitor-${index}`, 'shared-ip');
  }
  await assert.rejects(ipJournal.reserveGrant('owner-12', 'asset-12', 'visitor-12', 'shared-ip'), /network/i);

  const globalFixture = fixture();
  const globalJournal = new DurableJournal(globalFixture.store, () => globalFixture.clock.value);
  for (let index = 0; index < 30; index += 1) {
    await globalJournal.reserveGrant(`owner-${index}`, `asset-${index}`, `visitor-${index}`, `ip-${index}`);
  }
  await assert.rejects(globalJournal.reserveGrant('owner-30', 'asset-30', 'visitor-30', 'ip-30'), /budget/i);
});

test('faucet and observation lifetime reservations are hard caps', async () => {
  const faucetFixture = fixture();
  const faucetLedger = emptyLedger();
  faucetLedger.faucetLifetimeLamports = FAUCET_LIFETIME_LAMPORTS - FAUCET_RESERVATION_LAMPORTS + 1;
  faucetFixture.store.value = faucetLedger; faucetFixture.store.etag = 1;
  await assert.rejects(new DurableJournal(faucetFixture.store).reserveGrant('owner', 'asset', 'visitor', 'ip'), /budget/i);

  const observationFixture = fixture();
  const observationLedger = emptyLedger();
  observationLedger.observationLifetimeLamports = OBSERVATION_LIFETIME_LAMPORTS - OBSERVATION_RESERVATION_LAMPORTS + 1;
  observationFixture.store.value = observationLedger; observationFixture.store.etag = 1;
  await assert.rejects(new DurableJournal(observationFixture.store).reserveObservation('asset'), /budget/i);
});

test('expired preparation leases fence old workers', async () => {
  const { store, clock } = fixture();
  const journal = new DurableJournal(store, () => clock.value);
  const operation = await journal.reserveGrant(OWNER, 'asset', 'visitor', 'ip');
  const oldLease = await journal.acquire(operation);
  clock.value += PREPARATION_LEASE_MS + 1;
  const newLease = await journal.acquire(operation);
  const attempt = { signature: 'signature', blockhash: 'blockhash', lastValidBlockHeight: 10,
    serializedTransactionBase64: Buffer.from('signed').toString('base64'), preparedAt: new Date(clock.value).toISOString(),
    intent: { operation: 'test' } };
  await assert.rejects(journal.persistPrepared(operation.id, oldLease, attempt), /lease was lost/);
  assert.equal((await journal.persistPrepared(operation.id, newLease, attempt)).attempt?.signature, 'signature');
  await assert.rejects(journal.release(oldLease, 'submitted'), /lease was lost/);
  assert.equal((await journal.read()).operations[operation.id]!.state, 'prepared');
});

test('a delayed send result and stale reconciliation cannot downgrade a terminal operation', async () => {
  const { service, chain, manifest, store } = fixture();
  let sendStarted!: () => void; let completeSend!: () => void;
  const started = new Promise<void>((resolve) => { sendStarted = resolve; });
  const blocked = new Promise<void>((resolve) => { completeSend = resolve; });
  chain.onSend = async () => { sendStarted(); await blocked; };
  const funding = service.fund(request(manifest), 'visitor', 'ip');
  await started;
  const journal = new DurableJournal(store);
  const operation = Object.values((await journal.read()).operations)[0]!;
  await journal.transition(operation.id, 'confirmed');
  completeSend();
  assert.equal((await funding).status, 'confirmed');
  await journal.transition(operation.id, 'expired', 'STALE_RECONCILIATION');
  assert.equal((await journal.read()).operations[operation.id]!.state, 'confirmed');
});

test('manifest availability reflects global daily and lifetime quota exhaustion', async () => {
  const lifetime = fixture();
  const lifetimeLedger = emptyLedger(); lifetimeLedger.faucetLifetimeLamports = FAUCET_LIFETIME_LAMPORTS;
  lifetime.store.value = lifetimeLedger; lifetime.store.etag = 1;
  assert.equal(await lifetime.service.faucetAvailable(), false);

  const daily = fixture();
  const dailyLedger = emptyLedger();
  dailyLedger.daily['2026-09-18'] = { grants: 30, lamports: 270_000_000, visitors: {}, ips: {} };
  daily.store.value = dailyLedger; daily.store.etag = 1;
  assert.equal(await daily.service.faucetAvailable(), false);
});

test('store failure after signing prevents submission and disables the process instance', async () => {
  const { service, store, chain, manifest } = fixture();
  chain.onPrepare = () => { store.failWrites = true; };
  await assert.rejects(service.fund(request(manifest), 'visitor', 'ip'), /store unavailable/);
  assert.equal(chain.sendCount, 0); assert.equal(await service.faucetAvailable(), false);
});

test('store failure after submission returns the persisted signature and later replays exact bytes', async () => {
  const { service, store, chain, manifest, clock } = fixture();
  chain.sendThrows = true;
  chain.onSend = () => { store.failWrites = true; };
  const first = await service.fund(request(manifest), 'visitor', 'ip');
  assert.equal(first.status, 'pending'); assert.equal(first.signatures.length, 1); assert.equal(chain.sendCount, 1);
  const bytes = chain.sentBytes[0];
  store.failWrites = false; chain.onSend = null; chain.sendThrows = false;
  clock.value += PREPARATION_LEASE_MS + 1;
  const restarted = new HostedDevnetService(store, chain, manifest, () => clock.value);
  const second = await restarted.fund(request(manifest), 'visitor', 'ip');
  assert.equal(second.status, 'confirmed'); assert.equal(chain.prepareCount, 1); assert.equal(chain.sentBytes[1], bytes);
});

test('ambiguous submission reuses exact persisted bytes and expiry never resigns', async () => {
  const { service, chain, manifest } = fixture();
  chain.sendThrows = true;
  const first = await service.fund(request(manifest), 'visitor', 'ip');
  assert.equal(first.status, 'pending'); assert.equal(first.signatures.length, 1);
  const bytes = chain.sentBytes[0];
  const second = await service.fund(request(manifest), 'visitor', 'ip');
  assert.equal(second.status, 'pending'); assert.equal(chain.prepareCount, 1); assert.equal(chain.sentBytes[1], bytes);
  chain.block = 101;
  const expired = await service.fund(request(manifest), 'visitor', 'ip');
  assert.equal(expired.status, 'failed'); assert.match(expired.error!, /expired unresolved/);
  assert.equal(chain.prepareCount, 1); assert.equal(chain.sendCount, 2);
});

test('wrong runtime, invalid owner, identity drift, and insufficient balance cannot send', async () => {
  const stale = fixture();
  await assert.rejects(stale.service.fund({ ...request(stale.manifest), genesisHash: 'wrong' }, 'v', 'i'), /stale/);
  await assert.rejects(stale.service.fund(request(stale.manifest, stale.manifest.assets[0]!.id, 'not-a-key'), 'v', 'i'), /owner/);
  assert.equal(stale.chain.prepareCount, 0);

  const identity = fixture();
  identity.chain.prepareError = new ServiceError(503, 'profile changed', 'IDENTITY_PROFILE');
  await assert.rejects(identity.service.fund(request(identity.manifest), 'v', 'i'), /profile changed/);
  assert.equal(identity.chain.sendCount, 0); assert.equal(await identity.service.faucetAvailable(), false);

  const balance = fixture();
  balance.chain.prepareError = new ServiceError(503, 'balance low', 'INSUFFICIENT_BALANCE');
  await assert.rejects(balance.service.fund(request(balance.manifest), 'v', 'i'), /balance low/);
  assert.equal(balance.chain.sendCount, 0); assert.equal(await balance.service.faucetAvailable(), false);
});

test('failed simulation can retry the same reservation under a new lease', async () => {
  const { service, chain, manifest, store } = fixture();
  chain.prepareError = new ServiceError(503, 'simulation failed', 'SIMULATION_FAILED');
  await assert.rejects(service.fund(request(manifest), 'visitor', 'ip'), /simulation failed/);
  chain.prepareError = null;
  assert.equal((await service.fund(request(manifest), 'visitor', 'ip')).status, 'confirmed');
  assert.equal(chain.prepareCount, 2); assert.equal(chain.sendCount, 1);
  assert.equal((await new DurableJournal(store).read()).faucetLifetimeLamports, FAUCET_RESERVATION_LAMPORTS);
});

test('cron duplicate delivery journals one transaction per asset and bucket', async () => {
  const { service, chain, manifest, store } = fixture();
  const first = await service.refreshObservations();
  const second = await service.refreshObservations();
  assert.ok(first.every((item) => item.status === 'confirmed'));
  assert.ok(second.every((item) => item.status === 'confirmed'));
  assert.equal(chain.prepareCount, manifest.assets.length); assert.equal(chain.sendCount, manifest.assets.length);
  const ledger = await new DurableJournal(store).read();
  assert.equal(Object.values(ledger.operations).filter((item) => item.kind === 'observation').length, 3);
});

test('cron preserves earlier results and stops after a later asset failure', async () => {
  const failed = fixture();
  failed.chain.prepareError = new ServiceError(503, 'identity changed', 'IDENTITY_POLICY');
  failed.chain.prepareErrorAt = 2;
  const partial = await failed.service.refreshObservations();
  assert.equal(partial.length, 2);
  assert.equal(partial[0]!.status, 'confirmed');
  assert.deepEqual(partial[1], { signatures: [], status: 'failed',
    message: 'Observation refresh stopped before this asset completed.', error: 'IDENTITY_POLICY' });
  assert.equal(failed.chain.prepareCount, 2); assert.equal(failed.chain.sendCount, 1);
});

test('cron continues across pending submissions and reuses all three durable attempts', async () => {
  const pending = fixture(); pending.chain.sendThrows = true;
  const first = await pending.service.refreshObservations();
  const second = await pending.service.refreshObservations();
  assert.equal(first.length, 3); assert.ok(first.every((item) => item.status === 'pending'));
  assert.equal(new Set(first.flatMap((item) => item.signatures)).size, 3);
  assert.deepEqual(second.map((item) => item.signatures), first.map((item) => item.signatures));
  assert.equal(pending.chain.prepareCount, 3); assert.equal(pending.chain.sendCount, 6);
});

test('cron stops after a durable failed result', async () => {
  const failed = fixture(); failed.chain.immediateStatus = 'failed';
  const results = await failed.service.refreshObservations();
  assert.equal(results.length, 1); assert.equal(results[0]!.status, 'failed');
  assert.equal(failed.chain.prepareCount, 1); assert.equal(failed.chain.sendCount, 1);
});

test('confirmed outcome mismatch is terminal and cannot mint again', async () => {
  const { service, chain, manifest } = fixture();
  chain.outcome = false;
  const result = await service.fund(request(manifest), 'visitor', 'ip');
  assert.equal(result.status, 'failed');
  assert.equal((await service.fund(request(manifest), 'visitor', 'ip')).status, 'failed');
  assert.equal(chain.prepareCount, 1); assert.equal(chain.sendCount, 1);
});
