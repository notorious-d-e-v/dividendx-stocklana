import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surfnet } from '@solana/surfpool';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  DividendXInstructions,
  annualSeriesAddresses,
  assetPolicyPda,
  buildRecentUnsignedTransaction,
  configPda,
  eventHeadPda,
  eventRevisionPda,
  fetchClock,
  fetchProgramAccountsCoherently,
  fetchQuoteSnapshot,
  fetchToken2022Snapshot,
  issuerIdentityHash,
  normalizeAccumulatorAccount,
  normalizeConfigAccount,
  normalizeSeriesAccount,
  programDataAddress,
  signWithSignersSubmitAndConfirm,
} from '@dividendx/transaction-sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const repositoryRequire = createRequire(resolve(REPOSITORY_ROOT, 'package.json'));
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createMintToCheckedInstruction,
  createUpdateMultiplierDataInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} = repositoryRequire('@solana/spl-token');
const { Connection, Keypair, PublicKey, SystemProgram } = repositoryRequire('@solana/web3.js');
const ELF_PATH = resolve(REPOSITORY_ROOT, 'target/deploy/dividendx.so');
const IDL_PATH = resolve(REPOSITORY_ROOT, 'packages/transaction-sdk/idl/dividendx.json');
const HTTP_HOST = '127.0.0.1';
const HTTP_PORT = 4180;
const PROGRAM_ID = DIVIDENDX_PROGRAM_ID;
const LOADER_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const PRE_YEAR_MS = Date.UTC(2026, 11, 15, 12);
const START_YEAR_MS = Date.UTC(2027, 0, 2, 12);
const END_YEAR_MS = Date.UTC(2028, 0, 2, 12);
const FAUCET_SOL_LAMPORTS = 2_000_000_000;
const ORIGINS = new Set(['http://127.0.0.1:4174', 'http://localhost:4174']);
const HOSTS = new Set(['127.0.0.1:4180', 'localhost:4180']);
const MAX_BODY_BYTES = 4_096;

const PROFILES = [
  { id: 'xstocks-test-kox', company: 'Coca-Cola', symbol: 'TestKOx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'backpack-test-mu', company: 'Micron', symbol: 'TestMU', issuerLabel: 'Backpack/Trek test profile', decimals: 6 },
  { id: 'ondo-test-ibm', company: 'IBM', symbol: 'TestIBMon', issuerLabel: 'Ondo test profile', decimals: 9 },
];
const QUARTERS = [
  { month: 2, day: 15, multiplier: 1.01 },
  { month: 5, day: 15, multiplier: 1.02 },
  { month: 8, day: 15, multiplier: 1.03 },
  { month: 11, day: 15, multiplier: 1.04 },
];

function digest(value) {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

function sdkPublicKey(address) {
  const SdkPublicKey = DIVIDENDX_PROGRAM_ID.constructor;
  return new SdkPublicKey(address.toBytes());
}

function f64Bits(value) {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, true);
  return view.getBigUint64(0, true);
}

async function rawRpc(url, method, params = []) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method} failed: ${JSON.stringify(body.error)}`);
  return body.result;
}

function json(response, status, value, origin) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': origin ?? 'http://127.0.0.1:4174',
    vary: 'Origin',
  });
  response.end(body);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body is too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('request body must be valid JSON'), { status: 400 });
  }
}

class LocalRuntime {
  constructor() {
    this.runtimeId = randomUUID();
    this.deploymentDomain = new Uint8Array(randomBytes(32));
    this.admin = Keypair.generate();
    this.attestor = Keypair.generate();
    this.assets = [];
    this.faucetSolOwners = new Set();
    this.faucetAssets = new Set();
    this.mutationTail = Promise.resolve();
  }

  async initialize() {
    this.idl = JSON.parse(await readFile(IDL_PATH, 'utf8'));
    this.elf = await readFile(ELF_PATH);
    this.surfnet = Surfnet.startWithConfig({ offline: true, blockProductionMode: 'transaction' });
    // Surfpool publishes RPC/simnet events through a bounded native buffer.
    // A long-running daemon must drain it or state-reading RPC calls eventually block.
    this.eventDrain = setInterval(() => {
      try { this.surfnet.drainEvents(); } catch {}
    }, 50);
    this.eventDrain.unref();
    this.connection = new Connection(this.surfnet.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: this.surfnet.wsUrl,
    });
    this.builders = new DividendXInstructions(this.idl);
    this.surfnet.deploy({ programId: PROGRAM_ID.toBase58(), soBytes: this.elf });
    await rawRpc(this.surfnet.rpcUrl, 'surfnet_setProgramAuthority', [PROGRAM_ID.toBase58(), this.admin.publicKey.toBase58()]);
    this.surfnet.fundSolMany([this.admin, this.attestor].map(({ publicKey }) => ({ address: publicKey.toBase58(), lamports: 50_000_000_000 })));
    // A fresh disposable Surfnet is explicitly anchored before the 2027 series.
    // Public controls are monotonic after this one bootstrap clock assignment.
    this.surfnet.timeTravelToTimestamp(PRE_YEAR_MS);
    this.genesisHash = await this.connection.getGenesisHash();

    const config = configPda().address;
    await this.send([this.builders.admin.initializeConfig({
      config,
      program: PROGRAM_ID,
      programData: programDataAddress(),
      upgradeAuthority: this.admin.publicKey,
      systemProgram: SystemProgram.programId,
    }, this.deploymentDomain)], [this.admin]);

    for (const profile of PROFILES) this.assets.push(await this.bootstrapAsset(profile));
    await this.verifyBootstrap();
    this.manifest = {
      schemaVersion: 1,
      kind: 'surfnet',
      rpcUrl: this.surfnet.rpcUrl,
      wsUrl: this.surfnet.wsUrl,
      genesisHash: this.genesisHash,
      programId: PROGRAM_ID.toBase58(),
      deploymentDomainHex: Buffer.from(this.deploymentDomain).toString('hex'),
      runtimeId: this.runtimeId,
      clockControl: true,
      assets: this.assets.map(({ profile, issuerId, mint, policy, series }) => ({
        id: profile.id,
        company: profile.company,
        symbol: profile.symbol,
        issuerLabel: profile.issuerLabel,
        issuerIdHex: Buffer.from(issuerId).toString('hex'),
        decimals: profile.decimals,
        collateralMint: mint.publicKey.toBase58(),
        assetPolicy: policy.toBase58(),
        series: [{
          year: 2027,
          address: series.series.toBase58(),
          accumulator: series.accumulator.toBase58(),
          ptMint: series.ptMint.toBase58(),
          drMint: series.drMint.toBase58(),
          vault: series.vault.toBase58(),
        }],
      })),
    };
  }

  async bootstrapAsset(profile) {
    const mint = Keypair.generate();
    const mintSpace = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const rent = await this.connection.getMinimumBalanceForRentExemption(mintSpace);
    await this.send([
      SystemProgram.createAccount({ fromPubkey: this.admin.publicKey, newAccountPubkey: mint.publicKey, lamports: rent, space: mintSpace, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeScaledUiAmountConfigInstruction(mint.publicKey, this.admin.publicKey, 1, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, profile.decimals, this.admin.publicKey, this.admin.publicKey, TOKEN_2022_PROGRAM_ID),
    ], [this.admin, mint]);
    const issuerId = await issuerIdentityHash(`surfnet:${this.runtimeId}:${this.genesisHash}`, profile.id);
    const policy = assetPolicyPda(issuerId, mint.publicKey).address;
    await this.send([this.builders.admin.registerAsset({
      config: configPda().address,
      admin: this.admin.publicKey,
      collateralMint: mint.publicKey,
      assetPolicy: policy,
      systemProgram: SystemProgram.programId,
    }, { issuerId, symbol: profile.symbol, attestor: sdkPublicKey(this.attestor.publicKey), policyDigest: digest(`test-policy:${profile.id}`) })], [this.admin]);
    await this.refreshObservation({ profile, mint, policy }, `bootstrap:${profile.id}`);
    const series = annualSeriesAddresses(issuerId, mint.publicKey, 2027);
    await this.send([this.builders.permissionless.createSeries({
      payer: this.admin.publicKey,
      assetPolicy: policy,
      series: series.series,
      accumulator: series.accumulator,
      ptMint: series.ptMint,
      drMint: series.drMint,
      collateralMint: mint.publicKey,
      vault: series.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }, 2027)], [this.admin]);
    return { profile, mint, issuerId, policy, series };
  }

  async send(instructions, signers, payer = signers[0]) {
    const transaction = await buildRecentUnsignedTransaction(this.connection, payer.publicKey, instructions);
    const receipt = await signWithSignersSubmitAndConfirm(this.connection, transaction, signers);
    return receipt.signature;
  }

  async travelToAtLeast(timestampMs) {
    const clock = await fetchClock(this.connection);
    if (clock.unixTimestamp * 1_000n < BigInt(timestampMs)) this.surfnet.timeTravelToTimestamp(timestampMs);
    return fetchClock(this.connection);
  }

  async refreshObservation(asset, label) {
    const clock = await fetchClock(this.connection);
    return this.send([this.builders.attestor.refreshObservation({
      attestor: this.attestor.publicKey,
      assetPolicy: asset.policy,
      collateralMint: asset.mint.publicKey,
    }, digest(`test-observation:${label}`), clock.unixTimestamp + 3_600n)], [this.attestor]);
  }

  asset(assetId) {
    const asset = this.assets.find((candidate) => candidate.profile.id === assetId);
    if (!asset) throw Object.assign(new Error('unknown assetId'), { status: 400 });
    return asset;
  }

  assertRuntime(body) {
    if (body?.genesisHash !== this.genesisHash || body?.runtimeId !== this.runtimeId) {
      throw Object.assign(new Error('stale or mismatched local runtime identity'), { status: 409 });
    }
  }

  serialize(operation) {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.catch(() => undefined);
    return result;
  }

  async faucet(body) {
    this.assertRuntime(body);
    const asset = this.asset(body.assetId);
    let owner;
    try { owner = new PublicKey(body.owner); } catch { throw Object.assign(new Error('owner must be a valid public key'), { status: 400 }); }
    if (!PublicKey.isOnCurve(owner.toBytes())) throw Object.assign(new Error('owner must be an Ed25519 wallet address'), { status: 400 });
    const signatures = [];
    const ownerKey = owner.toBase58();
    try {
      const clock = await fetchClock(this.connection);
      if (clock.unixTimestamp < 1_798_761_600n) {
        const snapshot = await this.quoteSnapshot(asset);
        if (snapshot.policy.observationValidUntil < clock.unixTimestamp + 300n) signatures.push(await this.refreshObservation(asset, `faucet:${ownerKey}`));
      }
      if (!this.faucetSolOwners.has(ownerKey)) {
        const signature = await this.send([SystemProgram.transfer({ fromPubkey: this.admin.publicKey, toPubkey: owner, lamports: FAUCET_SOL_LAMPORTS })], [this.admin]);
        signatures.push(signature);
        this.faucetSolOwners.add(ownerKey);
      }
      const assetKey = `${ownerKey}:${asset.profile.id}`;
      if (!this.faucetAssets.has(assetKey)) {
        const ata = getAssociatedTokenAddressSync(asset.mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);
        const rawAmount = 100n * 10n ** BigInt(asset.profile.decimals);
        const signature = await this.send([
          createAssociatedTokenAccountIdempotentInstruction(this.admin.publicKey, ata, owner, asset.mint.publicKey, TOKEN_2022_PROGRAM_ID),
          createMintToCheckedInstruction(asset.mint.publicKey, ata, this.admin.publicKey, rawAmount, asset.profile.decimals, [], TOKEN_2022_PROGRAM_ID),
        ], [this.admin]);
        signatures.push(signature);
        this.faucetAssets.add(assetKey);
      }
      return { signatures };
    } catch (error) {
      if (signatures.length) {
        error.status ??= 500;
        error.response = { error: error.message, partial: true, signatures };
      }
      throw error;
    }
  }

  event(asset, quarterIndex) {
    const quarter = QUARTERS[quarterIndex];
    const eventId = new Uint8Array(32).fill(quarterIndex + 1);
    const previousMultiplier = quarterIndex === 0 ? 1 : QUARTERS[quarterIndex - 1].multiplier;
    const effectiveMs = Date.UTC(2027, quarter.month, quarter.day, 12);
    const eventHead = eventHeadPda(asset.series.series, eventId).address;
    return {
      effectiveMs,
      eventHead,
      eventRevision: eventRevisionPda(eventHead, 1n).address,
      input: {
        eventId,
        revision: 1n,
        exDate: 2027 * 10_000 + (quarter.month + 1) * 100 + quarter.day,
        status: 'qualified',
        m0Bits: f64Bits(previousMultiplier),
        m1Bits: f64Bits(quarter.multiplier),
        sourceFinal: true,
        originalEffectiveTimestamp: BigInt(effectiveMs / 1_000),
        paymentDate: 2027 * 10_000 + (quarter.month + 1) * 100 + quarter.day + 10,
        observedSlot: 0n,
        evidenceDigest: digest(`synthetic-quarter:${asset.profile.id}:${quarterIndex + 1}`),
      },
      multiplier: quarter.multiplier,
    };
  }

  async advance(body) {
    this.assertRuntime(body);
    const asset = this.asset(body.assetId);
    const signatures = [];
    try {
      if (body.step === 'start-year') {
        const before = await fetchClock(this.connection);
        await this.travelToAtLeast(START_YEAR_MS);
        for (const candidate of this.assets) signatures.push(await this.refreshObservation(candidate, `start-year:${candidate.profile.id}`));
        return { signatures, message: before.unixTimestamp * 1_000n < BigInt(START_YEAR_MS) ? 'Chain Clock advanced into the 2027 test year.' : 'Chain Clock was already at or past the 2027 test-year start.' };
      }
      if (body.step === 'record-dividends') {
        for (let index = 0; index < QUARTERS.length; index += 1) {
          const record = this.event(asset, index);
          if (await this.connection.getAccountInfo(record.eventHead, 'confirmed')) continue;
          const clock = await this.travelToAtLeast(record.effectiveMs + 1_000);
          const tokenSnapshot = await fetchToken2022Snapshot(this.connection, asset.mint.publicKey);
          if (tokenSnapshot.scale.activeBits !== record.input.m1Bits) {
            assert.equal(tokenSnapshot.scale.activeBits, record.input.m0Bits, 'test mint multiplier is not at the expected preceding quarter');
            signatures.push(await this.send([createUpdateMultiplierDataInstruction(asset.mint.publicKey, this.admin.publicKey, record.multiplier, BigInt(record.effectiveMs / 1_000), [], TOKEN_2022_PROGRAM_ID)], [this.admin]));
          }
          signatures.push(await this.refreshObservation(asset, `quarter:${index + 1}:${clock.slot}`));
          const refreshedClock = await fetchClock(this.connection);
          record.input.observedSlot = refreshedClock.slot;
          signatures.push(await this.send([this.builders.attestor.upsertEvent({
            attestor: this.attestor.publicKey,
            assetPolicy: asset.policy,
            series: asset.series.series,
            eventHead: record.eventHead,
            revision: record.eventRevision,
            systemProgram: SystemProgram.programId,
          }, record.input)], [this.attestor]));
        }
        return { signatures, message: 'Four test dividends are recorded for this 2027 test asset.' };
      }
      if (body.step === 'end-year') {
        const before = await fetchClock(this.connection);
        await this.travelToAtLeast(END_YEAR_MS);
        for (const candidate of this.assets) signatures.push(await this.refreshObservation(candidate, `end-year:${candidate.profile.id}`));
        return { signatures, message: before.unixTimestamp * 1_000n < BigInt(END_YEAR_MS) ? 'Chain Clock advanced past 2027 maturity; the series remains unfinalized.' : 'Chain Clock was already past 2027 maturity; the series remains unfinalized.' };
      }
      if (body.step === 'finalize') {
        let snapshot = await this.quoteSnapshot(asset);
        if (snapshot.series.eventCount !== 4 || snapshot.series.unresolvedCount !== 0) throw Object.assign(new Error('all four resolved synthetic records are required before finalization'), { status: 409 });
        if (snapshot.clock.unixTimestamp < snapshot.series.maturityUnixTimestamp) throw Object.assign(new Error('series has not reached maturity; run end-year first'), { status: 409 });
        if (snapshot.series.phase === 'finalized') return { signatures, message: 'Series was already finalized.' };
        signatures.push(await this.refreshObservation(asset, 'finalize'));
        snapshot = await this.quoteSnapshot(asset);
        if (snapshot.series.phase === 'open') {
          signatures.push(await this.send([this.builders.attestor.beginFinalization({
            attestor: this.attestor.publicKey,
            assetPolicy: asset.policy,
            series: asset.series.series,
            accumulator: asset.series.accumulator,
            collateralMint: asset.mint.publicKey,
            vault: asset.series.vault,
            ptMint: asset.series.ptMint,
            drMint: asset.series.drMint,
          }, snapshot.series.journalVersion, snapshot.series.journalHash, digest(`synthetic-coverage:${asset.profile.id}:2027`))], [this.attestor]));
          snapshot = await this.quoteSnapshot(asset);
        }
        for (let index = snapshot.accumulator.cursor; index < QUARTERS.length; index += 1) {
          const record = this.event(asset, index);
          signatures.push(await this.send([this.builders.permissionless.accumulateEvent({ keeper: this.admin.publicKey, series: asset.series.series, accumulator: asset.series.accumulator, eventHead: record.eventHead, revision: record.eventRevision })], [this.admin]));
        }
        snapshot = await this.quoteSnapshot(asset);
        if (snapshot.series.phase === 'sealing') {
          signatures.push(await this.send([this.builders.permissionless.completeFinalization({
            keeper: this.admin.publicKey,
            assetPolicy: asset.policy,
            series: asset.series.series,
            accumulator: asset.series.accumulator,
            collateralMint: asset.mint.publicKey,
            vault: asset.series.vault,
            ptMint: asset.series.ptMint,
            drMint: asset.series.drMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })], [this.admin]));
        }
        return { signatures, message: 'Series finalized from four test dividend records.' };
      }
      throw Object.assign(new Error('invalid advance step'), { status: 400 });
    } catch (error) {
      if (signatures.length) {
        error.status ??= 500;
        error.response = { error: error.message, partial: true, signatures };
      }
      throw error;
    }
  }

  quoteSnapshot(asset) {
    return fetchQuoteSnapshot(this.connection, DIVIDENDX_IDL, {
      assetPolicy: asset.policy,
      series: asset.series.series,
      accumulator: asset.series.accumulator,
      collateralMint: asset.mint.publicKey,
      vault: asset.series.vault,
    });
  }

  async verifyBootstrap() {
    assert.equal(await this.connection.getGenesisHash(), this.genesisHash);
    const program = await this.connection.getAccountInfo(PROGRAM_ID, 'confirmed');
    assert(program?.executable && program.owner.equals(LOADER_ID), 'program is not executable under the upgradeable loader');
    const programData = await this.connection.getAccountInfo(programDataAddress(), 'confirmed');
    assert(programData?.owner.equals(LOADER_ID), 'ProgramData is unavailable');
    assert.equal(new PublicKey(programData.data.subarray(13, 45)).toBase58(), this.admin.publicKey.toBase58());
    const configAddress = configPda().address;
    const configRead = await fetchProgramAccountsCoherently(this.connection, DIVIDENDX_IDL, [{ address: configAddress, accountName: 'config' }]);
    const config = normalizeConfigAccount(configAddress, configRead.accounts[0].value);
    assert.deepEqual(config.deploymentDomain, this.deploymentDomain);
    for (const asset of this.assets) await this.quoteSnapshot(asset);
  }

  stop() {
    clearInterval(this.eventDrain);
    this.surfnet?.stop();
  }
}

let activeRuntime;

async function main() {
  const runtime = activeRuntime = new LocalRuntime();
  await runtime.initialize();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    try {
      if (!HOSTS.has(request.headers.host ?? '')) throw Object.assign(new Error('invalid Host header'), { status: 403 });
      if (origin && !ORIGINS.has(origin)) throw Object.assign(new Error('origin is not allowed'), { status: 403 });
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          vary: 'Origin',
        });
        response.end();
        return;
      }
      if (request.method === 'GET' && request.url === '/manifest') {
        json(response, 200, runtime.manifest, origin);
        return;
      }
      if (request.method === 'POST' && (request.url === '/faucet' || request.url === '/advance')) {
        if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw Object.assign(new Error('content-type must be application/json'), { status: 415 });
        const body = await readJson(request);
        const result = await runtime.serialize(() => request.url === '/faucet' ? runtime.faucet(body) : runtime.advance(body));
        json(response, 200, result, origin);
        return;
      }
      throw Object.assign(new Error('route not found'), { status: 404 });
    } catch (error) {
      json(response, error.status ?? 500, error.response ?? { error: error.message ?? 'internal error' }, origin && ORIGINS.has(origin) ? origin : undefined);
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(HTTP_PORT, HTTP_HOST, resolveListen);
  });
  console.log(`DividendX local Surfnet ready at http://${HTTP_HOST}:${HTTP_PORT} (runtime ${runtime.runtimeId})`);
  const shutdown = () => {
    server.close(() => {
      runtime.stop();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  try { activeRuntime?.stop(); } catch {}
  console.error(`Local runtime failed: ${error.stack ?? error.message}`);
  process.exit(1);
});
