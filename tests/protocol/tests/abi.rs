use dividendx_protocol_tests::{
    abi::{
        abort_finalization, accumulate_event, begin_finalization, complete_finalization, create_series,
        deposit, initialize_config, recombine, redeem, refresh_observation, register_asset,
        set_asset_admission, upsert_event, ClaimSide, EventInput, Guard,
    },
    harness::{anchor_discriminator, read_sdk_vectors, repo_root, PROGRAM_ID_TEXT},
};
use solana_pubkey::Pubkey;
use std::collections::HashMap;

#[test]
fn anchor_instruction_discriminators_are_frozen() {
    let cases = [
        ("initialize_config", "d07f1501c2bec446"),
        ("register_asset", "15509b9575cfeb10"),
        ("set_asset_admission", "74028c52927da62b"),
        ("refresh_observation", "f174f9d353d89a52"),
        ("create_series", "b5093478c5dd2a8e"),
        ("deposit", "f223c68952e1f2b6"),
        ("recombine", "e391001d4bb51402"),
        ("upsert_event", "304e86b18f03d519"),
        ("begin_finalization", "c052d7359d885768"),
        ("accumulate_event", "2de69121965d395e"),
        ("complete_finalization", "7be6d57aa152fc9d"),
        ("abort_finalization", "0fc1d3a83fe41d43"),
        ("redeem", "b80c569546c461e1"),
    ];
    for (name, expected) in cases {
        assert_eq!(hex::encode(anchor_discriminator("global", name)), expected);
    }
}

#[test]
fn generated_sdk_vectors_match_independent_borsh_for_all_instructions() {
    let vectors = read_sdk_vectors(&repo_root().join("tests/protocol/fixtures/sdk-instructions.json"));
    assert_eq!(vectors.len(), 13);
    let by_name: HashMap<_, _> = vectors.iter().map(|vector| (vector.name.as_str(), vector)).collect();
    let guard = Guard { expected_state_version: 9, expiry_unix_timestamp: 1_800_000_000, minimum_raw_output: 7 };
    let event = EventInput {
        event_id: [5; 32], revision: 1, ex_date: 20270701, status: 1,
        m0_bits: 1.0f64.to_bits(), m1_bits: 1.1f64.to_bits(), source_final: true,
        original_effective_timestamp: 1_800_000_000, payment_date: 20270715,
        observed_slot: 100, evidence_digest: [6; 32],
    };
    let attestor = Pubkey::from_str_const("xbD3QvU4b8zSEvBDnHStz97WM9ugyVgxM1mYCyHUi8b");
    let expected = [
        ("initialize_config", initialize_config([1; 32])),
        ("register_asset", register_asset([2; 32], "KOx".to_owned(), attestor.to_bytes(), [3; 32])),
        ("set_asset_admission", set_asset_admission(true)),
        ("refresh_observation", refresh_observation([4; 32], 1_800_003_600)),
        ("create_series", create_series(2027)),
        ("deposit", deposit(10, guard.clone())),
        ("recombine", recombine(10, guard.clone())),
        ("upsert_event", upsert_event(event)),
        ("begin_finalization", begin_finalization(1, [7; 32], [8; 32])),
        ("accumulate_event", accumulate_event()),
        ("complete_finalization", complete_finalization()),
        ("abort_finalization", abort_finalization([9; 32])),
        ("redeem", redeem(ClaimSide::Dr, 10, false, guard)),
    ];
    let expected_account_counts = [5, 5, 3, 3, 12, 12, 12, 6, 8, 5, 9, 4, 10];
    let expected_flags = [
        "wrrWr", "rWrwr", "rRw", "Rwr", "Wrwwwwrwrrrr", "Rrwrwwwwwwrr",
        "Rrwrwwwwwwrr", "Wrwwwr", "Rrwwrrrr", "Rwwrr", "Rrwrrrwwr", "Rrww",
        "Rrwrwwwwrr",
    ];
    for (((name, data), account_count), flags) in expected.into_iter().zip(expected_account_counts).zip(expected_flags) {
        let vector = by_name.get(name).unwrap_or_else(|| panic!("missing SDK vector {name}"));
        assert_eq!(vector.program_id, PROGRAM_ID_TEXT, "{name} program ID");
        assert_eq!(hex::decode(&vector.data_hex).unwrap(), data, "{name} data bytes");
        assert_eq!(vector.accounts.len(), account_count, "{name} account count");
        let actual_flags: String = vector.accounts.iter().map(|account| match (account.is_signer, account.is_writable) {
            (false, false) => 'r',
            (false, true) => 'w',
            (true, false) => 'R',
            (true, true) => 'W',
        }).collect();
        assert_eq!(actual_flags, flags, "{name} ordered signer/writable flags");
    }
}

#[test]
fn independent_borsh_encoder_pins_field_order_and_widths() {
    assert_eq!(initialize_config([7; 32]).len(), 40);
    let guard = Guard {
        expected_state_version: 9,
        expiry_unix_timestamp: -10,
        minimum_raw_output: 11,
    };
    assert_eq!(deposit(12, guard.clone()).len(), 40);
    assert_eq!(redeem(ClaimSide::Dr, 12, true, guard).len(), 42);
    assert_eq!(accumulate_event().len(), 8);
    assert_eq!(complete_finalization().len(), 8);
    assert_eq!(begin_finalization(1, [2; 32], [3; 32]).len(), 80);

    let event = EventInput {
        event_id: [1; 32],
        revision: 2,
        ex_date: 20271231,
        status: 1,
        m0_bits: 1.0f64.to_bits(),
        m1_bits: 1.1f64.to_bits(),
        source_final: true,
        original_effective_timestamp: 4,
        payment_date: 20280115,
        observed_slot: 5,
        evidence_digest: [6; 32],
    };
    assert_eq!(upsert_event(event).len(), 122);
}
