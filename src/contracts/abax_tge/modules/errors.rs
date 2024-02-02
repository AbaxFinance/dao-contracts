use pendzl::contracts::{finance::general_vest::VestingError, token::psp22::PSP22Error};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum TGEError {
    PSP22Error(PSP22Error),
    CreateVestFailed(VestingError),
    ContributedZero,
    MathError,
    TGENotStarted,
    TGEEnded,
    Phase1TokenCapReached,
}

impl From<PSP22Error> for TGEError {
    fn from(e: PSP22Error) -> Self {
        TGEError::PSP22Error(e)
    }
}

impl From<VestingError> for TGEError {
    fn from(e: VestingError) -> Self {
        TGEError::CreateVestFailed(e)
    }
}
