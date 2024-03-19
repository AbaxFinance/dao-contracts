#![cfg_attr(not(feature = "std"), no_std, no_main)]
use ink::prelude::string::{String, ToString};

#[ink::event]
pub struct Flipped {
    #[ink(topic)]
    pub new_value: bool,
}

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum FlipperError {
    SomeError(String),
    SomeError2,
    SomeError3,
}

#[ink::contract]
mod flipper {
    use crate::*;
    #[ink(storage)]
    pub struct Flipper {
        value: bool,
    }

    impl Flipper {
        #[ink(constructor)]
        pub fn new(init_value: bool) -> Self {
            Self { value: init_value }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(Default::default())
        }
        #[ink(message)]
        pub fn flip(&mut self) {
            self.value = !self.value;
            self.env().emit_event(Flipped {
                new_value: self.value,
            });
        }

        #[ink(message)]
        pub fn flip_and_return_value(&mut self) -> Result<u128, FlipperError> {
            self.value = !self.value;
            self.env().emit_event(Flipped {
                new_value: self.value,
            });
            Ok(5)
        }

        #[ink(message)]
        pub fn return_error(&mut self) -> Result<u128, FlipperError> {
            Err(FlipperError::SomeError("Some error".to_string()))
        }

        #[ink(message)]
        pub fn do_panic(&mut self) {
            panic!("Some error")
        }

        #[ink(message)]
        pub fn get(&self) -> bool {
            self.value
        }
    }
}
