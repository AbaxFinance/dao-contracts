use pendzl::contracts::{
    access::access_control::AccessControlError, finance::general_vest::VestingError,
    token::psp22::PSP22Error,
};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum TGEError {
    PSP22Error(PSP22Error),
    AccessControlError(AccessControlError),
    CreateVestFailed(VestingError),
    AmountLessThanMinimum,
    MathError,
    TGENotStarted,
    TGEStarted,
    TGEEnded,
    Phase1TokenCapReached,
    ContributionViaContract,
    InvalidReferrer,
    NoReservedTokens,
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

impl From<AccessControlError> for TGEError {
    fn from(error: AccessControlError) -> Self {
        TGEError::AccessControlError(error)
    }
}
