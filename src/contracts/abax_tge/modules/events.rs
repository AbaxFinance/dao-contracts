pub use ink::primitives::AccountId;
pub use pendzl::traits::Balance;
#[ink::event]
pub struct Contribution {
    #[ink(topic)]
    pub contributor: AccountId,
    #[ink(topic)]
    pub amount_issued: u128,
    pub amount_contributed: Balance,
}
#[ink::event]
pub struct PhaseChanged {}
