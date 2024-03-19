use ink::{env::DefaultEnvironment, primitives::AccountId};
pub use pendzl::contracts::general_vest::GeneralVestRef;
use pendzl::traits::Timestamp;

use crate::modules::govern::traits::UnstakePeriodChanged;

#[derive(Debug, Default)]
#[pendzl::storage_item]
pub struct UnstakeData {
    #[lazy]
    general_vester: GeneralVestRef,
    #[lazy]
    unstake_period: Timestamp,
}

impl UnstakeData {
    pub fn new(general_vester_address: AccountId, unstake_period: Timestamp) -> Self {
        let mut instance = Self::default();
        instance.set_general_vester(&general_vester_address);
        instance.set_unstake_period(unstake_period);
        ink::env::emit_event::<DefaultEnvironment, UnstakePeriodChanged>(UnstakePeriodChanged {
            unstake_period,
        });
        instance
    }
}

impl UnstakeData {
    pub fn general_vester(&self) -> GeneralVestRef {
        self.general_vester.get().unwrap()
    }

    pub fn unstake_period(&self) -> Timestamp {
        self.unstake_period.get().unwrap_or_default()
    }

    pub fn set_general_vester(&mut self, vester: &AccountId) {
        let vester: GeneralVestRef = (*vester).into();
        self.general_vester.set(&vester);
    }

    pub fn set_unstake_period(&mut self, period: Timestamp) {
        self.unstake_period.set(&period);
    }
}
