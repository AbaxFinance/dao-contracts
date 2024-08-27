#![cfg_attr(not(feature = "std"), no_std, no_main)]

use abax_contracts::lending_pool::LendingPoolError;

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum ProposalError {
    LendingPoolError(LendingPoolError),
    AccessControlError(pendzl::contracts::access_control::AccessControlError),
    ProposalAlreadyExecuted,
}

impl From<LendingPoolError> for ProposalError {
    fn from(error: LendingPoolError) -> Self {
        ProposalError::LendingPoolError(error)
    }
}

impl From<pendzl::contracts::access_control::AccessControlError> for ProposalError {
    fn from(error: pendzl::contracts::access_control::AccessControlError) -> Self {
        ProposalError::AccessControlError(error)
    }
}
#[ink::contract]
mod initial_pool_config_proposal {
    use abax_contracts::lending_pool::{LendingPoolManage, LendingPoolManageRef};
    use ink::{codegen::TraitCallBuilder, prelude::vec, ToAccountId};
    use pendzl::contracts::access_control::{AccessControl, AccessControlRef};

    use crate::ProposalError;

    #[derive(Debug, scale::Encode, scale::Decode)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ViewParams {
        pub lending_pool: AccountId,
        pub emergency_admin: AccountId,
        pub price_feed_provider: AccountId,
    }

    #[ink(storage)]
    pub struct Proposal {
        execute_action_counter: u8,
        lending_pool: LendingPoolManageRef,
        emergency_admin: AccountId,
        price_feed_provider: AccountId,
    }

    impl Proposal {
        #[ink(constructor)]
        pub fn new(
            lending_pool: AccountId,
            emergency_admin: AccountId,
            price_feed_provider: AccountId,
        ) -> Self {
            Self {
                lending_pool: LendingPoolManageRef::from(lending_pool),
                execute_action_counter: 0,
                emergency_admin,
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
                emergency_admin: self.emergency_admin,
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
                2 => {
                    self._execute_step2()?;
                }
                3 => {
                    self._execute_step3()?;
                }
                4 => {
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
                    ink::selector_id!("EMERGENCY_ADMIN"),
                    Some(self.emergency_admin),
                )
                .call_v1()
                .invoke()?;

            Ok(())
        }

        fn _execute_step1(&self) -> Result<(), ProposalError> {
            let mut lending_pool_access_control =
                AccessControlRef::from(self.lending_pool.to_account_id());

            lending_pool_access_control
                .call_mut()
                .grant_role(
                    ink::selector_id!("PARAMETERS_ADMIN"),
                    Some(self.env().account_id()),
                )
                .call_v1()
                .invoke()?;

            lending_pool_access_control
                .call_mut()
                .renounce_role(0, Some(Self::env().account_id()))
                .call_v1()
                .invoke()?;

            Ok(())
        }

        fn _execute_step2(&mut self) -> Result<(), ProposalError> {
            self.lending_pool
                .call_mut()
                .set_price_feed_provider(self.price_feed_provider)
                .call_v1()
                .invoke()?;
            Ok(())
        }

        fn _execute_step3(&mut self) -> Result<(), ProposalError> {
            self.lending_pool
                .call_mut()
                .add_market_rule(vec![])
                .call_v1()
                .invoke()?;
            Ok(())
        }

        fn _execute_step4(&mut self) -> Result<(), ProposalError> {
            let mut lending_pool_access_control =
                AccessControlRef::from(self.lending_pool.to_account_id());

            lending_pool_access_control
                .call_mut()
                .renounce_role(
                    ink::selector_id!("PARAMETERS_ADMIN"),
                    Some(self.env().account_id()),
                )
                .call_v1()
                .invoke()?;

            Ok(())
        }
    }
}
