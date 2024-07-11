#![cfg_attr(not(feature = "std"), no_std, no_main)]
use ink::prelude::string::{String, ToString};

use ink::{contract_ref, env::DefaultEnvironment, prelude::vec::Vec, primitives::AccountId};
use lending_pool_error::LendingPoolError;
use pendzl::traits::Balance;

pub type LendingPoolManageRef = contract_ref!(LendingPoolManage, DefaultEnvironment);

/// Stores restrictions made on the reserve
#[derive(Debug, scale::Encode, scale::Decode, Default, Copy, Clone)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct ReserveRestrictions {
    /// maximal allowed total deposit
    pub maximal_total_deposit: Option<Balance>,
    /// maximal allowad total debt
    pub maximal_total_debt: Option<Balance>,
    /// minimal collateral that can be used by each account.
    /// if account's collateral drops below this value (during withdraw) then it will be automatically turned off (as collateral).
    /// it may happen during liquidation that accounts collateral will drop below this value.
    pub minimal_collateral: Balance,
    /// minimal debt that can be taken and maintained by each account.
    /// At any time account's debt can not bee smaller than minimal debt.
    pub minimal_debt: Balance,
}

/// used to manage interest rate model
#[derive(Debug, Default, scale::Encode, scale::Decode, Clone, Copy)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct InterestRateModelParams {
    pub target_ur_e6: u32,
    pub min_rate_at_target_e18: u64,
    pub max_rate_at_target_e18: u64,

    pub rate_at_max_ur_e18: u64,

    pub minimal_time_between_adjustments: u64,
}

#[derive(Debug, Default, scale::Encode, scale::Decode, Clone, Copy)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct SetReserveFeesArgs {
    /// fee is used to accumulate accounts debt interest. The real rate is the current_borrow_rate * (1+fee). 10^6 =100%
    pub debt_fee_e6: u32,
    /// fee is used to accumulate accounts deposit interest. The real rate is the current_deposit_rate * (1-fee). 10^6 =100%
    pub deposit_fee_e6: u32,
}

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

/// Trait containing `AccessControl` messages used to manage 'LendingPool' parameters. Used by **managers**.
#[ink::trait_definition]
pub trait LendingPoolManage {
    /// Registers new asset in the `LendingPool`'s storage and instaniates 'AToken' and 'VToken' for the reserve.
    ///
    /// * `asset` - `AccountId` of the registered asset
    /// * `a_token_code_hash` - code hash that will be used to initialize `AToken`
    /// * `v_token_code_hash` - code hash that will be used to initialize `vToken`
    /// * `name` - name of the `asset`. It will be used to create names for `AToken` and `VToken`.     
    /// * `symbol` - symbol of the `asset`. It will be used to create sumbol for `AToken` and `VToken`.     
    /// * `decimals` - a decimal denominator of an asset (number already multiplied by 10^N where N is number of decimals)
    /// * `asset_rules' - `asset`'s AssetRules that will be used in default market rule (id = 0).
    /// * `maximal_total_deposit` - maximal allowed total deposit. None for uncapped.
    /// * `maximal_total_debt` - maximal allowed total debt. None for uncapped.
    /// * `minimal_collateral` - the required minimal deposit of the asset by account to turn asset to be collateral.
    /// * `minimal_debt` - the minimal possible debt that can be taken by account.
    /// * `interest_rate_model` - check InterestRateModelParams
    /// * `income_for_suppliers_part_e6` - indicates which part of an income should suppliers be paid - in E6 notation (multiplied by 10^6)
    ///
    /// # Errors
    /// * `AccessControl::MisingRole` returned if the caller is not a ASSET_LISTING_ADMIN.
    /// * `AlreadyRegistered` returned if asset was already registered.
    /// * `InvalidAssetRule` returned if asset rule is invalid.
    #[ink(message)]
    #[allow(clippy::too_many_arguments)]
    fn register_asset(
        &mut self,
        asset: AccountId,
        a_token_code_hash: [u8; 32],
        v_token_code_hash: [u8; 32],
        name: String,
        symbol: String,
        decimals: u8,
        asset_rules: AssetRules,
        reserve_restrictions: ReserveRestrictions,
        fees: SetReserveFeesArgs,
        interest_rate_model_params: Option<InterestRateModelParams>,
    ) -> Result<(), LendingPoolError>;
}
mod lending_pool_error;

#[ink::contract]
mod register_asset_proposal {
    use crate::*;
    #[ink(storage)]
    pub struct Proposal {
        lending_pool: LendingPoolManageRef,
        asset: AccountId,
        a_token_code_hash: [u8; 32],
        v_token_code_hash: [u8; 32],
        name: String,
        symbol: String,
        decimals: u8,
        asset_rules: AssetRules,
        reserve_restrictions: ReserveRestrictions,
        fees: SetReserveFeesArgs,
        interest_rate_model_params: Option<InterestRateModelParams>,
    }

    impl Proposal {
        #[ink(constructor)]
        pub fn new(
            lending_pool: AccountId,
            //register asset params
            asset: AccountId,
            a_token_code_hash: [u8; 32],
            v_token_code_hash: [u8; 32],
            name: String,
            symbol: String,
            decimals: u8,
            asset_rules: AssetRules,
            reserve_restrictions: ReserveRestrictions,
            fees: SetReserveFeesArgs,
            interest_rate_model_params: Option<InterestRateModelParams>,
        ) -> Self {
            Self {
                lending_pool: LendingPoolManageRef::from(lending_pool),
                asset,
                a_token_code_hash,
                v_token_code_hash,
                name,
                symbol,
                decimals,
                asset_rules,
                reserve_restrictions,
                fees,
                interest_rate_model_params,
            }
        }

        #[ink(message)]
        pub fn execute(&mut self) -> Result<(), LendingPoolError> {
            self.lending_pool.register_asset(
                self.asset,
                self.a_token_code_hash,
                self.v_token_code_hash,
                self.name.clone(),
                self.symbol.clone(),
                self.decimals,
                self.asset_rules,
                self.reserve_restrictions,
                self.fees,
                self.interest_rate_model_params,
            )
        }
    }
}
