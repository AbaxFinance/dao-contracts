use pendzl::traits::String;
pub use pendzl::{
    contracts::{access_control::AccessControlError, psp22::PSP22Error},
    math::errors::MathError,
};

#[derive(scale::Encode, scale::Decode, Debug)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum GovernError {
    MathError(MathError),
    PSP22Error(PSP22Error),
    InsuficientVotes,
    ProposalAlreadyExists,
    ProposalDoesntExist,
    WrongStatus,
    TooEarlyToExecuteProposal,
    FinalizeCondition,
    UnderlyingTransactionReverted(String),
    CantForceUnstake,
    AccessControlError(AccessControlError),
    UnstakeShorterThanVotingPeriod,
}

impl From<MathError> for GovernError {
    fn from(error: MathError) -> Self {
        GovernError::MathError(error)
    }
}

impl From<PSP22Error> for GovernError {
    fn from(error: PSP22Error) -> Self {
        GovernError::PSP22Error(error)
    }
}

impl From<AccessControlError> for GovernError {
    fn from(error: AccessControlError) -> Self {
        GovernError::AccessControlError(error)
    }
}
