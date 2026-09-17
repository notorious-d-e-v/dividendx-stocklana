import type { IssuerId, SelectedAsset } from "./types.js";
import { fail } from "./schema.js";

export const SELECTED_ASSETS: readonly SelectedAsset[] = Object.freeze([
  ["xstocks", "KOx", "KO", "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ", 8],
  ["xstocks", "AAPLx", "AAPL", "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", 8],
  ["xstocks", "MSFTx", "MSFT", "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", 8],
  ["xstocks", "MUx", "MU", "XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav", 8],
  ["xstocks", "NKEx", "NKE", "XsGYpMvKbVt6ViHqRd7cF3s746dAMFBQWcC49hB9VVP", 8],
  ["xstocks", "IBMx", "IBM", "XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr", 8],
  ["backpack", "MU.US", "MU", "MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1", 6],
  ["backpack", "NKE.US", "NKE", "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg", 6],
  ["backpack", "IBM.US", "IBM", "BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk", 6],
  ["ondo", "KOon", "KO", "e6G4pfFcrdKxJuZ4YXixRFfMbpMvgXG2Mjcus71ondo", 9],
  ["ondo", "AAPLon", "AAPL", "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo", 9],
  ["ondo", "MSFTon", "MSFT", "FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo", 9],
  ["ondo", "MUon", "MU", "Fz9edBpaURPPzpKVRR1A8PENYDEgHqwx5D5th28ondo", 9],
  ["ondo", "NKEon", "NKE", "g646pcdG2Rt5DH9WZzL7VVnVDWCCMTTrnktwE74ondo", 9],
  ["ondo", "IBMon", "IBM", "C8bZkgSxXkyT1RgxByp2teJ24hgimPLoyEYoNa9ondo", 9],
].map(([issuerId, symbol, underlying, mint, decimals]) => Object.freeze({
  issuerId: issuerId as IssuerId,
  symbol: symbol as string,
  underlying: underlying as string,
  mint: mint as string,
  decimals: decimals as number,
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  chain: "solana:mainnet-beta" as const,
})));

export function selectAssets(filters: { issuers?: IssuerId[]; symbols?: string[] } = {}): SelectedAsset[] {
  const issuers = filters.issuers ? new Set(filters.issuers) : null;
  const symbols = filters.symbols ? new Set(filters.symbols) : null;
  const selected = SELECTED_ASSETS.filter((asset) =>
    (!issuers || issuers.has(asset.issuerId)) && (!symbols || symbols.has(asset.symbol)));
  if (symbols) {
    for (const symbol of symbols) {
      if (!SELECTED_ASSETS.some((asset) => asset.symbol === symbol)) fail("unknown_selected_symbol");
    }
  }
  if (selected.length === 0) fail("empty_selection");
  return selected.map((asset) => ({ ...asset }));
}
