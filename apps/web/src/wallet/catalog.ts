import catalog from '../../../../packages/demo-fixtures/catalog.json';
import type { LocalAssetManifest } from './types';

const ISSUERS: Record<string, string> = { xstocks: 'xStocks', backpack: 'Backpack/Trek', ondo: 'Ondo' };
const DEPLOYED_PROFILES: Record<string, string> = {
  'xstocks:KOx': 'xstocks-test-kox',
  'xstocks:AAPLx': 'xstocks-test-aapl',
  'xstocks:MSFTx': 'xstocks-test-msft',
  'xstocks:MUx': 'xstocks-test-mu',
  'xstocks:NKEx': 'xstocks-test-nke',
  'xstocks:IBMx': 'xstocks-test-ibm',
  'backpack:MU.US': 'backpack-test-mu',
  'backpack:NKE.US': 'backpack-test-nke',
  'backpack:IBM.US': 'backpack-test-ibm',
  'ondo:KOon': 'ondo-test-ko',
  'ondo:AAPLon': 'ondo-test-aapl',
  'ondo:MSFTon': 'ondo-test-msft',
  'ondo:MUon': 'ondo-test-mu',
  'ondo:NKEon': 'ondo-test-nke',
  'ondo:IBMon': 'ondo-test-ibm',
};

/** Catalog metadata never supplies transaction addresses; only the verified manifest can do that. */
export function walletMarketCatalog(assets: readonly LocalAssetManifest[]) {
  const entries = catalog.map((candidate) => ({
    id: candidate.id,
    company: candidate.company,
    symbol: candidate.symbol,
    issuer: ISSUERS[candidate.issuerId] ?? candidate.issuerId,
    availableAsset: assets.find((asset) => asset.id === DEPLOYED_PROFILES[`${candidate.issuerId}:${candidate.symbol}`]),
  }));
  // Preserve visibility of any independently verified runtime profiles outside this frozen directory.
  for (const asset of assets) {
    if (!entries.some((entry) => entry.availableAsset?.id === asset.id)) {
      entries.push({ id: asset.id, company: asset.company, symbol: asset.symbol,
        issuer: asset.issuerLabel, availableAsset: asset });
    }
  }
  return entries;
}
