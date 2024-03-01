use ink::{env::DefaultEnvironment, primitives::AccountId, storage::Mapping};
use pendzl::traits::{Balance, Hash};

use crate::{
    finalization::minimum_to_finalize, hashes::hash_proposal, GovernError, Proposal, ProposalHash,
    ProposalId, ProposalState, ProposalStatus, UserVote, Vote, VotingRules,
};

#[derive(Debug)]
#[pendzl::storage_item]
pub struct GovernData {
    #[lazy]
    rules: VotingRules,
    #[lazy]
    active_proposals: u32,
    #[lazy]
    finalized_proposals: u32,
    #[lazy]
    executed_proposals: u32,
    #[lazy]
    next_proposal_id: ProposalId,
    proposal_id_to_hash: Mapping<ProposalId, Hash>,
    proposal_hash_to_id: Mapping<Hash, ProposalId>,
    state: Mapping<ProposalId, ProposalState>,
    votes: Mapping<(AccountId, ProposalId), UserVote>,
}

impl GovernData {
    pub fn new(rules: &VotingRules) -> Self {
        let mut instance = Self {
            rules: Default::default(),
            active_proposals: Default::default(),
            finalized_proposals: Default::default(),
            executed_proposals: Default::default(),
            next_proposal_id: Default::default(),
            proposal_id_to_hash: Default::default(),
            proposal_hash_to_id: Default::default(),
            state: Default::default(),
            votes: Default::default(),
        };
        instance.rules.set(rules);
        instance
    }

    pub fn rules(&self) -> VotingRules {
        self.rules.get().unwrap_or_default()
    }

    pub fn change_rule(&mut self, rules: &VotingRules) {
        self.rules.set(rules);
    }

    pub fn active_proposals(&self) -> u32 {
        self.active_proposals.get().unwrap_or_default()
    }

    pub fn finalized_proposals(&self) -> u32 {
        self.finalized_proposals.get().unwrap_or_default()
    }

    pub fn executed_proposals(&self) -> u32 {
        self.executed_proposals.get().unwrap_or_default()
    }

    pub fn next_proposal_id(&self) -> ProposalId {
        self.next_proposal_id.get().unwrap_or_default()
    }

    pub fn proposal_id_to_hash(&self, proposal_id: &ProposalId) -> Option<Hash> {
        self.proposal_id_to_hash.get(proposal_id)
    }

    pub fn proposal_hash_to_id(&self, proposal_hash: &Hash) -> Option<ProposalId> {
        self.proposal_hash_to_id.get(proposal_hash)
    }

    pub fn register_new_proposal(
        &mut self,
        proposer: &AccountId,
        proposal_hash: &Hash,
        votes_at_start: Balance,
        counter_at_start: u128,
    ) -> Result<ProposalId, GovernError> {
        if self.proposal_hash_to_id(proposal_hash).is_some() {
            return Err(GovernError::ProposalAlreadyExists);
        }

        let proposal_id = self.next_proposal_id();
        self.next_proposal_id.set(&(proposal_id + 1));

        self.proposal_id_to_hash.insert(&proposal_id, proposal_hash);
        self.proposal_hash_to_id
            .insert(&proposal_hash, &proposal_id);

        self.state.insert(
            &proposal_id,
            &ProposalState {
                status: ProposalStatus::Active,
                proposer: *proposer,
                start: ink::env::block_timestamp::<DefaultEnvironment>(),
                counter_at_start,
                votes_at_start,
                finalized: None,
                votes_for: 0,
                votes_against: 0,
                votes_against_with_slash: 0,
            },
        );

        self.active_proposals.set(&(self.active_proposals() + 1));

        Ok(self.next_proposal_id() - 1)
    }

    pub fn finalize(
        &mut self,
        proposal_id: &ProposalId,
        current_counter: u128,
    ) -> Result<ProposalStatus, GovernError> {
        let mut state = self
            .state_of(proposal_id)
            .ok_or(GovernError::ProposalDoesntExist)?;

        if state.status != ProposalStatus::Active {
            return Err(GovernError::WrongStatus);
        }

        let minimum_to_finalize = minimum_to_finalize(
            &state,
            &self.rules(),
            ink::env::block_timestamp::<DefaultEnvironment>(),
            current_counter,
        );

        if state.votes_against + state.votes_against_with_slash >= minimum_to_finalize {
            if state.votes_against_with_slash <= state.votes_against + state.votes_for {
                state.status = ProposalStatus::Defeated;
            } else {
                state.status = ProposalStatus::DefeatedWithSlash;
            }
        } else if state.votes_for >= minimum_to_finalize {
            state.status = ProposalStatus::Succeeded;
        } else {
            return Err(GovernError::FinalizeCondition);
        }

        state.finalized = Some(ink::env::block_timestamp::<DefaultEnvironment>());

        self.state.insert(proposal_id, &state);
        self.active_proposals.set(&(self.active_proposals() - 1));
        self.finalized_proposals
            .set(&(self.finalized_proposals() + 1));

        Ok(state.status)
    }

    pub fn mark_as_executed(&mut self, proposal_id: &ProposalId) -> Result<(), GovernError> {
        let mut state = self
            .state_of(proposal_id)
            .ok_or(GovernError::ProposalDoesntExist)?;
        if state.status != ProposalStatus::Succeeded {
            return Err(GovernError::WrongStatus);
        }
        state.status = ProposalStatus::Executed;
        self.state.insert(proposal_id, &state);
        Ok(())
    }

    pub fn state_of(&self, proposal_id: &ProposalId) -> Option<ProposalState> {
        self.state.get(proposal_id)
    }

    pub fn status_of(&self, proposal_id: &ProposalId) -> Option<ProposalStatus> {
        match self.state_of(proposal_id) {
            Some(state) => Some(state.status),
            None => None,
        }
    }

    pub fn vote_of_for(&self, account: &AccountId, proposal_id: &ProposalId) -> Option<UserVote> {
        self.votes.get(&(*account, *proposal_id))
    }

    pub fn update_vote_of_for(
        &mut self,
        account: &AccountId,
        proposal_id: &ProposalId,
        vote: &Vote,
        amount: &Balance,
    ) -> Result<(), GovernError> {
        if *amount == 0 {
            return Err(GovernError::InnsuficientVotes);
        }
        let mut state = self
            .state_of(&proposal_id)
            .ok_or(GovernError::ProposalDoesntExist)?;
        if state.status != ProposalStatus::Active {
            return Err(GovernError::WrongStatus);
        }

        let user_vote = self.vote_of_for(account, &proposal_id);
        match user_vote {
            None => match vote {
                Vote::Agreed => state.votes_for += *amount,
                Vote::Disagreed => state.votes_against += *amount,
                Vote::DisagreedWithProposerSlashing => state.votes_against_with_slash += *amount,
            },
            Some(old_vote) => match old_vote.vote {
                Vote::Agreed => match vote {
                    Vote::Agreed => {
                        state.votes_for -= old_vote.amount;
                        state.votes_for += *amount;
                    }
                    Vote::Disagreed => {
                        state.votes_for -= old_vote.amount;
                        state.votes_against += *amount;
                    }
                    Vote::DisagreedWithProposerSlashing => {
                        state.votes_for -= old_vote.amount;
                        state.votes_against_with_slash += *amount;
                    }
                },
                Vote::Disagreed => match vote {
                    Vote::Agreed => {
                        state.votes_against -= old_vote.amount;
                        state.votes_for += *amount;
                    }
                    Vote::Disagreed => {
                        state.votes_against -= old_vote.amount;
                        state.votes_against += *amount;
                    }
                    Vote::DisagreedWithProposerSlashing => {
                        state.votes_against -= old_vote.amount;
                        state.votes_against_with_slash += *amount;
                    }
                },
                Vote::DisagreedWithProposerSlashing => match vote {
                    Vote::Agreed => {
                        state.votes_against_with_slash -= old_vote.amount;
                        state.votes_for += *amount;
                    }
                    Vote::Disagreed => {
                        state.votes_against_with_slash -= old_vote.amount;
                        state.votes_against += *amount;
                    }
                    Vote::DisagreedWithProposerSlashing => {
                        state.votes_against_with_slash -= old_vote.amount;
                        state.votes_against_with_slash += *amount;
                    }
                },
            },
        }

        let new_vote = UserVote {
            vote: *vote,
            amount: *amount,
        };

        self.votes.insert(&(*account, *proposal_id), &new_vote);

        self.state.insert(proposal_id, &state);
        Ok(())
    }
}
