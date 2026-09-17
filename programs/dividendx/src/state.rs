use anchor_lang::prelude::*;

pub const MAX_EVENTS: u8 = 64;
pub const MAX_BIGINT_BYTES: usize = 1024;
pub const MAX_OBSERVATION_LIFETIME: i64 = 86_400;

pub const STATUS_PENDING: u8 = 0;
pub const STATUS_QUALIFIED: u8 = 1;
pub const STATUS_CONFIRMED_ZERO: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;
pub const STATUS_UNSUPPORTED: u8 = 4;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub deployment_domain: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AssetPolicy {
    pub config: Pubkey,
    pub issuer_id: [u8; 32],
    pub collateral_mint: Pubkey,
    #[max_len(16)]
    pub symbol: String,
    pub decimals: u8,
    pub attestor: Pubkey,
    pub policy_digest: [u8; 32],
    pub extensions_mask: u64,
    pub admission_enabled: bool,
    pub reviewed_current_multiplier_bits: u64,
    pub reviewed_new_multiplier_bits: u64,
    pub reviewed_new_multiplier_effective_timestamp: i64,
    pub reviewed_active_multiplier_bits: u64,
    pub reviewed_controls_fingerprint: [u8; 32],
    pub observed_slot: u64,
    pub observation_valid_until: i64,
    pub observation_evidence_digest: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq, InitSpace)]
pub enum SeriesPhase {
    Open,
    Sealing,
    Finalized,
}

#[account]
#[derive(InitSpace)]
pub struct Series {
    pub asset_policy: Pubkey,
    pub policy_digest: [u8; 32],
    pub year: u16,
    pub start_timestamp: i64,
    pub maturity_timestamp: i64,
    pub collateral_mint: Pubkey,
    pub vault: Pubkey,
    pub pt_mint: Pubkey,
    pub dr_mint: Pubkey,
    pub decimals: u8,
    pub phase: SeriesPhase,
    pub nominal_backing: u64,
    pub event_count: u8,
    pub unresolved_count: u8,
    pub in_year_qualified_count: u8,
    pub journal_version: u64,
    pub journal_hash: [u8; 32],
    pub state_version: u64,
    pub sealed_journal_version: u64,
    pub sealed_journal_hash: [u8; 32],
    pub sealed_coverage_digest: [u8; 32],
    pub sealed_event_count: u8,
    pub sealed_current_multiplier_bits: u64,
    pub sealed_new_multiplier_bits: u64,
    pub sealed_new_multiplier_effective_timestamp: i64,
    pub sealed_active_multiplier_bits: u64,
    pub sealed_controls_fingerprint: [u8; 32],
    pub finalization_slot: u64,
    pub final_supply: u64,
    pub pt_pool: u64,
    pub dr_pool: u64,
    pub pt_redeemed_nominal: u64,
    pub dr_redeemed_nominal: u64,
    pub pt_paid: u64,
    pub dr_paid: u64,
    pub bump: u8,
    pub pt_mint_bump: u8,
    pub dr_mint_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EventHead {
    pub series: Pubkey,
    pub event_id: [u8; 32],
    pub index: u8,
    pub latest_revision: u64,
    pub latest_record_hash: [u8; 32],
    pub latest_resolved: bool,
    pub latest_in_year_qualified: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EventRevision {
    pub event_head: Pubkey,
    pub event_id: [u8; 32],
    pub revision: u64,
    pub ex_date: u32,
    pub status: u8,
    pub m0_bits: u64,
    pub m1_bits: u64,
    pub source_final: bool,
    pub original_effective_time: i64,
    pub source_payment_date: u32,
    pub observed_slot: u64,
    pub evidence_digest: [u8; 32],
    pub previous_revision_hash: [u8; 32],
    pub record_hash: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Accumulator {
    pub series: Pubkey,
    pub cursor: u8,
    #[max_len(1024)]
    pub numerator: Vec<u8>,
    #[max_len(1024)]
    pub denominator: Vec<u8>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub struct Guard {
    pub expected_state_version: u64,
    pub expiry_unix_timestamp: i64,
    pub minimum_raw_output: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub struct EventInput {
    pub event_id: [u8; 32],
    pub revision: u64,
    pub ex_date: u32,
    pub status: u8,
    pub m0_bits: u64,
    pub m1_bits: u64,
    pub source_final: bool,
    pub original_effective_time: i64,
    pub source_payment_date: u32,
    pub observed_slot: u64,
    pub evidence_digest: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum RedeemSide {
    Pt,
    Dr,
}

impl EventRevision {
    pub fn matches_input(&self, input: &EventInput, previous_revision_hash: [u8; 32]) -> bool {
        self.event_id == input.event_id
            && self.revision == input.revision
            && self.ex_date == input.ex_date
            && self.status == input.status
            && self.m0_bits == input.m0_bits
            && self.m1_bits == input.m1_bits
            && self.source_final == input.source_final
            && self.original_effective_time == input.original_effective_time
            && self.source_payment_date == input.source_payment_date
            && self.observed_slot == input.observed_slot
            && self.evidence_digest == input.evidence_digest
            && self.previous_revision_hash == previous_revision_hash
    }
}
