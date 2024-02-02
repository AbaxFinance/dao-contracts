use crate::modules::structs::{Allocation, TokenAllocationDistribution, VestingParams};

pub const E6_U128: u128 = 10_u128.pow(6);
pub const AZERO_DECIMALS: u128 = 12;
pub const ABAX_DECIMALS: u32 = 18;

pub const ONE_HOUR: u128 = 60 * 60 * 1000;
pub const ONE_DAY: u128 = 24 * ONE_HOUR;
pub const ONE_YEAR: u128 = 365 * ONE_DAY;

pub const ABAX_ALLOCATION_DISTRIBUTION_PARAMS: TokenAllocationDistribution =
    TokenAllocationDistribution {
        public_contribution: Allocation {
            instant_release_percentage_e6: 80_000,
            vesting_params: Some(VestingParams {
                amount_to_release_percentage_e6: 120_000,
                duration: ONE_YEAR * 4,
            }),
        },
        founders: Allocation {
            instant_release_percentage_e6: 40_000,
            vesting_params: Some(VestingParams {
                amount_to_release_percentage_e6: 160_000,
                duration: ONE_YEAR * 4,
            }),
        },
        foundation: Allocation {
            instant_release_percentage_e6: 20_000,
            vesting_params: None,
        },
        strategic_reserves: Allocation {
            instant_release_percentage_e6: 580_000,
            vesting_params: None,
        },
    };
