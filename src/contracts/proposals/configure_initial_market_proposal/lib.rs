#![cfg_attr(not(feature = "std"), no_std, no_main)]

use abax_contracts::lending_pool::LendingPoolError;
#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum ProposalError {
    LendingPoolError(LendingPoolError),
    ProposalAlreadyExecuted,
}

impl From<LendingPoolError> for ProposalError {
    fn from(error: LendingPoolError) -> Self {
        ProposalError::LendingPoolError(error)
    }
}

#[ink::contract]
mod configure_initial_market_proposal {
    use crate::ProposalError;
    use abax_contracts::lending_pool::SetReserveFeesArgs;
    use abax_library::structs::{AssetRules, InterestRateModelParams, ReserveRestrictions};

    use abax_contracts::lending_pool::{LendingPoolManage, LendingPoolManageRef};
    use ink::{
        codegen::TraitCallBuilder,
        prelude::{vec, vec::Vec},
        ToAccountId,
    };
    use pendzl::contracts::{
        access_control::{AccessControl, AccessControlRef},
        psp22::metadata::{PSP22Metadata, PSP22MetadataRef},
    };

    struct TokenToDeploy {
        address: AccountId,
        fees: SetReserveFeesArgs,
        interest_rate_model_params: InterestRateModelParams,
        default_rule: AssetRules,
        restrictions: ReserveRestrictions,
    }

    // 0.01 % / 365 * 24 * 60 * 60 * E18
    const ONE_PERCENT_APR_E18: u64 = 3_170_979;
    const ONE_SEC: u64 = 1000;
    const ONE_MIN: u64 = ONE_SEC * (60);
    const ONE_HOUR: u64 = ONE_MIN * (60);

    const DEFAULT_INTEREST_RATE_MODEL: InterestRateModelParams = InterestRateModelParams {
        target_ur_e6: 900_000, //90%
        min_rate_at_target_e18: 2 * ONE_PERCENT_APR_E18,
        max_rate_at_target_e18: 10 * ONE_PERCENT_APR_E18,

        rate_at_max_ur_e18: 100 * ONE_PERCENT_APR_E18,
        minimal_time_between_adjustments: ONE_HOUR,
    };

    #[derive(Debug, scale::Encode, scale::Decode)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ViewParams {
        pub lending_pool: AccountId,
        pub a_token_code_hash: [u8; 32],
        pub v_token_code_hash: [u8; 32],
        pub usdt_address: AccountId,
        pub usdc_address: AccountId,
        pub weth_address: AccountId,
        pub wbtc_address: AccountId,
        pub wazero_address: AccountId,
        pub price_feed_provider: AccountId,
    }

    #[ink(storage)]
    pub struct Proposal {
        execute_action_counter: u8,
        lending_pool: LendingPoolManageRef,
        a_token_code_hash: [u8; 32],
        v_token_code_hash: [u8; 32],
        usdt_address: AccountId,
        usdc_address: AccountId,
        weth_address: AccountId,
        wbtc_address: AccountId,
        wazero_address: AccountId,
        price_feed_provider: AccountId,
    }

    impl Proposal {
        #[ink(constructor)]
        pub fn new(
            lending_pool: AccountId,
            a_token_code_hash: [u8; 32],
            v_token_code_hash: [u8; 32],
            usdt_address: AccountId,
            usdc_address: AccountId,
            weth_address: AccountId,
            wbtc_address: AccountId,
            wazero_address: AccountId,
            price_feed_provider: AccountId,
        ) -> Self {
            Self {
                lending_pool: LendingPoolManageRef::from(lending_pool),
                execute_action_counter: 0,
                a_token_code_hash,
                v_token_code_hash,
                usdt_address,
                usdc_address,
                weth_address,
                wbtc_address,
                wazero_address,
                price_feed_provider,
            }
        }

        #[ink(message)]
        pub fn get_execute_action_counter(&self) -> u8 {
            self.execute_action_counter
        }

        #[ink(message)]
        pub fn get_params(&self) -> ViewParams {
            ViewParams {
                lending_pool: self.lending_pool.to_account_id(),
                a_token_code_hash: self.a_token_code_hash,
                v_token_code_hash: self.v_token_code_hash,
                usdt_address: self.usdt_address,
                usdc_address: self.usdc_address,
                weth_address: self.weth_address,
                wbtc_address: self.wbtc_address,
                wazero_address: self.wazero_address,
                price_feed_provider: self.price_feed_provider,
            }
        }

        #[ink(message)]
        pub fn execute(&mut self) -> Result<(), ProposalError> {
            match self.execute_action_counter {
                0 => {
                    self._execute_step0()?;
                }
                1 => {
                    self._execute_step1()?;
                }
                2..=6 => {
                    let asset_to_register_index =
                        self.execute_action_counter.checked_sub(2).unwrap();
                    self._execute_step2(asset_to_register_index)?;
                }
                7 => {
                    self._execute_step3()?;
                }
                8 => {
                    self._execute_step4()?;
                }
                _ => {
                    return Err(ProposalError::ProposalAlreadyExecuted);
                }
            }

            self.execute_action_counter = self.execute_action_counter.checked_add(1).unwrap();

            Ok(())
        }

        fn _execute_step0(&self) -> Result<(), ProposalError> {
            let mut lending_pool_access_control =
                AccessControlRef::from(self.lending_pool.to_account_id());

            lending_pool_access_control
                .call_mut()
                .grant_role(
                    ink::selector_id!("ASSET_LISTING_ADMIN"),
                    Some(self.env().account_id()),
                )
                .call_v1()
                .invoke()
                .unwrap();

            lending_pool_access_control
                .call_mut()
                .grant_role(
                    ink::selector_id!("PARAMETERS_ADMIN"),
                    Some(self.env().account_id()),
                )
                .call_v1()
                .invoke()
                .unwrap();

            lending_pool_access_control
                .call_mut()
                .renounce_role(0, Some(Self::env().account_id()))
                .call_v1()
                .invoke()
                .unwrap();

            Ok(())
        }

        fn _execute_step1(&mut self) -> Result<(), ProposalError> {
            self.lending_pool
                .call_mut()
                .add_market_rule(vec![])
                .call_v1()
                .invoke()
                .unwrap();
            Ok(())
        }

        fn _execute_step2(&mut self, asset_to_register_index: u8) -> Result<(), ProposalError> {
            let tokens_to_register = self._get_tokens_to_register();

            let token_to_register = &tokens_to_register[asset_to_register_index as usize];

            let token_psp22_ref = PSP22MetadataRef::from(token_to_register.address);

            let token_name = token_psp22_ref
                .call()
                .token_name()
                .call_v1()
                .invoke()
                .unwrap();
            let token_symbol = token_psp22_ref
                .call()
                .token_symbol()
                .call_v1()
                .invoke()
                .unwrap();
            let token_decimals = token_psp22_ref.call().token_decimals().call_v1().invoke();

            self.lending_pool
                .call_mut()
                .register_asset(
                    token_to_register.address,
                    self.a_token_code_hash,
                    self.v_token_code_hash,
                    token_name,
                    token_symbol,
                    token_decimals,
                    token_to_register.default_rule,
                    token_to_register.restrictions,
                    token_to_register.fees,
                    Some(token_to_register.interest_rate_model_params),
                )
                .call_v1()
                .invoke()
                .unwrap();

            Ok(())
        }

        fn _execute_step3(&mut self) -> Result<(), ProposalError> {
            self.lending_pool
                .call_mut()
                .set_price_feed_provider(self.price_feed_provider)
                .call_v1()
                .invoke()
                .unwrap();
            Ok(())
        }

        fn _execute_step4(&mut self) -> Result<(), ProposalError> {
            let mut lending_pool_access_control =
                AccessControlRef::from(self.lending_pool.to_account_id());

            lending_pool_access_control
                .call_mut()
                .renounce_role(
                    ink::selector_id!("ASSET_LISTING_ADMIN"),
                    Some(self.env().account_id()),
                )
                .call_v1()
                .invoke()
                .unwrap();

            lending_pool_access_control
                .call_mut()
                .renounce_role(
                    ink::selector_id!("PARAMETERS_ADMIN"),
                    Some(self.env().account_id()),
                )
                .call_v1()
                .invoke()
                .unwrap();

            Ok(())
        }

        fn _get_tokens_to_register(&self) -> Vec<TokenToDeploy> {
            vec![
                TokenToDeploy {
                    // "USDT"
                    // address: hex_literal::hex!("5Et3dDcXUiThrBCot7g65k3oDSicGy4qC82cq9f911izKNtE"),
                    address: self.usdt_address,
                    fees: SetReserveFeesArgs {
                        deposit_fee_e6: 0,
                        debt_fee_e6: 0,
                    },
                    interest_rate_model_params: DEFAULT_INTEREST_RATE_MODEL,
                    default_rule: AssetRules {
                        collateral_coefficient_e6: Some(950_000),
                        borrow_coefficient_e6: Some(1_050_000),
                        penalty_e6: Some(25_000),
                    },
                    restrictions: ReserveRestrictions {
                        maximal_total_deposit: None,
                        maximal_total_debt: None,
                        minimal_collateral: 2_000,
                        minimal_debt: 1_000,
                    },
                },
                TokenToDeploy {
                    // "USDC"
                    // address: hex_literal::hex!("5FYFojNCJVFR2bBNKfAePZCa72ZcVX5yeTv8K9bzeUo8D83Z"),
                    address: self.usdc_address,
                    fees: SetReserveFeesArgs {
                        deposit_fee_e6: 0,
                        debt_fee_e6: 0,
                    },
                    interest_rate_model_params: DEFAULT_INTEREST_RATE_MODEL,
                    default_rule: AssetRules {
                        collateral_coefficient_e6: Some(950_000),
                        borrow_coefficient_e6: Some(1_050_000),
                        penalty_e6: Some(25_000),
                    },
                    restrictions: ReserveRestrictions {
                        maximal_total_deposit: None,
                        maximal_total_debt: None,
                        minimal_collateral: 2_000,
                        minimal_debt: 1_000,
                    },
                },
                TokenToDeploy {
                    // "WETH"
                    // address: hex_literal::hex!("5EoFQd36196Duo6fPTz2MWHXRzwTJcyETHyCyaB3rb61Xo2u"),
                    address: self.weth_address,
                    fees: SetReserveFeesArgs {
                        deposit_fee_e6: 0,
                        debt_fee_e6: 0,
                    },
                    interest_rate_model_params: DEFAULT_INTEREST_RATE_MODEL,
                    default_rule: AssetRules {
                        collateral_coefficient_e6: Some(750_000),
                        borrow_coefficient_e6: Some(1_250_000),
                        penalty_e6: Some(125_000),
                    },
                    restrictions: ReserveRestrictions {
                        maximal_total_deposit: None,
                        maximal_total_debt: None,
                        minimal_collateral: 2_000,
                        minimal_debt: 1_000,
                    },
                },
                TokenToDeploy {
                    // "WBTC"
                    // address: hex_literal::hex!("5EEtCdKLyyhQnNQWWWPM1fMDx1WdVuiaoR9cA6CWttgyxtuJ"),
                    address: self.wbtc_address,
                    fees: SetReserveFeesArgs {
                        deposit_fee_e6: 0,
                        debt_fee_e6: 0,
                    },
                    interest_rate_model_params: DEFAULT_INTEREST_RATE_MODEL,
                    default_rule: AssetRules {
                        collateral_coefficient_e6: Some(750_000),
                        borrow_coefficient_e6: Some(1_250_000),
                        penalty_e6: Some(125_000),
                    },
                    restrictions: ReserveRestrictions {
                        maximal_total_deposit: None,
                        maximal_total_debt: None,
                        minimal_collateral: 2_000,
                        minimal_debt: 1_000,
                    },
                },
                TokenToDeploy {
                    // "WAZERO"
                    // address: hex_literal::hex!("5CtuFVgEUz13SFPVY6s2cZrnLDEkxQXc19aXrNARwEBeCXgg"),
                    address: self.wazero_address,
                    fees: SetReserveFeesArgs {
                        deposit_fee_e6: 0,
                        debt_fee_e6: 0,
                    },
                    interest_rate_model_params: DEFAULT_INTEREST_RATE_MODEL,
                    default_rule: AssetRules {
                        collateral_coefficient_e6: Some(630_000),
                        borrow_coefficient_e6: Some(1_420_000),
                        penalty_e6: Some(200_000),
                    },
                    restrictions: ReserveRestrictions {
                        maximal_total_deposit: None,
                        maximal_total_debt: None,
                        minimal_collateral: 2_000,
                        minimal_debt: 1_000,
                    },
                },
            ]
        }
    }
}
