#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, unpackMint, unpackAccount } from '@solana/spl-token';
import { DIVIDENDX_IDL, annualSeriesAddresses, issuerIdentityHash, decodeProgramAccount, normalizeSeriesAccount } from '@dividendx/transaction-sdk';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
assert(args.get('--receipt') && args.get('--output'), 'Usage: --receipt FILE --output FILE');
const receipt = JSON.parse(await readFile(args.get('--receipt'), 'utf8'));
const id = receipt.identities;
const genesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const usdc = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const raydium = new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb');
const program = new PublicKey('2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE');
const authority = new PublicKey('CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq');
const requireAmm = createRequire(resolve('packages/amm-integration/package.json'));
const { CpmmPoolInfoLayout } = requireAmm('@raydium-io/raydium-sdk-v2');
async function boundedRpcFetch(input, init = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });
      if (response.status !== 429 || attempt === 3) return response;
      const header = response.headers.get('retry-after');
      const parsedDelay = header ? (/^\d+$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000) : NaN;
      const seconds = Number.isFinite(parsedDelay) ? parsedDelay : 5 * 2 ** attempt;
      if (seconds > 60) return response;
      await response.arrayBuffer();
      await new Promise(resolve => setTimeout(resolve, Math.max(seconds, 5) * 1000));
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)));
    }
  }
}
const connection = new Connection('https://api.devnet.solana.com', {
  commitment: 'finalized', disableRetryOnRateLimit: true,
  fetch: boundedRpcFetch,
});
assert.equal(await connection.getGenesisHash(), genesis);
assert.equal(receipt.boundary, 'public-devnet');
assert.equal(id.testQuoteMint, usdc.toBase58());
assert.equal(id.admin, 'DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv');
for (const [field, value] of Object.entries({ seedQuoteRaw: '4000000', addQuoteRaw: '6000000', buyerQuoteRaw: '1000000' })) {
  assert.equal(receipt.amounts[field], value, field);
}
assert(!receipt.transactions.some(({ name }) => /create_worthless_test_quote/.test(name)));
const signatures = receipt.transactions.map(({ signature }) => signature);
let statuses;
const deadline = Date.now() + 90_000;
do {
  statuses = (await connection.getSignatureStatuses(signatures, { searchTransactionHistory: true })).value;
  assert(statuses.every(s => s && s.err === null), 'Missing or failed transaction');
  if (statuses.every(s => s.confirmationStatus === 'finalized')) break;
  await new Promise(r => setTimeout(r, 2000));
} while (Date.now() < deadline);
assert(statuses.every(s => s.confirmationStatus === 'finalized'), 'Transactions not finalized');
const transactions = [];
for (let i = 0; i < signatures.length; i++) {
  if (i) await new Promise(resolve => setTimeout(resolve, 1500));
  const tx = await connection.getParsedTransaction(signatures[i], { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  assert(tx && tx.meta?.err === null);
  assert.equal(tx.slot, statuses[i].slot);
  assert.equal(tx.slot, receipt.transactions[i].slot);
  transactions.push(tx);
  process.stdout.write(`Verified finalized transaction ${i + 1}/${signatures.length}\n`);
}
function amount(balances, owner, mint) {
  return (balances ?? []).filter(b => b.owner === owner && b.mint === mint)
    .reduce((n, b) => n + BigInt(b.uiTokenAmount.amount), 0n);
}
function delta(tx, owner, mint) {
  return amount(tx.meta.postTokenBalances, owner, mint) - amount(tx.meta.preTokenBalances, owner, mint);
}
const quoteDelta = owner => transactions.reduce((n, tx) => n + delta(tx, owner, usdc.toBase58()), 0n);
assert.equal(quoteDelta(id.admin), -11_000_000n, 'Funding did not debit exactly 11 USDC');
const funding = transactions.filter(tx => delta(tx, id.admin, usdc.toBase58()) < 0n);
assert.equal(funding.reduce((n, tx) => n + delta(tx, id.provider, usdc.toBase58()), 0n), 10_000_000n);
assert.equal(funding.reduce((n, tx) => n + delta(tx, id.buyer, usdc.toBase58()), 0n), 1_000_000n);
for (const tx of funding) {
  assert(tx.transaction.message.accountKeys.some(k => k.signer && k.pubkey.toBase58() === id.admin));
  const transfers = tx.transaction.message.instructions.filter(ix => ix.programId.equals(TOKEN_PROGRAM_ID)
    && ix.parsed?.type === 'transferChecked' && ix.parsed.info.mint === usdc.toBase58());
  assert(transfers.length > 0, 'Funding lacks a checked USDC transfer');
}
const step = name => {
  const index = receipt.transactions.findIndex(t => t.name === name);
  assert(index >= 0, `Missing ${name}`);
  return transactions[index];
};
for (const name of ['create_cpmm_pool', 'add_cpmm_liquidity', 'buyer_swap_quote_for_dr', 'withdraw_all_provider_lp']) {
  assert(step(name).transaction.message.instructions.some(ix => ix.programId.equals(raydium)), `${name} did not execute Raydium`);
}
assert.equal(delta(step('create_cpmm_pool'), id.provider, usdc.toBase58()), -4_000_000n);
assert.equal(delta(step('add_cpmm_liquidity'), id.provider, usdc.toBase58()), -6_000_000n);
assert.equal(delta(step('buyer_swap_quote_for_dr'), id.buyer, usdc.toBase58()), -1_000_000n);
assert.equal(delta(step('buyer_swap_quote_for_dr'), id.buyer, id.drMint), BigInt(receipt.exactSwap.actualDrOutputRaw));
assert.equal(receipt.exactSwap.actualDrOutputRaw, receipt.exactSwap.quotedDrOutputRaw);
assert(BigInt(receipt.exactSwap.actualDrOutputRaw) >= BigInt(receipt.exactSwap.minimumDrOutputRaw));

const pk = text => new PublicKey(text);
const stock = pk(id.collateralMint);
const issuer = await issuerIdentityHash(`devnet:${genesis}`, 'dividendx-raydium-test-issuer');
const series = annualSeriesAddresses(issuer, stock, 2027);
assert.equal(series.ptMint.toBase58(), id.ptMint);
assert.equal(series.drMint.toBase58(), id.drMint);
const poolResponse = await connection.getAccountInfo(pk(id.pool), 'finalized');
assert(poolResponse?.owner.equals(raydium));
const pool = CpmmPoolInfoLayout.decode(poolResponse.data);
const drFirst = pool.mintA.toBase58() === id.drMint;
assert.equal((drFirst ? pool.mintB : pool.mintA).toBase58(), usdc.toBase58());
assert.equal(pool.configId.toBase58(), '5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
assert.equal(pool.mintLp.toBase58(), id.lpMint);
assert.equal(pool.lpAmount.toString(), '100');
const addresses = {
  stock, pt: pk(id.ptMint), dr: pk(id.drMint), usdc, lp: pk(id.lpMint), series: series.series, vault: series.vault,
  providerStock: getAssociatedTokenAddressSync(stock, pk(id.provider), false, TOKEN_2022_PROGRAM_ID),
  providerPt: getAssociatedTokenAddressSync(pk(id.ptMint), pk(id.provider)),
  providerDr: getAssociatedTokenAddressSync(pk(id.drMint), pk(id.provider)),
  providerUsdc: getAssociatedTokenAddressSync(usdc, pk(id.provider)),
  providerLp: getAssociatedTokenAddressSync(pk(id.lpMint), pk(id.provider)),
  buyerDr: getAssociatedTokenAddressSync(pk(id.drMint), pk(id.buyer)),
  buyerUsdc: getAssociatedTokenAddressSync(usdc, pk(id.buyer)),
  poolDr: pk((drFirst ? pool.vaultA : pool.vaultB).toBase58()),
  poolUsdc: pk((drFirst ? pool.vaultB : pool.vaultA).toBase58()),
};
const entries = Object.entries(addresses);
const result = await connection.getMultipleAccountsInfoAndContext(entries.map(([, p]) => p), { commitment: 'finalized' });
const data = Object.fromEntries(entries.map(([name], i) => [name, result.value[i]]));
assert(Object.values(data).every(Boolean), 'Required final account missing');
function balance(name, mint, owner, tokenProgram = TOKEN_PROGRAM_ID) {
  const account = unpackAccount(addresses[name], data[name], tokenProgram);
  assert(account.isInitialized && !account.isFrozen && account.mint.equals(mint) && account.owner.equals(owner), name);
  return account.amount;
}
const decoded = normalizeSeriesAccount(series.series, decodeProgramAccount(DIVIDENDX_IDL, 'series', data.series.data));
assert(data.series.owner.equals(program));
assert.equal(decoded.phase, 'open');
assert.equal(decoded.eventCount, 0);
const stockSupply = unpackMint(stock, data.stock, TOKEN_2022_PROGRAM_ID).supply;
const ptSupply = unpackMint(addresses.pt, data.pt).supply;
const drSupply = unpackMint(addresses.dr, data.dr).supply;
const usdcMint = unpackMint(usdc, data.usdc);
assert.equal(usdcMint.decimals, 6);
assert.equal(usdcMint.mintAuthority?.toBase58(), 'GrNg1XM2ctzeE2mXxXCfhcTUbejM8Z4z4wNVTy2FjMEz');
assert.equal(usdcMint.freezeAuthority?.toBase58(), 'CJtyoKSLrktozQzjERTiK3btQtiTK3nN4QrqGHLidyCT');
const final = {
  providerStock: balance('providerStock', stock, pk(id.provider), TOKEN_2022_PROGRAM_ID),
  vault: balance('vault', stock, series.series, TOKEN_2022_PROGRAM_ID),
  providerPt: balance('providerPt', addresses.pt, pk(id.provider)),
  providerDr: balance('providerDr', addresses.dr, pk(id.provider)),
  buyerDr: balance('buyerDr', addresses.dr, pk(id.buyer)),
  poolDr: balance('poolDr', addresses.dr, authority),
  providerUsdc: balance('providerUsdc', usdc, pk(id.provider)),
  buyerUsdc: balance('buyerUsdc', usdc, pk(id.buyer)),
  poolUsdc: balance('poolUsdc', usdc, authority),
  providerLp: balance('providerLp', addresses.lp, pk(id.provider)),
};
assert.equal(final.vault, ptSupply);
assert.equal(ptSupply, drSupply);
assert.equal(decoded.accountableRaw, final.vault);
assert.equal(final.providerStock + final.vault, stockSupply);
assert.equal(final.providerPt, ptSupply);
assert.equal(final.providerDr, 0n);
assert.equal(final.buyerDr + final.poolDr, drSupply);
assert.equal(final.providerUsdc + final.buyerUsdc + final.poolUsdc, 11_000_000n);
assert.equal(final.providerLp, 0n);
assert.equal(unpackMint(addresses.lp, data.lp).supply, 0n);
const checkpoint = receipt.checkpoints.recombined;
for (const [actual, expected] of [
  [final.vault, checkpoint.collateral.vault], [final.providerStock, checkpoint.collateral.provider],
  [final.providerPt, checkpoint.pt.provider], [final.buyerDr, checkpoint.dr.buyer], [final.poolDr, checkpoint.dr.poolVault],
  [final.providerUsdc, checkpoint.testQuote.provider], [final.buyerUsdc, checkpoint.testQuote.buyer],
  [final.poolUsdc, checkpoint.testQuote.poolVault],
]) assert.equal(actual.toString(), expected, 'Final RPC state differs from receipt');
const output = { ok: true, verifiedAt: new Date().toISOString(), cluster: 'devnet', commitment: 'finalized',
  slot: result.context.slot, mint: usdc.toBase58(), pool: id.pool, fundingDebitedRaw: '11000000', final,
  globalUsdcSupplyRaw: usdcMint.supply, checks: { checkedFundingTransfers: true, actualRaydiumTransactions: true,
    officialUsdcPool: true, controlledUsdcConservation: true, remainingClaimsBacked: true },
  signatures: signatures.map((signature, i) => ({ name: receipt.transactions[i].name, signature, slot: statuses[i].slot, status: 'finalized' })),
};
await writeFile(args.get('--output'), JSON.stringify(output, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
console.log(JSON.stringify({ ok: true, transactions: signatures.length, slot: output.slot, pool: id.pool }));
