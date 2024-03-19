use ink::storage::Mapping;
use pendzl::{math::errors::MathError, traits::Balance};

use crate::modules::govern::traits::ProposalId;

#[derive(Debug, Default)]
#[pendzl::storage_item]
pub struct LockedSharesData {
    locked: Mapping<ProposalId, Balance>,
}

impl LockedSharesData {
    pub fn locked(&self, proposal_id: &ProposalId) -> Balance {
        self.locked.get(proposal_id).unwrap_or_default()
    }

    pub fn lock(&mut self, proposal_id: &ProposalId, amount: Balance) -> Result<(), MathError> {
        let mut locked = self.locked(proposal_id);
        locked = locked.checked_add(amount).ok_or(MathError::Overflow)?;
        self.locked.insert(proposal_id, &locked);
        Ok(())
    }

    pub fn unlock(&mut self, proposal_id: &ProposalId, amount: Balance) -> Result<(), MathError> {
        let mut locked = self.locked(proposal_id);
        locked = locked.checked_sub(amount).ok_or(MathError::Underflow)?;
        if locked > 0 {
            self.locked.insert(proposal_id, &locked);
        } else {
            self.locked.remove(proposal_id);
        }
        Ok(())
    }
}
