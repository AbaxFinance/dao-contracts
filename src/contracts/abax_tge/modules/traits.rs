use pendzl::traits::{AccountId, Balance};

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
