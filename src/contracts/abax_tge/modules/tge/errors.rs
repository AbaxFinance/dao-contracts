use pendzl::{
    contracts::{
        access_control::AccessControlError, general_vest::VestingError, psp22::PSP22Error,
    },
    math::errors::MathError,
};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum TGEError {
    PSP22Error(PSP22Error),

    MathError(MathError),
    AccessControlError(AccessControlError),
    CreateVestFailed(VestingError),
    AmountLessThanMinimum,
    TGENotStarted,
    TGEStarted,
    TGEEnded,
    Phase1TokenCapReached,
    ContributionViaContract,
    InvalidReferrer,
    NoReservedTokens,
    AlreadyInitialized,
}

impl From<PSP22Error> for TGEError {
    fn from(e: PSP22Error) -> Self {
        TGEError::PSP22Error(e)
    }
}

impl From<MathError> for TGEError {
    fn from(e: MathError) -> Self {
        TGEError::MathError(e)
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
