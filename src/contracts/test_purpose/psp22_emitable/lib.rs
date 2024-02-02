#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[pendzl::implementation(PSP22, PSP22Metadata, PSP22Mintable)]
#[ink::contract]
pub mod psp22_emitable {
    use pendzl::contracts::token::psp22;
    use pendzl::contracts::token::psp22::PSP22Error;

    use ink::prelude::string::String;

    #[ink(storage)]
    #[derive(Default, pendzl::traits::StorageFieldGetter)]
    pub struct PSP22EmitableContract {
        #[storage_field]
        psp22: psp22::implementation::PSP22Data,
        #[storage_field]
        metadata: psp22::extensions::metadata::implementation::PSP22MetadataData,
    }

    impl PSP22EmitableContract {
        #[ink(constructor)]
        pub fn new(name: String, symbol: String, decimal: u8) -> Self {
            let mut instance = Self::default();
            instance.metadata.name.set(&name.into());
            instance.metadata.symbol.set(&symbol.into());
            instance.metadata.decimals.set(&decimal);
            instance
        }
    }
}
