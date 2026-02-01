use solana_program::program_error::ProgramError;

#[repr(u32)]
pub enum StakeError {
    InvalidOwner = 6000,
    MathOverflow,
}

impl From<StakeError> for ProgramError {
    fn from(e: StakeError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
