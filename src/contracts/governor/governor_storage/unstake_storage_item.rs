use ink::primitives::AccountId;
pub use pendzl::contracts::finance::general_vest::GeneralVestRef;
use pendzl::traits::Timestamp;

#[derive(Debug, Default)]
#[pendzl::storage_item]
pub struct UnstakeData {
    #[lazy]
    general_vester: GeneralVestRef,
    #[lazy]
    unstake_period: Timestamp,
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
