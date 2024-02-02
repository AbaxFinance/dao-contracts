#[derive(Debug, Clone, Copy, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
pub enum ProposalStatus {
    /// VotingPeriod
    Active,
    /// Reejcted by DAO
    Defeated,
    /// Rejected by DAO. Proposer was slashed.
    DefeatedWithSlash,
    /// Accepted by DAO. Ready for execution.
    Succeeded,
    /// Executed
    Executed,
}
