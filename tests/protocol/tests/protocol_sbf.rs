use dividendx_protocol_tests::{
    abi::{ClaimSide, EventInput, Guard},
    fixture::{
        assert_success, rejected_profile_registration, ProtocolFixture, RejectedMintProfile,
        SeriesPhaseView, MATURITY, PRE_YEAR, YEAR_START,
    },
    harness::{funded_system_account, program_data_address, program_id, read_sdk_vectors, repo_root, SbfHarness, PROGRAM_ID_TEXT},
    oracle::{accumulate, pools},
};
use num_traits::ToPrimitive;
use solana_instruction::{AccountMeta, Instruction};
use solana_instruction::error::InstructionError;
use solana_pubkey::Pubkey;

#[test]
fn compiled_elf_runs_and_rejects_unknown_anchor_discriminator() {
    let harness = SbfHarness::new(1_798_761_599);
    let result = harness.process(&Instruction {
        program_id: program_id(),
        accounts: vec![],
        data: vec![0; 8],
    });
    assert!(result.program_result.is_err());
    assert!(result.compute_units_consumed > 0);
    assert_ne!(harness.elf_sha256, [0; 32]);
    eprintln!(
        "compiled_sbf program={} elf_sha256={} rejected_unknown_cu={}",
        PROGRAM_ID_TEXT,
        hex::encode(harness.elf_sha256),
        result.compute_units_consumed
    );
}

#[test]
fn actual_token2022_deposit_executes_real_cpis() {
    let fixture = ProtocolFixture::new(6, 1_000_000);
    let result = fixture.harness.process(&fixture.deposit_ix(100_000, 0));
    assert_success(&result, "deposit");
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral), 900_000);
    assert_eq!(fixture.collateral_amount(fixture.vault), 100_000);
    assert_eq!(fixture.claim_amount(fixture.holder_pt), 100_000);
    assert_eq!(fixture.claim_amount(fixture.holder_dr), 100_000);
    assert_eq!(fixture.series_state().nominal_backing, 100_000);
    assert!(result.compute_units_consumed > 0);
    assert!(result.inner_instructions.len() >= 3);
    let message = result.message.as_ref().expect("Mollusk message for CPI mapping");
    let cpi_programs: Vec<_> = result.inner_instructions.iter().map(|inner| {
        message.account_keys()[inner.instruction.program_id_index as usize]
    }).collect();
    assert!(cpi_programs.contains(&dividendx_protocol_tests::fixture::TOKEN_2022_ID));
    assert!(cpi_programs.contains(&dividendx_protocol_tests::fixture::TOKEN_ID));
    eprintln!("deposit_sbf cpi_programs={cpi_programs:?}");
    assert_failure_unchanged(&fixture, &fixture.deposit_ix(1, 0), Some(6021), "stale state-version quote");
}

fn event(id: u8, revision: u64, ex_date: u32, status: u8, m0: f64, m1: f64) -> EventInput {
    EventInput {
        event_id: [id; 32],
        revision,
        ex_date,
        status,
        m0_bits: if status == 1 { m0.to_bits() } else { 0 },
        m1_bits: if status == 1 { m1.to_bits() } else { 0 },
        source_final: true,
        original_effective_timestamp: PRE_YEAR - 1,
        payment_date: if id == 2 { 20280115 } else { 20271231 },
        observed_slot: 10,
        evidence_digest: [id.wrapping_add(0x80); 32],
    }
}

fn assert_failure_unchanged(fixture: &ProtocolFixture, instruction: &Instruction, expected_custom: Option<u32>, label: &str) {
    let series_before = fixture.harness.account(&fixture.series).unwrap();
    let holder_before = fixture.collateral_amount(fixture.holder_collateral);
    let vault_before = fixture.collateral_amount(fixture.vault);
    let pt_before = fixture.claim_amount(fixture.holder_pt);
    let dr_before = fixture.claim_amount(fixture.holder_dr);
    let result = fixture.harness.process(instruction);
    assert!(result.program_result.is_err(), "{label} unexpectedly succeeded");
    if let Some(expected) = expected_custom {
        assert_eq!(result.raw_result, Err(InstructionError::Custom(expected)), "{label} returned the wrong error");
    }
    assert_eq!(fixture.harness.account(&fixture.series).unwrap(), series_before, "{label} changed series");
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral), holder_before, "{label} changed holder collateral");
    assert_eq!(fixture.collateral_amount(fixture.vault), vault_before, "{label} changed vault");
    assert_eq!(fixture.claim_amount(fixture.holder_pt), pt_before, "{label} changed PT");
    assert_eq!(fixture.claim_amount(fixture.holder_dr), dr_before, "{label} changed DR");
}

#[test]
fn initializer_requires_loader_upgrade_authority() {
    let harness = SbfHarness::new(PRE_YEAR);
    let wrong = Pubkey::new_from_array([0xd1; 32]);
    harness.insert_account(wrong, funded_system_account(1_000_000_000));
    let config = Pubkey::find_program_address(&[b"config"], &program_id()).0;
    let result = harness.process(&Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(config, false),
            AccountMeta::new_readonly(program_id(), false),
            AccountMeta::new_readonly(program_data_address(), false),
            AccountMeta::new(wrong, true),
            AccountMeta::new_readonly(solana_sdk_ids::system_program::ID, false),
        ],
        data: dividendx_protocol_tests::abi::initialize_config([1; 32]),
    });
    assert!(result.program_result.is_err());
    assert!(harness.account(&config).is_none() || harness.account(&config).unwrap().lamports == 0);
}

#[test]
fn sdk_generated_initialize_vector_executes_against_compiled_elf() {
    let vectors = read_sdk_vectors(&repo_root().join("tests/protocol/fixtures/sdk-instructions.json"));
    let vector = vectors.iter().find(|vector| vector.name == "initialize_config").unwrap();
    let instruction = vector.instruction();
    let authority = instruction.accounts[3].pubkey;
    let harness = SbfHarness::new_with_upgrade_authority(PRE_YEAR, authority);
    let result = harness.process(&instruction);
    assert_success(&result, "SDK initialize_config vector");
    assert_eq!(instruction.data, dividendx_protocol_tests::abi::initialize_config([1; 32]));
    assert!(harness.account(&instruction.accounts[0].pubkey).unwrap().lamports > 0);
    eprintln!("sdk_vector_sbf initialize_config_cu={}", result.compute_units_consumed);
}

#[test]
fn annual_journal_revisions_staged_commit_and_independent_redemption() {
    let mut fixture = ProtocolFixture::new(8, 2_000_000);
    let deposit = fixture.harness.process(&fixture.deposit_ix(1_000_000, 0));
    assert_success(&deposit, "initial deposit");

    // A real Token-2022 mint-to donation is surplus and does not inflate claims.
    assert_success(&fixture.mint_external_collateral(fixture.vault, 777), "vault donation");
    assert_eq!(fixture.series_state().nominal_backing, 1_000_000);
    assert_eq!(fixture.collateral_amount(fixture.vault), 1_000_777);

    // Claims can move to another owner, then recombine before finalization.
    let second = Pubkey::new_from_array([0xd2; 32]);
    let second_collateral = Pubkey::new_from_array([0xd3; 32]);
    let second_pt = Pubkey::new_from_array([0xd4; 32]);
    let second_dr = Pubkey::new_from_array([0xd5; 32]);
    fixture.harness.insert_account(second, funded_system_account(1_000_000_000));
    fixture.create_collateral_account(second_collateral, second);
    fixture.create_claim_account(second_pt, fixture.pt_mint, second);
    fixture.create_claim_account(second_dr, fixture.dr_mint, second);
    assert_success(&fixture.transfer_claim(fixture.holder_pt, second_pt, 100_000), "transfer PT");
    assert_success(&fixture.transfer_claim(fixture.holder_dr, second_dr, 100_000), "transfer DR");
    let recombine = fixture.harness.process(&fixture.recombine_ix_for(
        100_000, 1, second, second_collateral, second_pt, second_dr,
    ));
    assert_success(&recombine, "second owner recombination");
    assert_eq!(fixture.collateral_amount(second_collateral), 100_000);
    assert_eq!(fixture.series_state().nominal_backing, 900_000);

    assert_success(&fixture.harness.process(&fixture.set_admission_ix(false)), "disable admission");
    assert_failure_unchanged(&fixture, &fixture.deposit_ix(1, 2), Some(6013), "disabled admission deposit");
    assert_failure_unchanged(&fixture, &fixture.create_series_ix_for_year(2028), Some(6013), "disabled admission series creation");
    assert_success(&fixture.harness.process(&fixture.set_admission_ix(true)), "resume admission");

    // Qualified ex-date zero is stored unresolved before the year; a later source revision resolves it.
    let unresolved = event(1, 1, 0, 1, 1.0, 1.1);
    assert_success(&fixture.harness.process(&fixture.upsert_ix(unresolved.clone())), "store unresolved event");
    assert_eq!(fixture.series_state().unresolved_count, 1);
    assert_failure_unchanged(&fixture, &fixture.deposit_ix(1, 3), Some(6025), "deposit after journal start");
    fixture.harness.set_clock_and_slot(1_805_155_200, 100); // 2027-03-16
    let mut first = event(1, 2, 20270315, 1, 1.0, 1.1);
    first.original_effective_timestamp = 1_805_155_100;
    first.observed_slot = 100;
    assert_success(&fixture.harness.process(&fixture.upsert_ix(first.clone())), "resolve event revision");
    assert_failure_unchanged(&fixture, &fixture.upsert_ix(unresolved.clone()), Some(6041), "lower event revision");
    let mut conflicting_first = first.clone();
    conflicting_first.m1_bits = 1.2f64.to_bits();
    assert_failure_unchanged(&fixture, &fixture.upsert_ix(conflicting_first), Some(6042), "same revision conflict");

    fixture.harness.set_clock_and_slot(1_813_104_000, 150); // 2027-06-16
    let mut second_event = event(2, 1, 20270615, 1, 1.0, 1.1);
    second_event.original_effective_timestamp = 1_813_103_900;
    second_event.observed_slot = 150;
    second_event.payment_date = 20270630;
    assert_success(&fixture.harness.process(&fixture.upsert_ix(second_event.clone())), "second qualified event");

    fixture.harness.set_clock_and_slot(1_821_052_800, 200); // 2027-09-16
    let mut third = event(3, 1, 20270915, 1, 1.0, 1.1);
    third.original_effective_timestamp = 1_821_052_700;
    third.observed_slot = 200;
    third.payment_date = 20270930;
    assert_success(&fixture.harness.process(&fixture.upsert_ix(third.clone())), "third qualified event");

    // The December dividend remains unfinalized at maturity and blocks sealing.
    fixture.harness.set_clock_and_slot(1_830_211_200, 250); // 2027-12-31
    let mut fourth_pending = event(4, 1, 20271231, 1, 1.0, 1.1);
    fourth_pending.source_final = false;
    fourth_pending.original_effective_timestamp = 1_830_211_100;
    fourth_pending.payment_date = 20280115;
    fourth_pending.observed_slot = 250;
    assert_success(&fixture.harness.process(&fixture.upsert_ix(fourth_pending)), "pending December dividend");

    let cancelled_initial = event(5, 1, 20270601, 1, 1.0, 1.25);
    assert_success(&fixture.harness.process(&fixture.upsert_ix(cancelled_initial)), "event later cancelled");
    let cancelled = event(5, 2, 20270601, 3, 0.0, 0.0);
    assert_success(&fixture.harness.process(&fixture.upsert_ix(cancelled.clone())), "cancel event");
    let unsupported_initial = event(6, 1, 20270901, 4, 0.0, 0.0);
    assert_success(&fixture.harness.process(&fixture.upsert_ix(unsupported_initial)), "unsupported event blocks sealing");
    let unsupported_resolved = event(6, 2, 20270901, 2, 0.0, 0.0);
    let confirmed_zero = event(7, 1, 20271001, 2, 0.0, 0.0);
    assert_success(&fixture.harness.process(&fixture.upsert_ix(confirmed_zero.clone())), "confirmed-zero event");
    assert_success(&fixture.harness.process(&fixture.set_admission_ix(false)), "disable admission after journal correction");
    let open = fixture.series_state();
    assert_eq!((open.event_count, open.unresolved_count, open.in_year_qualified_count), (7, 2, 3));

    fixture.harness.set_clock_and_slot(MATURITY, 300);
    assert_failure_unchanged(&fixture, &fixture.begin_ix([0xb0; 32]), Some(6045), "unresolved event at maturity");
    fixture.harness.set_clock_and_slot(1_831_507_200, 350); // 2028-01-15 payment date
    let mut fourth = event(4, 2, 20271231, 1, 1.0, 1.1);
    fourth.original_effective_timestamp = 1_831_507_100;
    fourth.payment_date = 20280115;
    fourth.observed_slot = 350;
    assert_success(&fixture.harness.process(&fixture.upsert_ix(fourth.clone())), "final late-paid December revision");
    assert_success(&fixture.harness.process(&fixture.upsert_ix(unsupported_resolved.clone())), "resolve unsupported event as zero");
    let mut next_year = event(8, 1, 20280101, 1, 1.0, 1.5);
    next_year.original_effective_timestamp = 1_831_507_100;
    next_year.payment_date = 20280115;
    next_year.observed_slot = 350;
    assert_success(&fixture.harness.process(&fixture.upsert_ix(next_year.clone())), "next-year boundary event");
    assert_eq!((fixture.series_state().unresolved_count, fixture.series_state().in_year_qualified_count), (0, 4));
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(1_831_507_200 + 86_400)), "post-payment observation");
    let state_before_seal = fixture.series_state();
    let mut wrong_journal = fixture.begin_ix([0xaf; 32]);
    wrong_journal.data = dividendx_protocol_tests::abi::begin_finalization(
        state_before_seal.journal_version + 1, state_before_seal.journal_hash, [0xaf; 32],
    );
    assert_failure_unchanged(&fixture, &wrong_journal, Some(6044), "journal seal mismatch");
    let begin = fixture.harness.process(&fixture.begin_ix([0xb1; 32]));
    assert_success(&begin, "begin with admission disabled");
    assert_eq!(fixture.series_state().phase, SeriesPhaseView::Sealing);

    assert_failure_unchanged(&fixture, &fixture.complete_ix(), Some(6050), "complete with omitted records");
    assert_failure_unchanged(&fixture, &fixture.accumulate_ix(&second_event), Some(6047), "wrong event order");
    let mut accumulation_cu = Vec::new();
    for current in [&first, &second_event, &third, &fourth, &cancelled, &unsupported_resolved, &confirmed_zero, &next_year] {
        let result = fixture.harness.process(&fixture.accumulate_ix(current));
        assert_success(&result, "accumulate current revision");
        accumulation_cu.push(result.compute_units_consumed);
    }
    let accumulator_after = fixture.accumulator_state();
    assert_eq!(accumulator_after.cursor, 8);
    assert_failure_unchanged(&fixture, &fixture.accumulate_ix(&next_year), Some(6047), "repeat accumulated record");
    let complete = fixture.harness.process(&fixture.complete_ix());
    assert_success(&complete, "complete finalization");

    let expected = pools(900_000, &accumulate(&[(1.0f64.to_bits(), 1.1f64.to_bits()); 4]).unwrap()).unwrap();
    let finalized = fixture.series_state();
    assert_eq!(finalized.phase, SeriesPhaseView::Finalized);
    assert_eq!(finalized.pt_pool, expected.pt.to_u64().unwrap());
    assert_eq!(finalized.dr_pool, expected.dr.to_u64().unwrap());
    assert_eq!(finalized.pt_pool + finalized.dr_pool, 900_000);

    let before = fixture.collateral_amount(fixture.holder_collateral);
    let redeem_dr = fixture.harness.process(&fixture.redeem_ix(ClaimSide::Dr, 300_000, false, finalized.state_version));
    assert_success(&redeem_dr, "partial DR redemption");
    let after_dr = fixture.series_state();
    let redeem_pt = fixture.harness.process(&fixture.redeem_ix(ClaimSide::Pt, 400_000, false, after_dr.state_version));
    assert_success(&redeem_pt, "independent PT redemption");
    let after_pt = fixture.series_state();
    assert_success(&fixture.harness.process(&fixture.redeem_ix(ClaimSide::Dr, 600_000, false, after_pt.state_version)), "remaining DR redemption");
    let after_all_dr = fixture.series_state();
    assert_success(&fixture.harness.process(&fixture.redeem_ix(ClaimSide::Pt, 500_000, false, after_all_dr.state_version)), "remaining PT redemption");
    let paid = fixture.collateral_amount(fixture.holder_collateral) - before;
    let fully_redeemed = fixture.series_state();
    assert_eq!((fully_redeemed.pt_redeemed_nominal, fully_redeemed.dr_redeemed_nominal), (900_000, 900_000));
    assert_eq!((fully_redeemed.pt_paid, fully_redeemed.dr_paid), (finalized.pt_pool, finalized.dr_pool));
    assert_eq!(paid, fully_redeemed.dr_paid + fully_redeemed.pt_paid);
    assert_eq!(fixture.collateral_amount(fixture.vault), 777);
    eprintln!(
        "annual_sbf elf={} deposit_cu={} begin_cu={} accumulate_cu={:?} complete_cu={} redeem_dr_cu={} redeem_pt_cu={}",
        hex::encode(fixture.harness.elf_sha256), deposit.compute_units_consumed, begin.compute_units_consumed,
        accumulation_cu, complete.compute_units_consumed, redeem_dr.compute_units_consumed, redeem_pt.compute_units_consumed,
    );
}

#[test]
fn empty_series_finalizes_and_zero_output_requires_consent() {
    let mut zero = ProtocolFixture::new(9, 0);
    zero.harness.set_clock_and_slot(MATURITY, 98);
    assert_success(&zero.harness.process(&zero.refresh_observation_ix(MATURITY + 86_400)), "zero-supply observation");
    assert_success(&zero.harness.process(&zero.begin_ix([0xc0; 32])), "begin zero-supply empty series");
    assert_success(&zero.harness.process(&zero.complete_ix()), "complete zero-supply empty series");
    let zero_state = zero.series_state();
    assert_eq!((zero_state.final_supply, zero_state.pt_pool, zero_state.dr_pool), (0, 0, 0));

    let mut fixture = ProtocolFixture::new(9, 1);
    assert_success(&fixture.harness.process(&fixture.deposit_ix(1, 0)), "one-unit deposit");
    fixture.harness.set_clock_and_slot(MATURITY, 99);
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(MATURITY + 86_400)), "fresh maturity observation");
    assert_success(&fixture.harness.process(&fixture.begin_ix([0xc1; 32])), "begin empty journal");
    assert_success(&fixture.harness.process(&fixture.complete_ix()), "complete empty journal");
    let finalized = fixture.series_state();
    assert_eq!((finalized.pt_pool, finalized.dr_pool), (1, 0));
    assert_failure_unchanged(&fixture, &fixture.redeem_ix(ClaimSide::Dr, 1, false, finalized.state_version), Some(6054), "zero output without consent");
    let redeem = fixture.harness.process(&fixture.redeem_ix(ClaimSide::Dr, 1, true, finalized.state_version));
    assert_success(&redeem, "zero output with consent");
    assert_eq!(fixture.series_state().dr_redeemed_nominal, 1);
    assert_eq!(fixture.series_state().dr_paid, 0);
}

#[test]
fn year_cutoff_and_external_claim_burn_fail_without_partial_state() {
    let mut fixture = ProtocolFixture::new(6, 100);
    assert_success(&fixture.harness.process(&fixture.deposit_ix(100, 0)), "fund claims");
    assert_success(&fixture.burn_claim_externally(fixture.holder_pt, fixture.pt_mint, 1), "external PT burn");
    assert_failure_unchanged(&fixture, &fixture.recombine_ix(100, 1), None, "recombine after one-sided burn");
    fixture.harness.set_clock_and_slot(YEAR_START, 11);
    assert_failure_unchanged(&fixture, &fixture.deposit_ix(1, 1), Some(6019), "deposit at exact year boundary");
}

#[test]
fn source_owner_and_program_constraints_reject_substituted_accounts() {
    let fixture = ProtocolFixture::new(6, 10);
    let foreign_collateral = Pubkey::new_from_array([0xee; 32]);
    fixture.create_collateral_account(foreign_collateral, Pubkey::new_from_array([0xef; 32]));
    let mut wrong_owner = fixture.deposit_ix(1, 0);
    wrong_owner.accounts[5].pubkey = foreign_collateral;
    assert_failure_unchanged(&fixture, &wrong_owner, Some(6026), "holder collateral owned by series");

    let mut wrong_program = fixture.deposit_ix(1, 0);
    wrong_program.accounts[11].pubkey = dividendx_protocol_tests::fixture::TOKEN_ID;
    assert_failure_unchanged(&fixture, &wrong_program, None, "legacy program substituted for Token-2022");

    let input = event(0x21, 1, 20270315, 2, 0.0, 0.0);
    let mut wrong_source = fixture.upsert_ix(input);
    wrong_source.accounts[0] = AccountMeta::new_readonly(fixture.holder, true);
    assert_failure_unchanged(&fixture, &wrong_source, None, "non-attestor event source");
}

#[test]
fn guards_and_event_validation_return_specific_errors_without_changes() {
    let fixture = ProtocolFixture::new(8, 10);
    let mut expired = fixture.deposit_ix(1, 0);
    expired.data = dividendx_protocol_tests::abi::deposit(1, Guard {
        expected_state_version: 0, expiry_unix_timestamp: PRE_YEAR - 1, minimum_raw_output: 0,
    });
    assert_failure_unchanged(&fixture, &expired, Some(6022), "expired quote");
    let mut minimum = fixture.deposit_ix(1, 0);
    minimum.data = dividendx_protocol_tests::abi::deposit(1, Guard {
        expected_state_version: 0, expiry_unix_timestamp: PRE_YEAR + 1, minimum_raw_output: 2,
    });
    assert_failure_unchanged(&fixture, &minimum, Some(6023), "minimum raw output");

    let decreasing = event(0x22, 1, 20270315, 1, 1.1, 1.0);
    assert_failure_unchanged(&fixture, &fixture.upsert_ix(decreasing), Some(6011), "decreasing qualified multiplier");
    let mut nonqualified_factor = event(0x23, 1, 20270315, 2, 0.0, 0.0);
    nonqualified_factor.m0_bits = 1.0f64.to_bits();
    assert_failure_unchanged(&fixture, &fixture.upsert_ix(nonqualified_factor), Some(6039), "factor on nonqualified status");
    let mut future = event(0x24, 1, 20270315, 1, 1.0, 1.1);
    future.original_effective_timestamp = PRE_YEAR + 1;
    assert_failure_unchanged(&fixture, &fixture.upsert_ix(future), Some(6038), "future source data");
    let invalid_date = event(0x25, 1, 20270229, 2, 0.0, 0.0);
    assert_failure_unchanged(&fixture, &fixture.upsert_ix(invalid_date), Some(6036), "invalid civil date");
}

#[test]
fn scale_tuple_and_active_multiplier_are_checked_at_exact_boundary_and_commit() {
    let mut fixture = ProtocolFixture::new(8, 10);
    assert_success(&fixture.update_multiplier(1.1, PRE_YEAR + 100), "schedule multiplier");
    assert_failure_unchanged(&fixture, &fixture.deposit_ix(1, 0), Some(6015), "unreviewed full scale tuple");
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(PRE_YEAR + 86_400)), "review scheduled tuple");
    assert_success(&fixture.harness.process(&fixture.deposit_ix(2, 0)), "deposit before activation");
    fixture.harness.set_clock_and_slot(PRE_YEAR + 100, 11);
    assert_failure_unchanged(&fixture, &fixture.deposit_ix(1, 1), Some(6016), "active multiplier at equality");
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(PRE_YEAR + 86_400)), "review active multiplier");
    assert_success(&fixture.harness.process(&fixture.deposit_ix(2, 1)), "deposit after exact activation review");

    fixture.harness.set_clock_and_slot(MATURITY, 200);
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(MATURITY + 86_400)), "seal observation");
    assert_success(&fixture.harness.process(&fixture.begin_ix([0xaa; 32])), "seal reviewed tuple");
    assert_success(&fixture.update_multiplier(1.2, MATURITY + 100), "mutate tuple after seal");
    assert_failure_unchanged(&fixture, &fixture.complete_ix(), Some(6015), "full scale tuple changed before commit");
    assert_success(&fixture.harness.process(&fixture.abort_ix()), "abort invalidated seal");
    assert_eq!(fixture.series_state().phase, SeriesPhaseView::Open);

    let mut controls = ProtocolFixture::new(8, 4);
    assert_success(&controls.harness.process(&controls.deposit_ix(4, 0)), "controls fixture deposit");
    controls.harness.set_clock_and_slot(MATURITY, 201);
    assert_success(&controls.harness.process(&controls.refresh_observation_ix(MATURITY + 86_400)), "controls seal observation");
    assert_success(&controls.harness.process(&controls.begin_ix([0xab; 32])), "controls seal");
    assert_success(&controls.rotate_collateral_mint_authority(Pubkey::new_from_array([0xe8; 32])), "post-seal authority rotation");
    assert_failure_unchanged(&controls, &controls.complete_ix(), Some(6017), "controls fingerprint changed before commit");
}

#[test]
fn healthy_exit_survives_admission_off_stale_review_authority_rotation_and_large_scale() {
    let mut fixture = ProtocolFixture::new(6, 100);
    assert_success(&fixture.harness.process(&fixture.deposit_ix(100, 0)), "fund healthy exit");
    assert_success(&fixture.harness.process(&fixture.set_admission_ix(false)), "disable admission");
    let rotated = Pubkey::new_from_array([0xe7; 32]);
    assert_success(&fixture.rotate_collateral_mint_authority(rotated), "rotate mint authority");
    assert_success(&fixture.update_multiplier(2_f64.powi(33), PRE_YEAR), "set positive out-of-accounting-range scale");
    fixture.harness.set_clock_and_slot(PRE_YEAR + 200_000, 20);
    let recombine = fixture.harness.process(&fixture.recombine_ix(100, 1));
    assert_success(&recombine, "healthy raw exit");
    assert_eq!(fixture.series_state().nominal_backing, 0);
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral), 100);
}

#[test]
fn paused_frozen_and_deficit_fail_with_intended_errors_and_rollback() {
    let pausable = ProtocolFixture::new_pausable(8, 100);
    assert_success(&pausable.harness.process(&pausable.deposit_ix(100, 0)), "pausable deposit");
    assert_success(&pausable.pause_collateral(), "pause collateral");
    assert_failure_unchanged(&pausable, &pausable.recombine_ix(1, 1), Some(6010), "paused recombination");
    assert_success(&pausable.resume_collateral(), "resume collateral");
    assert_success(&pausable.harness.process(&pausable.recombine_ix(100, 1)), "resumed recombination");

    let frozen = ProtocolFixture::new_freezable(9, 100);
    assert_success(&frozen.freeze_holder_collateral(), "freeze holder collateral");
    assert_failure_unchanged(&frozen, &frozen.deposit_ix(1, 0), Some(6031), "frozen holder deposit");

    let mut deficit = ProtocolFixture::new_with_permanent_delegate(6, 100);
    assert_success(&deficit.harness.process(&deficit.deposit_ix(100, 0)), "deficit fixture deposit");
    assert_success(&deficit.burn_collateral_as_delegate(deficit.vault, 1), "actual permanent-delegate vault burn");
    assert_eq!(deficit.collateral_amount(deficit.vault), 99);
    assert_failure_unchanged(&deficit, &deficit.recombine_ix(1, 1), Some(6032), "custody deficit recombination");
    deficit.harness.set_clock_and_slot(MATURITY, 500);
    assert_success(&deficit.harness.process(&deficit.refresh_observation_ix(MATURITY + 86_400)), "deficit maturity observation");
    assert_failure_unchanged(&deficit, &deficit.begin_ix([0xfe; 32]), Some(6032), "custody deficit finalization");

    let mut redeem_deficit = ProtocolFixture::new_with_permanent_delegate(6, 10);
    assert_success(&redeem_deficit.harness.process(&redeem_deficit.deposit_ix(10, 0)), "redemption deficit deposit");
    redeem_deficit.harness.set_clock_and_slot(MATURITY, 501);
    assert_success(&redeem_deficit.harness.process(&redeem_deficit.refresh_observation_ix(MATURITY + 86_400)), "redemption deficit observation");
    assert_success(&redeem_deficit.harness.process(&redeem_deficit.begin_ix([0xfd; 32])), "redemption deficit begin");
    assert_success(&redeem_deficit.harness.process(&redeem_deficit.complete_ix()), "redemption deficit complete");
    assert_success(&redeem_deficit.burn_collateral_as_delegate(redeem_deficit.vault, 1), "post-final vault burn");
    let final_version = redeem_deficit.series_state().state_version;
    assert_failure_unchanged(
        &redeem_deficit,
        &redeem_deficit.redeem_ix(ClaimSide::Pt, 1, false, final_version),
        Some(6032),
        "custody deficit redemption",
    );
}

#[test]
fn xstocks_passive_extensions_execute_custody_and_unsafe_profiles_reject() {
    let fixture = ProtocolFixture::new_xstocks_profile(8, 100);
    let deposit = fixture.harness.process(&fixture.deposit_ix(100, 0));
    assert_success(&deposit, "xStocks passive-profile deposit");
    let recombine = fixture.harness.process(&fixture.recombine_ix(100, 1));
    assert_success(&recombine, "xStocks passive-profile recombination");
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral), 100);
    assert_eq!(fixture.collateral_amount(fixture.vault), 0);

    for (profile, expected) in [
        (RejectedMintProfile::TransferFee, 6005),
        (RejectedMintProfile::ActiveTransferHook, 6009),
        (RejectedMintProfile::DefaultFrozen, 6008),
        (RejectedMintProfile::UnsupportedNonTransferable, 6005),
    ] {
        let result = rejected_profile_registration(profile);
        assert_eq!(result.raw_result, Err(InstructionError::Custom(expected)), "{profile:?}");
    }
}

#[test]
fn max_64_event_extreme_factor_path_executes_in_sbf_bounds() {
    let mut fixture = ProtocolFixture::new(8, u64::MAX);
    let deposit = fixture.harness.process(&fixture.deposit_ix(u64::MAX, 0));
    assert_success(&deposit, "maximum raw deposit");
    let low_bits = dividendx_protocol_tests::oracle::MIN_MULTIPLIER_BITS;
    let high_bits = dividendx_protocol_tests::oracle::MAX_MULTIPLIER_EXCLUSIVE_BITS - 1;
    let mut events = Vec::with_capacity(64);
    let mut max_upsert_cu = 0;
    for id in 1..=64u8 {
        let input = EventInput {
            event_id: [id; 32], revision: 1, ex_date: 20270615, status: 1,
            m0_bits: low_bits, m1_bits: high_bits, source_final: true,
            original_effective_timestamp: PRE_YEAR - 1, payment_date: 20271231,
            observed_slot: 10, evidence_digest: [id.wrapping_add(0x80); 32],
        };
        let result = fixture.harness.process(&fixture.upsert_ix(input.clone()));
        assert_success(&result, "max event upsert");
        max_upsert_cu = max_upsert_cu.max(result.compute_units_consumed);
        events.push(input);
    }
    let state = fixture.series_state();
    assert_eq!((state.event_count, state.in_year_qualified_count, state.unresolved_count), (64, 64, 0));
    fixture.harness.set_clock_and_slot(MATURITY, 300);
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(MATURITY + 86_400)), "max path observation");
    let begin = fixture.harness.process(&fixture.begin_ix([0xe1; 32]));
    assert_success(&begin, "max path begin");
    let mut peak_accumulate_cu = 0;
    for input in &events {
        let result = fixture.harness.process(&fixture.accumulate_ix(input));
        assert_success(&result, "max path accumulate");
        peak_accumulate_cu = peak_accumulate_cu.max(result.compute_units_consumed);
    }
    let accumulator = fixture.accumulator_state();
    assert_eq!(accumulator.cursor, 64);
    assert_eq!(accumulator.numerator.len(), 417); // ceil(3329/8)
    assert_eq!(accumulator.denominator.len(), 928); // 7424/8
    let complete = fixture.harness.process(&fixture.complete_ix());
    assert_success(&complete, "max path final commit");
    let final_state = fixture.series_state();
    assert_eq!((final_state.pt_pool, final_state.dr_pool), (1, u64::MAX - 1));
    let configured_heap_bytes = fixture.harness.context.mollusk.compute_budget.heap_size;
    assert_eq!(configured_heap_bytes, 32 * 1024);
    eprintln!(
        "max64_sbf elf={} configured_heap_bytes={} deposit_cu={} max_upsert_cu={} begin_cu={} peak_accumulate_cu={} final_commit_cu={} numerator_bits=3329 denominator_bits=7424 quantity_product_bits=7488",
        hex::encode(fixture.harness.elf_sha256), configured_heap_bytes, deposit.compute_units_consumed, max_upsert_cu,
        begin.compute_units_consumed, peak_accumulate_cu, complete.compute_units_consumed,
    );
}

fn run_sbf_factor_case(quantity: u64, m0_bits: u64, m1_bits: u64, count: u8, ex_date: u32) -> (u64, u64, u64) {
    let mut fixture = ProtocolFixture::new(8, quantity);
    assert_success(&fixture.harness.process(&fixture.deposit_ix(quantity, 0)), "factor case deposit");
    let mut events = Vec::new();
    for id in 1..=count {
        let input = EventInput {
            event_id: [id; 32], revision: 1, ex_date, status: 1, m0_bits, m1_bits,
            source_final: true, original_effective_timestamp: PRE_YEAR - 1,
            payment_date: 20271231, observed_slot: 10,
            evidence_digest: [id.wrapping_add(0x40); 32],
        };
        assert_success(&fixture.harness.process(&fixture.upsert_ix(input.clone())), "factor case event");
        events.push(input);
    }
    fixture.harness.set_clock_and_slot(MATURITY, 400);
    assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(MATURITY + 86_400)), "factor case observation");
    assert_success(&fixture.harness.process(&fixture.begin_ix([0xf1; 32])), "factor case begin");
    let mut peak_cu = 0;
    for input in &events {
        let result = fixture.harness.process(&fixture.accumulate_ix(input));
        assert_success(&result, "factor case accumulate");
        peak_cu = peak_cu.max(result.compute_units_consumed);
    }
    let complete = fixture.harness.process(&fixture.complete_ix());
    assert_success(&complete, "factor case complete");
    let state = fixture.series_state();
    (state.pt_pool, state.dr_pool, peak_cu.max(complete.compute_units_consumed))
}

#[test]
fn sourced_kox_and_mu_bits_match_sbf_allocation_regressions() {
    // Dates are deliberately synthetic: the immutable source fixtures provide factors only.
    let ko = run_sbf_factor_case(
        9_819_982_084, 4_607_264_977_872_978_803, 4_607_284_020_568_871_647, 1, 20270315,
    );
    assert_eq!((ko.0, ko.1), (9_779_376_057, 40_606_027));
    let mu = run_sbf_factor_case(
        100_000_000, 4_607_182_418_800_017_408, 4_607_182_899_454_409_970, 1, 20270415,
    );
    assert_eq!((mu.0, mu.1), (99_989_329, 10_671));
    eprintln!("factor_regression_sbf ko_peak_cu={} mu_peak_cu={}", ko.2, mu.2);
}

#[test]
fn one_ulp_64_event_sbf_regression_compounds_before_rounding() {
    let result = run_sbf_factor_case(
        u64::MAX, 4_607_182_418_800_017_408, 4_607_182_418_800_017_409, 64, 20270515,
    );
    assert_eq!((result.0, result.1), (18_446_744_073_709_289_472, 262_143));
    assert_ne!(result.1, 262_080);
    eprintln!("one_ulp64_sbf peak_accumulate_or_commit_cu={}", result.2);
}
