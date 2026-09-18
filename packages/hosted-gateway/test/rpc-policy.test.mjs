import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRpcEnvelope } from '../src/rpc-policy.mjs';

const ADDRESS = '2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE';
const SIGNATURE = '3'.repeat(88);
const tx = Buffer.alloc(1_232).toString('base64');
const request = (method, params = []) => ({ jsonrpc: '2.0', id: 1, method, params });

test('all documented RPC methods accept their bounded canonical forms', () => {
  const requests = [
    request('getGenesisHash'), request('getAccountInfo', [ADDRESS, { encoding: 'base64', commitment: 'confirmed' }]),
    request('getMultipleAccounts', [[ADDRESS], { encoding: 'base64' }]), request('getLatestBlockhash', [{ commitment: 'confirmed' }]),
    request('getSignatureStatuses', [[SIGNATURE], { searchTransactionHistory: true }]), request('getBlockHeight'),
    request('getBalance', [ADDRESS]), request('getMinimumBalanceForRentExemption', [165]), request('getFeeForMessage', [Buffer.from('message').toString('base64')]),
    request('sendTransaction', [tx, { encoding: 'base64', skipPreflight: false }]),
    request('simulateTransaction', [tx, { encoding: 'base64', accounts: { encoding: 'base64', addresses: [ADDRESS] } }]),
    request('getSlot'), request('getVersion'),
  ];
  for (const item of requests) assert.equal(validateRpcEnvelope(item), item);
});

test('unknown envelope and nested config keys are rejected', () => {
  assert.throws(() => validateRpcEnvelope({ ...request('getVersion'), extra: true }), /unsupported field/);
  assert.throws(() => validateRpcEnvelope(request('getBalance', [ADDRESS, { commitment: 'confirmed', url: 'https://attacker.invalid' }])), /unsupported field/);
  assert.throws(() => validateRpcEnvelope(request('simulateTransaction', [Buffer.from('x').toString('base64'), { encoding: 'base64', accounts: { encoding: 'base64', addresses: [], extra: true } }])), /unsupported field/);
});
