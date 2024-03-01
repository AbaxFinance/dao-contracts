use pendzl::traits::{AccountId, Timestamp};

use crate::ProposalHash;

use super::{Proposal, ProposalId, ProposalStatus, Vote, VotingRules};

#[ink::event]
pub struct ProposalCreated {
    #[ink(topic)]
    pub proposal_id: ProposalId,
    #[ink(topic)]
    pub proposal_hash: ProposalHash,
    #[ink(topic)]
    pub proposal: Proposal,
}

#[ink::event]
pub struct ProposalFinalized {
    #[ink(topic)]
    pub proposal_id: ProposalId,
    #[ink(topic)]
    pub status: ProposalStatus,
}

#[ink::event]
pub struct ProposalExecuted {
    #[ink(topic)]
    pub proposal_id: ProposalId,
}

#[ink::event]
pub struct VoteCasted {
    #[ink(topic)]
    pub account: AccountId,
    #[ink(topic)]
    pub proposal_id: ProposalId,
    pub vote: Vote,
}

#[ink::event]
pub struct RulesChanged {
    pub rules: VotingRules,
}

#[ink::event]
pub struct UnstakePeriodChanged {
    pub unstake_period: Timestamp,
}
