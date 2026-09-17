use anchor_lang::{prelude::*, solana_program::program_option::COption};
use solana_sha256_hasher::hashv;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        confidential_transfer::ConfidentialTransferMint,
        default_account_state::DefaultAccountState,
        metadata_pointer::MetadataPointer,
        mint_close_authority::MintCloseAuthority,
        pausable::PausableConfig,
        permanent_delegate::PermanentDelegate,
        scaled_ui_amount::ScaledUiAmountConfig,
        transfer_hook::TransferHook,
        BaseStateWithExtensions, ExtensionType, StateWithExtensions,
    },
    state::{AccountState, Mint},
};

use crate::{error::DividendXError, math::decode_multiplier};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScaleTuple {
    pub current_bits: u64,
    pub new_bits: u64,
    pub effective_timestamp: i64,
    pub active_bits: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MintProfile {
    pub decimals: u8,
    pub extensions_mask: u64,
    pub scale: ScaleTuple,
    pub controls_fingerprint: [u8; 32],
}

pub fn inspect_mint(mint_info: &AccountInfo<'_>, unix_timestamp: i64) -> Result<MintProfile> {
    inspect_mint_inner(mint_info, unix_timestamp, true)
}

pub fn inspect_mint_for_exit(mint_info: &AccountInfo<'_>, unix_timestamp: i64) -> Result<MintProfile> {
    inspect_mint_inner(mint_info, unix_timestamp, false)
}

fn inspect_mint_inner(
    mint_info: &AccountInfo<'_>,
    unix_timestamp: i64,
    enforce_factor_bounds: bool,
) -> Result<MintProfile> {
    require_keys_eq!(*mint_info.owner, anchor_spl::token_2022::ID, DividendXError::InvalidTokenProgram);
    let data = mint_info.try_borrow_data()?;
    let mint = StateWithExtensions::<Mint>::unpack(&data)
        .map_err(|_| error!(DividendXError::InvalidAccountData))?;
    require!(mint.base.is_initialized, DividendXError::MintNotInitialized);
    require!([6_u8, 8, 9].contains(&mint.base.decimals), DividendXError::UnsupportedDecimals);

    let mut extension_types = mint
        .get_extension_types()
        .map_err(|_| error!(DividendXError::InvalidAccountData))?;
    extension_types.sort_by_key(|extension_type| u16::from(*extension_type));
    for pair in extension_types.windows(2) {
        require!(pair[0] != pair[1], DividendXError::InvalidAccountData);
    }
    let mut mask = 0_u64;
    let mut fingerprint = Vec::with_capacity(512);
    fingerprint.extend_from_slice(b"dividendx:mint-controls:v1");
    fingerprint.extend_from_slice(mint_info.key.as_ref());
    push_coption_pubkey(&mut fingerprint, mint.base.mint_authority);
    push_coption_pubkey(&mut fingerprint, mint.base.freeze_authority);

    let mut scale = None;
    for extension_type in extension_types {
        let discriminant = u16::from(extension_type);
        require!(discriminant < 64, DividendXError::UnsupportedMintExtension);
        mask |= 1_u64 << discriminant;
        fingerprint.extend_from_slice(&discriminant.to_le_bytes());
        match extension_type {
            ExtensionType::ScaledUiAmount => {
                let extension = mint
                    .get_extension::<ScaledUiAmountConfig>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                let current_bits = u64::from_le_bytes(extension.multiplier.0);
                let new_bits = u64::from_le_bytes(extension.new_multiplier.0);
                let effective_timestamp = i64::from(extension.new_multiplier_effective_timestamp);
                if enforce_factor_bounds {
                    decode_multiplier(current_bits)?;
                    decode_multiplier(new_bits)?;
                }
                let active_bits = if unix_timestamp >= effective_timestamp {
                    new_bits
                } else {
                    current_bits
                };
                scale = Some(ScaleTuple {
                    current_bits,
                    new_bits,
                    effective_timestamp,
                    active_bits,
                });
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.authority));
            }
            ExtensionType::MetadataPointer => {
                let extension = mint
                    .get_extension::<MetadataPointer>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.authority));
            }
            ExtensionType::TokenMetadata => {
                // Display metadata is deliberately excluded from the economic fingerprint.
            }
            ExtensionType::MintCloseAuthority => {
                let extension = mint
                    .get_extension::<MintCloseAuthority>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.close_authority));
            }
            ExtensionType::PermanentDelegate => {
                let extension = mint
                    .get_extension::<PermanentDelegate>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.delegate));
            }
            ExtensionType::DefaultAccountState => {
                let extension = mint
                    .get_extension::<DefaultAccountState>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                require!(extension.state == AccountState::Initialized as u8, DividendXError::DefaultAccountStateNotInitialized);
                fingerprint.extend_from_slice(bytemuck::bytes_of(extension));
            }
            ExtensionType::TransferHook => {
                let extension = mint
                    .get_extension::<TransferHook>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                let hook_program: Option<Pubkey> = extension.program_id.into();
                require!(hook_program.is_none(), DividendXError::ActiveTransferHook);
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.authority));
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.program_id));
            }
            ExtensionType::Pausable => {
                let extension = mint
                    .get_extension::<PausableConfig>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                require!(!bool::from(extension.paused), DividendXError::MintPaused);
                fingerprint.extend_from_slice(bytemuck::bytes_of(&extension.authority));
            }
            ExtensionType::ConfidentialTransferMint => {
                let extension = mint
                    .get_extension::<ConfidentialTransferMint>()
                    .map_err(|_| error!(DividendXError::InvalidAccountData))?;
                fingerprint.extend_from_slice(bytemuck::bytes_of(extension));
            }
            _ => return err!(DividendXError::UnsupportedMintExtension),
        }
    }
    let scale = scale.ok_or(DividendXError::MissingScaledUiAmount)?;
    let controls_fingerprint = hashv(&[&fingerprint]).to_bytes();
    Ok(MintProfile {
        decimals: mint.base.decimals,
        extensions_mask: mask,
        scale,
        controls_fingerprint,
    })
}

fn push_coption_pubkey(output: &mut Vec<u8>, value: COption<Pubkey>) {
    match value {
        COption::Some(key) => {
            output.push(1);
            output.extend_from_slice(key.as_ref());
        }
        COption::None => {
            output.push(0);
            output.extend_from_slice(&[0_u8; 32]);
        }
    }
}
