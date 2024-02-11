use ink::storage::Mapping;
use pendzl::traits::AccountId;
use pendzl::traits::Timestamp;

#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct PublicContributionStorage {
    #[lazy]
    pub start_time: Timestamp,
    #[lazy]
    pub phase_two_start_time: Timestamp,
    #[lazy]
    pub phase_two_duration: Timestamp,
    #[lazy]
    pub generated_token_address: AccountId,
    #[lazy]
    pub wazero_address: AccountId,
    #[lazy]
    pub vester: AccountId,
    #[lazy]
    pub founders_address: AccountId,
    #[lazy]
    pub foundation_address: AccountId,
    #[lazy]
    pub strategic_reserves_address: AccountId,
    pub phase_one_token_cap: u128,
    pub cost_to_mint_milion_tokens: u128,
    pub total_amount_distributed: u128,
    pub total_amount_distributed_phase_two: u128,
    pub bonus_multiplier_e6_by_address: Mapping<AccountId, u128>,
    pub contributed_amount_by_address: Mapping<AccountId, u128>,
}

#[derive(Debug, Copy, Clone, scale::Encode, scale::Decode)]
pub struct TokenAllocationDistribution {
    pub public_contribution: Allocation,
    pub founders: Allocation,
    pub foundation: Allocation,
    pub strategic_reserves: Allocation,
}

#[derive(Debug, Copy, Clone, scale::Encode, scale::Decode)]
pub struct Allocation {
    pub instant_release_percentage_e6: u128,
    pub vesting_params: Option<VestingParams>,
}

#[derive(Debug, Copy, Clone, scale::Encode, scale::Decode)]
pub struct VestingParams {
    pub amount_to_release_percentage_e6: u128,
    pub duration: u128,
}
