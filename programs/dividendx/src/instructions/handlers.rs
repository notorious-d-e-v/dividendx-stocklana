use anchor_lang::{prelude::*, solana_program::program_option::COption};
use solana_sha256_hasher::hashv;
use anchor_spl::{
    token::{self, Burn, Mint as LegacyMint, MintTo, SetAuthority, Token, TokenAccount as LegacyTokenAccount},
    token_2022::{self, Token2022},
    token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount},
};

use super::contexts::*;
use crate::{
    calendar::{is_in_year, parse_civil_date, year_bounds},
    error::DividendXError,
    math::{multiply_ratio, redemption_payout, require_qualified_factor, split_pools},
    state::*,
    token_profile::{inspect_mint, inspect_mint_for_exit, MintProfile, ScaleTuple},
};

pub fn initialize_config(ctx: Context<InitializeConfig>, domain: [u8; 32]) -> Result<()> {
    require_nonzero(domain, DividendXError::ZeroDeploymentDomain)?;
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.upgrade_authority.key();
    config.deployment_domain = domain;
    config.bump = ctx.bumps.config;
    Ok(())
}

pub fn register_asset(
    ctx: Context<RegisterAsset>,
    issuer_id: [u8; 32],
    symbol: String,
    attestor: Pubkey,
    policy_digest: [u8; 32],
) -> Result<()> {
    require_nonzero(issuer_id, DividendXError::InvalidAccountData)?;
    require_nonzero(policy_digest, DividendXError::ZeroPolicyDigest)?;
    require!(!symbol.is_empty() && symbol.as_bytes().len() <= 16, DividendXError::InvalidSymbol);
    require!(attestor != Pubkey::default() && attestor != ctx.accounts.config.admin, DividendXError::InvalidAccountData);
    let clock = Clock::get()?;
    let profile = inspect_mint(&ctx.accounts.collateral_mint.to_account_info(), clock.unix_timestamp)?;

    let asset = &mut ctx.accounts.asset_policy;
    asset.config = ctx.accounts.config.key();
    asset.issuer_id = issuer_id;
    asset.collateral_mint = ctx.accounts.collateral_mint.key();
    asset.symbol = symbol;
    asset.decimals = profile.decimals;
    asset.attestor = attestor;
    asset.policy_digest = policy_digest;
    asset.extensions_mask = profile.extensions_mask;
    asset.admission_enabled = true;
    set_reviewed_scale(asset, profile.scale);
    asset.reviewed_controls_fingerprint = profile.controls_fingerprint;
    asset.observed_slot = clock.slot;
    // Admin registration does not substitute for attestor review.
    asset.observation_valid_until = 0;
    asset.observation_evidence_digest = [0; 32];
    asset.bump = ctx.bumps.asset_policy;
    Ok(())
}

pub fn set_asset_admission(ctx: Context<SetAssetAdmission>, enabled: bool) -> Result<()> {
    ctx.accounts.asset_policy.admission_enabled = enabled;
    Ok(())
}

pub fn refresh_observation(
    ctx: Context<RefreshObservation>,
    evidence_digest: [u8; 32],
    valid_until: i64,
) -> Result<()> {
    require_nonzero(evidence_digest, DividendXError::ZeroEvidenceDigest)?;
    let clock = Clock::get()?;
    require!(valid_until > clock.unix_timestamp, DividendXError::InvalidObservationExpiry);
    require!(
        valid_until <= clock.unix_timestamp.saturating_add(MAX_OBSERVATION_LIFETIME),
        DividendXError::InvalidObservationExpiry
    );
    let profile = inspect_mint(&ctx.accounts.collateral_mint.to_account_info(), clock.unix_timestamp)?;
    let asset = &mut ctx.accounts.asset_policy;
    require!(profile.decimals == asset.decimals, DividendXError::UnsupportedDecimals);
    require!(profile.extensions_mask == asset.extensions_mask, DividendXError::ControlsChanged);
    require!(profile.controls_fingerprint == asset.reviewed_controls_fingerprint, DividendXError::ControlsChanged);
    set_reviewed_scale(asset, profile.scale);
    asset.observed_slot = clock.slot;
    asset.observation_valid_until = valid_until;
    asset.observation_evidence_digest = evidence_digest;
    Ok(())
}

pub fn create_series(ctx: Context<CreateSeries>, year: u16) -> Result<()> {
    let clock = Clock::get()?;
    let (start_timestamp, maturity_timestamp) = year_bounds(year)?;
    require!(clock.unix_timestamp < start_timestamp, DividendXError::DepositsClosed);
    let profile = require_admission(
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint.to_account_info(),
        &clock,
    )?;

    let series = &mut ctx.accounts.series;
    series.asset_policy = ctx.accounts.asset_policy.key();
    series.policy_digest = ctx.accounts.asset_policy.policy_digest;
    series.year = year;
    series.start_timestamp = start_timestamp;
    series.maturity_timestamp = maturity_timestamp;
    series.collateral_mint = ctx.accounts.collateral_mint.key();
    series.vault = ctx.accounts.vault.key();
    series.pt_mint = ctx.accounts.pt_mint.key();
    series.dr_mint = ctx.accounts.dr_mint.key();
    series.decimals = profile.decimals;
    series.phase = SeriesPhase::Open;
    series.nominal_backing = 0;
    series.event_count = 0;
    series.unresolved_count = 0;
    series.in_year_qualified_count = 0;
    series.journal_version = 0;
    series.journal_hash = initial_journal_hash(series.key(), series.policy_digest);
    series.state_version = 0;
    series.sealed_journal_version = 0;
    series.sealed_journal_hash = [0; 32];
    series.sealed_coverage_digest = [0; 32];
    series.sealed_event_count = 0;
    series.sealed_current_multiplier_bits = 0;
    series.sealed_new_multiplier_bits = 0;
    series.sealed_new_multiplier_effective_timestamp = 0;
    series.sealed_active_multiplier_bits = 0;
    series.sealed_controls_fingerprint = [0; 32];
    series.finalization_slot = 0;
    series.final_supply = 0;
    series.pt_pool = 0;
    series.dr_pool = 0;
    series.pt_redeemed_nominal = 0;
    series.dr_redeemed_nominal = 0;
    series.pt_paid = 0;
    series.dr_paid = 0;
    series.bump = ctx.bumps.series;
    series.pt_mint_bump = ctx.bumps.pt_mint;
    series.dr_mint_bump = ctx.bumps.dr_mint;

    let accumulator = &mut ctx.accounts.accumulator;
    accumulator.series = series.key();
    accumulator.cursor = 0;
    accumulator.numerator = vec![1];
    accumulator.denominator = vec![1];
    accumulator.bump = ctx.bumps.accumulator;
    Ok(())
}

pub fn deposit(ctx: Context<Deposit>, amount: u64, guard: Guard) -> Result<()> {
    require!(amount > 0, DividendXError::ZeroAmount);
    let clock = Clock::get()?;
    check_guard(&ctx.accounts.series, &guard, &clock, amount)?;
    require!(ctx.accounts.series.phase == SeriesPhase::Open, DividendXError::InvalidPhase);
    require!(
        funding_journal_open(
            ctx.accounts.series.unresolved_count,
            ctx.accounts.series.in_year_qualified_count,
        ),
        DividendXError::SeriesJournalStarted
    );
    require!(clock.unix_timestamp < ctx.accounts.series.start_timestamp, DividendXError::DepositsClosed);
    require_admission(
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint.to_account_info(),
        &clock,
    )?;
    validate_series_accounts(
        &ctx.accounts.series,
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault,
        &ctx.accounts.pt_mint,
        &ctx.accounts.dr_mint,
    )?;
    validate_holder_collateral(&ctx.accounts.holder_collateral, ctx.accounts.holder.key(), ctx.accounts.collateral_mint.key())?;
    validate_holder_claim(&ctx.accounts.holder_pt, ctx.accounts.holder.key(), ctx.accounts.pt_mint.key())?;
    validate_holder_claim(&ctx.accounts.holder_dr, ctx.accounts.holder.key(), ctx.accounts.dr_mint.key())?;
    require_distinct(&[
        ctx.accounts.holder_collateral.key(),
        ctx.accounts.vault.key(),
        ctx.accounts.holder_pt.key(),
        ctx.accounts.holder_dr.key(),
    ])?;
    require!(ctx.accounts.vault.amount >= ctx.accounts.series.nominal_backing, DividendXError::CustodyDeficit);
    require_claim_mint_open(&ctx.accounts.pt_mint, ctx.accounts.series.key(), ctx.accounts.series.decimals)?;
    require_claim_mint_open(&ctx.accounts.dr_mint, ctx.accounts.series.key(), ctx.accounts.series.decimals)?;

    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.collateral_token_program.key(),
            token_2022::TransferChecked {
                from: ctx.accounts.holder_collateral.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.holder.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.series.decimals,
    )?;

    let year_bytes = ctx.accounts.series.year.to_le_bytes();
    let bump = [ctx.accounts.series.bump];
    let signer_seeds: &[&[u8]] = &[
        b"series",
        ctx.accounts.series.asset_policy.as_ref(),
        &year_bytes,
        &bump,
    ];
    mint_claim(
        &ctx.accounts.token_program,
        &ctx.accounts.pt_mint,
        &ctx.accounts.holder_pt,
        &ctx.accounts.series,
        signer_seeds,
        amount,
    )?;
    mint_claim(
        &ctx.accounts.token_program,
        &ctx.accounts.dr_mint,
        &ctx.accounts.holder_dr,
        &ctx.accounts.series,
        signer_seeds,
        amount,
    )?;

    let series = &mut ctx.accounts.series;
    series.nominal_backing = series.nominal_backing.checked_add(amount).ok_or(DividendXError::ArithmeticOverflow)?;
    bump_state_version(series)
}

pub fn recombine(ctx: Context<Recombine>, amount: u64, guard: Guard) -> Result<()> {
    require!(amount > 0, DividendXError::ZeroAmount);
    let clock = Clock::get()?;
    check_guard(&ctx.accounts.series, &guard, &clock, amount)?;
    require!(ctx.accounts.series.phase != SeriesPhase::Finalized, DividendXError::InvalidPhase);
    require!(amount <= ctx.accounts.series.nominal_backing, DividendXError::AmountExceedsBacking);
    inspect_mint_for_exit(&ctx.accounts.collateral_mint.to_account_info(), clock.unix_timestamp)?;
    validate_series_accounts(
        &ctx.accounts.series,
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault,
        &ctx.accounts.pt_mint,
        &ctx.accounts.dr_mint,
    )?;
    validate_holder_claim(&ctx.accounts.holder_pt, ctx.accounts.holder.key(), ctx.accounts.pt_mint.key())?;
    validate_holder_claim(&ctx.accounts.holder_dr, ctx.accounts.holder.key(), ctx.accounts.dr_mint.key())?;
    validate_holder_collateral(&ctx.accounts.holder_collateral, ctx.accounts.holder.key(), ctx.accounts.collateral_mint.key())?;
    require_distinct(&[
        ctx.accounts.holder_pt.key(),
        ctx.accounts.holder_dr.key(),
        ctx.accounts.holder_collateral.key(),
        ctx.accounts.vault.key(),
    ])?;
    require!(ctx.accounts.vault.amount >= ctx.accounts.series.nominal_backing, DividendXError::CustodyDeficit);

    burn_claim(&ctx.accounts.token_program, &ctx.accounts.pt_mint, &ctx.accounts.holder_pt, &ctx.accounts.holder, amount)?;
    burn_claim(&ctx.accounts.token_program, &ctx.accounts.dr_mint, &ctx.accounts.holder_dr, &ctx.accounts.holder, amount)?;
    transfer_from_vault(
        &ctx.accounts.collateral_token_program,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault,
        &ctx.accounts.holder_collateral,
        &ctx.accounts.series,
        amount,
    )?;

    let series = &mut ctx.accounts.series;
    series.nominal_backing = series.nominal_backing.checked_sub(amount).ok_or(DividendXError::ArithmeticOverflow)?;
    bump_state_version(series)
}

pub fn upsert_event(ctx: Context<UpsertEvent>, input: EventInput) -> Result<()> {
    require!(ctx.accounts.series.phase == SeriesPhase::Open, DividendXError::InvalidPhase);
    require!(input.revision > 0, DividendXError::InvalidRevision);
    let clock = Clock::get()?;
    let (resolved, in_year_qualified) = validate_event_input(&input, ctx.accounts.series.year, &clock)?;

    let head_is_new = ctx.accounts.event_head.series == Pubkey::default();
    if !head_is_new {
        require_keys_eq!(ctx.accounts.event_head.series, ctx.accounts.series.key(), DividendXError::InvalidEventRelationship);
        require!(ctx.accounts.event_head.event_id == input.event_id, DividendXError::InvalidEventRelationship);
        if input.revision < ctx.accounts.event_head.latest_revision {
            return err!(DividendXError::LowerRevision);
        }
        if input.revision == ctx.accounts.event_head.latest_revision {
            require!(
                ctx.accounts.revision.record_hash == ctx.accounts.event_head.latest_record_hash
                    && ctx.accounts.revision.matches_input(&input, ctx.accounts.revision.previous_revision_hash),
                DividendXError::RevisionConflict
            );
            return Ok(());
        }
    } else {
        require!(ctx.accounts.series.event_count < MAX_EVENTS, DividendXError::EventLimitReached);
    }

    require!(ctx.accounts.revision.revision == 0, DividendXError::RevisionConflict);
    let previous_revision_hash = if head_is_new {
        [0; 32]
    } else {
        ctx.accounts.event_head.latest_record_hash
    };
    let record_hash = hash_event_record(ctx.accounts.series.key(), &input, previous_revision_hash)?;

    let revision = &mut ctx.accounts.revision;
    revision.event_head = ctx.accounts.event_head.key();
    revision.event_id = input.event_id;
    revision.revision = input.revision;
    revision.ex_date = input.ex_date;
    revision.status = input.status;
    revision.m0_bits = input.m0_bits;
    revision.m1_bits = input.m1_bits;
    revision.source_final = input.source_final;
    revision.original_effective_time = input.original_effective_time;
    revision.source_payment_date = input.source_payment_date;
    revision.observed_slot = input.observed_slot;
    revision.evidence_digest = input.evidence_digest;
    revision.previous_revision_hash = previous_revision_hash;
    revision.record_hash = record_hash;
    revision.bump = ctx.bumps.revision;

    let series = &mut ctx.accounts.series;
    let head = &mut ctx.accounts.event_head;
    if head_is_new {
        head.series = series.key();
        head.event_id = input.event_id;
        head.index = series.event_count;
        head.bump = ctx.bumps.event_head;
        series.event_count = series.event_count.checked_add(1).ok_or(DividendXError::ArithmeticOverflow)?;
    } else {
        if !head.latest_resolved {
            series.unresolved_count = series.unresolved_count.checked_sub(1).ok_or(DividendXError::ArithmeticOverflow)?;
        }
        if head.latest_in_year_qualified {
            series.in_year_qualified_count = series
                .in_year_qualified_count
                .checked_sub(1)
                .ok_or(DividendXError::ArithmeticOverflow)?;
        }
    }
    if !resolved {
        series.unresolved_count = series.unresolved_count.checked_add(1).ok_or(DividendXError::ArithmeticOverflow)?;
    }
    if in_year_qualified {
        series.in_year_qualified_count = series
            .in_year_qualified_count
            .checked_add(1)
            .ok_or(DividendXError::ArithmeticOverflow)?;
    }
    head.latest_revision = input.revision;
    head.latest_record_hash = record_hash;
    head.latest_resolved = resolved;
    head.latest_in_year_qualified = in_year_qualified;

    series.journal_version = series.journal_version.checked_add(1).ok_or(DividendXError::ArithmeticOverflow)?;
    series.journal_hash = hashv(&[
        b"dividendx:journal-history:v1".as_ref(),
        series.journal_hash.as_ref(),
        record_hash.as_ref(),
    ])
    .to_bytes();
    bump_state_version(series)
}

pub fn begin_finalization(
    ctx: Context<BeginFinalization>,
    expected_journal_version: u64,
    expected_journal_hash: [u8; 32],
    coverage_digest: [u8; 32],
) -> Result<()> {
    require_nonzero(coverage_digest, DividendXError::ZeroEvidenceDigest)?;
    let clock = Clock::get()?;
    require!(ctx.accounts.series.phase == SeriesPhase::Open, DividendXError::InvalidPhase);
    require!(clock.unix_timestamp >= ctx.accounts.series.maturity_timestamp, DividendXError::NotMature);
    require!(ctx.accounts.series.unresolved_count == 0, DividendXError::UnresolvedJournal);
    require!(
        ctx.accounts.series.journal_version == expected_journal_version
            && ctx.accounts.series.journal_hash == expected_journal_hash,
        DividendXError::JournalMismatch
    );
    let profile = require_reviewed_profile(
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint.to_account_info(),
        &clock,
    )?;
    validate_series_accounts(
        &ctx.accounts.series,
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault,
        &ctx.accounts.pt_mint,
        &ctx.accounts.dr_mint,
    )?;
    require!(ctx.accounts.vault.amount >= ctx.accounts.series.nominal_backing, DividendXError::CustodyDeficit);

    let series = &mut ctx.accounts.series;
    series.phase = SeriesPhase::Sealing;
    series.sealed_journal_version = expected_journal_version;
    series.sealed_journal_hash = expected_journal_hash;
    series.sealed_coverage_digest = coverage_digest;
    series.sealed_event_count = series.event_count;
    series.sealed_current_multiplier_bits = profile.scale.current_bits;
    series.sealed_new_multiplier_bits = profile.scale.new_bits;
    series.sealed_new_multiplier_effective_timestamp = profile.scale.effective_timestamp;
    series.sealed_active_multiplier_bits = profile.scale.active_bits;
    series.sealed_controls_fingerprint = profile.controls_fingerprint;
    let accumulator = &mut ctx.accounts.accumulator;
    accumulator.cursor = 0;
    accumulator.numerator = vec![1];
    accumulator.denominator = vec![1];
    bump_state_version(series)
}

pub fn accumulate_event(ctx: Context<AccumulateEvent>) -> Result<()> {
    require!(ctx.accounts.series.phase == SeriesPhase::Sealing, DividendXError::InvalidPhase);
    require!(ctx.accounts.accumulator.cursor < ctx.accounts.series.sealed_event_count, DividendXError::InvalidAccumulatorCursor);
    require!(ctx.accounts.event_head.index == ctx.accounts.accumulator.cursor, DividendXError::InvalidAccumulatorCursor);
    require_keys_eq!(ctx.accounts.event_head.series, ctx.accounts.series.key(), DividendXError::InvalidEventRelationship);
    require_keys_eq!(ctx.accounts.revision.event_head, ctx.accounts.event_head.key(), DividendXError::InvalidEventRelationship);
    require!(
        ctx.accounts.revision.revision == ctx.accounts.event_head.latest_revision
            && ctx.accounts.revision.record_hash == ctx.accounts.event_head.latest_record_hash,
        DividendXError::InvalidEventRelationship
    );

    let accumulator = &mut ctx.accounts.accumulator;
    if ctx.accounts.event_head.latest_in_year_qualified {
        let (numerator, denominator) = multiply_ratio(
            &accumulator.numerator,
            &accumulator.denominator,
            ctx.accounts.revision.m0_bits,
            ctx.accounts.revision.m1_bits,
        )?;
        accumulator.numerator = numerator;
        accumulator.denominator = denominator;
    }
    accumulator.cursor = accumulator.cursor.checked_add(1).ok_or(DividendXError::ArithmeticOverflow)?;
    bump_state_version(&mut ctx.accounts.series)
}

pub fn complete_finalization(ctx: Context<CompleteFinalization>) -> Result<()> {
    let clock = Clock::get()?;
    require!(ctx.accounts.series.phase == SeriesPhase::Sealing, DividendXError::InvalidPhase);
    require!(
        ctx.accounts.accumulator.cursor == ctx.accounts.series.sealed_event_count,
        DividendXError::AccumulationIncomplete
    );
    let profile = inspect_mint(&ctx.accounts.collateral_mint.to_account_info(), clock.unix_timestamp)?;
    require!(profile.extensions_mask == ctx.accounts.asset_policy.extensions_mask, DividendXError::ControlsChanged);
    require!(
        profile.controls_fingerprint == ctx.accounts.series.sealed_controls_fingerprint
            && profile.controls_fingerprint == ctx.accounts.asset_policy.reviewed_controls_fingerprint,
        DividendXError::ControlsChanged
    );
    require_scale_equals_seal(&ctx.accounts.series, profile.scale)?;
    validate_series_accounts(
        &ctx.accounts.series,
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault,
        &ctx.accounts.pt_mint,
        &ctx.accounts.dr_mint,
    )?;
    require!(ctx.accounts.vault.amount >= ctx.accounts.series.nominal_backing, DividendXError::CustodyDeficit);
    require_claim_mint_open(&ctx.accounts.pt_mint, ctx.accounts.series.key(), ctx.accounts.series.decimals)?;
    require_claim_mint_open(&ctx.accounts.dr_mint, ctx.accounts.series.key(), ctx.accounts.series.decimals)?;
    let (pt_pool, dr_pool) = split_pools(
        ctx.accounts.series.nominal_backing,
        &ctx.accounts.accumulator.numerator,
        &ctx.accounts.accumulator.denominator,
    )?;

    let year_bytes = ctx.accounts.series.year.to_le_bytes();
    let bump = [ctx.accounts.series.bump];
    let signer_seeds: &[&[u8]] = &[
        b"series",
        ctx.accounts.series.asset_policy.as_ref(),
        &year_bytes,
        &bump,
    ];
    revoke_mint_authority(&ctx.accounts.token_program, &ctx.accounts.pt_mint, &ctx.accounts.series, signer_seeds)?;
    revoke_mint_authority(&ctx.accounts.token_program, &ctx.accounts.dr_mint, &ctx.accounts.series, signer_seeds)?;

    let series = &mut ctx.accounts.series;
    series.final_supply = series.nominal_backing;
    series.pt_pool = pt_pool;
    series.dr_pool = dr_pool;
    series.finalization_slot = clock.slot;
    series.phase = SeriesPhase::Finalized;
    bump_state_version(series)
}

pub fn abort_finalization(ctx: Context<AbortFinalization>, reason_digest: [u8; 32]) -> Result<()> {
    require_nonzero(reason_digest, DividendXError::ZeroEvidenceDigest)?;
    require!(ctx.accounts.series.phase == SeriesPhase::Sealing, DividendXError::InvalidPhase);
    let series = &mut ctx.accounts.series;
    series.phase = SeriesPhase::Open;
    series.sealed_journal_version = 0;
    series.sealed_journal_hash = [0; 32];
    series.sealed_coverage_digest = [0; 32];
    series.sealed_event_count = 0;
    series.sealed_current_multiplier_bits = 0;
    series.sealed_new_multiplier_bits = 0;
    series.sealed_new_multiplier_effective_timestamp = 0;
    series.sealed_active_multiplier_bits = 0;
    series.sealed_controls_fingerprint = [0; 32];
    let accumulator = &mut ctx.accounts.accumulator;
    accumulator.cursor = 0;
    accumulator.numerator = vec![1];
    accumulator.denominator = vec![1];
    bump_state_version(series)
}

pub fn redeem(
    ctx: Context<Redeem>,
    side: RedeemSide,
    amount: u64,
    allow_zero: bool,
    guard: Guard,
) -> Result<()> {
    require!(amount > 0, DividendXError::ZeroAmount);
    let clock = Clock::get()?;
    require!(ctx.accounts.series.phase == SeriesPhase::Finalized, DividendXError::InvalidPhase);
    inspect_mint_for_exit(&ctx.accounts.collateral_mint.to_account_info(), clock.unix_timestamp)?;
    validate_exit_accounts(
        &ctx.accounts.series,
        &ctx.accounts.asset_policy,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault,
    )?;
    validate_holder_collateral(&ctx.accounts.holder_collateral, ctx.accounts.holder.key(), ctx.accounts.collateral_mint.key())?;
    validate_holder_claim(&ctx.accounts.holder_claim, ctx.accounts.holder.key(), ctx.accounts.claim_mint.key())?;
    require_distinct(&[
        ctx.accounts.holder_claim.key(),
        ctx.accounts.holder_collateral.key(),
        ctx.accounts.vault.key(),
    ])?;

    let (expected_mint, redeemed_before, pool) = match side {
        RedeemSide::Pt => (
            ctx.accounts.series.pt_mint,
            ctx.accounts.series.pt_redeemed_nominal,
            ctx.accounts.series.pt_pool,
        ),
        RedeemSide::Dr => (
            ctx.accounts.series.dr_mint,
            ctx.accounts.series.dr_redeemed_nominal,
            ctx.accounts.series.dr_pool,
        ),
    };
    require_keys_eq!(ctx.accounts.claim_mint.key(), expected_mint, DividendXError::InvalidTokenMint);
    require_claim_mint_final(&ctx.accounts.claim_mint, ctx.accounts.series.decimals)?;
    let payout = redemption_payout(redeemed_before, amount, pool, ctx.accounts.series.final_supply)?;
    check_guard(&ctx.accounts.series, &guard, &clock, payout)?;
    require!(payout > 0 || allow_zero, DividendXError::ZeroOutputConsentRequired);
    let obligations = remaining_obligations(&ctx.accounts.series)?;
    require!(ctx.accounts.vault.amount >= obligations, DividendXError::CustodyDeficit);

    burn_claim(
        &ctx.accounts.token_program,
        &ctx.accounts.claim_mint,
        &ctx.accounts.holder_claim,
        &ctx.accounts.holder,
        amount,
    )?;
    if payout > 0 {
        transfer_from_vault(
            &ctx.accounts.collateral_token_program,
            &ctx.accounts.collateral_mint,
            &ctx.accounts.vault,
            &ctx.accounts.holder_collateral,
            &ctx.accounts.series,
            payout,
        )?;
    }

    let series = &mut ctx.accounts.series;
    match side {
        RedeemSide::Pt => {
            series.pt_redeemed_nominal = series.pt_redeemed_nominal.checked_add(amount).ok_or(DividendXError::ArithmeticOverflow)?;
            series.pt_paid = series.pt_paid.checked_add(payout).ok_or(DividendXError::ArithmeticOverflow)?;
        }
        RedeemSide::Dr => {
            series.dr_redeemed_nominal = series.dr_redeemed_nominal.checked_add(amount).ok_or(DividendXError::ArithmeticOverflow)?;
            series.dr_paid = series.dr_paid.checked_add(payout).ok_or(DividendXError::ArithmeticOverflow)?;
        }
    }
    bump_state_version(series)
}

fn require_nonzero(value: [u8; 32], error: DividendXError) -> Result<()> {
    if value == [0; 32] {
        return Err(error.into());
    }
    Ok(())
}

fn set_reviewed_scale(asset: &mut AssetPolicy, scale: ScaleTuple) {
    asset.reviewed_current_multiplier_bits = scale.current_bits;
    asset.reviewed_new_multiplier_bits = scale.new_bits;
    asset.reviewed_new_multiplier_effective_timestamp = scale.effective_timestamp;
    asset.reviewed_active_multiplier_bits = scale.active_bits;
}

fn require_admission<'info>(
    asset: &AssetPolicy,
    collateral_mint: &AccountInfo<'info>,
    clock: &Clock,
) -> Result<MintProfile> {
    require!(asset.admission_enabled, DividendXError::AdmissionDisabled);
    require_reviewed_profile(asset, collateral_mint, clock)
}

fn require_reviewed_profile<'info>(
    asset: &AssetPolicy,
    collateral_mint: &AccountInfo<'info>,
    clock: &Clock,
) -> Result<MintProfile> {
    require!(
        asset.observation_evidence_digest != [0; 32]
            && asset.observation_valid_until >= clock.unix_timestamp
            && asset.observed_slot <= clock.slot,
        DividendXError::ObservationStale
    );
    let profile = inspect_mint(collateral_mint, clock.unix_timestamp)?;
    require!(profile.decimals == asset.decimals, DividendXError::UnsupportedDecimals);
    require!(profile.extensions_mask == asset.extensions_mask, DividendXError::ControlsChanged);
    require!(profile.controls_fingerprint == asset.reviewed_controls_fingerprint, DividendXError::ControlsChanged);
    require_scale_equals_review(asset, profile.scale)?;
    Ok(profile)
}

fn require_scale_equals_review(asset: &AssetPolicy, scale: ScaleTuple) -> Result<()> {
    require!(
        scale.current_bits == asset.reviewed_current_multiplier_bits
            && scale.new_bits == asset.reviewed_new_multiplier_bits
            && scale.effective_timestamp == asset.reviewed_new_multiplier_effective_timestamp,
        DividendXError::ScaleTupleChanged
    );
    require!(scale.active_bits == asset.reviewed_active_multiplier_bits, DividendXError::ActiveScaleChanged);
    Ok(())
}

fn require_scale_equals_seal(series: &Series, scale: ScaleTuple) -> Result<()> {
    require!(
        scale.current_bits == series.sealed_current_multiplier_bits
            && scale.new_bits == series.sealed_new_multiplier_bits
            && scale.effective_timestamp == series.sealed_new_multiplier_effective_timestamp,
        DividendXError::ScaleTupleChanged
    );
    require!(scale.active_bits == series.sealed_active_multiplier_bits, DividendXError::ActiveScaleChanged);
    Ok(())
}

fn check_guard(series: &Series, guard: &Guard, clock: &Clock, raw_output: u64) -> Result<()> {
    require!(guard.expected_state_version == series.state_version, DividendXError::GuardVersionMismatch);
    require!(clock.unix_timestamp <= guard.expiry_unix_timestamp, DividendXError::GuardExpired);
    require!(raw_output >= guard.minimum_raw_output, DividendXError::MinimumOutputNotMet);
    Ok(())
}

fn validate_series_accounts(
    series: &Account<'_, Series>,
    asset: &Account<'_, AssetPolicy>,
    collateral_mint: &InterfaceAccount<'_, InterfaceMint>,
    vault: &InterfaceAccount<'_, InterfaceTokenAccount>,
    pt_mint: &Account<'_, LegacyMint>,
    dr_mint: &Account<'_, LegacyMint>,
) -> Result<()> {
    validate_exit_accounts(series, asset, collateral_mint, vault)?;
    require_keys_eq!(pt_mint.key(), series.pt_mint, DividendXError::InvalidTokenMint);
    require_keys_eq!(dr_mint.key(), series.dr_mint, DividendXError::InvalidTokenMint);
    require_keys_neq!(pt_mint.key(), dr_mint.key(), DividendXError::AccountsNotDistinct);
    require_keys_eq!(*pt_mint.to_account_info().owner, anchor_spl::token::ID, DividendXError::InvalidTokenProgram);
    require_keys_eq!(*dr_mint.to_account_info().owner, anchor_spl::token::ID, DividendXError::InvalidTokenProgram);
    Ok(())
}

fn validate_exit_accounts(
    series: &Account<'_, Series>,
    asset: &Account<'_, AssetPolicy>,
    collateral_mint: &InterfaceAccount<'_, InterfaceMint>,
    vault: &InterfaceAccount<'_, InterfaceTokenAccount>,
) -> Result<()> {
    require_keys_eq!(series.asset_policy, asset.key(), DividendXError::InvalidAccountData);
    require!(series.policy_digest == asset.policy_digest, DividendXError::InvalidAccountData);
    require_keys_eq!(collateral_mint.key(), series.collateral_mint, DividendXError::InvalidTokenMint);
    require_keys_eq!(*collateral_mint.to_account_info().owner, anchor_spl::token_2022::ID, DividendXError::InvalidTokenProgram);
    require_keys_eq!(vault.key(), series.vault, DividendXError::InvalidAccountData);
    require_keys_eq!(*vault.to_account_info().owner, anchor_spl::token_2022::ID, DividendXError::InvalidTokenProgram);
    require_keys_eq!(vault.mint, series.collateral_mint, DividendXError::InvalidTokenMint);
    require_keys_eq!(vault.owner, series.key(), DividendXError::InvalidTokenOwner);
    require!(vault.delegate == COption::None && vault.close_authority == COption::None, DividendXError::UnsafeVaultAuthority);
    require!(vault.state == anchor_spl::token_2022::spl_token_2022::state::AccountState::Initialized, DividendXError::UnsafeVaultState);
    Ok(())
}

fn validate_holder_collateral(
    account: &InterfaceAccount<'_, InterfaceTokenAccount>,
    holder: Pubkey,
    mint: Pubkey,
) -> Result<()> {
    require_keys_eq!(*account.to_account_info().owner, anchor_spl::token_2022::ID, DividendXError::InvalidTokenProgram);
    require_keys_eq!(account.owner, holder, DividendXError::InvalidTokenOwner);
    require_keys_eq!(account.mint, mint, DividendXError::InvalidTokenMint);
    require!(account.state == anchor_spl::token_2022::spl_token_2022::state::AccountState::Initialized, DividendXError::UnsafeVaultState);
    Ok(())
}

fn validate_holder_claim(account: &Account<'_, LegacyTokenAccount>, holder: Pubkey, mint: Pubkey) -> Result<()> {
    require_keys_eq!(*account.to_account_info().owner, anchor_spl::token::ID, DividendXError::InvalidTokenProgram);
    require_keys_eq!(account.owner, holder, DividendXError::InvalidTokenOwner);
    require_keys_eq!(account.mint, mint, DividendXError::InvalidTokenMint);
    require!(account.state == anchor_spl::token::spl_token::state::AccountState::Initialized, DividendXError::UnsafeVaultState);
    Ok(())
}

fn require_claim_mint_open(mint: &Account<'_, LegacyMint>, series: Pubkey, decimals: u8) -> Result<()> {
    require!(mint.decimals == decimals, DividendXError::UnsupportedDecimals);
    require!(mint.mint_authority == COption::Some(series), DividendXError::InvalidClaimMintAuthority);
    require!(mint.freeze_authority == COption::None, DividendXError::InvalidClaimFreezeAuthority);
    Ok(())
}

fn require_claim_mint_final(mint: &Account<'_, LegacyMint>, decimals: u8) -> Result<()> {
    require!(mint.decimals == decimals, DividendXError::UnsupportedDecimals);
    require!(mint.mint_authority == COption::None, DividendXError::InvalidClaimMintAuthority);
    require!(mint.freeze_authority == COption::None, DividendXError::InvalidClaimFreezeAuthority);
    Ok(())
}

fn require_distinct(keys: &[Pubkey]) -> Result<()> {
    for (index, key) in keys.iter().enumerate() {
        for other in keys.iter().skip(index + 1) {
            require!(key != other, DividendXError::AccountsNotDistinct);
        }
    }
    Ok(())
}

fn mint_claim<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, LegacyMint>,
    destination: &Account<'info, LegacyTokenAccount>,
    series: &Account<'info, Series>,
    signer_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    token::mint_to(
        CpiContext::new_with_signer(
            token_program.key(),
            MintTo {
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: series.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )
}

fn burn_claim<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, LegacyMint>,
    source: &Account<'info, LegacyTokenAccount>,
    holder: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    token::burn(
        CpiContext::new(
            token_program.key(),
            Burn {
                mint: mint.to_account_info(),
                from: source.to_account_info(),
                authority: holder.to_account_info(),
            },
        ),
        amount,
    )
}

fn transfer_from_vault<'info>(
    token_program: &Program<'info, Token2022>,
    mint: &InterfaceAccount<'info, InterfaceMint>,
    vault: &InterfaceAccount<'info, InterfaceTokenAccount>,
    destination: &InterfaceAccount<'info, InterfaceTokenAccount>,
    series: &Account<'info, Series>,
    amount: u64,
) -> Result<()> {
    let year_bytes = series.year.to_le_bytes();
    let bump = [series.bump];
    let signer_seeds: &[&[u8]] = &[
        b"series",
        series.asset_policy.as_ref(),
        &year_bytes,
        &bump,
    ];
    token_2022::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            token_2022::TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: series.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        series.decimals,
    )
}

fn revoke_mint_authority<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, LegacyMint>,
    series: &Account<'info, Series>,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    token::set_authority(
        CpiContext::new_with_signer(
            token_program.key(),
            SetAuthority {
                current_authority: series.to_account_info(),
                account_or_mint: mint.to_account_info(),
            },
            &[signer_seeds],
        ),
        token::spl_token::instruction::AuthorityType::MintTokens,
        None,
    )
}

fn validate_event_input(input: &EventInput, series_year: u16, clock: &Clock) -> Result<(bool, bool)> {
    require_nonzero(input.event_id, DividendXError::InvalidAccountData)?;
    require_nonzero(input.evidence_digest, DividendXError::ZeroEvidenceDigest)?;
    require!(input.status <= STATUS_UNSUPPORTED, DividendXError::InvalidEventStatus);
    if input.ex_date != 0 {
        parse_civil_date(input.ex_date)?;
    }
    if input.source_payment_date != 0 {
        parse_civil_date(input.source_payment_date)?;
    }
    if input.status == STATUS_QUALIFIED {
        require_qualified_factor(input.m0_bits, input.m1_bits)?;
        if input.source_final {
            require!(
                input.original_effective_time <= clock.unix_timestamp && input.observed_slot <= clock.slot,
                DividendXError::FutureEventData
            );
        }
    } else {
        require!(input.m0_bits == 0 && input.m1_bits == 0, DividendXError::UnexpectedEventFactor);
    }
    let resolved_status = matches!(input.status, STATUS_QUALIFIED | STATUS_CONFIRMED_ZERO | STATUS_CANCELLED);
    let resolved = resolved_status && input.source_final && input.ex_date != 0;
    let in_year_qualified = resolved && input.status == STATUS_QUALIFIED && is_in_year(input.ex_date, series_year);
    Ok((resolved, in_year_qualified))
}

fn initial_journal_hash(series: Pubkey, policy_digest: [u8; 32]) -> [u8; 32] {
    hashv(&[
        b"dividendx:journal-genesis:v1".as_ref(),
        series.as_ref(),
        policy_digest.as_ref(),
    ])
    .to_bytes()
}

fn hash_event_record(series: Pubkey, input: &EventInput, previous_revision_hash: [u8; 32]) -> Result<[u8; 32]> {
    let mut encoded = Vec::new();
    input.serialize(&mut encoded)?;
    Ok(hashv(&[
        b"dividendx:event-revision:v1".as_ref(),
        series.as_ref(),
        previous_revision_hash.as_ref(),
        encoded.as_ref(),
    ])
    .to_bytes())
}

fn bump_state_version(series: &mut Series) -> Result<()> {
    series.state_version = series.state_version.checked_add(1).ok_or(DividendXError::ArithmeticOverflow)?;
    Ok(())
}

fn remaining_obligations(series: &Series) -> Result<u64> {
    let pt = series.pt_pool.checked_sub(series.pt_paid).ok_or(DividendXError::ArithmeticOverflow)?;
    let dr = series.dr_pool.checked_sub(series.dr_paid).ok_or(DividendXError::ArithmeticOverflow)?;
    pt.checked_add(dr).ok_or(DividendXError::ArithmeticOverflow.into())
}

fn funding_journal_open(unresolved_count: u8, in_year_qualified_count: u8) -> bool {
    unresolved_count == 0 && in_year_qualified_count == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clock() -> Clock {
        Clock {
            slot: 100,
            unix_timestamp: 1_800_000_000,
            ..Clock::default()
        }
    }

    fn qualified(ex_date: u32) -> EventInput {
        EventInput {
            event_id: [1; 32],
            revision: 1,
            ex_date,
            status: STATUS_QUALIFIED,
            m0_bits: 1_f64.to_bits(),
            m1_bits: 1.1_f64.to_bits(),
            source_final: true,
            original_effective_time: 1_799_999_999,
            source_payment_date: 20270401,
            observed_slot: 99,
            evidence_digest: [2; 32],
        }
    }

    #[test]
    fn qualified_unknown_date_is_accepted_but_unresolved() {
        assert_eq!(validate_event_input(&qualified(0), 2027, &clock()).unwrap(), (false, false));
    }

    #[test]
    fn exact_year_membership_uses_civil_date() {
        assert_eq!(validate_event_input(&qualified(20270101), 2027, &clock()).unwrap(), (true, true));
        assert_eq!(validate_event_input(&qualified(20271231), 2027, &clock()).unwrap(), (true, true));
        assert_eq!(validate_event_input(&qualified(20280101), 2027, &clock()).unwrap(), (true, false));
    }

    #[test]
    fn nonqualified_factor_bits_are_rejected() {
        let mut input = qualified(20270101);
        input.status = STATUS_CANCELLED;
        assert!(validate_event_input(&input, 2027, &clock()).is_err());
        input.m0_bits = 0;
        input.m1_bits = 0;
        assert_eq!(validate_event_input(&input, 2027, &clock()).unwrap(), (true, false));
    }

    #[test]
    fn resolved_nonmember_records_do_not_permanently_close_funding() {
        assert!(funding_journal_open(0, 0));
        assert!(!funding_journal_open(1, 0));
        assert!(!funding_journal_open(0, 1));
    }
}
