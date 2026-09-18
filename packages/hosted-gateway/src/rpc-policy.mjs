const COMMITMENTS = new Set(['processed', 'confirmed', 'finalized']);
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_ACCOUNT_LIST = 32;
const MAX_SIGNATURE_LIST = 32;

export class RpcPolicyError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function fail(message) { throw new RpcPolicyError(message); }
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} contains an unsupported field`);
}
function address(value, label = 'address') {
  if (typeof value !== 'string' || !ADDRESS.test(value)) fail(`${label} is invalid`);
}
function commitment(value) {
  if (value !== undefined && (typeof value !== 'string' || !COMMITMENTS.has(value))) fail('commitment is invalid');
}
function minContextSlot(value) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) fail('minContextSlot is invalid');
}
function config(value, allowed, label = 'config') {
  const item = record(value, label);
  exactKeys(item, allowed, label);
  commitment(item.commitment);
  minContextSlot(item.minContextSlot);
  return item;
}
function optionalConfig(params, allowed) {
  if (params.length === 2) config(params[1], allowed);
}
function base64(value, label, limit = MAX_TRANSACTION_BYTES) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(limit / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`${label} must be canonical base64`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length > limit || decoded.toString('base64') !== value) fail(`${label} is too large or malformed`);
}
function paramsArray(value) {
  if (!Array.isArray(value)) fail('params must be an array');
  return value;
}
function count(params, minimum, maximum = minimum) {
  if (params.length < minimum || params.length > maximum) fail('parameter count is invalid');
}

const ACCOUNT_CONFIG = new Set(['commitment', 'encoding', 'minContextSlot']);
const SIMPLE_CONFIG = new Set(['commitment', 'minContextSlot']);

function accountConfig(value) {
  const item = config(value, ACCOUNT_CONFIG);
  if (item.encoding !== undefined && item.encoding !== 'base64') fail('account encoding must be base64');
}

const validators = {
  getGenesisHash(params) {
    count(params, 0, 1);
    if (params.length) config(params[0], new Set(['commitment']));
  },
  getAccountInfo(params) {
    count(params, 1, 2); address(params[0]);
    if (params.length === 2) accountConfig(params[1]);
  },
  getMultipleAccounts(params) {
    count(params, 1, 2);
    if (!Array.isArray(params[0]) || params[0].length < 1 || params[0].length > MAX_ACCOUNT_LIST) fail('account list must contain 1 to 32 addresses');
    params[0].forEach((item) => address(item));
    if (params.length === 2) accountConfig(params[1]);
  },
  getLatestBlockhash(params) {
    count(params, 0, 1); if (params.length) config(params[0], SIMPLE_CONFIG);
  },
  getSignatureStatuses(params) {
    count(params, 1, 2);
    if (!Array.isArray(params[0]) || params[0].length < 1 || params[0].length > MAX_SIGNATURE_LIST) fail('signature list must contain 1 to 32 signatures');
    params[0].forEach((item) => { if (typeof item !== 'string' || !SIGNATURE.test(item)) fail('signature is invalid'); });
    if (params.length === 2) {
      const item = config(params[1], new Set(['searchTransactionHistory']));
      if (item.searchTransactionHistory !== undefined && typeof item.searchTransactionHistory !== 'boolean') fail('searchTransactionHistory is invalid');
    }
  },
  getBlockHeight(params) {
    count(params, 0, 1); if (params.length) config(params[0], SIMPLE_CONFIG);
  },
  getBalance(params) {
    count(params, 1, 2); address(params[0]); optionalConfig(params, SIMPLE_CONFIG);
  },
  getMinimumBalanceForRentExemption(params) {
    count(params, 1, 2);
    if (!Number.isSafeInteger(params[0]) || params[0] < 0 || params[0] > 1_048_576) fail('account size is invalid');
    optionalConfig(params, new Set(['commitment']));
  },
  getFeeForMessage(params) {
    count(params, 1, 2); base64(params[0], 'message'); optionalConfig(params, SIMPLE_CONFIG);
  },
  sendTransaction(params) {
    count(params, 1, 2); base64(params[0], 'transaction');
    if (params.length === 2) {
      const item = config(params[1], new Set(['encoding', 'skipPreflight', 'preflightCommitment', 'maxRetries', 'minContextSlot']));
      if (item.encoding !== undefined && item.encoding !== 'base64') fail('transaction encoding must be base64');
      if (item.skipPreflight !== undefined && typeof item.skipPreflight !== 'boolean') fail('skipPreflight is invalid');
      if (item.preflightCommitment !== undefined && !COMMITMENTS.has(item.preflightCommitment)) fail('preflightCommitment is invalid');
      if (item.maxRetries !== undefined && (!Number.isSafeInteger(item.maxRetries) || item.maxRetries < 0 || item.maxRetries > 5)) fail('maxRetries is invalid');
    }
  },
  simulateTransaction(params) {
    count(params, 1, 2); base64(params[0], 'transaction');
    if (params.length === 2) {
      const item = config(params[1], new Set(['encoding', 'sigVerify', 'replaceRecentBlockhash', 'commitment', 'minContextSlot', 'accounts', 'innerInstructions']));
      if (item.encoding !== undefined && item.encoding !== 'base64') fail('transaction encoding must be base64');
      if (item.sigVerify !== undefined && typeof item.sigVerify !== 'boolean') fail('sigVerify is invalid');
      if (item.replaceRecentBlockhash !== undefined && typeof item.replaceRecentBlockhash !== 'boolean') fail('replaceRecentBlockhash is invalid');
      if (item.sigVerify === true && item.replaceRecentBlockhash === true) fail('signature verification and blockhash replacement cannot both be enabled');
      if (item.innerInstructions !== undefined && typeof item.innerInstructions !== 'boolean') fail('innerInstructions is invalid');
      if (item.accounts !== undefined) {
        const accounts = record(item.accounts, 'accounts');
        exactKeys(accounts, new Set(['encoding', 'addresses']), 'accounts');
        if (accounts.encoding !== 'base64') fail('simulation account encoding must be base64');
        if (!Array.isArray(accounts.addresses) || accounts.addresses.length > MAX_ACCOUNT_LIST) fail('simulation account list is too large');
        accounts.addresses.forEach((entry) => address(entry));
      }
    }
  },
  getSlot(params) {
    count(params, 0, 1); if (params.length) config(params[0], SIMPLE_CONFIG);
  },
  getVersion(params) { count(params, 0); },
};

export function validateRpcEnvelope(value) {
  const envelope = record(value, 'JSON-RPC request');
  exactKeys(envelope, new Set(['jsonrpc', 'id', 'method', 'params']), 'JSON-RPC request');
  if (Object.keys(envelope).length !== 4 || envelope.jsonrpc !== '2.0') fail('JSON-RPC envelope is invalid');
  if (!(Number.isSafeInteger(envelope.id) || (typeof envelope.id === 'string' && envelope.id.length >= 1 && envelope.id.length <= 64))) fail('JSON-RPC id is invalid');
  if (typeof envelope.method !== 'string' || !Object.hasOwn(validators, envelope.method)) fail('JSON-RPC method is not allowed');
  const params = paramsArray(envelope.params);
  validators[envelope.method](params);
  return envelope;
}

export const RPC_LIMITS = Object.freeze({ maxTransactionBytes: MAX_TRANSACTION_BYTES, maxAccountList: MAX_ACCOUNT_LIST, maxSignatureList: MAX_SIGNATURE_LIST });
