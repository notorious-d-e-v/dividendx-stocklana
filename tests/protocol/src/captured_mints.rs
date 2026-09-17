//! Exact captured issuer-mint fixtures exercised through the compiled program.

use {
    crate::{
        abi::{ClaimSide, EventInput},
        fixture::{assert_success, assert_transaction_success, ProtocolFixture, SeriesPhaseView, MATURITY, TOKEN_2022_ID, TOKEN_ID, YEAR},
        harness::{funded_system_account, program_id, repo_root, SbfHarness},
        oracle::{accumulate, cumulative_payout, pools},
    },
    mollusk_svm::result::InstructionResult,
    num_traits::ToPrimitive,
    serde::{Deserialize, Serialize},
    sha2::{Digest, Sha256},
    solana_account::Account,
    solana_clock::Clock,
    solana_program_option::COption,
    solana_program_pack::Pack,
    solana_pubkey::Pubkey,
    spl_associated_token_account_interface::{
        address::get_associated_token_address_with_program_id,
        instruction::create_associated_token_account,
    },
    spl_token_2022_interface::{
        extension::{
            confidential_transfer::ConfidentialTransferMint,
            default_account_state::DefaultAccountState,
            metadata_pointer::MetadataPointer,
            mint_close_authority::MintCloseAuthority,
            pausable::PausableConfig,
            permanent_delegate::PermanentDelegate,
            scaled_ui_amount::ScaledUiAmountConfig,
            transfer_hook::TransferHook,
            BaseStateWithExtensions, ExtensionType, StateWithExtensions, StateWithExtensionsMut,
        },
        state::{Account as TokenAccount, AccountState, Mint},
    },
    spl_token_interface::state::Mint as LegacyMint,
    std::{
        fs::{self, OpenOptions},
        io::Write,
        path::{Path, PathBuf},
        str::FromStr,
    },
};

pub const SNAPSHOT_RELATIVE_PATH: &str = "tests/protocol/fixtures/issuer-mints-2026-09-18.json";
pub const ACCEPTED_SNAPSHOT_SHA256: &str = "5f75decb014072a82708ff76319df5dee15646460f8006461ba4786978fed7ac";
pub const ACCEPTED_ELF_SHA256: &str = "a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070";
pub const MAINNET_GENESIS_HASH: &str = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
pub const MAINNET_RPC: &str = "https://api.mainnet-beta.solana.com";
pub const CLOCK_ADDRESS: &str = "SysvarC1ock11111111111111111111111111111111";
pub const CLOCK_OWNER: &str = "Sysvar1111111111111111111111111111111111111";
pub const TOKEN_2022_TEXT: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
pub const SYNTHETIC_FUNDING_RAW: u64 = 10_003;
pub const DEPOSIT_RAW: u64 = 9_997;
pub const RECOMBINE_RAW: u64 = 1_331;

#[derive(Clone, Copy, Debug)]
pub struct CatalogEntry {
    pub issuer_id: &'static str,
    pub symbol: &'static str,
    pub mint: &'static str,
    pub decimals: u8,
}

pub const CATALOG: [CatalogEntry; 15] = [
    CatalogEntry { issuer_id: "xstocks", symbol: "KOx", mint: "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ", decimals: 8 },
    CatalogEntry { issuer_id: "xstocks", symbol: "AAPLx", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8 },
    CatalogEntry { issuer_id: "xstocks", symbol: "MSFTx", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8 },
    CatalogEntry { issuer_id: "xstocks", symbol: "MUx", mint: "XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav", decimals: 8 },
    CatalogEntry { issuer_id: "xstocks", symbol: "NKEx", mint: "XsGYpMvKbVt6ViHqRd7cF3s746dAMFBQWcC49hB9VVP", decimals: 8 },
    CatalogEntry { issuer_id: "xstocks", symbol: "IBMx", mint: "XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr", decimals: 8 },
    CatalogEntry { issuer_id: "backpack", symbol: "MU.US", mint: "MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1", decimals: 6 },
    CatalogEntry { issuer_id: "backpack", symbol: "NKE.US", mint: "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg", decimals: 6 },
    CatalogEntry { issuer_id: "backpack", symbol: "IBM.US", mint: "BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk", decimals: 6 },
    CatalogEntry { issuer_id: "ondo", symbol: "KOon", mint: "e6G4pfFcrdKxJuZ4YXixRFfMbpMvgXG2Mjcus71ondo", decimals: 9 },
    CatalogEntry { issuer_id: "ondo", symbol: "AAPLon", mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo", decimals: 9 },
    CatalogEntry { issuer_id: "ondo", symbol: "MSFTon", mint: "FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo", decimals: 9 },
    CatalogEntry { issuer_id: "ondo", symbol: "MUon", mint: "Fz9edBpaURPPzpKVRR1A8PENYDEgHqwx5D5th28ondo", decimals: 9 },
    CatalogEntry { issuer_id: "ondo", symbol: "NKEon", mint: "g646pcdG2Rt5DH9WZzL7VVnVDWCCMTTrnktwE74ondo", decimals: 9 },
    CatalogEntry { issuer_id: "ondo", symbol: "IBMon", mint: "C8bZkgSxXkyT1RgxByp2teJ24hgimPLoyEYoNa9ondo", decimals: 9 },
];

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub schema: String,
    pub purpose: String,
    pub captured_at: String,
    pub endpoint: String,
    pub genesis_hash: String,
    pub commitment: String,
    pub context_slot: u64,
    pub catalog_sha256: String,
    pub live_custody_tested: bool,
    pub settlement_ready: bool,
    pub requests: Vec<SnapshotRequest>,
    pub clock: CapturedAccount,
    pub assets: Vec<CapturedAsset>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRequest {
    pub method: String,
    pub retrieved_at: String,
    pub response_sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedAccount {
    pub address: String,
    pub owner: String,
    pub lamports: u64,
    pub executable: bool,
    pub data_hex: String,
    pub data_sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedAsset {
    pub issuer_id: String,
    pub symbol: String,
    pub mint: String,
    pub decimals: u8,
    pub token_program: String,
    pub lamports: u64,
    pub executable: bool,
    pub data_hex: String,
    pub data_sha256: String,
}

#[derive(Clone, Debug)]
pub struct LoadedSnapshot {
    pub snapshot: Snapshot,
    pub snapshot_sha256: String,
    pub clock: Clock,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResult {
    pub decimals: u8,
    pub extensions: Vec<String>,
    pub extensions_mask: String,
    pub current_multiplier_bits: String,
    pub pending_multiplier_bits: String,
    pub pending_effective_timestamp: String,
    pub active_multiplier_bits_at_capture: String,
    pub controls_fingerprint: String,
    pub supported: bool,
    pub unsupported_reason: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeResult {
    pub create_series: u64,
    pub deposit: u64,
    pub recombine: u64,
    pub upsert_events: Vec<u64>,
    pub begin_finalization: u64,
    pub accumulate_events: Vec<u64>,
    pub complete_finalization: u64,
    pub redemptions: Vec<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetExecutionResult {
    pub issuer_id: String,
    pub symbol: String,
    pub mint: String,
    pub mint_data_sha256: String,
    pub profile: ProfileResult,
    pub supported: bool,
    pub executed: bool,
    pub environment: String,
    pub synthetic_holder_funding_raw: String,
    pub deposited_raw: String,
    pub recombined_raw: String,
    pub finalized_backing_raw: String,
    pub pt_pool_raw: String,
    pub dr_pool_raw: String,
    pub final_holder_raw: String,
    pub final_vault_raw: String,
    pub mint_bytes_unchanged: bool,
    pub redemption_payouts_raw: Vec<String>,
    pub compute_units: ComputeResult,
    pub issuer_authority_signatures: u8,
    pub mainnet_transactions: u8,
    pub live_custody_tested: bool,
    pub settlement_ready: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceReceipt {
    pub schema: String,
    pub input_snapshot: String,
    pub input_snapshot_sha256: String,
    pub catalog_sha256: String,
    pub elf_sha256: String,
    pub environment: String,
    pub synthetic_funding: bool,
    pub synthetic_clock_and_events: bool,
    pub issuer_authority_signatures: u8,
    pub mainnet_transactions: u8,
    pub live_custody_tested: bool,
    pub settlement_ready: bool,
    pub supported_assets: usize,
    pub executed_assets: usize,
    pub assets: Vec<AssetExecutionResult>,
}

fn sha256(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

fn decode_hex(value: &str, label: &str) -> Vec<u8> {
    assert!(value.len() <= 16_384 && value.len() % 2 == 0, "{label} hex length is invalid");
    assert!(value.bytes().all(|byte| byte.is_ascii_hexdigit()), "{label} contains non-hex data");
    let data = hex::decode(value).unwrap_or_else(|error| panic!("{label} hex decode failed: {error}"));
    assert_eq!(hex::encode(&data), value, "{label} hex must be lowercase canonical form");
    data
}

fn parse_hash(value: &str, label: &str) {
    assert_eq!(value.len(), 64, "{label} must be SHA-256 hex");
    assert!(value.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()), "{label} is not canonical SHA-256 hex");
}

fn derived_key(domain: &[u8], mint: &Pubkey) -> Pubkey {
    let digest: [u8; 32] = Sha256::new().chain_update(domain).chain_update(mint.as_ref()).finalize().into();
    Pubkey::new_from_array(digest)
}

fn issuer_id(asset: &CapturedAsset) -> [u8; 32] {
    Sha256::new()
        .chain_update(b"dividendx:synthetic-custody-issuer:v1")
        .chain_update(asset.issuer_id.as_bytes())
        .chain_update([0])
        .chain_update(asset.mint.as_bytes())
        .finalize()
        .into()
}

fn push_authority(output: &mut Vec<u8>, authority: COption<Pubkey>) {
    match authority {
        COption::Some(key) => {
            output.push(1);
            output.extend_from_slice(key.as_ref());
        }
        COption::None => {
            output.push(0);
            output.extend_from_slice(&[0; 32]);
        }
    }
}

fn extension_data(state: &StateWithExtensions<'_, Mint>, extension: ExtensionType) -> Option<Vec<u8>> {
    let data = match extension {
        ExtensionType::ScaledUiAmount => state.get_extension_bytes::<ScaledUiAmountConfig>().ok()?,
        ExtensionType::MetadataPointer => state.get_extension_bytes::<MetadataPointer>().ok()?,
        ExtensionType::MintCloseAuthority => state.get_extension_bytes::<MintCloseAuthority>().ok()?,
        ExtensionType::PermanentDelegate => state.get_extension_bytes::<PermanentDelegate>().ok()?,
        ExtensionType::DefaultAccountState => state.get_extension_bytes::<DefaultAccountState>().ok()?,
        ExtensionType::TransferHook => state.get_extension_bytes::<TransferHook>().ok()?,
        ExtensionType::Pausable => state.get_extension_bytes::<PausableConfig>().ok()?,
        ExtensionType::ConfidentialTransferMint => state.get_extension_bytes::<ConfidentialTransferMint>().ok()?,
        ExtensionType::TokenMetadata => return Some(Vec::new()),
        _ => return None,
    };
    Some(data.to_vec())
}

pub fn inspect_profile(asset: &CapturedAsset, clock: &Clock) -> ProfileResult {
    let mint_key = Pubkey::from_str(&asset.mint).expect("captured mint pubkey");
    let data = decode_hex(&asset.data_hex, &format!("{} mint", asset.symbol));
    let state = StateWithExtensions::<Mint>::unpack(&data).expect("captured Token-2022 mint state");
    let mut types = state.get_extension_types().expect("captured mint extension list");
    types.sort_by_key(|extension| u16::from(*extension));
    let duplicate = types.windows(2).any(|pair| pair[0] == pair[1]);
    let mut fingerprint = Vec::with_capacity(512);
    fingerprint.extend_from_slice(b"dividendx:mint-controls:v1");
    fingerprint.extend_from_slice(mint_key.as_ref());
    push_authority(&mut fingerprint, state.base.mint_authority);
    push_authority(&mut fingerprint, state.base.freeze_authority);
    let mut mask = 0_u64;
    let mut current = 0_u64;
    let mut pending = 0_u64;
    let mut effective = 0_i64;
    let mut has_scale = false;
    let mut reason = if state.base.is_initialized { None } else { Some("mint_uninitialized".to_owned()) };
    if ![6_u8, 8, 9].contains(&state.base.decimals) {
        reason.get_or_insert_with(|| "unsupported_decimals".to_owned());
    }
    if duplicate {
        reason.get_or_insert_with(|| "duplicate_extensions".to_owned());
    }
    for extension in &types {
        let discriminant = u16::from(*extension);
        if discriminant >= 64 {
            reason.get_or_insert_with(|| format!("unsupported_extension_{discriminant}"));
            continue;
        }
        mask |= 1_u64 << discriminant;
        fingerprint.extend_from_slice(&discriminant.to_le_bytes());
        let Some(raw) = extension_data(&state, *extension) else {
            reason.get_or_insert_with(|| format!("unsupported_extension_{discriminant}"));
            continue;
        };
        match extension {
            ExtensionType::ScaledUiAmount => {
                if raw.len() != 56 {
                    reason.get_or_insert_with(|| "invalid_scaled_ui_amount".to_owned());
                } else {
                    current = u64::from_le_bytes(raw[32..40].try_into().unwrap());
                    effective = i64::from_le_bytes(raw[40..48].try_into().unwrap());
                    pending = u64::from_le_bytes(raw[48..56].try_into().unwrap());
                    has_scale = true;
                    if crate::oracle::validate_multiplier(current).is_err()
                        || crate::oracle::validate_multiplier(pending).is_err()
                    {
                        reason.get_or_insert_with(|| "unsupported_multiplier".to_owned());
                    }
                    fingerprint.extend_from_slice(&raw[..32]);
                }
            }
            ExtensionType::MetadataPointer => {
                if raw.len() < 32 { reason.get_or_insert_with(|| "invalid_metadata_pointer".to_owned()); }
                else { fingerprint.extend_from_slice(&raw[..32]); }
            }
            ExtensionType::TokenMetadata => {}
            ExtensionType::MintCloseAuthority
            | ExtensionType::PermanentDelegate
            | ExtensionType::ConfidentialTransferMint => fingerprint.extend_from_slice(&raw),
            ExtensionType::DefaultAccountState => {
                if raw.as_slice() != [AccountState::Initialized as u8] {
                    reason.get_or_insert_with(|| "default_account_state_not_initialized".to_owned());
                }
                fingerprint.extend_from_slice(&raw);
            }
            ExtensionType::TransferHook => {
                if raw.len() != 64 || raw[32..].iter().any(|byte| *byte != 0) {
                    reason.get_or_insert_with(|| "active_transfer_hook".to_owned());
                }
                fingerprint.extend_from_slice(&raw);
            }
            ExtensionType::Pausable => {
                if raw.len() != 33 || raw[32] != 0 {
                    reason.get_or_insert_with(|| "mint_paused".to_owned());
                }
                if raw.len() >= 32 { fingerprint.extend_from_slice(&raw[..32]); }
            }
            _ => unreachable!(),
        }
    }
    if !has_scale {
        reason.get_or_insert_with(|| "missing_scaled_ui_amount".to_owned());
    }
    let active = if clock.unix_timestamp >= effective { pending } else { current };
    ProfileResult {
        decimals: state.base.decimals,
        extensions: types.iter().map(|extension| format!("{extension:?}")).collect(),
        extensions_mask: mask.to_string(),
        current_multiplier_bits: current.to_string(),
        pending_multiplier_bits: pending.to_string(),
        pending_effective_timestamp: effective.to_string(),
        active_multiplier_bits_at_capture: active.to_string(),
        controls_fingerprint: sha256(&fingerprint),
        supported: reason.is_none(),
        unsupported_reason: reason,
    }
}

pub fn load_snapshot() -> LoadedSnapshot {
    let path = repo_root().join(SNAPSHOT_RELATIVE_PATH);
    let bytes = fs::read(&path).unwrap_or_else(|error| panic!("required issuer mint snapshot {}: {error}", path.display()));
    assert!(bytes.len() <= 512 * 1024, "issuer mint snapshot exceeds test bound");
    let snapshot_sha256 = sha256(&bytes);
    assert_eq!(snapshot_sha256, ACCEPTED_SNAPSHOT_SHA256, "approved captured snapshot changed");
    let snapshot: Snapshot = serde_json::from_slice(&bytes).expect("valid issuer mint snapshot JSON");
    assert_eq!(snapshot.schema, "dividendx-issuer-mint-snapshot-v1");
    assert_eq!(snapshot.purpose, "offline_custody_conformance");
    assert!(!snapshot.captured_at.is_empty());
    assert_eq!(snapshot.endpoint, MAINNET_RPC);
    assert_eq!(snapshot.genesis_hash, MAINNET_GENESIS_HASH);
    assert_eq!(snapshot.commitment, "finalized");
    assert!(!snapshot.live_custody_tested && !snapshot.settlement_ready);
    assert_eq!(snapshot.requests.len(), 2, "capture must bind genesis and one atomic account read");
    assert_eq!(snapshot.requests[0].method, "getGenesisHash");
    assert_eq!(snapshot.requests[1].method, "getMultipleAccounts");
    for request in &snapshot.requests {
        assert!(!request.retrieved_at.is_empty());
        parse_hash(&request.response_sha256, "request response digest");
    }

    let catalog_bytes = fs::read(repo_root().join("packages/demo-fixtures/catalog.json")).expect("catalog bytes");
    let catalog_sha256 = sha256(&catalog_bytes);
    assert_eq!(catalog_sha256, "cd8c51171fb5d7ebb18b3c113ba30d339a4103c999bde51ebf031ae27ccd27fd");
    assert_eq!(snapshot.catalog_sha256, catalog_sha256);

    assert_eq!(snapshot.clock.address, CLOCK_ADDRESS);
    assert_eq!(snapshot.clock.owner, CLOCK_OWNER);
    assert!(!snapshot.clock.executable && snapshot.clock.lamports > 0);
    parse_hash(&snapshot.clock.data_sha256, "clock data digest");
    let clock_data = decode_hex(&snapshot.clock.data_hex, "Clock");
    assert_eq!(sha256(&clock_data), snapshot.clock.data_sha256);
    let clock: Clock = bincode::deserialize(&clock_data).expect("captured Clock bincode");
    assert_eq!(clock.slot, snapshot.context_slot, "captured Clock and RPC context slots differ");
    assert!(clock.unix_timestamp < 1_798_761_600, "capture is too late to create the 2027 test series");

    assert_eq!(snapshot.assets.len(), CATALOG.len());
    for (actual, expected) in snapshot.assets.iter().zip(CATALOG) {
        assert_eq!(actual.issuer_id, expected.issuer_id);
        assert_eq!(actual.symbol, expected.symbol);
        assert_eq!(actual.mint, expected.mint);
        assert_eq!(actual.decimals, expected.decimals);
        assert_eq!(actual.token_program, TOKEN_2022_TEXT);
        assert!(!actual.executable && actual.lamports > 0);
        parse_hash(&actual.data_sha256, "mint data digest");
        let data = decode_hex(&actual.data_hex, &format!("{} mint", actual.symbol));
        assert_eq!(sha256(&data), actual.data_sha256);
        let state = StateWithExtensions::<Mint>::unpack(&data).expect("captured initialized mint");
        assert!(state.base.is_initialized);
        assert_eq!(state.base.decimals, expected.decimals);
        let profile = inspect_profile(actual, &clock);
        assert_eq!(profile.decimals, expected.decimals);
    }
    LoadedSnapshot { snapshot, snapshot_sha256, clock }
}

fn assert_cpis(result: &InstructionResult, programs: &[Pubkey], label: &str) {
    assert!(result.compute_units_consumed > 0, "{label} consumed no SBF compute");
    let message = result.message.as_ref().unwrap_or_else(|| panic!("{label} has no execution message"));
    let invoked: Vec<Pubkey> = result
        .inner_instructions
        .iter()
        .map(|inner| message.account_keys()[inner.instruction.program_id_index as usize])
        .collect();
    for expected in programs {
        assert!(invoked.contains(expected), "{label} did not invoke {expected}; invoked {invoked:?}");
    }
}

fn mint_bytes(fixture: &ProtocolFixture) -> Vec<u8> {
    fixture.harness.account(&fixture.collateral_mint).expect("captured mint account").data
}

fn synthetic_event(
    fixture: &ProtocolFixture,
    id: u8,
    ex_date: u32,
    status: u8,
    m0: f64,
    m1: f64,
) -> EventInput {
    EventInput {
        event_id: [id; 32],
        revision: 1,
        ex_date,
        status,
        m0_bits: if status == 1 { m0.to_bits() } else { 0 },
        m1_bits: if status == 1 { m1.to_bits() } else { 0 },
        source_final: true,
        original_effective_timestamp: fixture.harness.context.mollusk.sysvars.clock.unix_timestamp,
        payment_date: 20271231,
        observed_slot: fixture.harness.context.mollusk.sysvars.clock.slot,
        evidence_digest: [id.wrapping_add(0xa0); 32],
    }
}

fn captured_fixture(asset: &CapturedAsset, clock: &Clock) -> (ProtocolFixture, Vec<u8>, u64) {
    let collateral_mint = Pubkey::from_str(&asset.mint).expect("captured mint pubkey");
    let captured_data = decode_hex(&asset.data_hex, &format!("{} mint", asset.symbol));
    let mut harness = SbfHarness::new(clock.unix_timestamp);
    harness.context.mollusk.sysvars.clock = clock.clone();
    harness.insert_account(collateral_mint, Account {
        lamports: asset.lamports,
        data: captured_data.clone(),
        owner: TOKEN_2022_ID,
        executable: false,
        rent_epoch: 0,
    });
    let attestor = derived_key(b"captured-attestor", &collateral_mint);
    let keeper = derived_key(b"captured-keeper", &collateral_mint);
    let holder = derived_key(b"captured-holder", &collateral_mint);
    for address in [attestor, keeper, holder] {
        harness.insert_account(address, funded_system_account(10_000_000_000_000));
    }
    let synthetic_issuer = issuer_id(asset);
    let config = Pubkey::find_program_address(&[b"config"], &program_id()).0;
    let asset_policy = Pubkey::find_program_address(
        &[b"asset", &synthetic_issuer, collateral_mint.as_ref()],
        &program_id(),
    ).0;
    let year_bytes = YEAR.to_le_bytes();
    let series = Pubkey::find_program_address(
        &[b"series", asset_policy.as_ref(), &year_bytes],
        &program_id(),
    ).0;
    let accumulator = Pubkey::find_program_address(&[b"accumulator", series.as_ref()], &program_id()).0;
    let pt_mint = Pubkey::find_program_address(&[b"pt", series.as_ref()], &program_id()).0;
    let dr_mint = Pubkey::find_program_address(&[b"dr", series.as_ref()], &program_id()).0;
    let vault = get_associated_token_address_with_program_id(&series, &collateral_mint, &TOKEN_2022_ID);
    let holder_collateral = get_associated_token_address_with_program_id(&holder, &collateral_mint, &TOKEN_2022_ID);
    let holder_pt = get_associated_token_address_with_program_id(&holder, &pt_mint, &TOKEN_ID);
    let holder_dr = get_associated_token_address_with_program_id(&holder, &dr_mint, &TOKEN_ID);
    let fixture = ProtocolFixture {
        harness,
        attestor,
        keeper,
        holder,
        mint_authority: derived_key(b"unused-issuer-authority", &collateral_mint),
        collateral_mint,
        holder_collateral,
        config,
        asset_policy,
        series,
        accumulator,
        pt_mint,
        dr_mint,
        holder_pt,
        holder_dr,
        vault,
        issuer_id: synthetic_issuer,
        year: YEAR,
        pausable: true,
    };
    assert_eq!(sha256(&mint_bytes(&fixture)), asset.data_sha256);
    assert_success(&fixture.harness.process(&fixture.initialize_config_ix()), "captured initialize config");
    assert_success(&fixture.harness.process(&fixture.register_asset_ix()), "captured register asset");
    let observation_valid_until = clock.unix_timestamp + 86_400;
    assert_success(
        &fixture.harness.process(&fixture.refresh_observation_ix(observation_valid_until)),
        "captured refresh observation",
    );
    let create_series = fixture.harness.process(&fixture.create_series_ix());
    assert_success(&create_series, "captured create series");
    assert_cpis(
        &create_series,
        &[TOKEN_ID, TOKEN_2022_ID, mollusk_svm_programs_token::associated_token::ID],
        "captured create series",
    );

    let create_holder_accounts = fixture.harness.process_transaction(&[
        create_associated_token_account(&fixture.harness.payer, &holder, &collateral_mint, &TOKEN_2022_ID),
        create_associated_token_account(&fixture.harness.payer, &holder, &pt_mint, &TOKEN_ID),
        create_associated_token_account(&fixture.harness.payer, &holder, &dr_mint, &TOKEN_ID),
    ]);
    assert_transaction_success(&create_holder_accounts, "create canonical captured holder ATAs");

    let mut holder_account = fixture.harness.account(&holder_collateral).expect("holder collateral ATA");
    {
        let mut state = StateWithExtensionsMut::<TokenAccount>::unpack(&mut holder_account.data)
            .expect("initialized extension-sized holder ATA");
        assert_eq!(state.base.amount, 0);
        assert_eq!(state.base.owner, holder);
        assert_eq!(state.base.mint, collateral_mint);
        assert_eq!(state.base.delegate, COption::None);
        assert_eq!(state.base.close_authority, COption::None);
        assert_eq!(state.base.state, AccountState::Initialized);
        state.base.amount = SYNTHETIC_FUNDING_RAW;
        state.pack_base();
    }
    fixture.harness.insert_account(holder_collateral, holder_account);

    let mint_state = StateWithExtensions::<Mint>::unpack(&captured_data).unwrap();
    let required = ExtensionType::get_required_init_account_extensions(
        &mint_state.get_extension_types().expect("mint extension types"),
    );
    for address in [fixture.holder_collateral, fixture.vault] {
        let account = fixture.harness.account(&address).expect("canonical collateral ATA");
        let state = StateWithExtensions::<TokenAccount>::unpack(&account.data).expect("extension-sized collateral ATA");
        let present = state.get_extension_types().expect("token account extension types");
        for extension in &required {
            assert!(present.contains(extension), "{} ATA lacks required {extension:?}", asset.symbol);
        }
        assert_eq!(state.base.delegate, COption::None);
        assert_eq!(state.base.close_authority, COption::None);
        assert_eq!(state.base.state, AccountState::Initialized);
    }
    let vault = fixture.harness.account(&fixture.vault).expect("captured vault ATA");
    let vault_state = StateWithExtensions::<TokenAccount>::unpack(&vault.data).unwrap();
    assert_eq!(vault_state.base.owner, fixture.series);
    assert_eq!(vault_state.base.mint, fixture.collateral_mint);
    assert_eq!(fixture.holder_collateral, get_associated_token_address_with_program_id(&holder, &collateral_mint, &TOKEN_2022_ID));
    assert_eq!(fixture.vault, get_associated_token_address_with_program_id(&series, &collateral_mint, &TOKEN_2022_ID));
    (fixture, captured_data, create_series.compute_units_consumed)
}

pub fn execute_asset(asset: &CapturedAsset, clock: &Clock) -> AssetExecutionResult {
    let profile = inspect_profile(asset, clock);
    if !profile.supported {
        return AssetExecutionResult {
            issuer_id: asset.issuer_id.clone(), symbol: asset.symbol.clone(), mint: asset.mint.clone(),
            mint_data_sha256: asset.data_sha256.clone(), profile, supported: false, executed: false,
            environment: "mollusk_offline".to_owned(), synthetic_holder_funding_raw: "0".to_owned(),
            deposited_raw: "0".to_owned(), recombined_raw: "0".to_owned(), finalized_backing_raw: "0".to_owned(),
            pt_pool_raw: "0".to_owned(), dr_pool_raw: "0".to_owned(), final_holder_raw: "0".to_owned(),
            final_vault_raw: "0".to_owned(), mint_bytes_unchanged: true, compute_units: ComputeResult::default(),
            redemption_payouts_raw: Vec::new(), issuer_authority_signatures: 0,
            mainnet_transactions: 0, live_custody_tested: false, settlement_ready: false,
        };
    }
    let (mut fixture, captured_data, create_series_cu) = captured_fixture(asset, clock);
    assert_eq!(hex::encode(fixture.harness.elf_sha256), ACCEPTED_ELF_SHA256, "accepted ELF changed");
    let mut compute = ComputeResult { create_series: create_series_cu, ..ComputeResult::default() };

    let deposit = fixture.harness.process(&fixture.deposit_ix(DEPOSIT_RAW, 0));
    assert_success(&deposit, "captured deposit");
    assert_cpis(&deposit, &[TOKEN_2022_ID, TOKEN_ID], "captured deposit");
    compute.deposit = deposit.compute_units_consumed;
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral), SYNTHETIC_FUNDING_RAW - DEPOSIT_RAW);
    assert_eq!(fixture.collateral_amount(fixture.vault), DEPOSIT_RAW);
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral) + fixture.collateral_amount(fixture.vault), SYNTHETIC_FUNDING_RAW);
    assert_eq!(fixture.claim_amount(fixture.holder_pt), DEPOSIT_RAW);
    assert_eq!(fixture.claim_amount(fixture.holder_dr), DEPOSIT_RAW);
    assert_eq!(mint_bytes(&fixture), captured_data, "deposit changed captured mint bytes");

    let stale_timestamp = clock.unix_timestamp + 86_401;
    fixture.harness.set_clock_and_slot(stale_timestamp, clock.slot + 1);
    let recombine = fixture.harness.process(&fixture.recombine_ix(RECOMBINE_RAW, 1));
    assert_success(&recombine, "captured stale-observation recombination");
    assert_cpis(&recombine, &[TOKEN_2022_ID, TOKEN_ID], "captured recombination");
    compute.recombine = recombine.compute_units_consumed;
    let final_backing = DEPOSIT_RAW - RECOMBINE_RAW;
    assert_eq!(fixture.series_state().nominal_backing, final_backing);
    assert_eq!(fixture.collateral_amount(fixture.vault), final_backing);
    assert_eq!(fixture.collateral_amount(fixture.holder_collateral) + fixture.collateral_amount(fixture.vault), SYNTHETIC_FUNDING_RAW);
    assert_eq!(mint_bytes(&fixture), captured_data, "recombination changed captured mint bytes");

    fixture.harness.set_clock_and_slot(MATURITY - 86_400, clock.slot + 500);

    let events = vec![
        synthetic_event(&fixture, 1, 20270315, 1, 1.0, 1.25),
        synthetic_event(&fixture, 2, 20270615, 2, 0.0, 0.0),
        synthetic_event(&fixture, 3, 20270915, 3, 0.0, 0.0),
        synthetic_event(&fixture, 4, 20271215, 1, 1.25, 1.5),
    ];
    for event in &events {
        let result = fixture.harness.process(&fixture.upsert_ix(event.clone()));
        assert_success(&result, "captured synthetic event");
        assert!(result.compute_units_consumed > 0);
        compute.upsert_events.push(result.compute_units_consumed);
    }
    assert_eq!((fixture.series_state().event_count, fixture.series_state().unresolved_count), (4, 0));

    fixture.harness.set_clock_and_slot(MATURITY, clock.slot + 1_000);
    assert_success(
        &fixture.harness.process(&fixture.refresh_observation_ix(MATURITY + 86_400)),
        "captured maturity observation",
    );
    let begin = fixture.harness.process(&fixture.begin_ix([0xd1; 32]));
    assert_success(&begin, "captured begin finalization");
    assert!(begin.compute_units_consumed > 0);
    compute.begin_finalization = begin.compute_units_consumed;
    for event in &events {
        let result = fixture.harness.process(&fixture.accumulate_ix(event));
        assert_success(&result, "captured accumulate event");
        assert!(result.compute_units_consumed > 0);
        compute.accumulate_events.push(result.compute_units_consumed);
    }
    let complete = fixture.harness.process(&fixture.complete_ix());
    assert_success(&complete, "captured complete finalization");
    assert_cpis(&complete, &[TOKEN_ID], "captured complete finalization");
    compute.complete_finalization = complete.compute_units_consumed;
    let expected = pools(
        final_backing,
        &accumulate(&[(1.0f64.to_bits(), 1.25f64.to_bits()), (1.25f64.to_bits(), 1.5f64.to_bits())]).unwrap(),
    ).unwrap();
    let expected_pt = expected.pt.to_u64().unwrap();
    let expected_dr = expected.dr.to_u64().unwrap();
    let finalized = fixture.series_state();
    assert_eq!(finalized.phase, SeriesPhaseView::Finalized);
    assert_eq!((finalized.final_supply, finalized.pt_pool, finalized.dr_pool), (final_backing, expected_pt, expected_dr));
    assert_eq!(expected_pt + expected_dr, final_backing);
    assert_eq!(mint_bytes(&fixture), captured_data, "finalization changed captured mint bytes");

    let pt_first = 2_111;
    let dr_first = 3_177;
    let mut pt_burned = 0;
    let mut dr_burned = 0;
    let mut redemption_payouts = Vec::with_capacity(4);
    for (side, amount) in [
        (ClaimSide::Pt, pt_first),
        (ClaimSide::Dr, dr_first),
        (ClaimSide::Pt, final_backing - pt_first),
        (ClaimSide::Dr, final_backing - dr_first),
    ] {
        let (prior_burned, pool) = match side {
            ClaimSide::Pt => (pt_burned, expected_pt),
            ClaimSide::Dr => (dr_burned, expected_dr),
        };
        let expected_payout = cumulative_payout(prior_burned, amount, pool, final_backing).unwrap();
        let holder_before = fixture.collateral_amount(fixture.holder_collateral);
        let vault_before = fixture.collateral_amount(fixture.vault);
        let version = fixture.series_state().state_version;
        let result = fixture.harness.process(&fixture.redeem_ix(side, amount, false, version));
        assert_success(&result, "captured independent redemption");
        assert_cpis(&result, &[TOKEN_2022_ID, TOKEN_ID], "captured redemption");
        compute.redemptions.push(result.compute_units_consumed);
        assert_eq!(fixture.collateral_amount(fixture.holder_collateral) - holder_before, expected_payout);
        assert_eq!(vault_before - fixture.collateral_amount(fixture.vault), expected_payout);
        assert_eq!(fixture.collateral_amount(fixture.holder_collateral) + fixture.collateral_amount(fixture.vault), SYNTHETIC_FUNDING_RAW);
        assert_eq!(mint_bytes(&fixture), captured_data, "redemption changed captured mint bytes");
        redemption_payouts.push(expected_payout.to_string());
        match side {
            ClaimSide::Pt => pt_burned += amount,
            ClaimSide::Dr => dr_burned += amount,
        }
    }
    let final_state = fixture.series_state();
    assert_eq!((final_state.pt_redeemed_nominal, final_state.dr_redeemed_nominal), (final_backing, final_backing));
    assert_eq!((final_state.pt_paid, final_state.dr_paid), (expected_pt, expected_dr));
    assert_eq!(fixture.claim_amount(fixture.holder_pt), 0);
    assert_eq!(fixture.claim_amount(fixture.holder_dr), 0);
    let final_holder = fixture.collateral_amount(fixture.holder_collateral);
    let final_vault = fixture.collateral_amount(fixture.vault);
    assert_eq!(final_holder, SYNTHETIC_FUNDING_RAW);
    assert_eq!(final_vault, 0);
    assert_eq!(mint_bytes(&fixture), captured_data, "lifecycle changed captured mint bytes");
    for mint in [fixture.pt_mint, fixture.dr_mint] {
        let account = fixture.harness.account(&mint).expect("claim mint account");
        let state = LegacyMint::unpack(&account.data).expect("ordinary SPL claim mint");
        assert_eq!(state.supply, 0);
        assert_eq!(state.mint_authority, COption::None);
        assert_eq!(state.freeze_authority, COption::None);
    }

    AssetExecutionResult {
        issuer_id: asset.issuer_id.clone(), symbol: asset.symbol.clone(), mint: asset.mint.clone(),
        mint_data_sha256: asset.data_sha256.clone(), profile, supported: true, executed: true,
        environment: "mollusk_offline".to_owned(), synthetic_holder_funding_raw: SYNTHETIC_FUNDING_RAW.to_string(),
        deposited_raw: DEPOSIT_RAW.to_string(), recombined_raw: RECOMBINE_RAW.to_string(),
        finalized_backing_raw: final_backing.to_string(), pt_pool_raw: expected_pt.to_string(),
        dr_pool_raw: expected_dr.to_string(), final_holder_raw: final_holder.to_string(),
        final_vault_raw: final_vault.to_string(), mint_bytes_unchanged: true,
        redemption_payouts_raw: redemption_payouts, compute_units: compute,
        issuer_authority_signatures: 0,
        mainnet_transactions: 0, live_custody_tested: false, settlement_ready: false,
    }
}

pub fn execute_all() -> ConformanceReceipt {
    let loaded = load_snapshot();
    let elf_hash = sha256(&fs::read(repo_root().join("target/deploy/dividendx.so")).expect("compiled DividendX ELF"));
    assert_eq!(elf_hash, ACCEPTED_ELF_SHA256, "accepted compiled ELF changed");
    let assets: Vec<_> = loaded.snapshot.assets.iter().map(|asset| execute_asset(asset, &loaded.clock)).collect();
    let supported_assets = assets.iter().filter(|asset| asset.supported).count();
    let executed_assets = assets.iter().filter(|asset| asset.executed).count();
    assert_eq!(supported_assets, CATALOG.len(), "dated accepted fixture lost structural support");
    assert_eq!(executed_assets, CATALOG.len(), "dated accepted fixture lost custody execution");
    assert_eq!(executed_assets, supported_assets, "not every supported captured mint executed");
    ConformanceReceipt {
        schema: "dividendx-issuer-custody-conformance-v1".to_owned(),
        input_snapshot: SNAPSHOT_RELATIVE_PATH.to_owned(),
        input_snapshot_sha256: loaded.snapshot_sha256,
        catalog_sha256: loaded.snapshot.catalog_sha256,
        elf_sha256: elf_hash,
        environment: "mollusk_offline".to_owned(),
        synthetic_funding: true,
        synthetic_clock_and_events: true,
        issuer_authority_signatures: 0,
        mainnet_transactions: 0,
        live_custody_tested: false,
        settlement_ready: false,
        supported_assets,
        executed_assets,
        assets,
    }
}

pub fn write_receipt_exclusive(receipt: &ConformanceReceipt, output: &Path) -> PathBuf {
    assert!(output.is_absolute(), "receipt output must be absolute");
    let mut bytes = serde_json::to_vec_pretty(receipt).expect("serialize conformance receipt");
    bytes.push(b'\n');
    let mut file = OpenOptions::new().write(true).create_new(true).open(output)
        .unwrap_or_else(|error| panic!("create exclusive conformance receipt {}: {error}", output.display()));
    file.write_all(&bytes).expect("write conformance receipt");
    output.to_path_buf()
}
