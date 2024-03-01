use pendzl::{
    contracts::token::psp22::PSP22Error,
    traits::{AccountId, Balance},
};

use crate::modules::errors::TGEError;

#[ink::trait_definition]
/// Trait defining the functions for the TGE module.
pub trait AbaxTGE {
    /// Contribute function for the TGE module.
    ///
    /// # Arguments
    ///
    /// * `to_create` - The amount of tokens to create.
    /// * `receiver` - The account ID of the receiver.
    /// * `referrer` - An optional account ID of the referrer.
    ///
    /// # Returns
    ///
    /// Returns the amount of tokens created as a result of the contribution, or an error if the contribution fails.
    #[ink(message)]
    fn contribute(
        &mut self,
        to_create: Balance,
        receiver: AccountId,
        referrer: Option<AccountId>,
    ) -> Result<u128, TGEError>;

    /// Stakedrop function for the TGE module.
    ///
    /// # Arguments
    ///
    /// * `to_create` - The amount of tokens to create.
    /// * `fee_paid` - The fee paid for the stakedrop.
    /// * `receiver` - The account ID of the receiver.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the stakedrop is successful, or an error if the stakedrop fails.
    #[ink(message)]
    fn stakedrop(
        &mut self,
        to_create: Balance,
        fee_paid: Balance,
        receiver: AccountId,
    ) -> Result<(), TGEError>;

    /// Collect reserved function for the TGE module.
    ///
    /// # Returns
    ///
    /// Returns the amount of reserved tokens collected, or an error if the collection fails.
    #[ink(message)]
    fn collect_reserved(&mut self) -> Result<Balance, TGEError>;
}

use ink::{contract_ref, env::DefaultEnvironment};
pub type AbaxTokenRef = contract_ref!(AbaxToken, DefaultEnvironment);

#[ink::trait_definition]
pub trait AbaxToken {
    #[ink(message)]
    fn generate(&mut self, to: AccountId, amount: Balance) -> Result<(), PSP22Error>;

    #[ink(message)]
    fn inflation_rate_per_milisecond(&self) -> Balance;

    #[ink(message)]
    fn cap(&self) -> Balance;
}
