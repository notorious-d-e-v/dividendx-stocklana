# Raydium CPMM execution notes

Checked 17 September 2026 for the annual-series AMM boundary in [claim-amm-feasibility.md](claim-amm-feasibility.md). This is a read-only implementation contract for one future-year DR/private-test-quote pool. It does not make the public chain mature early, value the quote as dollars, or establish mainnet readiness.

## Selected Devnet state

The finalized snapshot at slot `499748702` used Devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`:

| Role | Address | Verified state |
| --- | --- | --- |
| CPMM program | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` | Executable, Upgradeable Loader owner |
| ProgramData | `3KvTa2fYhMxMZNfHho5oX34yLQLwRauoU2JScBkugvXF` | Deploy slot `498629438`; dumped ELF is 742,640 bytes, SHA-256 `87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd` |
| `AmmConfig` index 0 | `5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy` | Program-owned, 236 bytes, `disableCreatePool=false` |
| Creation-fee receiver | `3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy` | Initialized classic SPL native-wSOL account; this exact hardcoded address is required |
| Vault/LP authority | `CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq` | PDA for seed `vault_and_lp_mint_auth_seed` |

The live config decoded as `tradeFeeRate=2500`, `protocolFeeRate=120000`, `fundFeeRate=40000`, `creatorFeeRate=2500`, `createPoolFee=150000000` lamports, and `protocolOwner=fundOwner=DRay33UmULQCeawH3dVpJfN3uqLj6Qtq4ymSRx2pAgGK`. The denominator is `1_000_000`. Thus the ordinary pool's trade fee is 0.25% of input, then 12% and 4% of that trade fee accrue to protocol and fund counters. `Initialize` sets `enable_creator_fee=false`, so the stored creator rate is inactive for this pool.

Decode this config again immediately before creation and quoting. Admin updates affect bound pools without migration. Reject a missing/wrong owner, wrong 236-byte layout, nonzero `disableCreatePool`, unexpected index, address mismatch, or creation fee above the run budget. The receiver is a native-wSOL token account but is not the token owner's associated token address; pass the published constant exactly.

The config PDA is `findProgramAddress(["amm_config", u16be(0)], programId)`. All mint amounts are raw integers. Sort token mints by public-key bytes before direct PDA derivation:

```text
pool       = PDA("pool", config, token0Mint, token1Mint)
lpMint     = PDA("pool_lp_mint", pool)
vault0/1   = PDA("pool_vault", pool, token0/1Mint)
observation= PDA("observation", pool)
```

Use the canonical pool PDA and fail if it already exists. Although the program accepts a signed random pool account, it is unnecessary for this proof and complicates discovery. Never infer which sorted side is DR; compare exact mint addresses on every add, swap, withdrawal, and reconciliation.

Primary references are Raydium's [program-address table](https://docs.raydium.io/reference/program-addresses), [CPMM instruction contract](https://docs.raydium.io/products/cpmm/instructions), [code demos](https://docs.raydium.io/products/cpmm/code-demos), and public [`raydium-cp-swap` source at `59fb845…`](https://github.com/raydium-io/raydium-cp-swap/tree/59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92). The deployed ELF digest was captured independently; reproducible source-to-binary equivalence was not established.

## Pinned SDK contract

Use exactly `@raydium-io/raydium-sdk-v2@0.2.64-alpha`. The inspected npm tarball has SHA-256 `d790e56ac6bb6d3af369b55fd35fcdb6d46c47eb1c2aff89caf35e0996d9c8e0` and npm SHA-1 `9c859e01219987981fc282d077ce7f7d0ad18b99`. Its Devnet program and fee constants match the live accounts. Its unqualified `CREATE_CPMM_POOL_PROGRAM` and `CREATE_CPMM_POOL_FEE_ACC` exports are **mainnet** constants; use `DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM` and `DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC` explicitly.

Initialize with `cluster: "devnet"`, `disableLoadToken: true`, and `disableFeatureCheck: true`. For a local clone, do not call `raydium.api.getCpmmConfigs()` or `raydium.token.getTokenInfo()`: both try remote HTTP. Decode the cloned config and mint accounts over RPC and construct these inputs locally:

```ts
createPool({
  programId, poolFeeAccount, mintA, mintB,
  mintAAmount: BN, mintBAmount: BN, startTime: BN,
  feeConfig, associatedOnly, ownerInfo, txVersion
})

getPoolInfoFromRpc(poolId: string)
// -> { poolInfo, poolKeys, rpcData, computePoolInfo }

addLiquidity({
  poolInfo, poolKeys?, inputAmount: BN, baseIn: boolean,
  slippage: Percent, txVersion
})

swap({
  poolInfo, poolKeys?, inputAmount: BN,
  swapResult: { inputAmount: BN, outputAmount: BN },
  baseIn: boolean, fixedOut?: boolean, slippage?: number, txVersion
})

withdrawLiquidity({
  poolInfo, poolKeys?, lpAmount: BN, slippage: Percent, txVersion
})
```

`mintA`/`mintB` need `{address, decimals, programId}`. `feeConfig` needs `{id,index,tradeFeeRate,protocolFeeRate,fundFeeRate,createPoolFee,creatorFeeRate}`. On Devnet, discover a created pool only through `getPoolInfoFromRpc(poolId)`; the public indexer is not an execution dependency.

Two pinned-SDK defects require explicit guards:

1. `computeSwapAmount` and the published demo pass the config's creator rate without checking `rpcData.enableCreatorFee`. For this ordinary pool, pass `BN_ZERO` as the creator rate to `CurveCalculator.swapBaseInput`/`swapBaseOutput` and assert `creatorFee=0`. The pinned SDK's creator-enabled input rounding also differs from the upgraded program's combined-fee/split calculation, so v1 must remain on ordinary creator-disabled `Initialize`.
2. The convenience projection converts LP supply and some reserve-derived values to JavaScript `number`. Use `rpcData` BN values for quotes and all accounting. The selected small test amounts are below `Number.MAX_SAFE_INTEGER`, but that is not a general protocol guarantee. The high-level `swap` also mutates the supplied `swapResult` when applying slippage; preserve an immutable pre-call quote for receipt comparison.

Use integer-basis-point slippage values, simulate each built transaction, and read raw pool/config/vault/mint accounts after confirmation. Re-read config just before the swap because fee parameters are mutable. The SDK's exported low-level reviewed fallbacks are `makeCreateCpmmPoolInInstruction`, `makeDepositCpmmInInstruction`, `makeSwapCpmmBaseInInstruction`, `makeSwapCpmmBaseOutInstruction`, and `makeWithdrawCpmmInInstruction`; the withdraw builder already supplies the now-required memo-program account.

The September 2026 program upgrade moved to Anchor 1.0.2/Solana 3.1.10, added `CollectExcessLamports`, replaced the old hardcoded Token-2022 whitelist with support-mint registry handling, and changed owner values written by newly created configs. The public user instruction arguments and account order remained stable. Current source `master` already contains the Anchor upgrade, despite an older sentence in the code-demo page that still calls out the former upgrade branch.

## Liquidity and residual accounting

For classic SPL DR and quote mints, initial internal LP supply is

```text
L0 = floor(sqrt(initialRawDR * initialRawQuote))
```

The program mints `L0 - 100` LP base units to the creator and records `pool_state.lp_supply=L0`. The 100-base-unit difference is permanently locked without an LP token account. Each later deposit increases both the mint supply and internal supply equally, preserving the difference of 100.

If one provider owns and burns every minted LP unit after all adds, internal supply falls to 100 while the LP mint supply falls to zero. With fee-excluded reserve `Ri` and pre-withdraw internal supply `L`, the provider receives `floor((L-100)*Ri/L)` and the pool retains `ceil(100*Ri/L)` before transfer-fee effects. Protocol/fund/creator counters are excluded from `Ri` and also remain in the actual vault. The pool and observation accounts never close. Therefore:

- assert `pool_state.lp_supply - lp_mint.supply == 100` before and after ordinary adds/withdrawals;
- reconcile actual vault balances, fee counters, and fee-excluded reserves separately;
- include every residual DR raw unit in outstanding DR backing; and
- never sweep the locked-liquidity residual as surplus.

For the planned quote-to-DR purchase, trade/protocol/fund fees accrue on the quote input, not DR. Still read both token fee counters rather than assuming a direction. Pool status is a bitmask: bit 0 disables deposit, bit 1 withdrawal, and bit 2 swaps. A new pool starts at zero, but check it before every operation. `startTime<=chainTime` is rewritten to `chainTime+1`; deposit/withdraw work immediately, while swaps must wait until open time.

## SOL budget

At the check, rent exemptions were 0.0038862 SOL for the 637-byte pool, 0.02135124 for the 4,075-byte observation account, 0.0010668 for the 82-byte LP mint, and 0.00148844 for each classic 165-byte token account. Pool creation adds two vaults and the creator LP account, for 0.03076956 SOL rent. With the current 0.15 SOL creation fee, the known CPMM minimum is **0.18076956 SOL**, before transaction fees, priority fees, participant accounts, token mints, or seeded assets. A 0.20 SOL CPMM-only ceiling is reasonable when all participant token accounts already exist; use 0.25 SOL when they may not.

The current DivX ELF is 706,504 bytes. A fresh default-length deployment retains about 3.59075228 SOL of program/program-data rent and temporarily needs another 3.58987852 SOL for the upload buffer, a peak of about **7.1806308 SOL plus deployment transaction fees** before the buffer refund. This explains the separate 8-test-SOL funding request, but mint, vault, series, and user-account costs remain outside that deployment estimate. Rent can change; query it again and enforce an explicit maximum before signing.

## Genuine local fallback

Faucet failure does not require a simulated AMM. On a fresh, separate ledger, Solana CLI 4.1.1 supports a genuine Devnet clone:

```sh
solana-test-validator --reset --url https://api.devnet.solana.com \
  --clone-feature-set \
  --clone-upgradeable-program DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb \
  --clone 5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy \
  --clone 3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy
```

`--clone-upgradeable-program` is essential: cloning only the executable program account omits its ProgramData. The config and hardcoded fee account are separate and must also be cloned. Start with a fresh ledger because clone flags are ignored when the ledger already exists.

If startup cloning is rate-limited, use the captured 742,640-byte ELF under the same program ID with `--bpf-program`, plus `--account` JSON dumps of the exact config and fee receiver. This preserves genuine captured executable bytes and relevant state but makes the local program immutable and does not reproduce Devnet deployment metadata. Record the source slot, the four identities above, and the ELF digest in the receipt. The local proof is integration with a captured deployment; it is not a public-network transaction or source-build equivalence proof.

The sanitized machine-readable snapshot is [raydium-config-preflight-2026-09-17.json](../evidence/raydium-config-preflight-2026-09-17.json).
