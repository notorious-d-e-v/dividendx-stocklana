use {
    mollusk_svm::{
        account_store::AccountStore,
        program::{create_program_account_loader_v3, loader_keys},
        result::{types::TransactionResult, InstructionResult},
        Mollusk, MolluskContext,
    },
    serde::Deserialize,
    sha2::{Digest, Sha256},
    solana_account::Account,
    solana_instruction::{AccountMeta, Instruction},
    solana_loader_v3_interface::state::UpgradeableLoaderState,
    solana_pubkey::Pubkey,
    solana_rent::Rent,
    std::{
        collections::HashMap,
        fs,
        path::{Path, PathBuf},
        str::FromStr,
    },
};

pub const PROGRAM_ID_TEXT: &str = "2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE";
pub const TEST_UPGRADE_AUTHORITY_BYTES: [u8; 32] = [0xa1; 32];
pub const TEST_PAYER_BYTES: [u8; 32] = [0xb2; 32];

pub type AccountMap = HashMap<Pubkey, Account>;
pub type ProtocolContext = MolluskContext<AccountMap>;

pub fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_TEXT).expect("fixed DividendX program id")
}

pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repository root")
}

pub fn compiled_elf_path() -> PathBuf {
    repo_root().join("target/deploy/dividendx.so")
}

pub fn read_compiled_elf() -> Vec<u8> {
    let path = compiled_elf_path();
    let elf = fs::read(&path).unwrap_or_else(|error| {
        panic!(
            "compiled SBF program is required at {}: {error}",
            path.display()
        )
    });
    assert!(
        elf.len() > 4 && elf[..4] == [0x7f, b'E', b'L', b'F'],
        "{} is not an ELF program",
        path.display()
    );
    elf
}

pub fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(&[program_id().as_ref()], &loader_keys::LOADER_V3).0
}

fn program_data_account(elf: &[u8], upgrade_authority: Pubkey) -> Account {
    let offset = UpgradeableLoaderState::size_of_programdata_metadata();
    let mut data = vec![0; offset + elf.len()];
    bincode::serialize_into(
        &mut data[..offset],
        &UpgradeableLoaderState::ProgramData {
            slot: 0,
            upgrade_authority_address: Some(upgrade_authority),
        },
    )
    .expect("serialize ProgramData metadata");
    data[offset..].copy_from_slice(elf);
    Account {
        lamports: Rent::default().minimum_balance(data.len()),
        data,
        owner: loader_keys::LOADER_V3,
        executable: false,
        rent_epoch: 0,
    }
}

pub fn funded_system_account(lamports: u64) -> Account {
    Account {
        lamports,
        owner: solana_sdk_ids::system_program::ID,
        ..Account::default()
    }
}

pub struct SbfHarness {
    pub context: ProtocolContext,
    pub upgrade_authority: Pubkey,
    pub payer: Pubkey,
    pub elf_sha256: [u8; 32],
}

impl SbfHarness {
    pub fn new(unix_timestamp: i64) -> Self {
        Self::new_with_upgrade_authority(
            unix_timestamp,
            Pubkey::new_from_array(TEST_UPGRADE_AUTHORITY_BYTES),
        )
    }

    pub fn new_with_upgrade_authority(unix_timestamp: i64, upgrade_authority: Pubkey) -> Self {
        let elf = read_compiled_elf();
        let program_id = program_id();
        let payer = Pubkey::new_from_array(TEST_PAYER_BYTES);

        let mut mollusk = Mollusk::default();
        mollusk.add_program_with_loader_and_elf(&program_id, &loader_keys::LOADER_V3, &elf);
        mollusk_svm_programs_token::token::add_program(&mut mollusk);
        mollusk_svm_programs_token::token2022::add_program(&mut mollusk);
        mollusk_svm_programs_token::associated_token::add_program(&mut mollusk);
        mollusk.sysvars.clock.unix_timestamp = unix_timestamp;

        let mut accounts = AccountMap::new();
        accounts.insert(program_id, create_program_account_loader_v3(&program_id));
        accounts.insert(
            program_data_address(),
            program_data_account(&elf, upgrade_authority),
        );
        accounts.insert(upgrade_authority, funded_system_account(10_000_000_000_000));
        accounts.insert(payer, funded_system_account(10_000_000_000_000));

        let elf_sha256: [u8; 32] = Sha256::digest(&elf).into();
        Self {
            context: mollusk.with_context(accounts),
            upgrade_authority,
            payer,
            elf_sha256,
        }
    }

    pub fn set_clock(&mut self, unix_timestamp: i64) {
        self.context.mollusk.sysvars.clock.unix_timestamp = unix_timestamp;
    }

    pub fn set_clock_and_slot(&mut self, unix_timestamp: i64, slot: u64) {
        self.context.mollusk.sysvars.clock.unix_timestamp = unix_timestamp;
        self.context.mollusk.sysvars.clock.slot = slot;
    }

    pub fn process(&self, instruction: &Instruction) -> InstructionResult {
        self.context.process_instruction(instruction)
    }

    pub fn process_transaction(&self, instructions: &[Instruction]) -> TransactionResult {
        self.context.process_transaction_instructions(instructions)
    }

    pub fn account(&self, key: &Pubkey) -> Option<Account> {
        self.context.account_store.borrow().get_account(key)
    }

    pub fn insert_account(&self, key: Pubkey, account: Account) {
        self.context.account_store.borrow_mut().store_account(key, account);
    }
}

pub fn anchor_discriminator(namespace: &str, name: &str) -> [u8; 8] {
    let digest = Sha256::digest(format!("{namespace}:{name}").as_bytes());
    digest[..8].try_into().expect("eight-byte discriminator")
}

pub fn anchor_instruction_data(name: &str, arguments: &[u8]) -> Vec<u8> {
    let mut data = anchor_discriminator("global", name).to_vec();
    data.extend_from_slice(arguments);
    data
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdkAccountMeta {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdkInstructionVector {
    pub name: String,
    pub program_id: String,
    pub accounts: Vec<SdkAccountMeta>,
    pub data_hex: String,
}

impl SdkInstructionVector {
    pub fn instruction(&self) -> Instruction {
        Instruction {
            program_id: Pubkey::from_str(&self.program_id).expect("vector program id"),
            accounts: self
                .accounts
                .iter()
                .map(|account| {
                    let pubkey = Pubkey::from_str(&account.pubkey).expect("vector account pubkey");
                    if account.is_writable {
                        AccountMeta::new(pubkey, account.is_signer)
                    } else {
                        AccountMeta::new_readonly(pubkey, account.is_signer)
                    }
                })
                .collect(),
            data: hex::decode(&self.data_hex).expect("vector instruction hex"),
        }
    }
}

pub fn read_sdk_vectors(path: &Path) -> Vec<SdkInstructionVector> {
    let bytes = fs::read(path).unwrap_or_else(|error| {
        panic!("SDK vector file is required at {}: {error}", path.display())
    });
    serde_json::from_slice(&bytes).expect("valid SDK instruction vector JSON")
}
