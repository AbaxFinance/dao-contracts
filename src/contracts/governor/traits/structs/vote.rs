#[derive(Debug, Clone, Copy, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
/// Possibilities to choose during voting
pub enum Vote {
    /// Agree
    Agreed,
    /// Disagree
    Disagreed,
    /// Disagree and slash the proposal. Should be chosen if the proposition is made to hurt the DAO.
    DisagreedWithProposerSlashing,
}
