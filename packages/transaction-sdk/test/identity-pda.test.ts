import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';
import { hex } from '../src/bytes.js';
import { eventIdentityHash, issuerIdentityHash } from '../src/identity.js';
import {
  accumulatorPda,
  assetPolicyPda,
  configPda,
  deriveClaimNames,
  drMintPda,
  eventHeadPda,
  eventRevisionPda,
  ptMintPda,
  seriesPda,
  vaultAddress,
} from '../src/pdas.js';

const MINT = new PublicKey('So11111111111111111111111111111111111111112');

test('identity hashes bind kind, local domain and length-delimited NFC source ID', async () => {
  const issuer = await issuerIdentityHash('localnet:test-genesis', 'issuer:example');
  const event = await eventIdentityHash('localnet:test-genesis', 'issuer:example');
  assert.equal(issuer.length, 32);
  assert.equal(hex(issuer), 'a87659d78ced88659c6e667f6a191c352f7ebb373f181b8456cbfd645e9eed54');
  assert.notEqual(hex(issuer), hex(event));
  assert.notEqual(hex(issuer), hex(await issuerIdentityHash('devnet', 'issuer:example')));
  await assert.rejects(() => issuerIdentityHash('localnet', 'e\u0301'), /Unicode NFC/);
});

test('all canonical PDAs and Token-2022 vault derive deterministically', async () => {
  const issuerId = await issuerIdentityHash('localnet:test-genesis', 'issuer:example');
  const eventId = await eventIdentityHash('localnet:test-genesis', 'event:2027:first');
  const config = configPda();
  const asset = assetPolicyPda(issuerId, MINT);
  const series = seriesPda(asset.address, 2027);
  const pt = ptMintPda(series.address);
  const dr = drMintPda(series.address);
  const head = eventHeadPda(series.address, eventId);
  const revision = eventRevisionPda(head.address, 3n);
  const accumulator = accumulatorPda(series.address);
  const vault = vaultAddress(series.address, MINT);
  const values = [config, asset, series, pt, dr, head, revision, accumulator].map(({ address }) => address.toBase58());
  assert.equal(new Set(values).size, values.length);
  assert.equal(PublicKey.isOnCurve(vault.toBytes()), false);
  assert.deepEqual(deriveClaimNames('KOx', 2027), { pt: 'PT-KOx-2027', dr: 'DR-KOx-2027' });
});
