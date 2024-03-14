#![cfg_attr(not(feature = "std"), no_std, no_main)]

pub mod modules;

#[pendzl::implementation(PSP22, PSP22Metadata, AccessControl, Upgradeable)]
#[ink::contract]
pub mod abax_token {
    use crate::modules::{
        capped_infaltion_storage_field::CappedInflation,
        new_storage_field::{NewStorageField, NewStorageFieldView},
        reserved::Reserved,
    };
    use ink::prelude::string::String;
    use pendzl::contracts::token::psp22::{
        extensions::mintable::PSP22Mintable, implementation::PSP22InternalDefaultImpl, PSP22Error,
        PSP22Internal,
    };

    #[ink(event)]
    pub struct CapUpdated {
        #[ink(topic)]
        cap: Balance,
    }

    const YEAR: u128 = 365 * 24 * 60 * 60 * 1000;
    const MINTER: RoleType = ink::selector_id!("MINTER");
    const GENERATOR: RoleType = ink::selector_id!("GENERATOR");

    #[ink(storage)]
    #[derive(Default, pendzl::traits::StorageFieldGetter)]
    pub struct AbaxToken {
        #[storage_field]
        access: AccessControlData,
        #[storage_field]
        psp22: PSP22Data,
        #[storage_field]
        metadata: PSP22MetadataData,
        #[storage_field]
        capped_inflation: CappedInflation,
        #[storage_field]
        upgradeable: Reserved,
    }

    #[overrider(PSP22Internal)]
    pub fn _mint_to(&mut self, to: &AccountId, amount: &Balance) -> Result<(), PSP22Error> {
        if (self._total_supply() + amount) > self.capped_inflation.cap() {
            return Err(PSP22Error::Custom("CapReached".into()));
        }
        self._mint_to_default_impl(to, amount)
    }

    impl AbaxToken {
        #[ink(constructor)]
        pub fn new(name: String, symbol: String, decimal: u8) -> Result<Self, PSP22Error> {
            let mut instance = Self::default();
            instance.metadata.name.set(&name.into());
            instance.metadata.symbol.set(&symbol.into());
            instance.metadata.decimals.set(&decimal);

            instance._grant_role(0, Some(Self::env().caller()))?;

            Ok(instance)
        }

        pub fn _inflate_cap(&mut self) {
            self.capped_inflation.inflate(self.env().block_timestamp());
            self.env().emit_event(CapUpdated {
                cap: self.capped_inflation.cap(),
            });
        }

        #[ink(message)]
        pub fn increment_counter(&mut self) {
            self.upgradeable
                .counter
                .set(&(self.upgradeable.counter.get().unwrap_or_default() + 1));
        }

        #[ink(message)]
        pub fn get_counter(&self) -> u32 {
            self.upgradeable.counter.get().unwrap_or_default()
        }

        #[ink(message)]
        pub fn set_new_field_a(&mut self, value: u128) {
            let mut prev_new_field = self.upgradeable.new_field.get().unwrap_or_default();
            prev_new_field
                .a
                .set(&(prev_new_field.a.get().unwrap_or_default() + value));
            self.upgradeable.new_field.set(&(prev_new_field));
        }

        #[ink(message)]
        pub fn get_new_field(&mut self) -> NewStorageFieldView {
            let field = self.upgradeable.new_field.get().unwrap_or_default();
            NewStorageFieldView {
                a: field.a.get().unwrap_or_default(),
                b: field.b.get().unwrap_or_default(),
            }
        }
    }

    impl crate::modules::traits::AbaxToken for AbaxToken {
        // mints amount of tokens to the to `to`
        // inflates the cap
        // increases the cap by the `amount`
        // increases the inflation rate  by the 10% of the `amount` per year
        #[ink(message)]
        fn generate(&mut self, to: AccountId, amount: Balance) -> Result<(), PSP22Error> {
            self._ensure_has_role(GENERATOR, Some(self.env().caller()))?;
            self._inflate_cap();
            let delta_inflation = amount / YEAR / 10;
            self.capped_inflation
                .increase_inflation_rate_per_milisecond(delta_inflation);
            self.capped_inflation.increase_cap(amount);
            self._mint_to(&to, &amount)
        }

        #[ink(message)]
        fn inflation_rate_per_milisecond(&self) -> Balance {
            self.capped_inflation.inflation_rate_per_milisecond()
        }

        #[ink(message)]
        fn cap(&self) -> Balance {
            self.capped_inflation.cap()
        }
    }

    impl PSP22Mintable for AbaxToken {
        #[ink(message)]
        fn mint(&mut self, to: AccountId, amount: Balance) -> Result<(), PSP22Error> {
            self._ensure_has_role(MINTER, Some(self.env().caller()))?;
            self._inflate_cap();
            self._mint_to(&to, &amount)
        }
    }
}
