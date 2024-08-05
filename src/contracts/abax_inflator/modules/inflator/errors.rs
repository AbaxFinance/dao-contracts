use pendzl::{
    contracts::{access_control::AccessControlError, psp22::PSP22Error},
    math::errors::MathError,
};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum AbaxInflatorError {
    MathError(MathError),
    PSP22Error(PSP22Error),
    AccessControlError(AccessControlError),
    WrongInflationDistribution,
}

impl From<PSP22Error> for AbaxInflatorError {
    fn from(e: PSP22Error) -> Self {
        AbaxInflatorError::PSP22Error(e)
    }
}

impl From<MathError> for AbaxInflatorError {
    fn from(e: MathError) -> Self {
        AbaxInflatorError::MathError(e)
    }
}

impl From<AccessControlError> for AbaxInflatorError {
    fn from(e: AccessControlError) -> Self {
        AbaxInflatorError::AccessControlError(e)
    }
}
