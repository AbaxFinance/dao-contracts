use super::errors::AbaxInflatorError;
use ink::prelude::vec::Vec;
use pendzl::traits::{AccountId, Balance};

#[ink::trait_definition]
/// Trait defining the functions for the Abax Inflator module.
pub trait AbaxInflator {
    /// Inflates the tokens and distributes them according to the inflation distribution.
    #[ink(message)]
    fn inflate(&mut self, amount: Balance) -> Result<(), AbaxInflatorError>;
}

#[ink::trait_definition]
pub trait AbaxInflatorView {
    /// Returns Abax Token Acccount Id
    #[ink(message)]
    fn abax_token_account_id(&self) -> AccountId;

    /// Returns Inflation Distribution. i.e Accounts and their respective inflation part.
    #[ink(message)]
    fn inflation_distribution(&self) -> Vec<(AccountId, u16)>;
}

#[ink::trait_definition]
pub trait AbaxInflatorManage {
    /// Sets the inflation distribution.
    #[ink(message)]
    fn set_inflation_distribution(
        &mut self,
        inflation_distribution: Vec<(AccountId, u16)>,
    ) -> Result<(), AbaxInflatorError>;
}
