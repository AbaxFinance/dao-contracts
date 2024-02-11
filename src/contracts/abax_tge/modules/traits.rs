use pendzl::traits::Balance;

use crate::modules::errors::TGEError;

#[ink::trait_definition]
pub trait AbaxTGE {
    #[ink(message, payable)]
    fn contribute(&mut self, to_create: Balance) -> Result<u128, TGEError>;
}
