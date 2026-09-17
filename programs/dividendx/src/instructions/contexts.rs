use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint as LegacyMint, Token, TokenAccount as LegacyTokenAccount},
    token_2022::Token2022,
    token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount},
};

use crate::{error::DividendXError, state::*};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer = upgrade_authority, seeds = [b"config"], bump, space = 8 + Config::INIT_SPACE)]
    pub config: Box<Account<'info, Config>>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::Dividendx>,
    #[account(constraint = program_data.upgrade_authority_address == Some(upgrade_authority.key()))]
    pub program_data: Box<Account<'info, ProgramData>>,
    #[account(mut)]
    pub upgrade_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(issuer_id: [u8; 32])]
pub struct RegisterAsset<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: owner and Token-2022 mint data are validated by inspect_mint.
    #[account(owner = anchor_spl::token_2022::ID)]
    pub collateral_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        seeds = [b"asset", issuer_id.as_ref(), collateral_mint.key().as_ref()],
        bump,
        space = 8 + AssetPolicy::INIT_SPACE
    )]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAssetAdmission<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
    pub admin: Signer<'info>,
    #[account(mut, has_one = config)]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
}

#[derive(Accounts)]
pub struct RefreshObservation<'info> {
    pub attestor: Signer<'info>,
    #[account(
        mut,
        has_one = attestor,
        constraint = asset_policy.collateral_mint == collateral_mint.key() @ DividendXError::InvalidTokenMint
    )]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    /// CHECK: owner and Token-2022 mint data are validated by inspect_mint.
    #[account(owner = anchor_spl::token_2022::ID)]
    pub collateral_mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(year: u16)]
pub struct CreateSeries<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [b"asset", asset_policy.issuer_id.as_ref(), collateral_mint.key().as_ref()],
        bump = asset_policy.bump,
        constraint = asset_policy.collateral_mint == collateral_mint.key() @ DividendXError::InvalidTokenMint
    )]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(
        init,
        payer = payer,
        seeds = [b"series", asset_policy.key().as_ref(), &year.to_le_bytes()],
        bump,
        space = 8 + Series::INIT_SPACE
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init,
        payer = payer,
        seeds = [b"accumulator", series.key().as_ref()],
        bump,
        space = 8 + Accumulator::INIT_SPACE
    )]
    pub accumulator: Box<Account<'info, Accumulator>>,
    #[account(
        init,
        payer = payer,
        seeds = [b"pt", series.key().as_ref()],
        bump,
        mint::decimals = asset_policy.decimals,
        mint::authority = series,
        mint::token_program = token_program
    )]
    pub pt_mint: Box<Account<'info, LegacyMint>>,
    #[account(
        init,
        payer = payer,
        seeds = [b"dr", series.key().as_ref()],
        bump,
        mint::decimals = asset_policy.decimals,
        mint::authority = series,
        mint::token_program = token_program
    )]
    pub dr_mint: Box<Account<'info, LegacyMint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = collateral_mint,
        associated_token::authority = series,
        associated_token::token_program = collateral_token_program
    )]
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub collateral_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub holder: Signer<'info>,
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    pub collateral_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub holder_collateral: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub pt_mint: Box<Account<'info, LegacyMint>>,
    #[account(mut)]
    pub dr_mint: Box<Account<'info, LegacyMint>>,
    #[account(mut)]
    pub holder_pt: Box<Account<'info, LegacyTokenAccount>>,
    #[account(mut)]
    pub holder_dr: Box<Account<'info, LegacyTokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub collateral_token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Recombine<'info> {
    pub holder: Signer<'info>,
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    pub collateral_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub holder_collateral: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub pt_mint: Box<Account<'info, LegacyMint>>,
    #[account(mut)]
    pub dr_mint: Box<Account<'info, LegacyMint>>,
    #[account(mut)]
    pub holder_pt: Box<Account<'info, LegacyTokenAccount>>,
    #[account(mut)]
    pub holder_dr: Box<Account<'info, LegacyTokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub collateral_token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
#[instruction(input: EventInput)]
pub struct UpsertEvent<'info> {
    #[account(mut)]
    pub attestor: Signer<'info>,
    #[account(has_one = attestor)]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init_if_needed,
        payer = attestor,
        seeds = [b"event", series.key().as_ref(), input.event_id.as_ref()],
        bump,
        space = 8 + EventHead::INIT_SPACE
    )]
    pub event_head: Box<Account<'info, EventHead>>,
    #[account(
        init_if_needed,
        payer = attestor,
        seeds = [b"revision", event_head.key().as_ref(), &input.revision.to_le_bytes()],
        bump,
        space = 8 + EventRevision::INIT_SPACE
    )]
    pub revision: Box<Account<'info, EventRevision>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BeginFinalization<'info> {
    pub attestor: Signer<'info>,
    #[account(has_one = attestor)]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"accumulator", series.key().as_ref()], bump = accumulator.bump, has_one = series)]
    pub accumulator: Box<Account<'info, Accumulator>>,
    pub collateral_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    pub pt_mint: Box<Account<'info, LegacyMint>>,
    pub dr_mint: Box<Account<'info, LegacyMint>>,
}

#[derive(Accounts)]
pub struct AccumulateEvent<'info> {
    pub keeper: Signer<'info>,
    #[account(mut)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"accumulator", series.key().as_ref()], bump = accumulator.bump, has_one = series)]
    pub accumulator: Box<Account<'info, Accumulator>>,
    pub event_head: Box<Account<'info, EventHead>>,
    pub revision: Box<Account<'info, EventRevision>>,
}

#[derive(Accounts)]
pub struct CompleteFinalization<'info> {
    pub keeper: Signer<'info>,
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    #[account(seeds = [b"accumulator", series.key().as_ref()], bump = accumulator.bump, has_one = series)]
    pub accumulator: Box<Account<'info, Accumulator>>,
    pub collateral_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub pt_mint: Box<Account<'info, LegacyMint>>,
    #[account(mut)]
    pub dr_mint: Box<Account<'info, LegacyMint>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AbortFinalization<'info> {
    pub attestor: Signer<'info>,
    #[account(has_one = attestor)]
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"accumulator", series.key().as_ref()], bump = accumulator.bump, has_one = series)]
    pub accumulator: Box<Account<'info, Accumulator>>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub holder: Signer<'info>,
    pub asset_policy: Box<Account<'info, AssetPolicy>>,
    #[account(mut, has_one = asset_policy)]
    pub series: Box<Account<'info, Series>>,
    pub collateral_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub holder_collateral: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub claim_mint: Box<Account<'info, LegacyMint>>,
    #[account(mut)]
    pub holder_claim: Box<Account<'info, LegacyTokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub collateral_token_program: Program<'info, Token2022>,
}
