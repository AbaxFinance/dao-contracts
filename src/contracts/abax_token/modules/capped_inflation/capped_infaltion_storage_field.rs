use pendzl::{
    math::errors::MathError,
    traits::{Balance, Timestamp},
};

#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct CappedInflation {
    #[lazy]
    cap: Balance,
    #[lazy]
    inflation_rate_per_milisecond: Balance,
    #[lazy]
    last_cap_update: Timestamp,
}

impl CappedInflation {
    pub fn cap(&self) -> Balance {
        self.cap.get().unwrap_or(0)
    }

    pub fn increase_cap(&mut self, amount: Balance) -> Result<(), MathError> {
        let cap = self.cap.get().unwrap_or(0);
        self.cap
            .set(&(cap.checked_add(amount).ok_or(MathError::Overflow)?));
        Ok(())
    }

    pub fn inflation_rate_per_milisecond(&self) -> Balance {
        self.inflation_rate_per_milisecond.get().unwrap_or(0)
    }

    pub fn set_inflation_rate_per_milisecond(&mut self, rate: Balance) {
        self.inflation_rate_per_milisecond.set(&rate);
    }

    pub fn increase_inflation_rate_per_milisecond(
        &mut self,
        rate: Balance,
    ) -> Result<(), MathError> {
        let inflation_rate = self.inflation_rate_per_milisecond.get().unwrap_or(0);
        self.inflation_rate_per_milisecond.set(
            &(inflation_rate
                .checked_add(rate)
                .ok_or(MathError::Overflow)?),
        );
        Ok(())
    }

    pub fn last_cap_update(&self) -> Timestamp {
        self.last_cap_update.get().unwrap_or(0)
    }

    pub fn inflate(&mut self, now: Timestamp) -> Result<(), MathError> {
        if now < self.last_cap_update() {
            panic!("Invalid timestamp");
        }
        let time_diff = now
            .checked_sub(self.last_cap_update.get().unwrap_or(0))
            .ok_or(MathError::Underflow)? as u128;
        let increase_cap_by = self
            .inflation_rate_per_milisecond()
            .checked_mul(time_diff)
            .ok_or(MathError::Overflow)?;
        self.increase_cap(increase_cap_by)?;

        self.last_cap_update.set(&now);
        Ok(())
    }
}
