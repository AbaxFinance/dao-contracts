#![cfg_attr(not(feature = "std"), no_std, no_main)]

mod traits;
pub use traits::WrappedAZERO;

#[ink::contract]
mod wazero {
    use crate::WrappedAZERO;
    use ink::prelude::{string::String, vec::Vec};
    use psp22::{PSP22Data, PSP22Error, PSP22Event, PSP22Metadata, PSP22};

    #[ink(event)]
    pub struct Approval {
        #[ink(topic)]
        owner: AccountId,
        #[ink(topic)]
        spender: AccountId,
        amount: u128,
    }

    #[ink(event)]
    pub struct Transfer {
        #[ink(topic)]
        from: Option<AccountId>,
        #[ink(topic)]
        to: Option<AccountId>,
        value: u128,
    }

    #[ink(storage)]
    #[derive(Default)]
    pub struct Wazero {
        data: PSP22Data,
    }

    impl Wazero {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self::default()
        }

        fn emit_events(&self, events: Vec<PSP22Event>) {
            for event in events {
                match event {
                    PSP22Event::Transfer { from, to, value } => {
                        self.env().emit_event(Transfer { from, to, value })
                    }
                    PSP22Event::Approval {
                        owner,
                        spender,
                        amount,
                    } => self.env().emit_event(Approval {
                        owner,
                        spender,
                        amount,
                    }),
                }
            }
        }
    }

    impl WrappedAZERO for Wazero {
        #[ink(message, payable)]
        fn deposit(&mut self) -> Result<(), PSP22Error> {
            let events = self
                .data
                .mint(self.env().caller(), self.env().transferred_value())?;
            self.emit_events(events);
            Ok(())
        }

        #[ink(message)]
        fn withdraw(&mut self, value: u128) -> Result<(), PSP22Error> {
            let caller = self.env().caller();
            let events = self.data.burn(caller, value)?;
            self.env()
                .transfer(caller, value)
                .map_err(|_| PSP22Error::Custom(String::from("Wrapped AZERO: withdraw failed")))?;
            self.emit_events(events);
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

    impl PSP22 for Wazero {
        #[ink(message)]
        fn total_supply(&self) -> u128 {
            self.data.total_supply()
        }

        #[ink(message)]
        fn balance_of(&self, owner: AccountId) -> u128 {
            self.data.balance_of(owner)
        }

        #[ink(message)]
        fn allowance(&self, owner: AccountId, spender: AccountId) -> u128 {
            self.data.allowance(owner, spender)
        }

        #[ink(message)]
        fn transfer(
            &mut self,
            to: AccountId,
            value: u128,
            _data: Vec<u8>,
        ) -> Result<(), PSP22Error> {
            let events = self.data.transfer(self.env().caller(), to, value)?;
            self.emit_events(events);
            Ok(())
        }

        #[ink(message)]
        fn transfer_from(
            &mut self,
            from: AccountId,
            to: AccountId,
            value: u128,
            _data: Vec<u8>,
        ) -> Result<(), PSP22Error> {
            let events = self
                .data
                .transfer_from(self.env().caller(), from, to, value)?;
            self.emit_events(events);
            Ok(())
        }

        #[ink(message)]
        fn approve(&mut self, spender: AccountId, value: u128) -> Result<(), PSP22Error> {
            let events = self.data.approve(self.env().caller(), spender, value)?;
            self.emit_events(events);
            Ok(())
        }

        #[ink(message)]
        fn increase_allowance(
            &mut self,
            spender: AccountId,
            delta_value: u128,
        ) -> Result<(), PSP22Error> {
            let events = self
                .data
                .increase_allowance(self.env().caller(), spender, delta_value)?;
            self.emit_events(events);
            Ok(())
        }

        #[ink(message)]
        fn decrease_allowance(
            &mut self,
            spender: AccountId,
            delta_value: u128,
        ) -> Result<(), PSP22Error> {
            let events = self
                .data
                .decrease_allowance(self.env().caller(), spender, delta_value)?;
            self.emit_events(events);
            Ok(())
        }
    }
}
