#![cfg_attr(not(feature = "std"), no_std, no_main)]

mod modules;

#[pendzl::implementation(AccessControl)]
#[ink::contract]
pub mod abax_treasury {
    use crate::modules::inflator::{
        errors::AbaxInflatorError,
        events::InflationDistributed,
        storage_fields::inflator::InflatorStorage,
        traits::{AbaxInflator, AbaxInflatorManage, AbaxInflatorView},
    };
    use ink::{codegen::TraitCallBuilder, env::DefaultEnvironment};
    pub use ink::{prelude::vec::Vec, ToAccountId};
    pub use pendzl::contracts::psp22::{PSP22Ref, PSP22};
    use pendzl::{
        contracts::psp22::mintable::{PSP22Mintable, PSP22MintableRef},
        math::operations::{mul_div, Rounding},
    };

    pub const PARAMETERS_ADMIN: RoleType = ink::selector_id!("PARAMETERS_ADMIN"); // 368_001_360_u32

    #[ink(storage)]
    #[derive(pendzl::traits::StorageFieldGetter)]
    pub struct AbaxInflatorContract {
        #[storage_field]
        access: AccessControlData,
        #[storage_field]
        inflator: InflatorStorage,
    }

    impl AbaxInflatorContract {
        #[ink(constructor)]
        pub fn new(
            admin: AccountId,
            abax_token_account_id: AccountId,
            inflation_distribution: Vec<(AccountId, u16)>,
        ) -> Result<Self, AbaxInflatorError> {
            let instance = AbaxInflatorContract {
                access: AccessControlData::new(Some(admin)),
                inflator: InflatorStorage::new(&abax_token_account_id, &inflation_distribution)?,
            };

            Ok(instance)
        }
    }

    impl AbaxInflatorView for AbaxInflatorContract {
        #[ink(message)]
        fn abax_token_account_id(&self) -> AccountId {
            self.inflator.abax_token_account_id()
        }

        #[ink(message)]
        fn inflation_distribution(&self) -> Vec<(AccountId, u16)> {
            self.inflator.inflation_distribution()
        }
    }

    impl AbaxInflator for AbaxInflatorContract {
        #[ink(message)]
        fn inflate(&mut self, amount: Balance) -> Result<(), AbaxInflatorError> {
            let mut abax_token_mintable: PSP22MintableRef = self.abax_token_account_id().into();
            let total_parts = self.inflator.total_parts();
            let distribution = self.inflation_distribution();

            for (account_id, part) in distribution.iter() {
                let amount = mul_div(amount, *part as u128, total_parts as u128, Rounding::Down)?;
                abax_token_mintable
                    .call_mut()
                    .mint(*account_id, amount)
                    .call_v1()
                    .invoke()?;
            }

            ink::env::emit_event::<DefaultEnvironment, InflationDistributed>(
                InflationDistributed {},
            );

            Ok(())
        }
    }

    impl AbaxInflatorManage for AbaxInflatorContract {
        #[ink(message)]
        fn set_inflation_distribution(
            &mut self,
            inflation_distribution: Vec<(AccountId, u16)>,
        ) -> Result<(), AbaxInflatorError> {
            self._ensure_has_role(PARAMETERS_ADMIN, Some(self.env().caller()))?;

            self.inflator
                .set_inflation_distribution(&inflation_distribution)?;
            Ok(())
        }
    }
}
