pub use ink::{prelude::vec::Vec, primitives::AccountId};

use super::structs::Operation;

#[ink::event]
pub struct VesterChanged {
    #[ink(topic)]
    pub vester: AccountId,
}

#[ink::event]
pub struct OrderCreated {
    #[ink(topic)]
    pub id: u32,
    pub earliest_execution: u64,
    pub latest_execution: u64,
    pub operations: Vec<Operation>,
}

#[ink::event]
pub struct OrderExecuted {
    #[ink(topic)]
    pub id: u32,
}

#[ink::event]
pub struct OrderCancelled {
    #[ink(topic)]
    pub id: u32,
}
