use pendzl::{
    contracts::{
        access_control::AccessControlError, general_vest::VestingError, psp22::PSP22Error,
    },
    math::errors::MathError,
};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum AbaxTreasuryError {
    PSP22Error(PSP22Error),
    MathError(MathError),
    AccessControlError(AccessControlError),
    VestingError(VestingError),

    /// The order with the given ID does not exist - haven't been created or have been already executed or canceled.
    NoSuchOrder,
    ToEarlyToExecute,
    ToLateToExecute,
    NativeTransferFailed,
}

impl From<PSP22Error> for AbaxTreasuryError {
    fn from(e: PSP22Error) -> Self {
        AbaxTreasuryError::PSP22Error(e)
    }
}

impl From<MathError> for AbaxTreasuryError {
    fn from(e: MathError) -> Self {
        AbaxTreasuryError::MathError(e)
    }
}

impl From<VestingError> for AbaxTreasuryError {
    fn from(e: VestingError) -> Self {
        AbaxTreasuryError::VestingError(e)
    }
}

impl From<AccessControlError> for AbaxTreasuryError {
    fn from(e: AccessControlError) -> Self {
        AbaxTreasuryError::AccessControlError(e)
    }
}
