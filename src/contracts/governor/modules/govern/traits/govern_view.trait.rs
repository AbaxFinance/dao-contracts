#[ink::trait_definition]
pub trait AbaxGovernView {
    /// Returns account of the vester which is used to unstake tokens.
    #[ink(message)]
    fn vester(&self) -> AccountId;

    /// Returns hash of the `proposal`.
    #[ink(message)]
    fn hash(&self, proposal: Proposal) -> ProposalHash;

    /// Returns hash of the description.
    #[ink(message)]
    fn hash_description(&self, description: String) -> Hash;

    /// Returns hash of the `proposal.
    #[ink(message)]
    fn hash_by_id(&self, proposal_id: ProposalId) -> Option<ProposalHash>;

    /// Returns 'VotingRules' used for proposing and voting.
    #[ink(message)]
    fn rules(&self) -> VotingRules;

    /// Returns ProposalStatus of proposal with proposal_id (proposal Hash) if it exists.
    #[ink(message)]
    fn status(&self, proposal_id: ProposalId) -> Option<ProposalStatus>;

    /// Returns minimum to finalize proposal at current timestamp
    #[ink(message)]
    fn minimum_to_finalize(&self, proposal_id: ProposalId) -> Option<Balance>;

    /// Returns ProposalStatus of proposal with proposal_id (proposal Hash) if it exists.
    #[ink(message)]
    fn state(&self, proposal_id: ProposalId) -> Option<ProposalState>;

    /// Returns `account` vote for proposal `proposal_id` if it exists.
    #[ink(message)]
    fn vote_of_for(&self, account: AccountId, proposal_id: ProposalId) -> Option<UserVote>;

    /// Returns `account` last proposalId that was used for force unstake.
    #[ink(message)]
    fn last_force_unstakes(&self, account: AccountId) -> Option<ProposalId>;

    /// Returns last timestamp at which 'account' has staked while having empty stake.
    #[ink(message)]
    fn last_stake_timestamp(&self, account: AccountId) -> Option<Timestamp>;
}
