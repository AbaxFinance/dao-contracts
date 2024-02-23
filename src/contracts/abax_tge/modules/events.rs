pub use ink::primitives::AccountId;
pub use pendzl::traits::Balance;
#[ink::event]
pub struct Contribution {
    #[ink(topic)]
    pub contributor: AccountId,
    pub receiver: AccountId,
    pub to_create: Balance,
    pub bonus: Balance,
    pub referrer: Option<AccountId>,
}
#[ink::event]
pub struct Stakedrop {
    #[ink(topic)]
    pub receiver: AccountId,
    pub amount: Balance,
    pub fee_paid: Balance,
}

#[ink::event]
pub struct BonusMultiplierSet {
    #[ink(topic)]
    pub account: AccountId,
    pub multiplier: u128,
}

#[ink::event]
pub struct PhaseChanged {}
