pub use ink::{prelude::vec::Vec, primitives::AccountId};
pub use pendzl::traits::Balance;

#[ink::event]
pub struct InflationDistributionChanged {
    pub distribution: Vec<(AccountId, u16)>,
}

#[ink::event]
pub struct InflationDistributed {}
