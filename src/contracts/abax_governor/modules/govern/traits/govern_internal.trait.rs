pub trait AbaxGovernInternal {
    /// Creates new `proposal` with `proposal_id` and `description`
    ///
    /// On success emits `ProposalCreated` event.
    ///
    /// # Returns
    ///
    /// Returns `ProposalId` of the created proposal.
    ///
    /// # Errors
    /// Returns `ProposalAlreadyExists` if `propsal` with the same `proposal_description` exists,
    fn _propose(
        &mut self,
        proposer: &AccountId,
        proposal: &Proposal,
    ) -> Result<ProposalId, GovernError>;

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

    /// Forcefully unstakes all tokens of `account` if:
    /// 1. proposal with `proposal_id` allows for force unstake
    /// 2. `account` has staked some tokens before the proposal was created.
    /// 3. `account` hasn't voted one the proposal.
    ///
    /// On success emits `ForcefullyUnstaked` event.
    ///
    /// # Errors
    /// Returns `ProposalDoesntExist` if proposal doesn't exist.
    /// Returns `WrongStatus` if proposal wasn't finalized in final phase.
    /// Returns `CantForceUnstake` if proposal doesnt allow for force unstake or the 'account' was already force unstaked for not voting on proposal with id >= 'proposal_id'.
    fn _force_unstake(
        &mut self,
        account: &AccountId,
        proposal_id: &ProposalId,
    ) -> Result<(), GovernError>;
}
