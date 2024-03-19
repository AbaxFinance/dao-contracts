#![cfg_attr(not(feature = "std"), no_std, no_main)]

mod traits;
pub use traits::WrappedAZERO;

#[pendzl::implementation(PSP22)]
#[ink::contract]
mod wazero {
    use crate::WrappedAZERO;
    use ink::prelude::string::String;
    use pendzl::contracts::psp22::{metadata::PSP22Metadata, PSP22Error};

    #[ink(storage)]
    #[derive(Default, pendzl::traits::StorageFieldGetter)]
    pub struct Wazero {
        #[storage_field]
        data: PSP22Data,
    }

    impl Wazero {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self::default()
        }
    }

    impl WrappedAZERO for Wazero {
        #[ink(message, payable)]
        fn deposit(&mut self) -> Result<(), PSP22Error> {
            PSP22Internal::_mint_to(self, &self.env().caller(), &self.env().transferred_value())?;
            Ok(())
        }

        #[ink(message)]
        fn withdraw(&mut self, value: u128) -> Result<(), PSP22Error> {
            let caller = self.env().caller();
            PSP22Internal::_burn_from(self, &caller, &value)?;
            self.env()
                .transfer(caller, value)
                .map_err(|_| PSP22Error::Custom(String::from("Wrapped AZERO: withdraw failed")))?;
            Ok(())
        }
    }

    impl PSP22Metadata for Wazero {
        #[ink(message)]
        fn token_name(&self) -> Option<String> {
            Some(String::from("Wrapped AZERO"))
        }

        #[ink(message)]
        fn token_symbol(&self) -> Option<String> {
            Some(String::from("wAZERO"))
        }

        #[ink(message)]
        fn token_decimals(&self) -> u8 {
            12
        }
    }
}
