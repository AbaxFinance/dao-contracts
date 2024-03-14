use pendzl::contracts::{
    access::access_control::AccessControlError, finance::general_vest::VestingError,
    token::psp22::PSP22Error,
};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum AbaxTreasuryError {
    PSP22Error(PSP22Error),
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
