use pendzl::traits::Timestamp;

#[derive(Debug, Copy, Clone, scale::Encode, scale::Decode)]
pub struct TokenAllocationDistribution {
    pub public_contribution: Allocation,
    pub founders: Allocation,
    pub foundation: Allocation,
    pub strategic_reserves: Allocation,
}

#[derive(Debug, Copy, Clone, scale::Encode, scale::Decode)]
pub struct Allocation {
    pub instant_release_percentage_e3: u16,
    pub vesting_params: Option<VestingParams>,
}

#[derive(Debug, Copy, Clone, scale::Encode, scale::Decode)]
pub struct VestingParams {
    pub amount_to_release_percentage_e3: u16,
    pub duration: Timestamp,
}
