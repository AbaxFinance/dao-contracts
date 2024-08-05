#![cfg_attr(not(feature = "std"), no_std, no_main)]

use ink::{
    contract_ref,
    env::{call::ExecutionInput, DefaultEnvironment},
    prelude::{
        string::{String, ToString},
        vec::Vec,
    },
    primitives::{AccountId, Hash},
    ToAccountId,
};

pub type DummyRef = contract_ref!(Dummy, DefaultEnvironment);

#[ink::trait_definition]
pub trait Dummy {
    #[ink(message)]
    fn dummy(&self);
}

#[ink::event]
pub struct LendingPoolDeployed {
    #[ink(topic)]
    lending_pool: AccountId,
}

#[ink::contract]
mod deploy_lp_proposal {
    use ink::{codegen::TraitCallBuilder, env::call::ExecutionInput};
    use pendzl::contracts::access_control::{AccessControl, AccessControlRef};

    use crate::*;
    #[ink(storage)]
    pub struct Proposal {
        lending_pool_code_hash: [u8; 32],
        governor_address: AccountId,
    }

    impl Proposal {
        #[ink(constructor)]
        pub fn new(lending_pool_code_hash: [u8; 32], governor_address: AccountId) -> Self {
            Self {
                lending_pool_code_hash,
                governor_address,
            }
        }

        #[ink(message)]
        pub fn execute(&mut self) {
            let create_params = ink::env::call::build_create::<DummyRef>()
                .instantiate_v1()
                .code_hash(Hash::from(self.lending_pool_code_hash))
                .gas_limit(10_000_000_000)
                .endowment(0)
                .exec_input(ExecutionInput::new(ink::env::call::Selector::new(
                    ink::selector_bytes!("new"),
                )))
                .returns::<DummyRef>()
                .salt_bytes(self.lending_pool_code_hash)
                .params();

            let contract = Self::env()
                .instantiate_contract_v1(&create_params)
                .unwrap_or_else(|error| panic!("Contract pallet error: {:?}", error))
                .unwrap_or_else(|error| panic!("LangError: {:?}", error));

            self.env().emit_event(LendingPoolDeployed {
                lending_pool: contract.to_account_id(),
            });

            AccessControlRef::from(contract.to_account_id())
                .call_mut()
                .grant_role(0, Some(self.governor_address))
                .call_v1()
                .invoke()
                .unwrap();
        }
    }
}
