#[derive(Debug, Default)]
#[pendzl::storage_item]
pub struct VaultCounterData {
    #[lazy]
    counter: u128,
}

impl VaultCounterData {
    pub fn counter(&self) -> u128 {
        self.counter.get().unwrap_or_default()
    }

    pub fn increase_counter(&mut self, amount: u128) {
        let mut counter = self.counter();
        counter = counter.overflowing_add(amount).0;
        self.counter.set(&counter);
    }
}
