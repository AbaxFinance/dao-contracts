use pendzl::{
    contracts::token::psp22::PSP22Error,
    traits::{AccountId, Balance},
};

use crate::modules::errors::TGEError;

#[ink::trait_definition]
pub trait AbaxTGE {
    #[ink(message)]
    fn contribute(
        &mut self,
        to_create: Balance,
        receiver: AccountId,
        referrer: Option<AccountId>,
    ) -> Result<u128, TGEError>;

    #[ink(message)]
    fn stakedrop(
        &mut self,
        to_create: Balance,
        fee_paid: Balance,
        receiver: AccountId,
    ) -> Result<(), TGEError>;

    #[ink(message)]
    fn collect_reserved(&mut self) -> Result<(), TGEError>;
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
