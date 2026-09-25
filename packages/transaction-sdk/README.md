# DivX annual transaction SDK

This isolated TypeScript package builds and submits transactions for the annual DivX Solana program. It does not replace `packages/sdk`, which remains the rehearsal reference model.

The default program is `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`. RPC examples use `http://127.0.0.1:8899`; the SDK never selects mainnet implicitly. A different deployment must supply its program ID explicitly, use an IDL whose `address` matches it, and bind discovery to the cluster genesis hash plus the Config deployment domain.

## Guarantees

- Raw token quantities, u64 account fields and quote guards stay as `bigint`.
- ScaledUiAmount current and pending binary64 values are converted back to their exact u64 bit patterns and selected with the chain Clock, including timestamp equality.
- Annual retention uses exact bigint rationals derived from binary64 bits, capped at 64 events and 1,024 bytes per numerator/denominator.
- Issuer and event source identifiers use SHA-256 over a tagged, length-delimited NFC UTF-8 preimage containing an explicit cluster/genesis domain.
- Program accounts can be fetched in one RPC context and decoded through the generated Anchor IDL without converting u64 values to JavaScript `number`.
- Quotes include the expected state version, expiry and minimum raw output. A zero-output redemption also needs `allowZero: true`. Journal resolution and attestor-provided coverage are reported separately; the latter is a trusted attestation, not independent proof of completeness.
- Transaction helpers return only RPC-confirmed signatures and slots. Callers supply the wallet callback or signers; the SDK has no embedded key.

Administrative, attestor, holder and permissionless instructions are exposed separately through `DividendXInstructions`. Every account map is resolved against the generated IDL, which fixes signer/writable order and instruction bytes.

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DEFAULT_RPC_ENDPOINT,
  DIVIDENDX_IDL,
  DividendXInstructions,
  buildRecentUnsignedTransaction,
  signSubmitAndConfirm,
} from '@dividendx/transaction-sdk';

const connection = new Connection(DEFAULT_RPC_ENDPOINT, 'confirmed');
const owner = new PublicKey('...');
const builders = new DividendXInstructions(DIVIDENDX_IDL);
const instruction = builders.holder.deposit(accounts, 1_000_000n, {
  expectedStateVersion: 4n,
  expiryUnixTimestamp: 1_800_000_000n,
  minimumRawOutput: 1_000_000n,
});
const transaction = await buildRecentUnsignedTransaction(connection, owner, [instruction]);
const receipt = await signSubmitAndConfirm(connection, transaction, wallet.signTransaction);
```

The generated IDL is copied byte-for-byte from `programs/dividendx/idl/dividendx.json`; do not hand-edit it. After regenerating the program IDL, sync the copy, regenerate vectors, and verify the hashes match:

```sh
npm --prefix packages/transaction-sdk run vectors
shasum -a 256 programs/dividendx/idl/dividendx.json packages/transaction-sdk/idl/dividendx.json
```

Install and test with:

```sh
npm --prefix packages/transaction-sdk ci
npm --prefix packages/transaction-sdk test
```

The test suite distinguishes decimal display ratios from canonical binary64 ratios, checks year/issuer/mint PDA isolation, exercises guard and zero-output cases, and verifies every instruction byte/account vector against the copied generated IDL. Runtime conformance uses the compiled SBF program in `tests/protocol`; arithmetic-only tests are not evidence of onchain execution.

`npm --prefix packages/transaction-sdk run smoke:local` starts a disposable localhost validator, loads `target/deploy/dividendx.so` under the declared upgradeable program ID, and uses fresh in-memory signers. It executes real Token and Token-2022 CPIs for deposit and recombination. It then proves transaction rollback by running a valid recombination before a deliberately failing top-level System transfer and comparing Series, custody, holder, claim, and mint-supply state. The non-secret local-only receipt and runtime logs are written to `smoke/results/local-validator-receipt.json`.
