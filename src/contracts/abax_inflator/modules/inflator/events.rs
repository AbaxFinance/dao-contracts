pub use ink::{prelude::vec::Vec, primitives::AccountId};

#[ink::event]
pub struct InflationDistributionChanged {
    pub distribution: Vec<(AccountId, u16)>,
}

#[ink::event]
pub struct InflationDistributed {}
