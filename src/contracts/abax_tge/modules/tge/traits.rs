use pendzl::{
    contracts::psp22::PSP22Error,
    traits::{AccountId, Balance},
};

use crate::modules::tge::errors::TGEError;

#[ink::trait_definition]
/// Trait defining the functions for the TGE module.
pub trait AbaxTGE {
    /// Initializes the TGE.
    /// Reserves tokens for foundation, strategic reserves and founders.
    ///
    /// # Errors
    ///
    /// Returns "AlreadyInitialized" if the TGE has already been initialized.
    #[ink(message)]
    fn init(&mut self) -> Result<(), TGEError>;
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

    /// Collect reserved tokens for account and distributes them to account..
    ///
    /// # Returns
    ///
    /// Returns the amount of reserved tokens collected, or an error if the collection fails.
    #[ink(message)]
    fn collect_reserved(&mut self, account: AccountId) -> Result<Balance, TGEError>;

    #[ink(message)]
    fn set_exp_bonus_multiplier_e3(
        &mut self,
        contributor: AccountId,
        bonus_multiplier_e3: u16,
    ) -> Result<(), TGEError>;

    #[ink(message)]
    fn register_referrer(&mut self, referrer: AccountId) -> Result<(), TGEError>;
}

#[ink::trait_definition]
pub trait AbaxTGEView {
    #[ink(message)]
    fn tge_parameters(
        &self,
    ) -> (
        u64,
        Option<u64>,
        u64,
        AccountId,
        AccountId,
        AccountId,
        AccountId,
        AccountId,
        AccountId,
        u128,
        u128,
    );
    #[ink(message)]
    fn total_amount_minted(&self) -> Balance;

    #[ink(message)]
    fn exp_bonus_multiplier_of_e3(&self, contributor: AccountId) -> u16;

    #[ink(message)]
    fn contribution_bonus_multiplier_of_e3(&self, contributor: AccountId) -> u16;

    #[ink(message)]
    fn is_referrer(&self, contributor: AccountId) -> bool;

    #[ink(message)]
    fn reserved_for(&self, account: AccountId) -> Balance;

    #[ink(message)]
    fn contributed_amount_by(&self, account: AccountId) -> Balance;

    #[ink(message)]
    fn generated_base_amount_by(&self, account: AccountId) -> Balance;

    #[ink(message)]
    fn generated_bonus_amount_by(&self, account: AccountId) -> Balance;

    #[ink(message)]
    fn calculate_cost(&self, to_create: Balance) -> Balance;
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
