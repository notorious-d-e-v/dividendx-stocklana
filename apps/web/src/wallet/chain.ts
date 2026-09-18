import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  unpackMint,
} from '@solana/spl-token';
import { Connection, PublicKey, type Transaction, type TransactionInstruction } from '@solana/web3.js';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  DividendXInstructions,
  annualSeriesAddresses,
  buildRecentUnsignedTransaction,
  decodeProgramAccount,
  deriveEligibility,
  fetchQuoteSnapshot,
  quoteDeposit,
  quoteRecombine,
  quoteRedemption,
  signSubmitAndConfirm,
  type ConfirmedTransactionReceipt,
} from '@dividendx/transaction-sdk';
import type { WalletAccount } from '@wallet-standard/base';
import type { ConnectedWallet, LocalAssetManifest, LocalManifest, LocalSeriesManifest, WalletSeriesSnapshot } from './types';
import { bytesFromHex, RUNTIME_CONFIG, RuntimeRequestError, type RuntimeConfig, verifyRuntimeIdentity } from './runtime';
import { signLegacyTransaction } from './wallet-standard';

const builders = new DividendXInstructions(DIVIDENDX_IDL);

function key(value: string, label: string): PublicKey {
  try { return new PublicKey(value); } catch { throw new Error(`${label} is not a valid Solana address.`); }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function validateWalletSignedTransaction(unsigned: Transaction, signed: Transaction): Transaction {
  const expectedMessage = unsigned.serializeMessage();
  const signedMessage = signed.serializeMessage();
  if (!sameBytes(signedMessage, expectedMessage)) throw new Error('Wallet changed the transaction message. Nothing was submitted.');
  signed.lastValidBlockHeight = unsigned.lastValidBlockHeight;
  return signed;
}

function assertDerived(manifest: LocalManifest, asset: LocalAssetManifest, series: LocalSeriesManifest) {
  const issuerId = bytesFromHex(asset.issuerIdHex, 'Issuer ID');
  const mint = key(asset.collateralMint, 'Collateral mint');
  const derived = annualSeriesAddresses(issuerId, mint, series.year);
  const expected = {
    assetPolicy: asset.assetPolicy,
    series: series.address,
    accumulator: series.accumulator,
    ptMint: series.ptMint,
    drMint: series.drMint,
    vault: series.vault,
  };
  for (const [name, address] of Object.entries(expected)) {
    if (derived[name as keyof typeof derived].toBase58() !== address) throw new Error(`${name} does not match the address derived from issuer, mint and year.`);
  }
  if (manifest.programId !== DIVIDENDX_PROGRAM_ID.toBase58()) throw new Error('Manifest program ID mismatch.');
  return { issuerId, mint, derived };
}

function publicKeyField(value: unknown, label: string): PublicKey {
  if (!(value instanceof PublicKey)) throw new Error(`Policy ${label} is malformed.`);
  return value;
}

export async function fetchWalletSeries(
  connection: Connection,
  manifest: LocalManifest,
  asset: LocalAssetManifest,
  seriesManifest: LocalSeriesManifest,
  owner?: PublicKey,
): Promise<WalletSeriesSnapshot> {
  const { issuerId, mint, derived } = assertDerived(manifest, asset, seriesManifest);
  const holders = owner ? {
    collateral: getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID),
    pt: getAssociatedTokenAddressSync(derived.ptMint, owner),
    dr: getAssociatedTokenAddressSync(derived.drMint, owner),
  } : undefined;
  const addresses = [derived.assetPolicy, derived.ptMint, derived.drMint, ...(holders ? [holders.collateral, holders.pt, holders.dr] : [])];
  const inspected = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment: 'confirmed' });
  const [policyInfo, ptMintInfo, drMintInfo, collateralInfo, ptInfo, drInfo] = inspected.value;
  if (!policyInfo || !ptMintInfo || !drMintInfo) throw new Error('Required policy or claim mint account is missing.');
  if (!policyInfo.owner.equals(DIVIDENDX_PROGRAM_ID)) throw new Error('Asset policy owner mismatch.');
  if (!ptMintInfo.owner.equals(TOKEN_PROGRAM_ID) || !drMintInfo.owner.equals(TOKEN_PROGRAM_ID)) throw new Error('Claim mint owner mismatch.');
  const rawPolicy = decodeProgramAccount(DIVIDENDX_IDL, 'assetPolicy', policyInfo.data);
  if (!publicKeyField(rawPolicy.config, 'config').equals(derived.config)) throw new Error('Asset policy config relationship mismatch.');
  if (!publicKeyField(rawPolicy.collateralMint, 'collateral mint').equals(mint)) throw new Error('Asset policy collateral relationship mismatch.');
  if (!sameBytes(Uint8Array.from(rawPolicy.issuerId as ArrayLike<number>), issuerId)) throw new Error('Asset policy issuer identity mismatch.');
  if (rawPolicy.symbol !== asset.symbol || rawPolicy.decimals !== asset.decimals) throw new Error('Manifest symbol or decimals do not match the registered asset policy.');
  const ptMint = unpackMint(derived.ptMint, ptMintInfo, TOKEN_PROGRAM_ID);
  const drMint = unpackMint(derived.drMint, drMintInfo, TOKEN_PROGRAM_ID);
  if (ptMint.decimals !== asset.decimals || drMint.decimals !== asset.decimals) throw new Error('Claim mint decimals do not match the asset policy.');
  const exists = (info: typeof collateralInfo) => Boolean(info);
  const quote = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL, {
    assetPolicy: derived.assetPolicy,
    series: derived.series,
    accumulator: derived.accumulator,
    collateralMint: mint,
    vault: derived.vault,
    holder: owner,
    holderCollateral: holders && exists(collateralInfo) ? holders.collateral : undefined,
    holderPt: holders && exists(ptInfo) ? holders.pt : undefined,
    holderDr: holders && exists(drInfo) ? holders.dr : undefined,
  });
  if (!quote.series.ptMint.equals(derived.ptMint) || !quote.series.drMint.equals(derived.drMint) || quote.series.year !== seriesManifest.year) throw new Error('Series claim mint or year relationship mismatch.');
  return {
    quote,
    eligibility: deriveEligibility(quote.series, quote.policy, quote.vaultRaw, quote.clock),
    holderAddresses: holders,
    collateralRaw: quote.holderCollateralRaw ?? 0n,
    ptRaw: quote.holderPtRaw ?? 0n,
    drRaw: quote.holderDrRaw ?? 0n,
  };
}

type Action = 'deposit' | 'recombine' | 'redeem-pt' | 'redeem-dr' | 'transfer-pt' | 'transfer-dr';

export interface HolderActionRequest {
  action: Action;
  manifest: LocalManifest;
  asset: LocalAssetManifest;
  series: LocalSeriesManifest;
  connected: ConnectedWallet;
  amountRaw: bigint;
  allowZero?: boolean;
  recipient?: PublicKey;
  isCurrent: () => boolean;
  runtimeConfig?: RuntimeConfig;
  signal?: AbortSignal;
}

const HTTP_CONFIRM_TIMEOUT_MS = 30_000;

function confirmationDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', aborted); resolve(); }
    function aborted() { globalThis.clearTimeout(timer); reject(signal?.reason); }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

export async function submitAndConfirmOverHttp(
  connection: Connection,
  transaction: Transaction,
  isCurrent: () => boolean,
  timeoutMs = HTTP_CONFIRM_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<ConfirmedTransactionReceipt> {
  if (!transaction.recentBlockhash || transaction.lastValidBlockHeight === undefined) throw new Error('Transaction needs a recent blockhash and last-valid block height.');
  if (signal?.aborted) throw signal.reason;
  if (!isCurrent()) throw new Error('Wallet or sandbox session changed before submission. The signed transaction was discarded.');
  const signature = await connection.sendRawTransaction(transaction.serialize());
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw signal.reason;
    if (!isCurrent()) throw new Error('Wallet or sandbox session changed while confirming the transaction.');
    const [statusResult, blockHeight] = await Promise.all([
      connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
      connection.getBlockHeight('confirmed'),
    ]);
    const status = statusResult.value[0];
    if (status?.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
      return { signature, slot: status.slot, confirmationStatus: status.confirmationStatus, err: null };
    }
    if (blockHeight > transaction.lastValidBlockHeight) throw new Error(`Transaction ${signature} expired before confirmation.`);
    await confirmationDelay(400, signal);
  }
  throw new Error(`Transaction ${signature} was not confirmed before the HTTP confirmation deadline.`);
}

export async function executeHolderAction(request: HolderActionRequest): Promise<ConfirmedTransactionReceipt> {
  const runtimeConfig = request.runtimeConfig ?? RUNTIME_CONFIG;
  const connection = await verifyRuntimeIdentity(request.manifest, runtimeConfig);
  if (!request.isCurrent()) throw new Error('Wallet or annual series changed while preparing the transaction.');
  const holder = new PublicKey(request.connected.account.publicKey);
  const current = await fetchWalletSeries(connection, request.manifest, request.asset, request.series, holder);
  if (!request.isCurrent()) throw new Error('Wallet or annual series changed while refreshing the quote.');
  const { quote, holderAddresses } = current;
  if (!holderAddresses) throw new Error('Holder token accounts could not be derived.');
  const expires = quote.clock.unixTimestamp + 60n;
  const common = {
    holder,
    assetPolicy: quote.policy.address,
    series: quote.series.address,
    collateralMint: quote.series.collateralMint,
    vault: quote.series.vault,
    holderCollateral: holderAddresses.collateral,
    ptMint: quote.series.ptMint,
    drMint: quote.series.drMint,
    holderPt: holderAddresses.pt,
    holderDr: holderAddresses.dr,
    tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
  };
  const instructions: TransactionInstruction[] = [];
  if (request.action === 'deposit') {
    const quoted = quoteDeposit(quote.series, quote.policy, quote.vaultRaw, request.amountRaw, current.collateralRaw, quote.clock, expires, request.amountRaw);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(holder, holderAddresses.pt, holder, quote.series.ptMint),
      createAssociatedTokenAccountIdempotentInstruction(holder, holderAddresses.dr, holder, quote.series.drMint),
      builders.holder.deposit(common, request.amountRaw, quoted.guard),
    );
  } else if (request.action === 'recombine') {
    const quoted = quoteRecombine(quote.series, quote.vaultRaw, request.amountRaw, current.ptRaw, current.drRaw, quote.clock.unixTimestamp, expires, request.amountRaw);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(holder, holderAddresses.collateral, holder, quote.series.collateralMint, TOKEN_2022_PROGRAM_ID),
      builders.holder.recombine(common, request.amountRaw, quoted.guard),
    );
  } else if (request.action === 'redeem-pt' || request.action === 'redeem-dr') {
    const side = request.action === 'redeem-pt' ? 'pt' : 'dr';
    const owned = side === 'pt' ? current.ptRaw : current.drRaw;
    const quoted = quoteRedemption(quote.series, quote.vaultRaw, side, request.amountRaw, owned, Boolean(request.allowZero), quote.clock.unixTimestamp, expires);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(holder, holderAddresses.collateral, holder, quote.series.collateralMint, TOKEN_2022_PROGRAM_ID),
      builders.holder.redeem({
        holder,
        assetPolicy: quote.policy.address,
        series: quote.series.address,
        collateralMint: quote.series.collateralMint,
        vault: quote.series.vault,
        holderCollateral: holderAddresses.collateral,
        claimMint: side === 'pt' ? quote.series.ptMint : quote.series.drMint,
        holderClaim: side === 'pt' ? holderAddresses.pt : holderAddresses.dr,
        tokenProgram: TOKEN_PROGRAM_ID,
        collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
      }, side, request.amountRaw, quoted.allowZero, quoted.guard),
    );
  } else {
    const side = request.action === 'transfer-pt' ? 'pt' : 'dr';
    const balance = side === 'pt' ? current.ptRaw : current.drRaw;
    if (request.amountRaw > balance) throw new Error(`Transfer exceeds the current ${side.toUpperCase()} balance.`);
    if (!request.recipient || request.recipient.equals(holder)) throw new Error('Enter a different valid recipient wallet.');
    const mintAddress = side === 'pt' ? quote.series.ptMint : quote.series.drMint;
    const source = side === 'pt' ? holderAddresses.pt : holderAddresses.dr;
    const destination = getAssociatedTokenAddressSync(mintAddress, request.recipient);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(holder, destination, request.recipient, mintAddress),
      createTransferCheckedInstruction(source, mintAddress, destination, holder, request.amountRaw, request.asset.decimals),
    );
  }
  const unsigned = await buildRecentUnsignedTransaction(connection, holder, instructions);
  const sign = async (transaction: Transaction) => {
    if (!request.isCurrent()) throw new Error('Wallet or annual series changed before the wallet prompt.');
    const signed = validateWalletSignedTransaction(transaction,
      await signLegacyTransaction(request.connected.wallet, request.connected.account, transaction, runtimeConfig.network === 'devnet' ? 'devnet' : 'local'));
    await verifyRuntimeIdentity(request.manifest, runtimeConfig);
    if (!request.isCurrent()) throw new Error('Wallet or annual series changed before submission. The signed transaction was discarded.');
    return signed;
  };
  if (runtimeConfig.network === 'sandbox') return submitAndConfirmOverHttp(connection, await sign(unsigned), request.isCurrent, HTTP_CONFIRM_TIMEOUT_MS, request.signal);
  return signSubmitAndConfirm(connection, unsigned, sign);
}

export async function confirmedRuntimeSignatures(connection: Connection, signatures: readonly string[]): Promise<ConfirmedTransactionReceipt[]> {
  const statuses = (await connection.getSignatureStatuses([...signatures], { searchTransactionHistory: true })).value;
  return signatures.map((signature, index) => {
    const status = statuses[index];
    if (!status || (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized') || status.err) {
      throw new Error(`Runtime transaction ${signature} is not confirmed successfully.`);
    }
    return { signature, slot: status.slot, confirmationStatus: status.confirmationStatus, err: null };
  });
}

export async function waitForRuntimeSignatures(connection: Connection, signatures: readonly string[], timeoutMs = 30_000): Promise<ConfirmedTransactionReceipt[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statuses = (await connection.getSignatureStatuses([...signatures], { searchTransactionHistory: true })).value;
    const failed = statuses.find((status) => status?.err);
    if (failed?.err) throw new Error(`A recorded faucet transaction failed: ${JSON.stringify(failed.err)}`);
    if (statuses.every((status) => status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'))) {
      return signatures.map((signature, index) => ({
        signature,
        slot: statuses[index]!.slot,
        confirmationStatus: statuses[index]!.confirmationStatus!,
        err: null,
      }));
    }
    await confirmationDelay(750);
  }
  throw new RuntimeRequestError('The faucet transaction was recorded but is still pending. Refresh balances before requesting again; the same request is idempotent.', { signatures, pending: true });
}
