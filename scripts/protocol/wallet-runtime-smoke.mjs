#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  DividendXInstructions,
  annualSeriesAddresses,
  buildRecentUnsignedTransaction,
  configPda,
  decodeProgramAccount,
  deriveEligibility,
  fetchClock,
  fetchProgramAccountsCoherently,
  fetchQuoteSnapshot,
  normalizeConfigAccount,
  quoteDeposit,
  quoteRecombine,
  quoteRedemption,
  requiredCustodyRaw,
  signWithSignersSubmitAndConfirm,
  termDiscoveryId,
} from '@dividendx/transaction-sdk';

const RUNTIME_URL = 'http://127.0.0.1:4180';
const REQUEST_TIMEOUT_MS = 120_000;
const RPC_FETCH_TIMEOUT_MS = 30_000;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidencePath = resolve(repositoryRoot, 'planning/evidence/wallet-runtime-smoke-2026-09-17.json');
const builders = new DividendXInstructions(DIVIDENDX_IDL);

function idlErrorCode(name) {
  const entry = DIVIDENDX_IDL.errors?.find((candidate) => candidate.name === name);
  assert.ok(entry, `IDL does not define ${name}`);
  return entry.code;
}

const ERROR = {
  minimumOutputNotMet: idlErrorCode('MinimumOutputNotMet'),
  invalidPhase: idlErrorCode('InvalidPhase'),
  zeroOutputConsentRequired: idlErrorCode('ZeroOutputConsentRequired'),
};

function loopbackUrl(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:', `${label} must use HTTP`);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), `${label} must be loopback`);
  assert.equal(url.username, '', `${label} must not contain credentials`);
  assert.equal(url.password, '', `${label} must not contain credentials`);
  return url;
}

function loopbackWsUrl(value, label, rpcUrl) {
  const url = new URL(value);
  const rpc = new URL(rpcUrl);
  assert.equal(url.protocol, 'ws:', `${label} must use WS`);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), `${label} must be loopback`);
  assert.equal(url.hostname, rpc.hostname, `${label} must use the RPC host`);
  assert.notEqual(url.port, '', `${label} must specify a port`);
  assert.equal(url.username, '', `${label} must not contain credentials`);
  assert.equal(url.password, '', `${label} must not contain credentials`);
  assert.equal(url.search, '', `${label} must not contain a query`);
  assert.equal(url.hash, '', `${label} must not contain a fragment`);
  return url;
}

function key(value, label) {
  try {
    return new PublicKey(value);
  } catch (error) {
    throw new Error(`${label} is not a valid Solana public key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bytesFromHex(value, label) {
  assert.match(value, /^[0-9a-fA-F]{64}$/, `${label} must be 32 bytes of hexadecimal`);
  return Uint8Array.from(value.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}

function sameBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function asPublicKey(value, label) {
  assert.ok(value && typeof value === 'object' && typeof value.toBase58 === 'function', `${label} is not a public key`);
  const encoded = value.toBase58();
  assert.equal(typeof encoded, 'string', `${label} did not encode as a public key`);
  const normalized = new PublicKey(encoded);
  assert.equal(normalized.toBase58(), encoded, `${label} is not canonically encoded`);
  return normalized;
}

function asBytes(value, label) {
  assert.ok(value instanceof Uint8Array || Array.isArray(value), `${label} is not bytes`);
  return Uint8Array.from(value);
}

function rawObject(value) {
  return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, typeof entry === 'bigint' ? entry.toString() : entry]));
}

function errorText(error) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error
      ? `; cause=${error.cause.name}: ${error.cause.message}`
      : error.cause
        ? `; cause=${String(error.cause)}`
        : '';
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

async function boundedRpcFetch(input, init = {}) {
  const timeout = AbortSignal.timeout(RPC_FETCH_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error(`RPC HTTP request exceeded ${RPC_FETCH_TIMEOUT_MS}ms`);
    throw error;
  }
}

async function fetchJson(url, options, label, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.text();
    let parsed = null;
    if (body) {
      try { parsed = JSON.parse(body); } catch { parsed = null; }
    }
    if (!response.ok) {
      const detail = parsed?.error ?? (body.slice(0, 1_000) || 'empty response');
      throw new Error(`${label} returned HTTP ${response.status}: ${detail}`);
    }
    assert.notEqual(parsed, null, `${label} did not return JSON`);
    return parsed;
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error(`${label} exceeded ${timeoutMs}ms`);
    if (error instanceof Error && error.message.startsWith(`${label} `)) throw error;
    throw new Error(`${label} failed: ${errorText(error)}`);
  }
}

async function loadManifest() {
  const base = loopbackUrl(RUNTIME_URL, 'runtime URL');
  const manifest = await fetchJson(new URL('/manifest', base), { headers: { Accept: 'application/json' } }, 'GET /manifest', 10_000);
  assert.equal(manifest.schemaVersion, 1, 'unsupported runtime manifest schema');
  assert.equal(manifest.kind, 'surfnet', `unsupported runtime kind ${String(manifest.kind)}`);
  assert.equal(typeof manifest.runtimeId, 'string');
  assert.ok(manifest.runtimeId.length >= 16, 'runtimeId is unexpectedly short');
  assert.equal(typeof manifest.genesisHash, 'string');
  assert.equal(manifest.programId, DIVIDENDX_PROGRAM_ID.toBase58(), 'runtime program ID mismatch');
  bytesFromHex(manifest.deploymentDomainHex, 'deployment domain');
  loopbackUrl(manifest.rpcUrl, 'RPC URL');
  loopbackWsUrl(manifest.wsUrl, 'WebSocket URL', manifest.rpcUrl);
  assert.equal(manifest.clockControl, true, 'runtime does not provide the controlled clock required by this acceptance test');
  assert.ok(Array.isArray(manifest.assets), 'manifest assets are missing');
  const byDecimals = new Map();
  for (const asset of manifest.assets) {
    assert.ok([6, 8, 9].includes(asset.decimals), `asset ${String(asset.id)} has unsupported decimals`);
    if (!byDecimals.has(asset.decimals)) byDecimals.set(asset.decimals, asset);
  }
  assert.deepEqual([...byDecimals.keys()].sort(), [6, 8, 9], 'manifest must expose 6, 8 and 9 decimal assets');
  return { manifest, assets: [byDecimals.get(6), byDecimals.get(8), byDecimals.get(9)] };
}

async function runtimePost(manifest, path, body) {
  const base = loopbackUrl(RUNTIME_URL, 'runtime URL');
  return fetchJson(new URL(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, genesisHash: manifest.genesisHash, runtimeId: manifest.runtimeId }),
  }, `POST ${path} (${body.step ?? body.assetId ?? 'request'})`);
}

async function transactionDetails(connection, signature) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const details = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (details) return details;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`confirmed transaction ${signature} details remained unavailable after 4s`);
}

async function confirmedReceipt(connection, signature, expectedSuccess = true) {
  let status = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.ok(status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized', `signature ${signature} did not reach confirmed/finalized status`);
  if (expectedSuccess) assert.equal(status.err, null, `signature ${signature} failed: ${JSON.stringify(status.err)}`);
  else assert.notEqual(status.err, null, `signature ${signature} unexpectedly succeeded`);
  const details = await transactionDetails(connection, signature);
  assert.deepEqual(details.meta?.err ?? null, status.err ?? null, `signature ${signature} status/detail error mismatch`);
  return {
    signature,
    slot: status.slot,
    confirmationStatus: status.confirmationStatus,
    err: status.err,
    blockTime: details.blockTime,
    feeLamports: details.meta?.fee ?? null,
    computeUnitsConsumed: details.meta?.computeUnitsConsumed ?? null,
    dividendXInvokeObserved: Boolean(details.meta?.logMessages?.some((line) => line.includes(`Program ${DIVIDENDX_PROGRAM_ID.toBase58()} invoke`))),
    ...(expectedSuccess ? {} : { logs: details.meta?.logMessages?.slice(-50) ?? [] }),
  };
}

async function runtimeReceipts(connection, label, response, requireSignatures, requireProgramInvoke = false) {
  assert.ok(response && Array.isArray(response.signatures), `${label} response has no signatures array`);
  if (requireSignatures) assert.ok(response.signatures.length > 0, `${label} returned no genuine transaction signatures`);
  const receipts = [];
  for (const signature of response.signatures) receipts.push(await confirmedReceipt(connection, signature));
  if (requireProgramInvoke) assert.ok(receipts.some((receipt) => receipt.dividendXInvokeObserved), `${label} receipts never invoked DividendX`);
  return { message: String(response.message ?? ''), receipts };
}

async function send(connection, label, instructions, signers, payer = signers[0]) {
  assert.ok(signers.length > 0, `${label} requires a signer`);
  const transaction = await buildRecentUnsignedTransaction(connection, payer.publicKey, instructions);
  try {
    const submitted = await signWithSignersSubmitAndConfirm(connection, transaction, signers);
    const receipt = await confirmedReceipt(connection, submitted.signature);
    assert.equal(receipt.slot, submitted.slot, `${label} SDK and RPC receipt slots differ`);
    return { label, ...receipt };
  } catch (error) {
    let simulation = null;
    try {
      transaction.partialSign(...signers);
      const result = await connection.simulateTransaction(transaction);
      simulation = { err: result.value.err, logs: result.value.logs?.slice(-30) ?? [] };
    } catch (simulationError) {
      simulation = { diagnosticFailure: errorText(simulationError) };
    }
    throw new Error(`${label} failed: ${errorText(error)}; diagnostic=${JSON.stringify(simulation)}`);
  }
}

async function sendExpectedFailure(connection, label, instructions, signer, expectedCustomErrorCode) {
  const transaction = await buildRecentUnsignedTransaction(connection, signer.publicKey, instructions);
  transaction.partialSign(signer);
  let signature = '';
  let confirmationDiagnostic = '';
  try {
    signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true, maxRetries: 0 });
  } catch (error) {
    throw new Error(`${label} was not submitted to RPC: ${errorText(error)}`);
  }
  try {
    await connection.confirmTransaction({
      signature,
      blockhash: transaction.recentBlockhash,
      lastValidBlockHeight: transaction.lastValidBlockHeight,
    }, 'confirmed');
  } catch (error) {
    confirmationDiagnostic = errorText(error);
  }
  const receipt = await confirmedReceipt(connection, signature, false);
  assert.equal(receipt.dividendXInvokeObserved, true, `${label} did not invoke DividendX before failing`);
  assert.deepEqual(
    receipt.err,
    { InstructionError: [0, { Custom: expectedCustomErrorCode }] },
    `${label} failed for an unintended reason`,
  );
  return { label, ...receipt, ...(confirmationDiagnostic ? { confirmationDiagnostic } : {}) };
}

function holderAddresses(session, owner) {
  return {
    collateral: getAssociatedTokenAddressSync(session.collateralMint, owner, false, TOKEN_2022_PROGRAM_ID),
    pt: getAssociatedTokenAddressSync(session.addresses.ptMint, owner),
    dr: getAssociatedTokenAddressSync(session.addresses.drMint, owner),
  };
}

function holderAccounts(session, owner) {
  const accounts = holderAddresses(session, owner);
  return {
    holder: owner,
    assetPolicy: session.addresses.assetPolicy,
    series: session.addresses.series,
    collateralMint: session.collateralMint,
    vault: session.addresses.vault,
    holderCollateral: accounts.collateral,
    ptMint: session.addresses.ptMint,
    drMint: session.addresses.drMint,
    holderPt: accounts.pt,
    holderDr: accounts.dr,
    tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
  };
}

async function seriesSnapshot(connection, session, owner) {
  const holder = owner ? holderAddresses(session, owner) : null;
  return fetchQuoteSnapshot(connection, DIVIDENDX_IDL, {
    assetPolicy: session.addresses.assetPolicy,
    series: session.addresses.series,
    accumulator: session.addresses.accumulator,
    collateralMint: session.collateralMint,
    vault: session.addresses.vault,
    holder: owner,
    holderCollateral: holder?.collateral,
    holderPt: holder?.pt,
    holderDr: holder?.dr,
  });
}

async function protocolState(connection, session, ownerA, ownerB) {
  const [quote, aCollateral, aPt, aDr, bCollateral, bPt, bDr, ptMint, drMint, collateralMint] = await Promise.all([
    seriesSnapshot(connection, session),
    getAccount(connection, holderAddresses(session, ownerA).collateral, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getAccount(connection, holderAddresses(session, ownerA).pt, 'confirmed', TOKEN_PROGRAM_ID),
    getAccount(connection, holderAddresses(session, ownerA).dr, 'confirmed', TOKEN_PROGRAM_ID),
    getAccount(connection, holderAddresses(session, ownerB).collateral, 'confirmed', TOKEN_2022_PROGRAM_ID),
    getAccount(connection, holderAddresses(session, ownerB).pt, 'confirmed', TOKEN_PROGRAM_ID),
    getAccount(connection, holderAddresses(session, ownerB).dr, 'confirmed', TOKEN_PROGRAM_ID),
    getMint(connection, session.addresses.ptMint, 'confirmed', TOKEN_PROGRAM_ID),
    getMint(connection, session.addresses.drMint, 'confirmed', TOKEN_PROGRAM_ID),
    getMint(connection, session.collateralMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
  ]);
  return {
    contextSlot: quote.contextSlot,
    clockUnixTimestamp: quote.clock.unixTimestamp,
    series: quote.series,
    accumulator: quote.accumulator,
    vaultRaw: quote.vaultRaw,
    requiredRaw: requiredCustodyRaw(quote.series),
    aCollateralRaw: aCollateral.amount,
    aPtRaw: aPt.amount,
    aDrRaw: aDr.amount,
    bCollateralRaw: bCollateral.amount,
    bPtRaw: bPt.amount,
    bDrRaw: bDr.amount,
    ptSupplyRaw: ptMint.supply,
    drSupplyRaw: drMint.supply,
    collateralSupplyRaw: collateralMint.supply,
  };
}

function evidenceState(state) {
  return {
    contextSlot: state.contextSlot,
    clockUnixTimestamp: state.clockUnixTimestamp,
    phase: state.series.phase,
    stateVersion: state.series.stateVersion,
    accountableRaw: state.series.accountableRaw,
    eventCount: state.series.eventCount,
    unresolvedCount: state.series.unresolvedCount,
    inYearQualifiedCount: state.series.inYearQualifiedCount,
    accumulatorCursor: state.accumulator.cursor,
    finalSupplyRaw: state.series.finalSupplyRaw,
    finalPtPoolRaw: state.series.finalPtPoolRaw,
    finalDrPoolRaw: state.series.finalDrPoolRaw,
    redeemedPtClaimsRaw: state.series.redeemedPtClaimsRaw,
    redeemedDrClaimsRaw: state.series.redeemedDrClaimsRaw,
    ptPaidRaw: state.series.ptPaidRaw,
    drPaidRaw: state.series.drPaidRaw,
    vaultRaw: state.vaultRaw,
    requiredRaw: state.requiredRaw,
    aCollateralRaw: state.aCollateralRaw,
    aPtRaw: state.aPtRaw,
    aDrRaw: state.aDrRaw,
    bCollateralRaw: state.bCollateralRaw,
    bPtRaw: state.bPtRaw,
    bDrRaw: state.bDrRaw,
    ptSupplyRaw: state.ptSupplyRaw,
    drSupplyRaw: state.drSupplyRaw,
    collateralSupplyRaw: state.collateralSupplyRaw,
  };
}

function economicState(state) {
  const { contextSlot: _contextSlot, clockUnixTimestamp: _clockUnixTimestamp, ...economic } = evidenceState(state);
  return economic;
}

async function validateRuntime(manifest, assets, connection) {
  const [genesisHash, programInfo] = await Promise.all([
    connection.getGenesisHash(),
    connection.getAccountInfo(DIVIDENDX_PROGRAM_ID, 'confirmed'),
  ]);
  assert.equal(genesisHash, manifest.genesisHash, 'RPC genesis does not match manifest');
  assert.equal(programInfo?.executable, true, 'DividendX program is missing or non-executable');
  const configAddress = configPda().address;
  const decodedConfig = await fetchProgramAccountsCoherently(connection, DIVIDENDX_IDL, [{ address: configAddress, accountName: 'config' }]);
  const config = normalizeConfigAccount(configAddress, decodedConfig.accounts[0].value);
  const deploymentDomain = bytesFromHex(manifest.deploymentDomainHex, 'deployment domain');
  assert.ok(sameBytes(config.deploymentDomain, deploymentDomain), 'Config deployment domain does not match manifest');

  const year = 2027;
  assert.ok(assets.every((asset) => Array.isArray(asset.series) && asset.series.some((series) => series.year === year)), 'every 6/8/9-decimal asset must expose the fixed 2027 series');
  const sessions = [];
  for (const asset of assets) {
    assert.equal(typeof asset.id, 'string');
    assert.ok(asset.id.length > 0, 'asset ID is empty');
    assert.equal(typeof asset.symbol, 'string');
    const issuerId = bytesFromHex(asset.issuerIdHex, `${asset.id} issuer ID`);
    const collateralMint = key(asset.collateralMint, `${asset.id} collateral mint`);
    const entry = asset.series.find((candidate) => candidate.year === year);
    assert.ok(entry, `${asset.id} lacks series ${year}`);
    const addresses = annualSeriesAddresses(issuerId, collateralMint, year);
    for (const [name, expected] of Object.entries({
      assetPolicy: asset.assetPolicy,
      series: entry.address,
      accumulator: entry.accumulator,
      ptMint: entry.ptMint,
      drMint: entry.drMint,
      vault: entry.vault,
    })) assert.equal(addresses[name].toBase58(), expected, `${asset.id} manifest ${name} PDA mismatch`);

    const [quote, policyInfo, ptMint, drMint] = await Promise.all([
      fetchQuoteSnapshot(connection, DIVIDENDX_IDL, {
        assetPolicy: addresses.assetPolicy,
        series: addresses.series,
        accumulator: addresses.accumulator,
        collateralMint,
        vault: addresses.vault,
      }),
      connection.getAccountInfo(addresses.assetPolicy, 'confirmed'),
      getMint(connection, addresses.ptMint, 'confirmed', TOKEN_PROGRAM_ID),
      getMint(connection, addresses.drMint, 'confirmed', TOKEN_PROGRAM_ID),
    ]);
    assert.ok(policyInfo, `${asset.id} asset policy is missing`);
    const rawPolicy = decodeProgramAccount(DIVIDENDX_IDL, 'assetPolicy', policyInfo.data);
    assert.ok(asPublicKey(rawPolicy.config, `${asset.id} policy config`).equals(configAddress));
    assert.ok(asPublicKey(rawPolicy.collateralMint, `${asset.id} policy mint`).equals(collateralMint));
    assert.ok(sameBytes(asBytes(rawPolicy.issuerId, `${asset.id} policy issuer`), issuerId));
    assert.equal(rawPolicy.symbol, asset.symbol, `${asset.id} policy symbol mismatch`);
    assert.equal(rawPolicy.decimals, asset.decimals, `${asset.id} policy decimals mismatch`);
    assert.equal(quote.series.year, year);
    assert.equal(quote.series.phase, 'open');
    assert.equal(quote.series.eventCount, 0, `${asset.id} runtime is not a fresh event journal`);
    assert.equal(quote.series.accountableRaw, 0n, `${asset.id} runtime series already has deposits`);
    assert.equal(quote.vaultRaw, 0n, `${asset.id} runtime vault is not empty`);
    assert.equal(ptMint.decimals, asset.decimals);
    assert.equal(drMint.decimals, asset.decimals);
    assert.ok(ptMint.mintAuthority?.equals(addresses.series), `${asset.id} PT authority mismatch before finalization`);
    assert.ok(drMint.mintAuthority?.equals(addresses.series), `${asset.id} DR authority mismatch before finalization`);
    assert.equal(ptMint.freezeAuthority, null);
    assert.equal(drMint.freezeAuthority, null);
    const discoveryId = await termDiscoveryId({
      clusterGenesisHash: genesisHash,
      programId: DIVIDENDX_PROGRAM_ID,
      deploymentDomain,
      issuerId,
      collateralMint,
      year,
    });
    sessions.push({ asset, entry, issuerId, collateralMint, addresses, discoveryId });
  }
  return { genesisHash, config, deploymentDomain, year, sessions };
}

async function redeemAll(connection, session, owner, side) {
  const accountAddresses = holderAddresses(session, owner.publicKey);
  const before = await seriesSnapshot(connection, session, owner.publicKey);
  const amount = side === 'pt' ? before.holderPtRaw : before.holderDrRaw;
  assert.ok(amount > 0n, `${session.asset.id} ${side.toUpperCase()} owner has no claims to redeem`);
  const ownedCollateral = before.holderCollateralRaw;
  const quote = quoteRedemption(
    before.series,
    before.vaultRaw,
    side,
    amount,
    amount,
    true,
    before.clock.unixTimestamp,
    before.clock.unixTimestamp + 60n,
  );
  const allowZero = quote.collateralOutputRaw === 0n;
  const guarded = allowZero ? quote : quoteRedemption(
    before.series,
    before.vaultRaw,
    side,
    amount,
    amount,
    false,
    before.clock.unixTimestamp,
    before.clock.unixTimestamp + 60n,
  );
  const receipt = await send(connection, `${session.asset.id} redeem ${side.toUpperCase()}`, [builders.holder.redeem({
    holder: owner.publicKey,
    assetPolicy: session.addresses.assetPolicy,
    series: session.addresses.series,
    collateralMint: session.collateralMint,
    vault: session.addresses.vault,
    holderCollateral: accountAddresses.collateral,
    claimMint: side === 'pt' ? session.addresses.ptMint : session.addresses.drMint,
    holderClaim: side === 'pt' ? accountAddresses.pt : accountAddresses.dr,
    tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
  }, side, amount, allowZero, guarded.guard)], [owner]);
  const after = await seriesSnapshot(connection, session, owner.publicKey);
  assert.equal(side === 'pt' ? after.holderPtRaw : after.holderDrRaw, 0n, `${session.asset.id} ${side.toUpperCase()} was not fully burned`);
  assert.equal(after.holderCollateralRaw, ownedCollateral + guarded.collateralOutputRaw, `${session.asset.id} ${side.toUpperCase()} payout mismatch`);
  assert.equal(after.vaultRaw, before.vaultRaw - guarded.collateralOutputRaw, `${session.asset.id} ${side.toUpperCase()} vault delta mismatch`);
  return { side, owner: owner.publicKey.toBase58(), amountRaw: amount, outputRaw: guarded.collateralOutputRaw, allowZero, receipt };
}

async function main() {
  const { manifest, assets } = await loadManifest();
  const connection = new Connection(manifest.rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: manifest.wsUrl,
    confirmTransactionInitialTimeout: REQUEST_TIMEOUT_MS,
    fetch: boundedRpcFetch,
  });
  const identity = await validateRuntime(manifest, assets, connection);
  const ownerA = Keypair.generate();
  const ownerB = Keypair.generate();
  const evidence = {
    schemaVersion: 1,
    kind: 'wallet-runtime-acceptance',
    checkedAt: new Date().toISOString(),
    runtime: {
      kind: manifest.kind,
      scope: 'offline local SBF sandbox; not a public validator or network',
      rpcUrl: manifest.rpcUrl,
      wsUrl: manifest.wsUrl,
      genesisHash: identity.genesisHash,
      runtimeId: manifest.runtimeId,
      programId: manifest.programId,
      deploymentDomainHex: manifest.deploymentDomainHex,
      config: configPda().address.toBase58(),
      year: identity.year,
    },
    disposableOwners: { a: ownerA.publicKey.toBase58(), b: ownerB.publicKey.toBase58() },
    controls: [],
    assets: [],
  };

  for (const session of identity.sessions) {
    const faucet = {};
    for (const [name, owner] of [['a', ownerA], ['b', ownerB]]) {
      const response = await runtimePost(manifest, '/faucet', { owner: owner.publicKey.toBase58(), assetId: session.asset.id });
      faucet[name] = await runtimeReceipts(connection, `${session.asset.id} faucet ${name.toUpperCase()}`, response, true);
    }
    session.faucet = faucet;
  }

  for (const session of identity.sessions) {
    const a = holderAddresses(session, ownerA.publicKey);
    const b = holderAddresses(session, ownerB.publicKey);
    const [funding, aCollateral, bCollateral, collateralMint] = await Promise.all([
      seriesSnapshot(connection, session),
      getAccount(connection, a.collateral, 'confirmed', TOKEN_2022_PROGRAM_ID),
      getAccount(connection, b.collateral, 'confirmed', TOKEN_2022_PROGRAM_ID),
      getMint(connection, session.collateralMint, 'confirmed', TOKEN_2022_PROGRAM_ID),
    ]);
    const unit = 10n ** BigInt(session.asset.decimals);
    const depositRaw = 100n * unit;
    const ptTransferRaw = 40n * unit;
    const drTransferRaw = 60n * unit;
    const recombineRaw = 20n * unit;
    const donationRaw = 7n;
    const burnPtRaw = 1n;
    assert.ok(aCollateral.amount >= depositRaw, `${session.asset.id} faucet A balance is below ${depositRaw}`);
    assert.ok(bCollateral.amount >= donationRaw, `${session.asset.id} faucet B cannot fund donation`);
    assert.equal(funding.series.phase, 'open');
    assert.ok(funding.clock.unixTimestamp < funding.series.startUnixTimestamp, `${session.asset.id} deposits are not before the year start`);
    const quote = quoteDeposit(
      funding.series,
      funding.policy,
      funding.vaultRaw,
      depositRaw,
      aCollateral.amount,
      funding.clock,
      funding.clock.unixTimestamp + 60n,
      depositRaw,
    );
    const receipts = {};
    receipts.deposit = await send(connection, `${session.asset.id} deposit`, [
      createAssociatedTokenAccountIdempotentInstruction(ownerA.publicKey, a.pt, ownerA.publicKey, session.addresses.ptMint),
      createAssociatedTokenAccountIdempotentInstruction(ownerA.publicKey, a.dr, ownerA.publicKey, session.addresses.drMint),
      builders.holder.deposit(holderAccounts(session, ownerA.publicKey), depositRaw, quote.guard),
    ], [ownerA]);

    receipts.transferPt = await send(connection, `${session.asset.id} transfer PT (not a sale)`, [
      createAssociatedTokenAccountIdempotentInstruction(ownerA.publicKey, b.pt, ownerB.publicKey, session.addresses.ptMint),
      createTransferCheckedInstruction(a.pt, session.addresses.ptMint, b.pt, ownerA.publicKey, ptTransferRaw, session.asset.decimals),
    ], [ownerA]);
    receipts.transferDr = await send(connection, `${session.asset.id} transfer DR (not a sale)`, [
      createAssociatedTokenAccountIdempotentInstruction(ownerA.publicKey, b.dr, ownerB.publicKey, session.addresses.drMint),
      createTransferCheckedInstruction(a.dr, session.addresses.drMint, b.dr, ownerA.publicKey, drTransferRaw, session.asset.decimals),
    ], [ownerA]);

    const paired = await seriesSnapshot(connection, session, ownerB.publicKey);
    const pairedQuote = quoteRecombine(
      paired.series,
      paired.vaultRaw,
      recombineRaw,
      paired.holderPtRaw,
      paired.holderDrRaw,
      paired.clock.unixTimestamp,
      paired.clock.unixTimestamp + 60n,
      recombineRaw,
    );
    receipts.recombine = await send(connection, `${session.asset.id} partial paired recombination`, [
      builders.holder.recombine(holderAccounts(session, ownerB.publicKey), recombineRaw, pairedQuote.guard),
    ], [ownerB]);
    receipts.donation = await send(connection, `${session.asset.id} unsolicited vault donation`, [
      createTransferCheckedInstruction(b.collateral, session.collateralMint, session.addresses.vault, ownerB.publicKey, donationRaw, session.asset.decimals, [], TOKEN_2022_PROGRAM_ID),
    ], [ownerB]);
    receipts.externalPtBurn = await send(connection, `${session.asset.id} external PT burn`, [
      createBurnCheckedInstruction(a.pt, session.addresses.ptMint, ownerA.publicKey, burnPtRaw, session.asset.decimals),
    ], [ownerA]);

    const prepared = await protocolState(connection, session, ownerA.publicKey, ownerB.publicKey);
    assert.equal(prepared.series.accountableRaw, depositRaw - recombineRaw);
    assert.equal(prepared.vaultRaw, depositRaw - recombineRaw + donationRaw);
    assert.equal(prepared.requiredRaw, depositRaw - recombineRaw);
    assert.equal(prepared.aPtRaw, depositRaw - ptTransferRaw - burnPtRaw);
    assert.equal(prepared.aDrRaw, depositRaw - drTransferRaw);
    assert.equal(prepared.bPtRaw, ptTransferRaw - recombineRaw);
    assert.equal(prepared.bDrRaw, drTransferRaw - recombineRaw);
    assert.equal(prepared.ptSupplyRaw, depositRaw - recombineRaw - burnPtRaw);
    assert.equal(prepared.drSupplyRaw, depositRaw - recombineRaw);
    session.amounts = { unit, depositRaw, ptTransferRaw, drTransferRaw, recombineRaw, donationRaw, burnPtRaw };
    session.initialTrackedCollateralRaw = aCollateral.amount + bCollateral.amount;
    session.initialCollateralSupplyRaw = collateralMint.supply;
    session.prepared = prepared;
    session.holderReceipts = receipts;
  }

  const first = identity.sessions[0];
  const startBefore = await fetchClock(connection);
  const startResponse = await runtimePost(manifest, '/advance', { step: 'start-year', assetId: first.asset.id });
  const startReceipts = await runtimeReceipts(connection, 'start-year', startResponse, false);
  const startAfter = await fetchClock(connection);
  assert.ok(startAfter.unixTimestamp >= startBefore.unixTimestamp, 'start-year moved the chain clock backwards');
  evidence.controls.push({ step: 'start-year', assetId: first.asset.id, beforeUnixTimestamp: startBefore.unixTimestamp, afterUnixTimestamp: startAfter.unixTimestamp, ...startReceipts });

  for (const session of identity.sessions) {
    const before = await seriesSnapshot(connection, session);
    const clockBefore = await fetchClock(connection);
    const response = await runtimePost(manifest, '/advance', { step: 'record-dividends', assetId: session.asset.id });
    const result = await runtimeReceipts(connection, `${session.asset.id} record-dividends`, response, true, true);
    const clockAfter = await fetchClock(connection);
    assert.ok(clockAfter.unixTimestamp >= clockBefore.unixTimestamp, `${session.asset.id} record-dividends moved the chain clock backwards`);
    const after = await seriesSnapshot(connection, session);
    assert.equal(after.series.eventCount - before.series.eventCount, 4, `${session.asset.id} did not add exactly four events`);
    assert.equal(after.series.inYearQualifiedCount - before.series.inYearQualifiedCount, 4, `${session.asset.id} did not add exactly four qualified events`);
    assert.equal(after.series.unresolvedCount, 0, `${session.asset.id} journal remains unresolved`);
    evidence.controls.push({ step: 'record-dividends', assetId: session.asset.id, beforeUnixTimestamp: clockBefore.unixTimestamp, afterUnixTimestamp: clockAfter.unixTimestamp, eventCount: after.series.eventCount, qualifiedCount: after.series.inYearQualifiedCount, ...result });
  }

  const endBefore = await fetchClock(connection);
  const endResponse = await runtimePost(manifest, '/advance', { step: 'end-year', assetId: first.asset.id });
  const endReceipts = await runtimeReceipts(connection, 'end-year', endResponse, false);
  const endAfter = await fetchClock(connection);
  assert.ok(endAfter.unixTimestamp >= endBefore.unixTimestamp, 'end-year moved the chain clock backwards');
  evidence.controls.push({ step: 'end-year', assetId: first.asset.id, beforeUnixTimestamp: endBefore.unixTimestamp, afterUnixTimestamp: endAfter.unixTimestamp, ...endReceipts });

  for (const session of identity.sessions) {
    const matured = await seriesSnapshot(connection, session, ownerA.publicKey);
    const eligibility = deriveEligibility(matured.series, matured.policy, matured.vaultRaw, matured.clock);
    assert.equal(eligibility.productPhase, 'matured_pending', `${session.asset.id} is not maturity-pending`);
    assert.equal(eligibility.redeemable, false);
    session.matured = matured;
  }

  const pendingSession = first;
  const pendingHolder = holderAddresses(pendingSession, ownerA.publicKey);
  const pendingBefore = await protocolState(connection, pendingSession, ownerA.publicKey, ownerB.publicKey);
  const pendingFailure = await sendExpectedFailure(connection, `${pendingSession.asset.id} redemption before finalization`, [builders.holder.redeem({
    holder: ownerA.publicKey,
    assetPolicy: pendingSession.addresses.assetPolicy,
    series: pendingSession.addresses.series,
    collateralMint: pendingSession.collateralMint,
    vault: pendingSession.addresses.vault,
    holderCollateral: pendingHolder.collateral,
    claimMint: pendingSession.addresses.ptMint,
    holderClaim: pendingHolder.pt,
    tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
  }, 'pt', 1n, false, {
    expectedStateVersion: pendingSession.matured.series.stateVersion,
    expiryUnixTimestamp: pendingSession.matured.clock.unixTimestamp + 60n,
    minimumRawOutput: 1n,
  })], ownerA, ERROR.invalidPhase);
  const pendingAfter = await protocolState(connection, pendingSession, ownerA.publicKey, ownerB.publicKey);
  assert.deepEqual(economicState(pendingAfter), economicState(pendingBefore), 'failed maturity-only redemption mutated economic state');
  evidence.maturityOnlyRedemptionRejection = pendingFailure;

  for (const session of identity.sessions) {
    const clockBefore = await fetchClock(connection);
    const response = await runtimePost(manifest, '/advance', { step: 'finalize', assetId: session.asset.id });
    const result = await runtimeReceipts(connection, `${session.asset.id} finalize`, response, true, true);
    const clockAfter = await fetchClock(connection);
    assert.ok(clockAfter.unixTimestamp >= clockBefore.unixTimestamp, `${session.asset.id} finalize moved the chain clock backwards`);
    const [finalized, ptMint, drMint] = await Promise.all([
      seriesSnapshot(connection, session),
      getMint(connection, session.addresses.ptMint, 'confirmed', TOKEN_PROGRAM_ID),
      getMint(connection, session.addresses.drMint, 'confirmed', TOKEN_PROGRAM_ID),
    ]);
    const eligibility = deriveEligibility(finalized.series, finalized.policy, finalized.vaultRaw, finalized.clock);
    assert.equal(finalized.series.phase, 'finalized');
    assert.equal(finalized.accumulator.cursor, 4, `${session.asset.id} did not accumulate all four events`);
    assert.equal(finalized.series.finalSupplyRaw, session.amounts.depositRaw - session.amounts.recombineRaw);
    assert.equal(finalized.series.finalPtPoolRaw + finalized.series.finalDrPoolRaw, finalized.series.finalSupplyRaw);
    assert.equal(eligibility.redeemable, true);
    assert.equal(eligibility.custody.healthy, true);
    assert.equal(ptMint.mintAuthority, null, `${session.asset.id} PT mint authority survived finalization`);
    assert.equal(drMint.mintAuthority, null, `${session.asset.id} DR mint authority survived finalization`);
    session.finalized = finalized;
    evidence.controls.push({
      step: 'finalize',
      assetId: session.asset.id,
      eventCount: finalized.series.eventCount,
      accumulatorCursor: finalized.accumulator.cursor,
      finalPtPoolRaw: finalized.series.finalPtPoolRaw,
      finalDrPoolRaw: finalized.series.finalDrPoolRaw,
      beforeUnixTimestamp: clockBefore.unixTimestamp,
      afterUnixTimestamp: clockAfter.unixTimestamp,
      ...result,
    });
  }

  const guarded = first;
  const guardHolder = holderAddresses(guarded, ownerA.publicKey);
  const guardBefore = await protocolState(connection, guarded, ownerA.publicKey, ownerB.publicKey);
  const guardSnapshot = await seriesSnapshot(connection, guarded, ownerA.publicKey);
  const validGuardQuote = quoteRedemption(
    guardSnapshot.series,
    guardSnapshot.vaultRaw,
    'pt',
    guardSnapshot.holderPtRaw,
    guardSnapshot.holderPtRaw,
    true,
    guardSnapshot.clock.unixTimestamp,
    guardSnapshot.clock.unixTimestamp + 60n,
  );
  const minimumFailure = await sendExpectedFailure(connection, `${guarded.asset.id} excessive minimum-output redemption`, [builders.holder.redeem({
    holder: ownerA.publicKey,
    assetPolicy: guarded.addresses.assetPolicy,
    series: guarded.addresses.series,
    collateralMint: guarded.collateralMint,
    vault: guarded.addresses.vault,
    holderCollateral: guardHolder.collateral,
    claimMint: guarded.addresses.ptMint,
    holderClaim: guardHolder.pt,
    tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
  }, 'pt', validGuardQuote.claimInputRaw, false, {
    ...validGuardQuote.guard,
    minimumRawOutput: validGuardQuote.collateralOutputRaw + 1n,
  })], ownerA, ERROR.minimumOutputNotMet);
  const guardAfter = await protocolState(connection, guarded, ownerA.publicKey, ownerB.publicKey);
  assert.deepEqual(economicState(guardAfter), economicState(guardBefore), 'failed minimum-output redemption mutated economic state');
  evidence.minimumOutputRejection = { quotedOutputRaw: validGuardQuote.collateralOutputRaw, requestedMinimumRaw: validGuardQuote.collateralOutputRaw + 1n, ...minimumFailure };

  let zeroOutputGuard = { supportedByObservedAllocation: false, scope: 'SDK quote check only because every tested one-raw-unit DR quote had positive output.' };
  for (const session of identity.sessions) {
    const snapshot = await seriesSnapshot(connection, session, ownerA.publicKey);
    if (snapshot.holderDrRaw < 1n) continue;
    const permissive = quoteRedemption(snapshot.series, snapshot.vaultRaw, 'dr', 1n, snapshot.holderDrRaw, true, snapshot.clock.unixTimestamp, snapshot.clock.unixTimestamp + 60n);
    if (permissive.collateralOutputRaw === 0n) {
      let rejection = '';
      try {
        quoteRedemption(snapshot.series, snapshot.vaultRaw, 'dr', 1n, snapshot.holderDrRaw, false, snapshot.clock.unixTimestamp, snapshot.clock.unixTimestamp + 60n);
      } catch (error) {
        rejection = errorText(error);
      }
      assert.match(rejection, /zero-output redemption requires explicit consent/);
      const addresses = holderAddresses(session, ownerA.publicKey);
      const before = await protocolState(connection, session, ownerA.publicKey, ownerB.publicKey);
      const programRejection = await sendExpectedFailure(connection, `${session.asset.id} zero-output redemption without consent`, [builders.raw.build('redeem', {
        side: { dr: {} },
        amount: 1n,
        allowZero: false,
        guard: {
          expectedStateVersion: snapshot.series.stateVersion,
          expiryUnixTimestamp: snapshot.clock.unixTimestamp + 60n,
          minimumRawOutput: 0n,
        },
      }, {
        holder: ownerA.publicKey,
        assetPolicy: session.addresses.assetPolicy,
        series: session.addresses.series,
        collateralMint: session.collateralMint,
        vault: session.addresses.vault,
        holderCollateral: addresses.collateral,
        claimMint: session.addresses.drMint,
        holderClaim: addresses.dr,
        tokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
      })], ownerA, ERROR.zeroOutputConsentRequired);
      const after = await protocolState(connection, session, ownerA.publicKey, ownerB.publicKey);
      assert.deepEqual(economicState(after), economicState(before), 'failed zero-output redemption mutated economic state');
      zeroOutputGuard = {
        supportedByObservedAllocation: true,
        scope: 'SDK quote rejection and actual local SBF program rejection',
        assetId: session.asset.id,
        side: 'dr',
        amountRaw: 1n,
        outputRaw: 0n,
        sdkRejection: rejection,
        programRejection,
      };
      break;
    }
  }
  evidence.zeroOutputGuard = zeroOutputGuard;

  for (const session of identity.sessions) {
    const redemptions = [];
    redemptions.push(await redeemAll(connection, session, ownerA, 'pt'));
    redemptions.push(await redeemAll(connection, session, ownerB, 'dr'));
    redemptions.push(await redeemAll(connection, session, ownerA, 'dr'));
    redemptions.push(await redeemAll(connection, session, ownerB, 'pt'));
    const final = await protocolState(connection, session, ownerA.publicKey, ownerB.publicKey);
    assert.equal(final.ptSupplyRaw, 0n, `${session.asset.id} PT supply remains after redeeming every extant claim`);
    assert.equal(final.drSupplyRaw, 0n, `${session.asset.id} DR supply remains after redeeming every extant claim`);
    assert.equal(final.aPtRaw + final.bPtRaw + final.aDrRaw + final.bDrRaw, 0n, `${session.asset.id} holder claims remain`);
    assert.equal(final.collateralSupplyRaw, session.initialCollateralSupplyRaw, `${session.asset.id} collateral supply changed after faucet baseline`);
    assert.equal(final.aCollateralRaw + final.bCollateralRaw + final.vaultRaw, session.initialTrackedCollateralRaw, `${session.asset.id} tracked raw collateral is not conserved`);
    assert.equal(final.vaultRaw, final.requiredRaw + session.amounts.donationRaw, `${session.asset.id} donation was drained or obligation accounting diverged`);
    assert.equal(final.series.ptPaidRaw + final.series.drPaidRaw + final.requiredRaw, final.series.accountableRaw, `${session.asset.id} payouts and remaining obligations do not equal accountable custody`);
    evidence.assets.push({
      assetId: session.asset.id,
      company: session.asset.company,
      symbol: session.asset.symbol,
      issuerLabel: session.asset.issuerLabel,
      decimals: session.asset.decimals,
      collateralMint: session.collateralMint.toBase58(),
      series: session.addresses.series.toBase58(),
      ptMint: session.addresses.ptMint.toBase58(),
      drMint: session.addresses.drMint.toBase58(),
      vault: session.addresses.vault.toBase58(),
      discoveryId: session.discoveryId,
      amounts: rawObject(session.amounts),
      faucet: session.faucet,
      holderTransactions: session.holderReceipts,
      preparedState: evidenceState(session.prepared),
      finalizedState: {
        phase: session.finalized.series.phase,
        finalSupplyRaw: session.finalized.series.finalSupplyRaw,
        finalPtPoolRaw: session.finalized.series.finalPtPoolRaw,
        finalDrPoolRaw: session.finalized.series.finalDrPoolRaw,
      },
      redemptions,
      finalState: evidenceState(final),
      conservation: {
        initialTrackedCollateralRaw: session.initialTrackedCollateralRaw,
        finalTrackedCollateralRaw: final.aCollateralRaw + final.bCollateralRaw + final.vaultRaw,
        remainingProtocolObligationsRaw: final.requiredRaw,
        preservedDonationRaw: final.vaultRaw - final.requiredRaw,
      },
    });
  }

  const idlBytes = await readFile(resolve(repositoryRoot, 'packages/transaction-sdk/idl/dividendx.json'));
  const elfBytes = await readFile(resolve(repositoryRoot, 'target/deploy/dividendx.so'));
  evidence.artifacts = {
    idlSha256: createHash('sha256').update(idlBytes).digest('hex'),
    elfSha256: createHash('sha256').update(elfBytes).digest('hex'),
  };
  evidence.assertions = {
    actualLocalRpcExecution: true,
    publicNetwork: false,
    freshInMemorySigners: true,
    exactRawUnits: true,
    allThreeDecimalProfiles: [6, 8, 9],
    transfersAreNotSales: true,
    fourQualifiedEventsPerAsset: true,
    maturityDoesNotFinalize: true,
    independentWalletRedemptions: true,
    externalBurnAndDonationDoNotDrainCustody: true,
  };

  const endingManifest = (await loadManifest()).manifest;
  assert.equal(endingManifest.runtimeId, manifest.runtimeId, 'runtime restarted during acceptance execution');
  assert.equal(endingManifest.genesisHash, manifest.genesisHash, 'runtime genesis changed during acceptance execution');
  assert.equal(await connection.getGenesisHash(), manifest.genesisHash, 'RPC genesis changed during acceptance execution');

  await mkdir(dirname(evidencePath), { recursive: true });
  const temporaryPath = `${evidencePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(evidence, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)}\n`, { mode: 0o644 });
  await rename(temporaryPath, evidencePath);
  process.stdout.write(`${JSON.stringify({ ok: true, evidencePath, runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash, assets: evidence.assets.map((asset) => asset.assetId) })}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, stage: 'wallet-runtime-smoke', error: errorText(error), runtimeUrl: RUNTIME_URL })}\n`);
  process.exitCode = 1;
}
