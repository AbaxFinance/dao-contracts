// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[pendzl::implementation(GeneralVest)]
#[ink::contract]
pub mod abax_vester {
    #[ink(storage)]
    #[derive(Default, StorageFieldGetter)]
    pub struct Vester {
        #[storage_field]
        vesting: GeneralVestData,
    }

    impl Vester {
        #[ink(constructor)]
        pub fn new() -> Self {
            Default::default()
        }
    }
}
