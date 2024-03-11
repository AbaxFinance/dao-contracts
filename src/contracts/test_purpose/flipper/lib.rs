#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::event]
pub struct Flipped {
    #[ink(topic)]
    pub new_value: bool,
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
        pub fn get(&self) -> bool {
            self.value
        }
    }
}
