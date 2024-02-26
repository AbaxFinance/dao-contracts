use pendzl::traits::Timestamp;

pub const E6_U128: u128 = 10_u128.pow(6);
pub const E3_U128: u128 = 10_u128.pow(3);
pub const E12_U128: u128 = 10_u128.pow(12);
pub const AZERO_DECIMALS: u128 = 12;
pub const ABAX_DECIMALS: u32 = 18;

pub const ONE_HOUR: Timestamp = 60 * 60 * 1000;
pub const ONE_DAY: Timestamp = 24 * ONE_HOUR;
pub const ONE_YEAR: Timestamp = 365 * ONE_DAY;

pub const VEST_DURATION: Timestamp = ONE_YEAR * 4;

pub const FOUNDERS_PART_E3: u16 = 200; // 20%
pub const FOUNDATION_PART_E3: u16 = 20; // 2%
pub const STRATEGIC_RESERVES_PART_E3: u16 = 580; // 58%
pub const PUBLIC_PART_E3: u16 = 20; // 20%

pub const ALL_TO_PUBLIC_RATIO: u128 = 5; // 5:1

pub const FOUNDERS_INSTANT_RELEASE_E3: u16 = 200; // 20%
pub const PUBLIC_INSTANT_RELEASE_E3: u16 = 400; // 40%
pub const BONUSE_FOR_CODE_USE_E3: u16 = 10; // 1%

pub const REFERER_REWARD_E3: u16 = 10; // 1%

pub const MAX_BONUS_MULTIPLIER_E3: u16 = 100; // 10%

pub const CONTRIBUTION_BONUS_DENOMINATOR: u128 = 1000 * 10_u128.pow(12); // how much to contribute to get 1% bonus

// pub const ABAX_ALLOCATION_DISTRIBUTION_PARAMS: TokenAllocationDistribution =
//     TokenAllocationDistribution {
//         public_contribution: Allocation {
//             instant_release_percentage_e3: 80, // 8%
//             vesting_params: Some(VestingParams {
//                 amount_to_release_percentage_e3: 120, // 12%
//                 duration: ONE_YEAR * 4,
//             }),
//         },
//         founders: Allocation {
//             instant_release_percentage_e3: 40, // 4%
//             vesting_params: Some(VestingParams {
//                 amount_to_release_percentage_e3: 160, // 16%
//                 duration: ONE_YEAR * 4,
//             }),
//         },
//         foundation: Allocation {
//             instant_release_percentage_e3: 20, // 2%
//             vesting_params: None,
//         },
//         strategic_reserves: Allocation {
//             instant_release_percentage_e3: 580, // 58%
//             vesting_params: None,
//         },
//     };
