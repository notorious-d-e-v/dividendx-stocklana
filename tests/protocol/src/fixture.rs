//! Controlled accounts and instruction builders for compiled-SBF tests.

use {
    crate::{
        abi::{self, ClaimSide, EventInput, Guard},
        harness::{funded_system_account, program_data_address, program_id, SbfHarness},
    },
    borsh::BorshDeserialize,
    mollusk_svm::result::{types::TransactionResult, InstructionResult},
    solana_instruction::{AccountMeta, Instruction},
    solana_program_pack::Pack,
    solana_pubkey::Pubkey,
    solana_rent::Rent,
    spl_associated_token_account_interface::address::get_associated_token_address_with_program_id,
    spl_token_2022_interface::{
        extension::{
            confidential_transfer::instruction as confidential_instruction,
            default_account_state::instruction as default_state_instruction,
            pausable::instruction as pausable_instruction,
            scaled_ui_amount::instruction as scale_instruction,
            transfer_fee::instruction as transfer_fee_instruction,
            transfer_hook::instruction as hook_instruction,
            ExtensionType, StateWithExtensions,
        },
        instruction as token2022_instruction,
        state::{Account as TokenAccount, AccountState, Mint},
    },
    spl_token_interface::{instruction as token_instruction, state::Account as LegacyTokenAccount},
};

pub const YEAR: u16 = 2027;
pub const PRE_YEAR: i64 = 1_798_675_200; // 2026-12-31T00:00:00Z
pub const YEAR_START: i64 = 1_798_761_600;
pub const MATURITY: i64 = 1_830_297_600;
pub const TOKEN_2022_ID: Pubkey = mollusk_svm_programs_token::token2022::ID;
pub const TOKEN_ID: Pubkey = mollusk_svm_programs_token::token::ID;

#[derive(Clone, Copy, Debug)]
pub enum RejectedMintProfile {
    TransferFee,
    ActiveTransferHook,
    DefaultFrozen,
    UnsupportedNonTransferable,
}

fn key(tag: u8) -> Pubkey {
    Pubkey::new_from_array([tag; 32])
}

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction { program_id: program_id(), accounts, data }
}

fn ro(key: Pubkey) -> AccountMeta {
    AccountMeta::new_readonly(key, false)
}

fn signer(key: Pubkey, writable: bool) -> AccountMeta {
    if writable { AccountMeta::new(key, true) } else { AccountMeta::new_readonly(key, true) }
}

pub fn assert_success(result: &InstructionResult, label: &str) {
    assert!(result.program_result.is_ok(), "{label}: {:?}\nlogs: {:?}", result.program_result, result.raw_result);
}

pub fn assert_transaction_success(result: &TransactionResult, label: &str) {
    assert!(result.program_result.is_ok(), "{label}: {:?}\nraw: {:?}", result.program_result, result.raw_result);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, BorshDeserialize)]
pub enum SeriesPhaseView { Open, Sealing, Finalized }

#[derive(Clone, Debug, BorshDeserialize)]
pub struct SeriesView {
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
    pub phase: SeriesPhaseView,
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

#[derive(Clone, Debug, BorshDeserialize)]
pub struct AccumulatorView {
    pub series: Pubkey,
    pub cursor: u8,
    pub numerator: Vec<u8>,
    pub denominator: Vec<u8>,
    pub bump: u8,
}

pub struct ProtocolFixture {
    pub harness: SbfHarness,
    pub attestor: Pubkey,
    pub keeper: Pubkey,
    pub holder: Pubkey,
    pub mint_authority: Pubkey,
    pub collateral_mint: Pubkey,
    pub holder_collateral: Pubkey,
    pub config: Pubkey,
    pub asset_policy: Pubkey,
    pub series: Pubkey,
    pub accumulator: Pubkey,
    pub pt_mint: Pubkey,
    pub dr_mint: Pubkey,
    pub holder_pt: Pubkey,
    pub holder_dr: Pubkey,
    pub vault: Pubkey,
    pub issuer_id: [u8; 32],
    pub year: u16,
    pub pausable: bool,
}

impl ProtocolFixture {
    pub fn new(decimals: u8, initial_collateral: u64) -> Self {
        Self::new_with_options(decimals, initial_collateral, false, false, false, false)
    }

    pub fn new_pausable(decimals: u8, initial_collateral: u64) -> Self {
        Self::new_with_options(decimals, initial_collateral, true, false, false, false)
    }

    pub fn new_freezable(decimals: u8, initial_collateral: u64) -> Self {
        Self::new_with_options(decimals, initial_collateral, false, true, false, false)
    }

    pub fn new_with_permanent_delegate(decimals: u8, initial_collateral: u64) -> Self {
        Self::new_with_options(decimals, initial_collateral, false, false, true, false)
    }

    pub fn new_xstocks_profile(decimals: u8, initial_collateral: u64) -> Self {
        Self::new_with_options(decimals, initial_collateral, false, false, false, true)
    }

    fn new_with_options(decimals: u8, initial_collateral: u64, pausable: bool, freezable: bool, permanent_delegate: bool, xstocks: bool) -> Self {
        let mut harness = SbfHarness::new(PRE_YEAR);
        harness.set_clock_and_slot(PRE_YEAR, 10);
        let attestor = key(0x31);
        let keeper = key(0x32);
        let holder = key(0x33);
        let mint_authority = key(0x34);
        let collateral_mint = key(0x35u8.wrapping_add(decimals));
        let holder_collateral = key(0x45u8.wrapping_add(decimals));
        let holder_pt = key(0x55u8.wrapping_add(decimals));
        let holder_dr = key(0x65u8.wrapping_add(decimals));
        for account in [attestor, keeper, holder, mint_authority] {
            harness.insert_account(account, funded_system_account(10_000_000_000_000));
        }

        create_scaled_mint_and_fund_holder(
            &harness,
            collateral_mint,
            holder_collateral,
            mint_authority,
            holder,
            decimals,
            initial_collateral,
            1.0,
            pausable,
            freezable,
            permanent_delegate,
            xstocks,
        );

        let config = Pubkey::find_program_address(&[b"config"], &program_id()).0;
        let issuer_id = [0x71; 32];
        let asset_policy = Pubkey::find_program_address(
            &[b"asset", &issuer_id, collateral_mint.as_ref()],
            &program_id(),
        ).0;
        let year = YEAR;
        let year_bytes = year.to_le_bytes();
        let series = Pubkey::find_program_address(
            &[b"series", asset_policy.as_ref(), &year_bytes],
            &program_id(),
        ).0;
        let accumulator = Pubkey::find_program_address(&[b"accumulator", series.as_ref()], &program_id()).0;
        let pt_mint = Pubkey::find_program_address(&[b"pt", series.as_ref()], &program_id()).0;
        let dr_mint = Pubkey::find_program_address(&[b"dr", series.as_ref()], &program_id()).0;
        let vault = get_associated_token_address_with_program_id(&series, &collateral_mint, &TOKEN_2022_ID);

        let fixture = Self {
            harness, attestor, keeper, holder, mint_authority, collateral_mint,
            holder_collateral, config, asset_policy, series, accumulator, pt_mint,
            dr_mint, holder_pt, holder_dr, vault, issuer_id, year, pausable,
        };
        assert_success(&fixture.harness.process(&fixture.initialize_config_ix()), "initialize config");
        assert_success(&fixture.harness.process(&fixture.register_asset_ix()), "register asset");
        assert_success(&fixture.harness.process(&fixture.refresh_observation_ix(PRE_YEAR + 86_400)), "refresh observation");
        assert_success(&fixture.harness.process(&fixture.create_series_ix()), "create series");
        create_legacy_token_account(&fixture.harness, fixture.holder_pt, fixture.pt_mint, fixture.holder);
        create_legacy_token_account(&fixture.harness, fixture.holder_dr, fixture.dr_mint, fixture.holder);
        fixture
    }

    pub fn initialize_config_ix(&self) -> Instruction {
        ix(vec![
            AccountMeta::new(self.config, false), ro(program_id()), ro(program_data_address()),
            signer(self.harness.upgrade_authority, true), ro(solana_sdk_ids::system_program::ID),
        ], abi::initialize_config([0x91; 32]))
    }

    pub fn register_asset_ix(&self) -> Instruction {
        ix(vec![
            ro(self.config), signer(self.harness.upgrade_authority, true), ro(self.collateral_mint),
            AccountMeta::new(self.asset_policy, false), ro(solana_sdk_ids::system_program::ID),
        ], abi::register_asset(self.issuer_id, "DX".to_owned(), self.attestor.to_bytes(), [0x92; 32]))
    }

    pub fn refresh_observation_ix(&self, valid_until: i64) -> Instruction {
        ix(vec![signer(self.attestor, false), AccountMeta::new(self.asset_policy, false), ro(self.collateral_mint)],
            abi::refresh_observation([0x93; 32], valid_until))
    }

    pub fn create_series_ix(&self) -> Instruction {
        self.create_series_ix_for_year(self.year)
    }

    pub fn create_series_ix_for_year(&self, year: u16) -> Instruction {
        let year_bytes = year.to_le_bytes();
        let series = Pubkey::find_program_address(&[b"series", self.asset_policy.as_ref(), &year_bytes], &program_id()).0;
        let accumulator = Pubkey::find_program_address(&[b"accumulator", series.as_ref()], &program_id()).0;
        let pt_mint = Pubkey::find_program_address(&[b"pt", series.as_ref()], &program_id()).0;
        let dr_mint = Pubkey::find_program_address(&[b"dr", series.as_ref()], &program_id()).0;
        let vault = get_associated_token_address_with_program_id(&series, &self.collateral_mint, &TOKEN_2022_ID);
        ix(vec![
            signer(self.harness.payer, true), ro(self.asset_policy), AccountMeta::new(series, false),
            AccountMeta::new(accumulator, false), AccountMeta::new(pt_mint, false),
            AccountMeta::new(dr_mint, false), ro(self.collateral_mint), AccountMeta::new(vault, false),
            ro(TOKEN_ID), ro(TOKEN_2022_ID), ro(mollusk_svm_programs_token::associated_token::ID),
            ro(solana_sdk_ids::system_program::ID),
        ], abi::create_series(year))
    }

    pub fn deposit_ix(&self, amount: u64, state_version: u64) -> Instruction {
        self.amount_ix("deposit", amount, state_version)
    }

    pub fn recombine_ix(&self, amount: u64, state_version: u64) -> Instruction {
        self.amount_ix("recombine", amount, state_version)
    }

    fn amount_ix(&self, name: &str, amount: u64, state_version: u64) -> Instruction {
        self.amount_ix_for(name, amount, state_version, self.holder, self.holder_collateral, self.holder_pt, self.holder_dr)
    }

    pub fn recombine_ix_for(&self, amount: u64, state_version: u64, holder: Pubkey, collateral: Pubkey, pt: Pubkey, dr: Pubkey) -> Instruction {
        self.amount_ix_for("recombine", amount, state_version, holder, collateral, pt, dr)
    }

    fn amount_ix_for(&self, name: &str, amount: u64, state_version: u64, holder: Pubkey, collateral: Pubkey, pt: Pubkey, dr: Pubkey) -> Instruction {
        let guard = Guard { expected_state_version: state_version, expiry_unix_timestamp: i64::MAX, minimum_raw_output: 0 };
        let data = if name == "deposit" { abi::deposit(amount, guard) } else { abi::recombine(amount, guard) };
        ix(vec![
            signer(holder, false), ro(self.asset_policy), AccountMeta::new(self.series, false),
            ro(self.collateral_mint), AccountMeta::new(self.vault, false), AccountMeta::new(collateral, false),
            AccountMeta::new(self.pt_mint, false), AccountMeta::new(self.dr_mint, false),
            AccountMeta::new(pt, false), AccountMeta::new(dr, false),
            ro(TOKEN_ID), ro(TOKEN_2022_ID),
        ], data)
    }

    pub fn set_admission_ix(&self, enabled: bool) -> Instruction {
        ix(vec![ro(self.config), signer(self.harness.upgrade_authority, false), AccountMeta::new(self.asset_policy, false)],
            abi::set_asset_admission(enabled))
    }

    pub fn event_addresses(&self, input: &EventInput) -> (Pubkey, Pubkey) {
        let head = Pubkey::find_program_address(&[b"event", self.series.as_ref(), &input.event_id], &program_id()).0;
        let revision = Pubkey::find_program_address(&[b"revision", head.as_ref(), &input.revision.to_le_bytes()], &program_id()).0;
        (head, revision)
    }

    pub fn upsert_ix(&self, input: EventInput) -> Instruction {
        let (head, revision) = self.event_addresses(&input);
        ix(vec![signer(self.attestor, true), ro(self.asset_policy), AccountMeta::new(self.series, false),
            AccountMeta::new(head, false), AccountMeta::new(revision, false), ro(solana_sdk_ids::system_program::ID)],
            abi::upsert_event(input))
    }

    pub fn begin_ix(&self, coverage: [u8; 32]) -> Instruction {
        let state = self.series_state();
        ix(vec![signer(self.attestor, false), ro(self.asset_policy), AccountMeta::new(self.series, false),
            AccountMeta::new(self.accumulator, false), ro(self.collateral_mint), ro(self.vault),
            ro(self.pt_mint), ro(self.dr_mint)],
            abi::begin_finalization(state.journal_version, state.journal_hash, coverage))
    }

    pub fn accumulate_ix(&self, input: &EventInput) -> Instruction {
        let (head, revision) = self.event_addresses(input);
        ix(vec![signer(self.keeper, false), AccountMeta::new(self.series, false),
            AccountMeta::new(self.accumulator, false), ro(head), ro(revision)], abi::accumulate_event())
    }

    pub fn complete_ix(&self) -> Instruction {
        ix(vec![signer(self.keeper, false), ro(self.asset_policy), AccountMeta::new(self.series, false),
            ro(self.accumulator), ro(self.collateral_mint), ro(self.vault), AccountMeta::new(self.pt_mint, false),
            AccountMeta::new(self.dr_mint, false), ro(TOKEN_ID)], abi::complete_finalization())
    }

    pub fn abort_ix(&self) -> Instruction {
        ix(vec![signer(self.attestor, false), ro(self.asset_policy), AccountMeta::new(self.series, false),
            AccountMeta::new(self.accumulator, false)], abi::abort_finalization([0xa5; 32]))
    }

    pub fn redeem_ix(&self, side: ClaimSide, amount: u64, allow_zero: bool, state_version: u64) -> Instruction {
        self.redeem_ix_for(side, amount, allow_zero, state_version, self.holder, self.holder_collateral,
            match side { ClaimSide::Pt => self.holder_pt, ClaimSide::Dr => self.holder_dr })
    }

    pub fn redeem_ix_for(&self, side: ClaimSide, amount: u64, allow_zero: bool, state_version: u64, holder: Pubkey, collateral: Pubkey, account: Pubkey) -> Instruction {
        let mint = match side { ClaimSide::Pt => self.pt_mint, ClaimSide::Dr => self.dr_mint };
        ix(vec![signer(holder, false), ro(self.asset_policy), AccountMeta::new(self.series, false),
            ro(self.collateral_mint), AccountMeta::new(self.vault, false), AccountMeta::new(collateral, false),
            AccountMeta::new(mint, false), AccountMeta::new(account, false), ro(TOKEN_ID), ro(TOKEN_2022_ID)],
            abi::redeem(side, amount, allow_zero, Guard { expected_state_version: state_version, expiry_unix_timestamp: i64::MAX, minimum_raw_output: 0 }))
    }

    pub fn update_multiplier(&self, multiplier: f64, effective_timestamp: i64) -> InstructionResult {
        let instruction = scale_instruction::update_multiplier(
            &TOKEN_2022_ID, &self.collateral_mint, &self.mint_authority, &[], multiplier, effective_timestamp,
        ).unwrap();
        self.harness.process(&instruction)
    }

    pub fn series_state(&self) -> SeriesView {
        decode_anchor(self.harness.account(&self.series).expect("series account").data)
    }

    pub fn accumulator_state(&self) -> AccumulatorView {
        decode_anchor(self.harness.account(&self.accumulator).expect("accumulator account").data)
    }

    pub fn collateral_amount(&self, address: Pubkey) -> u64 {
        let account = self.harness.account(&address).expect("collateral token account");
        StateWithExtensions::<TokenAccount>::unpack(&account.data).unwrap().base.amount
    }

    pub fn claim_amount(&self, address: Pubkey) -> u64 {
        let account = self.harness.account(&address).expect("legacy token account");
        LegacyTokenAccount::unpack(&account.data).unwrap().amount
    }

    pub fn mint_external_collateral(&self, destination: Pubkey, amount: u64) -> InstructionResult {
        self.harness.process(&token2022_instruction::mint_to(
            &TOKEN_2022_ID, &self.collateral_mint, &destination, &self.mint_authority, &[], amount,
        ).unwrap())
    }

    pub fn create_collateral_account(&self, address: Pubkey, owner: Pubkey) {
        create_token2022_account(&self.harness, address, self.collateral_mint, owner, self.pausable);
    }

    pub fn create_claim_account(&self, address: Pubkey, mint: Pubkey, owner: Pubkey) {
        create_legacy_token_account(&self.harness, address, mint, owner);
    }

    pub fn transfer_claim(&self, from: Pubkey, to: Pubkey, amount: u64) -> InstructionResult {
        self.harness.process(&token_instruction::transfer(
            &TOKEN_ID, &from, &to, &self.holder, &[], amount,
        ).unwrap())
    }

    pub fn burn_claim_externally(&self, account: Pubkey, mint: Pubkey, amount: u64) -> InstructionResult {
        self.harness.process(&token_instruction::burn(
            &TOKEN_ID, &account, &mint, &self.holder, &[], amount,
        ).unwrap())
    }

    pub fn rotate_collateral_mint_authority(&self, new_authority: Pubkey) -> InstructionResult {
        self.harness.process(&token2022_instruction::set_authority(
            &TOKEN_2022_ID, &self.collateral_mint, Some(&new_authority),
            token2022_instruction::AuthorityType::MintTokens, &self.mint_authority, &[],
        ).unwrap())
    }

    pub fn pause_collateral(&self) -> InstructionResult {
        self.harness.process(&pausable_instruction::pause(
            &TOKEN_2022_ID, &self.collateral_mint, &self.mint_authority, &[],
        ).unwrap())
    }

    pub fn resume_collateral(&self) -> InstructionResult {
        self.harness.process(&pausable_instruction::resume(
            &TOKEN_2022_ID, &self.collateral_mint, &self.mint_authority, &[],
        ).unwrap())
    }

    pub fn freeze_holder_collateral(&self) -> InstructionResult {
        self.harness.process(&token2022_instruction::freeze_account(
            &TOKEN_2022_ID, &self.holder_collateral, &self.collateral_mint,
            &self.mint_authority, &[],
        ).unwrap())
    }

    pub fn burn_collateral_as_delegate(&self, account: Pubkey, amount: u64) -> InstructionResult {
        self.harness.process(&token2022_instruction::burn(
            &TOKEN_2022_ID, &account, &self.collateral_mint,
            &self.mint_authority, &[], amount,
        ).unwrap())
    }
}

fn decode_anchor<T: BorshDeserialize>(data: Vec<u8>) -> T {
    let mut body = &data[8..];
    T::deserialize(&mut body).expect("Anchor account Borsh")
}

fn create_scaled_mint_and_fund_holder(
    harness: &SbfHarness,
    mint: Pubkey,
    token_account: Pubkey,
    authority: Pubkey,
    holder: Pubkey,
    decimals: u8,
    amount: u64,
    multiplier: f64,
    pausable: bool,
    freezable: bool,
    permanent_delegate: bool,
    xstocks: bool,
) {
    let mut mint_extensions = vec![ExtensionType::ScaledUiAmount];
    if pausable { mint_extensions.push(ExtensionType::Pausable); }
    if permanent_delegate { mint_extensions.push(ExtensionType::PermanentDelegate); }
    if xstocks {
        mint_extensions.extend([
            ExtensionType::ConfidentialTransferMint,
            ExtensionType::TransferHook,
            ExtensionType::DefaultAccountState,
        ]);
    }
    let mint_len = ExtensionType::try_calculate_account_len::<Mint>(&mint_extensions).unwrap();
    let account_extensions = ExtensionType::get_required_init_account_extensions(&mint_extensions);
    let token_len = ExtensionType::try_calculate_account_len::<TokenAccount>(&account_extensions).unwrap();
    let mut instructions = vec![
        solana_system_interface::instruction::create_account(&harness.payer, &mint, Rent::default().minimum_balance(mint_len), mint_len as u64, &TOKEN_2022_ID),
        scale_instruction::initialize(&TOKEN_2022_ID, &mint, Some(authority), multiplier).unwrap(),
    ];
    if pausable { instructions.push(pausable_instruction::initialize(&TOKEN_2022_ID, &mint, &authority).unwrap()); }
    if permanent_delegate { instructions.push(token2022_instruction::initialize_permanent_delegate(&TOKEN_2022_ID, &mint, &authority).unwrap()); }
    if xstocks {
        instructions.extend([
            confidential_instruction::initialize_mint(&TOKEN_2022_ID, &mint, Some(authority), true, None).unwrap(),
            hook_instruction::initialize(&TOKEN_2022_ID, &mint, Some(authority), None).unwrap(),
            default_state_instruction::initialize_default_account_state(&TOKEN_2022_ID, &mint, &AccountState::Initialized).unwrap(),
        ]);
    }
    instructions.extend([
        token2022_instruction::initialize_mint2(&TOKEN_2022_ID, &mint, &authority, (freezable || xstocks).then_some(&authority), decimals).unwrap(),
        solana_system_interface::instruction::create_account(&harness.payer, &token_account, Rent::default().minimum_balance(token_len), token_len as u64, &TOKEN_2022_ID),
        token2022_instruction::initialize_account3(&TOKEN_2022_ID, &token_account, &mint, &holder).unwrap(),
        token2022_instruction::mint_to(&TOKEN_2022_ID, &mint, &token_account, &authority, &[], amount).unwrap(),
    ]);
    assert_transaction_success(&harness.process_transaction(&instructions), "create/fund scaled collateral");
}

fn create_legacy_token_account(harness: &SbfHarness, address: Pubkey, mint: Pubkey, owner: Pubkey) {
    let len = LegacyTokenAccount::LEN;
    let result = harness.process_transaction(&[
        solana_system_interface::instruction::create_account(&harness.payer, &address, Rent::default().minimum_balance(len), len as u64, &TOKEN_ID),
        token_instruction::initialize_account3(&TOKEN_ID, &address, &mint, &owner).unwrap(),
    ]);
    assert_transaction_success(&result, "create legacy claim account");
}

fn create_token2022_account(harness: &SbfHarness, address: Pubkey, mint: Pubkey, owner: Pubkey, pausable: bool) {
    let len = if pausable {
        ExtensionType::try_calculate_account_len::<TokenAccount>(&[ExtensionType::PausableAccount]).unwrap()
    } else { TokenAccount::LEN };
    let result = harness.process_transaction(&[
        solana_system_interface::instruction::create_account(&harness.payer, &address, Rent::default().minimum_balance(len), len as u64, &TOKEN_2022_ID),
        token2022_instruction::initialize_account3(&TOKEN_2022_ID, &address, &mint, &owner).unwrap(),
    ]);
    assert_transaction_success(&result, "create Token-2022 holder account");
}

pub fn rejected_profile_registration(profile: RejectedMintProfile) -> InstructionResult {
    let mut harness = SbfHarness::new(PRE_YEAR);
    harness.set_clock_and_slot(PRE_YEAR, 10);
    let mint = key(0xf1);
    let authority = key(0xf2);
    let attestor = key(0xf3);
    harness.insert_account(authority, funded_system_account(1_000_000_000));
    harness.insert_account(attestor, funded_system_account(1_000_000_000));

    let profile_extension = match profile {
        RejectedMintProfile::TransferFee => ExtensionType::TransferFeeConfig,
        RejectedMintProfile::ActiveTransferHook => ExtensionType::TransferHook,
        RejectedMintProfile::DefaultFrozen => ExtensionType::DefaultAccountState,
        RejectedMintProfile::UnsupportedNonTransferable => ExtensionType::NonTransferable,
    };
    let mint_len = ExtensionType::try_calculate_account_len::<Mint>(&[
        ExtensionType::ScaledUiAmount,
        profile_extension,
    ]).unwrap();
    let mut setup = vec![
        solana_system_interface::instruction::create_account(
            &harness.payer,
            &mint,
            Rent::default().minimum_balance(mint_len),
            mint_len as u64,
            &TOKEN_2022_ID,
        ),
        scale_instruction::initialize(&TOKEN_2022_ID, &mint, Some(authority), 1.0).unwrap(),
    ];
    match profile {
        RejectedMintProfile::TransferFee => setup.push(
            transfer_fee_instruction::initialize_transfer_fee_config(
                &TOKEN_2022_ID, &mint, Some(&authority), Some(&authority), 1, 1,
            ).unwrap(),
        ),
        RejectedMintProfile::ActiveTransferHook => setup.push(
            hook_instruction::initialize(&TOKEN_2022_ID, &mint, Some(authority), Some(key(0xf4))).unwrap(),
        ),
        RejectedMintProfile::DefaultFrozen => setup.push(
            default_state_instruction::initialize_default_account_state(
                &TOKEN_2022_ID, &mint, &AccountState::Frozen,
            ).unwrap(),
        ),
        RejectedMintProfile::UnsupportedNonTransferable => setup.push(
            token2022_instruction::initialize_non_transferable_mint(&TOKEN_2022_ID, &mint).unwrap(),
        ),
    }
    setup.push(token2022_instruction::initialize_mint2(
        &TOKEN_2022_ID,
        &mint,
        &authority,
        matches!(profile, RejectedMintProfile::DefaultFrozen).then_some(&authority),
        8,
    ).unwrap());
    assert_transaction_success(&harness.process_transaction(&setup), "create rejected-profile mint with real Token-2022 instructions");

    let config = Pubkey::find_program_address(&[b"config"], &program_id()).0;
    assert_success(&harness.process(&ix(vec![
        AccountMeta::new(config, false), ro(program_id()), ro(program_data_address()),
        signer(harness.upgrade_authority, true), ro(solana_sdk_ids::system_program::ID),
    ], abi::initialize_config([0xf5; 32]))), "rejected-profile config");
    let issuer_id = [0xf6; 32];
    let asset = Pubkey::find_program_address(&[b"asset", &issuer_id, mint.as_ref()], &program_id()).0;
    harness.process(&ix(vec![
        ro(config), signer(harness.upgrade_authority, true), ro(mint), AccountMeta::new(asset, false),
        ro(solana_sdk_ids::system_program::ID),
    ], abi::register_asset(issuer_id, "BAD".to_owned(), attestor.to_bytes(), [0xf7; 32])))
}
