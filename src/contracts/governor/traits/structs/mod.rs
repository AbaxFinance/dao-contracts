use ink::primitives::Hash;
pub use pendzl::traits::{AccountId, Balance, Timestamp};

pub type ProposalId = u32;

include!("voting_rules.rs");
include!("proposal_state.rs");
include!("proposal_status.rs");
include!("proposal.rs");
include!("transaction.rs");
include!("user_vote.rs");
include!("vote.rs");
