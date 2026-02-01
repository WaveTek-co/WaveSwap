pub mod claim;
pub mod initialize_pool;
pub mod stake;
pub mod unstake;

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};

pub enum StakeInstruction {
    InitializePool,
    Stake { amount: u64 },
    Claim,
    Unstake,
}

impl StakeInstruction {
    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        Ok(match data[0] {
            0 => Self::InitializePool,
            1 => {
                let amount = u64::from_le_bytes(data[1..9].try_into().unwrap());
                Self::Stake { amount }
            }
            2 => Self::Claim,
            3 => Self::Unstake,
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }

    pub fn process(&self, program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        match self {
            Self::InitializePool => initialize_pool::handler(program_id, accounts),
            Self::Stake { amount } => stake::handler(program_id, accounts, *amount),
            Self::Claim => claim::handler(program_id, accounts),
            Self::Unstake => unstake::handler(program_id, accounts),
        }
    }
}
