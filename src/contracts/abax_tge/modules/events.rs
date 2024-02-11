pub use ink::primitives::AccountId;
pub use pendzl::traits::Balance;
#[ink::event]
pub struct Contribution {
    #[ink(topic)]
    pub contributor: AccountId,
    pub to_create: Balance,
}
#[ink::event]
pub struct PhaseChanged {}
