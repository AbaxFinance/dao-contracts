use pendzl::traits::{Balance, Timestamp};

#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct CappedInflation {
    #[lazy]
    cap: Balance,
    #[lazy]
    inflation_rate_per_milisecond: Balance,
    #[lazy]
    last_cap_update: Timestamp,
    // new field added
    #[lazy]
    added_new_field: Balance,
}

impl CappedInflation {
    pub fn cap(&self) -> Balance {
        self.cap.get().unwrap_or(0)
    }

    pub fn increase_cap(&mut self, amount: Balance) {
        let cap = self.cap.get().unwrap_or(0);
        self.cap.set(&(cap + amount));
    }

    pub fn inflation_rate_per_milisecond(&self) -> Balance {
        self.inflation_rate_per_milisecond.get().unwrap_or(0)
    }

    pub fn set_inflation_rate_per_milisecond(&mut self, rate: Balance) {
        self.inflation_rate_per_milisecond.set(&rate);
    }

    pub fn increase_inflation_rate_per_milisecond(&mut self, rate: Balance) {
        let inflation_rate = self.inflation_rate_per_milisecond.get().unwrap_or(0);
        self.inflation_rate_per_milisecond
            .set(&(inflation_rate + rate));
    }

    pub fn last_cap_update(&self) -> Timestamp {
        self.last_cap_update.get().unwrap_or(0)
    }

    pub fn inflate(&mut self, now: Timestamp) {
        if now < self.last_cap_update() {
            panic!("Invalid timestamp");
        }
        let time_diff = now - self.last_cap_update.get().unwrap_or(0);
        self.increase_cap(time_diff as u128 * self.inflation_rate_per_milisecond());

        self.last_cap_update.set(&now);
    }
}
