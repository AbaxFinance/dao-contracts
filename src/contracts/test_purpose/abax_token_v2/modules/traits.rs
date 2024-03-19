use pendzl::traits::{AccountId, Balance};

use pendzl::contracts::psp22::PSP22Error;

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
