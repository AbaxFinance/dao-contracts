#[derive(Debug, Clone, Copy, PartialEq, scale::Encode, scale::Decode, Default)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]

pub struct VotingRules {
    /// minimal part of proposer stake in total stake to propose.
    pub minimum_stake_part_e3: u16,
    /// part of total
    pub proposer_deposit_part_e3: u16,
    /// during initial period required amount to finalize proposal falls from 100% to 50% of total votes.
    pub initial_period: Timestamp,
    /// time after start of proposal during which the required amount to finalize proposal is flat at 50%.
    pub flat_period: Timestamp,
    /// time after flat_period during which the required amount to finalize proposal linearly falls to 0.
    pub final_period: Timestamp,
}
