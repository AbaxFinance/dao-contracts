#[derive(Debug, Clone, Copy, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct ProposalState {
    /// proposal status
    pub status: ProposalStatus,
    /// if proposal was finalized in final phase, then it's possible to force unstake
    pub force_unstake_possible: bool,
    /// the proposer
    pub proposer: AccountId,
    /// time of proposition
    pub start: Timestamp,
    /// Stake::total_stake at start
    pub votes_at_start: Balance,
    /// Stake::counter_stake at start
    pub counter_at_start: Balance,
    /// time of proposal finalization. Some if proposal finalized. None if porposal is not finalized yet.
    pub finalized: Option<Timestamp>,
    /// amount of votes to accept the proposal
    pub votes_for: Balance,
    /// amount of votes to reject proposal
    pub votes_against: Balance,
    /// amount of votes to reject proposal and slash the proposer
    pub votes_against_with_slash: Balance,
}
