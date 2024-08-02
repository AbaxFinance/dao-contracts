use ink::{env::DefaultEnvironment, prelude::vec::Vec};
use pendzl::{math::errors::MathError, traits::AccountId};

use crate::modules::inflator::events::InflationDistributionChanged;
use ink::prelude::borrow::ToOwned;

#[derive(Debug)]
#[pendzl::storage_item]
pub struct InflatorStorage {
    abax_token_account_id: AccountId,
    inflation_distribution: Vec<(AccountId, u16)>,
    total_parts: u16,
}

impl InflatorStorage {
    pub fn new(
        abax_token_account_id: &AccountId,
        inflation_distribution: &[(AccountId, u16)],
    ) -> Result<Self, MathError> {
        let mut instance = InflatorStorage {
            abax_token_account_id: *abax_token_account_id,
            inflation_distribution: inflation_distribution.to_owned(),
            total_parts: 0,
        };
        let mut new_total_parts: u16 = 0;
        for (_, part) in inflation_distribution.iter() {
            new_total_parts = new_total_parts
                .checked_add(*part)
                .ok_or(MathError::Overflow)?;
        }
        instance.total_parts = new_total_parts;

        ink::env::emit_event::<DefaultEnvironment, InflationDistributionChanged>(
            InflationDistributionChanged {
                distribution: inflation_distribution.to_vec(),
            },
        );

        Ok(instance)
    }

    pub fn abax_token_account_id(&self) -> AccountId {
        self.abax_token_account_id
    }

    pub fn inflation_distribution(&self) -> Vec<(AccountId, u16)> {
        self.inflation_distribution.clone()
    }

    pub fn total_parts(&self) -> u16 {
        self.total_parts
    }

    pub fn set_inflation_distribution(
        &mut self,
        inflation_distribution: &[(AccountId, u16)],
    ) -> Result<(), MathError> {
        self.inflation_distribution = inflation_distribution.to_owned();
        let mut new_total_parts: u16 = 0;
        for (_, part) in inflation_distribution.iter() {
            new_total_parts = new_total_parts
                .checked_add(*part)
                .ok_or(MathError::Overflow)?;
        }

        self.total_parts = new_total_parts;

        ink::env::emit_event::<DefaultEnvironment, InflationDistributionChanged>(
            InflationDistributionChanged {
                distribution: inflation_distribution.to_vec(),
            },
        );
        Ok(())
    }
}
