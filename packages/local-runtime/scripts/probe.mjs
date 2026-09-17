import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surfnet } from '@solana/surfpool';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  DividendXInstructions,
  buildRecentUnsignedTransaction,
  configPda,
  fetchClock,
  programDataAddress,
  signWithSignersSubmitAndConfirm,
} from '@dividendx/transaction-sdk';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const require = createRequire(resolve(repositoryRoot, 'package.json'));
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const loader = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

async function rpc(url, method, params = []) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const surfnet = Surfnet.startWithConfig({ offline: true, blockProductionMode: 'transaction' });
const eventDrain = setInterval(() => surfnet.drainEvents(), 50);
eventDrain.unref();
let connection;
try {
  if (process.env.DIVIDENDX_PROBE_FORCE_FAILURE === '1') throw new Error('forced probe failure');
  const elf = await readFile(resolve(repositoryRoot, 'target/deploy/dividendx.so'));
  const admin = Keypair.generate();
  const missingSigner = Keypair.generate();
  surfnet.deploy({ programId: DIVIDENDX_PROGRAM_ID.toBase58(), soBytes: elf });
  await rpc(surfnet.rpcUrl, 'surfnet_setProgramAuthority', [DIVIDENDX_PROGRAM_ID.toBase58(), admin.publicKey.toBase58()]);
  surfnet.fundSol(admin.publicKey.toBase58(), 5_000_000_000);
  connection = new Connection(surfnet.rpcUrl, {
    commitment: 'confirmed',
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  });
  const [token, token2022, associatedToken] = await Promise.all([
    connection.getAccountInfo(TOKEN_PROGRAM_ID, 'confirmed'),
    connection.getAccountInfo(TOKEN_2022_PROGRAM_ID, 'confirmed'),
    connection.getAccountInfo(ASSOCIATED_TOKEN_PROGRAM_ID, 'confirmed'),
  ]);
  assert(token?.executable && token2022?.executable && associatedToken?.executable);
  const data = await connection.getAccountInfo(programDataAddress(), 'confirmed');
  assert(data?.owner.equals(loader));
  assert.equal(new PublicKey(data.data.subarray(13, 45)).toBase58(), admin.publicKey.toBase58());
  const builders = new DividendXInstructions(DIVIDENDX_IDL);
  const initialize = builders.admin.initializeConfig({ config: configPda().address, program: DIVIDENDX_PROGRAM_ID, programData: programDataAddress(), upgradeAuthority: admin.publicKey, systemProgram: SystemProgram.programId }, new Uint8Array(randomBytes(32)));
  const signed = await buildRecentUnsignedTransaction(connection, admin.publicKey, [initialize]);
  const receipt = await signWithSignersSubmitAndConfirm(connection, signed, [admin]);
  const balanceBefore = await connection.getBalance(admin.publicKey, 'confirmed');
  const invalid = await buildRecentUnsignedTransaction(connection, admin.publicKey, [SystemProgram.transfer({ fromPubkey: missingSigner.publicKey, toPubkey: admin.publicKey, lamports: 1 })]);
  invalid.partialSign(admin);
  let missingSignatureRejected = false;
  try {
    await connection.sendRawTransaction(invalid.serialize({ requireAllSignatures: false, verifySignatures: false }), { skipPreflight: true });
  } catch (error) {
    missingSignatureRejected = /signature|verify/i.test(String(error));
  }
  assert(missingSignatureRejected);
  assert.equal(await connection.getBalance(admin.publicKey, 'confirmed'), balanceBefore);
  const before = await fetchClock(connection);
  surfnet.timeTravelToTimestamp(Number((before.unixTimestamp + 86_400n) * 1_000n));
  const after = await fetchClock(connection);
  assert.equal(after.unixTimestamp, before.unixTimestamp + 86_400n);
  assert(await connection.getAccountInfo(configPda().address, 'confirmed'));
  for (let index = 0; index < 300; index += 1) {
    assert(await connection.getAccountInfo(configPda().address, 'confirmed'));
  }
  await new Promise((resolveIdle) => setTimeout(resolveIdle, 250));
  assert(await connection.getAccountInfo(configPda().address, 'confirmed'));
  console.log(JSON.stringify({ surfpool: '1.5.0', offline: true, initializeSignature: receipt.signature, missingSignatureRejected, clockBefore: before.unixTimestamp.toString(), clockAfter: after.unixTimestamp.toString(), configRetained: true, stateReadsBeforeIdle: 300, idleFollowupRead: true }, null, 2));
} finally {
  clearInterval(eventDrain);
  connection?._rpcWebSocket?.removeAllListeners();
  connection?._rpcWebSocket?.close();
  surfnet.stop();
}
