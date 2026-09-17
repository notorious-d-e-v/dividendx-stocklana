#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod calendar;
pub mod error;
pub mod instructions;
pub mod math;
pub mod state;
pub mod token_profile;

pub use instructions::*;
pub use state::{EventInput, Guard, RedeemSide};

declare_id!("2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE");

#[program]
pub mod dividendx {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, domain: [u8; 32]) -> Result<()> {
        instructions::initialize_config(ctx, domain)
    }

    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        issuer_id: [u8; 32],
        symbol: String,
        attestor: Pubkey,
        policy_digest: [u8; 32],
    ) -> Result<()> {
        instructions::register_asset(ctx, issuer_id, symbol, attestor, policy_digest)
    }

    pub fn set_asset_admission(ctx: Context<SetAssetAdmission>, enabled: bool) -> Result<()> {
        instructions::set_asset_admission(ctx, enabled)
    }

    pub fn refresh_observation(
        ctx: Context<RefreshObservation>,
        evidence_digest: [u8; 32],
        valid_until: i64,
    ) -> Result<()> {
        instructions::refresh_observation(ctx, evidence_digest, valid_until)
    }

    pub fn create_series(ctx: Context<CreateSeries>, year: u16) -> Result<()> {
        instructions::create_series(ctx, year)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64, guard: Guard) -> Result<()> {
        instructions::deposit(ctx, amount, guard)
    }

    pub fn recombine(ctx: Context<Recombine>, amount: u64, guard: Guard) -> Result<()> {
        instructions::recombine(ctx, amount, guard)
    }

    pub fn upsert_event(ctx: Context<UpsertEvent>, input: EventInput) -> Result<()> {
        instructions::upsert_event(ctx, input)
    }

    pub fn begin_finalization(
        ctx: Context<BeginFinalization>,
        expected_journal_version: u64,
        expected_journal_hash: [u8; 32],
        coverage_digest: [u8; 32],
    ) -> Result<()> {
        instructions::begin_finalization(
            ctx,
            expected_journal_version,
            expected_journal_hash,
            coverage_digest,
        )
    }

    pub fn accumulate_event(ctx: Context<AccumulateEvent>) -> Result<()> {
        instructions::accumulate_event(ctx)
    }

    pub fn complete_finalization(ctx: Context<CompleteFinalization>) -> Result<()> {
        instructions::complete_finalization(ctx)
    }

    pub fn abort_finalization(ctx: Context<AbortFinalization>, reason_digest: [u8; 32]) -> Result<()> {
        instructions::abort_finalization(ctx, reason_digest)
    }

    pub fn redeem(
        ctx: Context<Redeem>,
        side: RedeemSide,
        amount: u64,
        allow_zero: bool,
        guard: Guard,
    ) -> Result<()> {
        instructions::redeem(ctx, side, amount, allow_zero, guard)
    }
}
