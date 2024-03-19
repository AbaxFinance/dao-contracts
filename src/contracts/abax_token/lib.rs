#![cfg_attr(not(feature = "std"), no_std, no_main)]

mod modules;

#[pendzl::implementation(PSP22, PSP22Metadata, AccessControl, SetCodeHash)]
#[ink::contract]
pub mod abax_token {
    pub use crate::modules::capped_inflation::{
        capped_infaltion_storage_field::CappedInflation, reserved::Reserved, traits::AbaxToken,
    };
    pub use ink::prelude::string::String;
    pub use pendzl::contracts::psp22::{
        mintable::PSP22Mintable, PSP22Error, PSP22Internal, PSP22InternalDefaultImpl,
    };
    use pendzl::math::errors::MathError;

    #[ink(event)]
    pub struct CapUpdated {
        #[ink(topic)]
        cap: Balance,
    }

    const YEAR: u128 = 365 * 24 * 60 * 60 * 1000;
    const TEN_YEARS: u128 = 10 * YEAR;
    const MINTER: RoleType = ink::selector_id!("MINTER");
    const GENERATOR: RoleType = ink::selector_id!("GENERATOR");

    #[ink(storage)]
    #[derive(Default, StorageFieldGetter)]
    pub struct AbaxTokenContract {
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
        if (self
            ._total_supply()
            .checked_add(*amount)
            .ok_or(MathError::Overflow)?)
            > self.capped_inflation.cap()
        {
            return Err(PSP22Error::Custom("CapReached".into()));
        }
        self._mint_to_default_impl(to, amount)
    }

    impl AbaxTokenContract {
        #[ink(constructor)]
        pub fn new(name: String, symbol: String, decimal: u8) -> Result<Self, PSP22Error> {
            let mut instance = Self::default();
            instance.metadata.name.set(&name.into());
            instance.metadata.symbol.set(&symbol.into());
            instance.metadata.decimals.set(&decimal);

            instance._grant_role(0, Some(Self::env().caller()))?;

            Ok(instance)
        }

        pub fn _inflate_cap(&mut self) -> Result<(), MathError> {
            self.capped_inflation
                .inflate(self.env().block_timestamp())?;
            self.env().emit_event(CapUpdated {
                cap: self.capped_inflation.cap(),
            });
            Ok(())
        }
    }

    impl AbaxToken for AbaxTokenContract {
        // mints amount of tokens to the to `to`
        // inflates the cap
        // increases the cap by the `amount`
        // increases the inflation rate  by the 10% of the `amount` per year
        #[ink(message)]
        fn generate(&mut self, to: AccountId, amount: Balance) -> Result<(), PSP22Error> {
            ink::env::debug_println!("GENERATOR {:?}", GENERATOR);
            self._ensure_has_role(GENERATOR, Some(self.env().caller()))?;
            self._inflate_cap()?;
            let delta_inflation = amount.checked_div(TEN_YEARS).ok_or(MathError::DivByZero)?;
            self.capped_inflation
                .increase_inflation_rate_per_milisecond(delta_inflation)?;
            self.capped_inflation.increase_cap(amount)?;
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

    impl PSP22Mintable for AbaxTokenContract {
        #[ink(message)]
        fn mint(&mut self, to: AccountId, amount: Balance) -> Result<(), PSP22Error> {
            self._ensure_has_role(MINTER, Some(self.env().caller()))?;
            self._inflate_cap()?;
            self._mint_to(&to, &amount)
        }
    }
}
