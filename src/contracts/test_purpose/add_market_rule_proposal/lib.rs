#![cfg_attr(not(feature = "std"), no_std, no_main)]

use ink::{contract_ref, env::DefaultEnvironment, prelude::vec::Vec};
use lending_pool_error::LendingPoolError;

pub type LendingPoolManageRef = contract_ref!(LendingPoolManage, DefaultEnvironment);

/// Defines rules on which asset can be borrowed and used as collateral.
#[derive(Debug, Default, scale::Encode, scale::Decode, Clone, Copy)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct AssetRules {
    /// used while veryfing collateralization. If None then can not be used as collateral.
    pub collateral_coefficient_e6: Option<u128>,
    /// used while veryfing collateralization. If None then can not be borrowed.
    pub borrow_coefficient_e6: Option<u128>,
    /// penalty when liquidated, 1e6 == 100%.
    pub penalty_e6: Option<u128>,
}

/// type used to represent market rule
pub type MarketRule = Vec<Option<AssetRules>>;

/// Trait containing `AccessControl` messages used to manage 'LendingPool' parameters. Used by **managers**.
#[ink::trait_definition]
pub trait LendingPoolManage {
    /// adds new market rule at next martket rule id
    ///
    /// * `market_rule` - list of asset rules for that market rule
    ///
    /// # Errors
    /// * `AccessControl::MisingRole` returned if the caller is not a STABLECOIN_RATE_ADMIN.
    /// * `InvalidAssetRule` returned if the `market_rule` contains invalid AssetRule.
    #[ink(message)]
    fn add_market_rule(&mut self, market_rule: MarketRule) -> Result<(), LendingPoolError>;
}
mod lending_pool_error;

#[ink::contract]
mod add_market_rule_proposal {
    use crate::*;
    #[ink(storage)]
    pub struct Proposal {
        lending_pool: LendingPoolManageRef,
        market_rule: MarketRule,
    }

    impl Proposal {
        #[ink(constructor)]
        pub fn new(
            lending_pool: AccountId,
            //params
            market_rule: MarketRule,
        ) -> Self {
            Self {
                lending_pool: LendingPoolManageRef::from(lending_pool),
                market_rule,
            }
        }

        #[ink(message)]
        pub fn execute(&mut self) -> Result<(), LendingPoolError> {
            self.lending_pool.add_market_rule(self.market_rule.clone())
        }
    }
}
