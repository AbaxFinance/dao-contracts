use ink::{prelude::vec::Vec, primitives::AccountId};
use pendzl::{
    contracts::general_vest::VestingSchedule,
    traits::{Balance, Timestamp},
};

pub type OrderId = u32;

#[derive(Debug, Clone, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct Order {
    pub earliest_execution: Timestamp,
    pub latest_execution: Timestamp,
    pub operations: Vec<Operation>,
}

#[derive(Debug, Clone, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub enum Operation {
    NativeTransfer(NativeTransfer),
    PSP22Transfer(PSP22Transfer),
    Vest(Vest),
}

#[derive(Debug, Clone, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct Vest {
    pub receiver: AccountId,
    pub asset: Option<AccountId>,
    pub amount: Balance,
    pub schedule: VestingSchedule,
}

#[derive(Debug, Clone, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct PSP22Transfer {
    pub asset: AccountId,
    pub to: AccountId,
    pub amount: Balance,
}

#[derive(Debug, Clone, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct NativeTransfer {
    pub to: AccountId,
    pub amount: Balance,
}
