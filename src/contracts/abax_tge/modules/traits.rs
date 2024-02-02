use crate::modules::errors::TGEError;

#[ink::trait_definition]
pub trait AbaxTGE {
    #[ink(message, payable)]
    fn contribute(&mut self) -> Result<u128, TGEError>;
}
