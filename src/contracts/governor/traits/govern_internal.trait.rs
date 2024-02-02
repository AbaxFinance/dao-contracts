pub trait GovernInternal {
    /// Creates new `proposal` with `proposal_id` and `description`
    ///
    /// On success emits `ProposalCreated` event.
    ///
    /// # Errors
    /// Returns `ProposalAlreadyExists` if `propsal` with the same `proposal_description` exists,
    fn _propose(&mut self, proposer: &AccountId, proposal: &Proposal) -> Result<(), GovernError>;

    fn _cast_vote(
        &mut self,
        voter: &AccountId,
        proposal_id: ProposalId,
        vote: Vote,
        #[allow(unused_variables)] reason: Vec<u8>,
    ) -> Result<(), GovernError>;

    /// Finalizes proposal identified by `proposal_id`
    ///
    /// On success emits `ProposalFinalized` event.
    ///
    /// # Errors
    /// Returns `ProposalDoesntExist` if there is no proposal identified by `proposal_id.
    /// Returns `NotActive` if proposal identified by `proposal_id` isnt Active.
    /// Returns `FinalizeCondition` if finalization condition wasn`t met.
    /// Returns `TransferError` if proposal was finalized with `Succeeded`, `Defeated` and transfering  deposit of native currency to the proposer failed.
    fn _finalize(&mut self, proposal_id: &ProposalId) -> Result<(), GovernError>;

    /// Executes the `proposal`
    ///
    /// On success emits `ProposalExecuted` event.
    ///
    /// # Errors
    /// Returns `ProposalDoesntExist` if there is no proposal identified by `proposal_id.
    /// Returns `WronfStatus` if proposal identified by `proposal_id` has different than Succeeded status.
    /// Returns `UnderlyingTransactionReverted` if any of Transactions from the `proposal` fails.
    fn _execute(&mut self, proposal: &Proposal) -> Result<(), GovernError>;
}
