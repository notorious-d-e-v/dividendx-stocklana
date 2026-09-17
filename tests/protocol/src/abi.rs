//! Independent Anchor instruction encoding for SDK/program byte-parity tests.

use crate::harness::anchor_instruction_data;
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(Clone, Debug, Eq, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct Guard {
    pub expected_state_version: u64,
    pub expiry_unix_timestamp: i64,
    pub minimum_raw_output: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct EventInput {
    pub event_id: [u8; 32],
    pub revision: u64,
    pub ex_date: u32,
    pub status: u8,
    pub m0_bits: u64,
    pub m1_bits: u64,
    pub source_final: bool,
    pub original_effective_timestamp: i64,
    pub payment_date: u32,
    pub observed_slot: u64,
    pub evidence_digest: [u8; 32],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, BorshDeserialize, BorshSerialize)]
pub enum ClaimSide {
    Pt,
    Dr,
}

fn encode<T: BorshSerialize>(name: &str, arguments: &T) -> Vec<u8> {
    anchor_instruction_data(name, &borsh::to_vec(arguments).expect("Borsh instruction arguments"))
}

pub fn initialize_config(domain: [u8; 32]) -> Vec<u8> {
    encode("initialize_config", &domain)
}

pub fn register_asset(
    issuer_id: [u8; 32],
    symbol: String,
    attestor: [u8; 32],
    policy_digest: [u8; 32],
) -> Vec<u8> {
    encode(
        "register_asset",
        &(issuer_id, symbol, attestor, policy_digest),
    )
}

pub fn set_asset_admission(enabled: bool) -> Vec<u8> {
    encode("set_asset_admission", &enabled)
}

pub fn refresh_observation(evidence_digest: [u8; 32], valid_until: i64) -> Vec<u8> {
    encode("refresh_observation", &(evidence_digest, valid_until))
}

pub fn create_series(year: u16) -> Vec<u8> {
    encode("create_series", &year)
}

pub fn deposit(amount: u64, guard: Guard) -> Vec<u8> {
    encode("deposit", &(amount, guard))
}

pub fn recombine(amount: u64, guard: Guard) -> Vec<u8> {
    encode("recombine", &(amount, guard))
}

pub fn upsert_event(input: EventInput) -> Vec<u8> {
    encode("upsert_event", &input)
}

pub fn begin_finalization(
    expected_journal_version: u64,
    expected_journal_hash: [u8; 32],
    coverage_digest: [u8; 32],
) -> Vec<u8> {
    encode(
        "begin_finalization",
        &(
            expected_journal_version,
            expected_journal_hash,
            coverage_digest,
        ),
    )
}

pub fn accumulate_event() -> Vec<u8> {
    anchor_instruction_data("accumulate_event", &[])
}

pub fn complete_finalization() -> Vec<u8> {
    anchor_instruction_data("complete_finalization", &[])
}

pub fn abort_finalization(reason_digest: [u8; 32]) -> Vec<u8> {
    encode("abort_finalization", &reason_digest)
}

pub fn redeem(side: ClaimSide, amount: u64, allow_zero: bool, guard: Guard) -> Vec<u8> {
    encode("redeem", &(side, amount, allow_zero, guard))
}
