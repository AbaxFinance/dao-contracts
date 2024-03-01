pub type ProposalHash = Hash;

#[ink::trait_definition]
pub trait AbaxGovern {
    /// Propose `proposal` with `describtion`.
    ///
    /// On success emits `ProposalCreated` event.
    ///
    /// # Errors
    /// Returns `ProposalAlreadyExists` if `propsal` with the same `proposal_description` exists,
    /// Returns `InnsuficientVotes` if `caller` has insufficient amount of votes to create a proposal.
    #[ink(message)]
    fn propose(&mut self, proposal: Proposal, description: String) -> Result<(), GovernError>;

    /// Finilize `proposal_id` if the finalization conditions are met.  
    ///
    /// On success emits `ProposalFinalized` event.
    ///
    /// # Errors
    /// Returns `ProposalDoesntExist` if proposal doesn't exist.
    /// Returns `WrongStatus` if proposal is not `Active``.
    /// Returns `FinalizeCondition` if finalize condition isn't met.
    #[ink(message)]
    fn finalize(&mut self, proposal_id: ProposalId) -> Result<(), GovernError>;

    /// Executes the `proposal` which was finalized with `Succeeded` status.
    ///
    /// On success emits `ProposalExecuted` event.
    ///
    /// # Errors
    /// Returns `ProposalDoesntExist` if proposal doesn't exist.
    /// Returns `WrongStatus` if proposal status is not `Succeeded`.
    /// Returns `UnderlyingTransactionReverted` if any of Transactions from the `proposal` fails.
    #[ink(message)]
    fn execute(&mut self, proposal: Proposal) -> Result<(), GovernError>;

    /// Cast vote in the name of `caller` on `proposa_id` for `vote` with `reason`.
    ///
    /// On Success emits `VoteCasted` event.
    ///
    /// # Errors
    /// Returns `InnsuficientVotes` if `caller` has no votes.
    /// Returns `ProposalDoesntExist` if proposal doesn't exist.
    /// Returns `WrongStatus` if proposal status isn't `Active`.
    #[ink(message)]
    fn vote(
        &mut self,
        proposal_id: ProposalId,
        vote: Vote,
        reason: Vec<u8>,
    ) -> Result<(), GovernError>;
}
