use dividendx_protocol_tests::captured_mints::{execute_all, write_receipt_exclusive, ACCEPTED_ELF_SHA256};
use std::{env, path::Path};

#[test]
fn all_captured_issuer_mints_execute_offline_custody_lifecycle() {
    let receipt = execute_all();
    assert_eq!(receipt.assets.len(), 15);
    assert_eq!(receipt.supported_assets, 15);
    assert_eq!(receipt.executed_assets, 15);
    assert_eq!(receipt.elf_sha256, ACCEPTED_ELF_SHA256);
    assert_eq!(receipt.environment, "mollusk_offline");
    assert!(receipt.synthetic_funding && receipt.synthetic_clock_and_events);
    assert_eq!(receipt.issuer_authority_signatures, 0);
    assert_eq!(receipt.mainnet_transactions, 0);
    assert!(!receipt.live_custody_tested && !receipt.settlement_ready);
    for asset in &receipt.assets {
        if asset.supported {
            assert!(asset.executed && asset.mint_bytes_unchanged);
            assert_eq!(asset.issuer_authority_signatures, 0);
            assert_eq!(asset.redemption_payouts_raw.len(), 4);
            assert!(asset.compute_units.create_series > 0);
            assert!(asset.compute_units.deposit > 0);
            assert!(asset.compute_units.recombine > 0);
            assert_eq!(asset.compute_units.upsert_events.len(), 4);
            assert!(asset.compute_units.upsert_events.iter().all(|value| *value > 0));
            assert_eq!(asset.compute_units.accumulate_events.len(), 4);
            assert!(asset.compute_units.accumulate_events.iter().all(|value| *value > 0));
            assert!(asset.compute_units.begin_finalization > 0);
            assert!(asset.compute_units.complete_finalization > 0);
            assert_eq!(asset.compute_units.redemptions.len(), 4);
            assert!(asset.compute_units.redemptions.iter().all(|value| *value > 0));
        } else {
            assert!(!asset.executed);
            assert!(asset.profile.unsupported_reason.is_some());
        }
    }
    if let Some(output) = env::var_os("DIVIDENDX_CUSTODY_RECEIPT_OUTPUT") {
        write_receipt_exclusive(&receipt, Path::new(&output));
    }
    eprintln!(
        "issuer_custody_conformance snapshot={} elf={} supported={} executed={} mainnet_transactions=0 live_custody_tested=false settlement_ready=false",
        receipt.input_snapshot_sha256, receipt.elf_sha256, receipt.supported_assets, receipt.executed_assets,
    );
}
