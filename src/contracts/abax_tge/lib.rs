// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "std"), no_std, no_main)]

pub mod modules;

//TODO events
#[pendzl::implementation(AccessControl)]
#[ink::contract]
pub mod abax_tge {
    use ink::{prelude::vec, prelude::vec::Vec, ToAccountId};
    use pendzl::contracts::{
        finance::general_vest::{GeneralVest, GeneralVestRef, VestingSchedule},
        token::psp22::{
            extensions::mintable::{PSP22Mintable, PSP22MintableRef},
            PSP22Ref, PSP22,
        },
    };

    use crate::modules::{
        constants::{ABAX_ALLOCATION_DISTRIBUTION_PARAMS, E6_U128},
        errors::TGEError,
        events::{Contribution, PhaseChanged},
        structs::PublicContributionStorage,
        traits::AbaxTGE,
    };
    use primitive_types::U256;

    const ADMIN: RoleType = ink::selector_id!("ADMIN");

    #[ink(storage)]
    #[derive(Default, pendzl::traits::StorageFieldGetter)]
    pub struct TGEContract {
        #[storage_field]
        access_control: AccessControlData,
        #[storage_field]
        tge: PublicContributionStorage,
    }

    impl AbaxTGE for TGEContract {
        #[ink(message, payable)]
        fn contribute(&mut self) -> Result<u128, TGEError> {
            if self.env().block_timestamp() < self.tge.start_time.get().unwrap() {
                return Err(TGEError::TGENotStarted);
            }

            if self
                .tge
                .phase_two_start_time
                .get()
                .is_some_and(|phase_two_start_time| {
                    self.env().block_timestamp()
                        > (phase_two_start_time + self.tge.phase_two_duration.get().unwrap())
                })
            {
                return Err(TGEError::TGEEnded);
            }

            let contributor = self.env().caller();
            let amount_contributed = self.env().transferred_value();

            if amount_contributed == 0 {
                return Err(TGEError::ContributedZero);
            }

            self.tge.total_amount_distributed +=
                self.ensure_phase1_non_contributor_actions_performed()?;

            let is_phase_one = self.tge.phase_two_start_time.get().is_none();

            ink::env::debug_println!(
                "is_phase_one {:?} amount_contributed {:?}",
                is_phase_one,
                amount_contributed
            );
            // let amount_in_abax_decimals =
            //     amount_contributed * 10_u128.pow(ABAX_DECIMALS);

            let amount_issued = match is_phase_one {
                true => self.contribute_phase1(contributor, amount_contributed),
                false => self.contribute_phase2(contributor, amount_contributed),
            }?;

            self.env().emit_event(Contribution {
                contributor,
                amount_issued,
                amount_contributed,
            });
            self.tge.total_amount_distributed += amount_issued;
            Ok(amount_issued)
        }
    }

    impl TGEContract {
        #[ink(constructor)]
        pub fn new() -> Self {
            let mut instance = Self::default();
            instance
                ._grant_role(ADMIN, Some(Self::env().account_id()))
                .unwrap();
            instance
        }

        //returns a tuple with all of the TGE state properties
        #[ink(message)]
        pub fn get_tge_params(
            &self,
        ) -> (
            u64,
            u64,
            u64,
            AccountId,
            AccountId,
            AccountId,
            AccountId,
            AccountId,
            u128,
            u128,
            u128,
        ) {
            let default_addr = self.env().account_id();
            (
                self.tge.start_time.get_or_default(),
                self.tge.phase_two_start_time.get_or_default(),
                self.tge.phase_two_duration.get_or_default(),
                self.tge
                    .contribution_token_address
                    .get()
                    .unwrap_or(default_addr),
                self.tge.vester.get().unwrap_or(default_addr),
                self.tge.founders_address.get().unwrap_or(default_addr),
                self.tge.foundation_address.get().unwrap_or(default_addr),
                self.tge
                    .strategic_reserves_address
                    .get()
                    .unwrap_or(default_addr),
                self.tge.phase_one_token_cap,
                self.tge.phase_one_amount_per_milllion_tokens,
                self.tge.total_amount_distributed,
            )
        }

        #[ink(message)]
        pub fn set_tge_params(
            &mut self,
            start_time: Timestamp,
            phase_one_token_cap: u128,
            phase_one_amount_per_milllion_tokens: u128,
            phase_two_duration: Timestamp,
            contribution_token_address: AccountId,
            vester: AccountId,
            founders_address: AccountId,
            foundation_address: AccountId,
            strategic_reserves_address: AccountId,
        ) {
            self.tge.start_time.set(&start_time);
            self.tge.phase_one_token_cap = phase_one_token_cap;
            self.tge.phase_one_amount_per_milllion_tokens = phase_one_amount_per_milllion_tokens;
            self.tge.phase_two_duration.set(&phase_two_duration);
            self.tge
                .contribution_token_address
                .set(&contribution_token_address);
            self.tge.vester.set(&vester);
            self.tge.founders_address.set(&founders_address);
            self.tge.foundation_address.set(&foundation_address);
            self.tge
                .strategic_reserves_address
                .set(&strategic_reserves_address);
        }

        #[ink(message)]
        pub fn set_bonus_multiplier_e6(
            &mut self,
            contributor: AccountId,
            bonus_multiplier_e6: u128,
        ) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;
            self.tge
                .bonus_multiplier_e6_by_address
                .insert(contributor, &bonus_multiplier_e6);
            Ok(())
        }

        #[ink(message)]
        pub fn get_bonus_multiplier_e6(&self, contributor: AccountId) -> u128 {
            self.tge
                .bonus_multiplier_e6_by_address
                .get(&contributor)
                .unwrap_or(0)
        }

        fn ensure_phase1_non_contributor_actions_performed(&self) -> Result<u128, TGEError> {
            if self.tge.total_amount_distributed != 0 {
                return Ok(0);
            }

            ink::env::debug_println!("ensure_phase1_non_contributor_actions_performed");

            let contribution_token_address = self.tge.contribution_token_address.get().unwrap();
            let mut psp22: PSP22Ref = contribution_token_address.into();

            let mut vester: GeneralVestRef = self.tge.vester.get().unwrap().into();

            let (
                founders_amount,
                founders_amount_to_vest,
                foundation_amount,
                strategic_reserves_amount,
            ) = calculate_rest_amounts_to_issue(self.tge.phase_one_token_cap)?;

            // approve vester to spend tokens
            psp22
                .increase_allowance(vester.to_account_id(), founders_amount_to_vest)
                .unwrap();
            // issue tokens to founders
            psp22.transfer(
                self.tge.founders_address.get().unwrap(),
                founders_amount,
                vec![],
            )?;

            // create vesting schedule for founders
            vester.create_vest(
                self.tge.founders_address.get().unwrap(),
                Some(contribution_token_address),
                founders_amount_to_vest,
                VestingSchedule::Constant(
                    0,
                    Timestamp::try_from(
                        ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                            .founders
                            .vesting_params
                            .unwrap()
                            .duration,
                    )
                    .unwrap(),
                ),
                vec![],
            )?;

            // issue tokens to foundation
            psp22.transfer(
                self.tge.foundation_address.get().unwrap(),
                foundation_amount,
                vec![],
            )?;

            // issue tokens to strategic reserves
            psp22.transfer(
                self.tge.strategic_reserves_address.get().unwrap(),
                strategic_reserves_amount,
                vec![],
            )?;

            Ok(founders_amount
                + founders_amount_to_vest
                + foundation_amount
                + strategic_reserves_amount)
        }

        fn contribute_phase1(
            &mut self,
            contributor: AccountId,
            amount_contributed: u128,
        ) -> Result<u128, TGEError> {
            let base_amount = self.calculate_base_amount_phase1(amount_contributed);
            let amount_to_issue = self.calculate_amount_with_bonus(contributor, base_amount)?;

            let new_total_issued_so_far = self.tge.total_amount_distributed + amount_to_issue;

            ink::env::debug_println!("fn contribute_phase1");
            ink::env::debug_println!(
                "amount_contributed {:?} base_amount: {:?} amount_to_issue: {:?}, new_total_issued_so_far: {:?}",
                amount_contributed,
                base_amount,
                amount_to_issue,
                new_total_issued_so_far
            );
            if new_total_issued_so_far > self.tge.phase_one_token_cap {
                return Err(TGEError::Phase1TokenCapReached);
            } else if new_total_issued_so_far == self.tge.phase_one_token_cap {
                self.tge
                    .phase_two_start_time
                    .set(&(self.env().block_timestamp()));
                self.env().emit_event(PhaseChanged {});
            }

            self.issue_tokens_phase1(contributor, amount_to_issue)?;
            Ok(amount_to_issue)
        }

        fn contribute_phase2(
            &self,
            contributor: AccountId,
            amount_contributed: u128,
        ) -> Result<u128, TGEError> {
            let base_amount = self.calculate_base_amount_phase2(amount_contributed);
            let contributor_amount_to_issue =
                self.calculate_amount_with_bonus(contributor, base_amount)?;
            self.issue_tokens_phase2(contributor, contributor_amount_to_issue)?;

            Ok(contributor_amount_to_issue)
        }

        /// Calculates the amount of tokens to be issued for a contribution
        /// The amount is calculated as follows:
        /// base_amount * bonus_multiplier / 1_000_000
        fn calculate_amount_with_bonus(
            &self,
            contributor: AccountId,
            base_amount: u128,
        ) -> Result<u128, TGEError> {
            match self.tge.bonus_multiplier_e6_by_address.get(&contributor) {
                Some(bonus_multiplier_e6) => mul_denom_e6(base_amount, bonus_multiplier_e6),
                None => Ok(base_amount),
            }
        }

        /// Calculates the base amount of tokens to be issued for a contribution in phase 1
        /// The base amount is the amount of tokens that would be issued if the contributor had no bonus
        /// The base amount is calculated as follows:
        /// amount * phase_one_amount_per_milllion_tokens / 1_000_000
        fn calculate_base_amount_phase1(&self, contributed: Balance) -> u128 {
            contributed * self.tge.phase_one_amount_per_milllion_tokens / E6_U128
        }

        /// Calculates the base amount of tokens to be issued for a contribution in phase 2
        /// The base amount is the amount of tokens that would be issued if the contributor had no bonus
        /// The base amount is calculated as follows:
        /// the effective amount per million is an avaerage between the amount per million before and after the contribution
        /// amount * effective_amount_per_milllion_tokens / 1_000_000
        fn calculate_base_amount_phase2(&self, contributed: Balance) -> u128 {
            let amount_per_million_before =
                U256::from(self.tge.phase_one_amount_per_milllion_tokens)
                    * U256::from(self.tge.phase_one_token_cap)
                    / U256::from(self.tge.total_amount_distributed);

            let amount_per_million_after =
                U256::from(self.tge.phase_one_amount_per_milllion_tokens)
                    * U256::from(self.tge.phase_one_token_cap)
                    / U256::from(self.tge.total_amount_distributed + contributed)
                    + 1;
            ink::env::debug_println!(
                "amount_per_million_before: {:?}, amount_per_million_after: {:?}",
                amount_per_million_before,
                amount_per_million_after
            );

            let effective_amount_per_million =
                (amount_per_million_after + amount_per_million_before) / 2;

            ink::env::debug_println!(
                "effective_amount_per_million: {:?}",
                effective_amount_per_million
            );

            u128::try_from(
                U256::from(contributed) * effective_amount_per_million / U256::from(E6_U128),
            )
            .unwrap()
        }
        fn issue_tokens_phase1(&self, to: AccountId, amount: u128) -> Result<(), TGEError> {
            //todo check roundings

            let contribution_token_address = self.tge.contribution_token_address.get().unwrap();
            let mut psp22: PSP22Ref = contribution_token_address.into();
            let (amount_to_instant_release, amount_to_vest) =
                calculate_amounts_to_issue_phase1(amount)?;

            ink::env::debug_println!("fn issue_tokens_phase1");
            ink::env::debug_println!(
                "amount_to_instant_release: {:?}, amount_to_vest: {:?}",
                amount_to_instant_release,
                amount_to_vest
            );
            psp22.transfer(to, amount_to_instant_release, Vec::<u8>::new())?;

            let mut vester: GeneralVestRef = self.tge.vester.get().unwrap().into();

            psp22
                .increase_allowance(vester.to_account_id(), amount_to_vest)
                .unwrap();
            vester.create_vest(
                to,
                Some(contribution_token_address),
                amount_to_vest,
                VestingSchedule::Constant(
                    0,
                    Timestamp::try_from(
                        ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                            .public_contribution
                            .vesting_params
                            .unwrap()
                            .duration,
                    )
                    .unwrap(),
                ),
                vec![],
            )?;

            Ok(())
        }

        fn issue_tokens_phase2(&self, to: AccountId, amount: u128) -> Result<u128, TGEError> {
            let contribution_token_address = self.tge.contribution_token_address.get().unwrap();
            let mut psp22_mintable: PSP22MintableRef = contribution_token_address.into();
            let mut psp22: PSP22Ref = contribution_token_address.into();

            let mut vester: GeneralVestRef = self.tge.vester.get().unwrap().into();

            //todo check roundings

            let (
                amount_to_instant_release,
                amount_to_vest,
                founders_amount,
                founders_amount_to_vest,
                foundation_amount,
                strategic_reserves_amount,
            ) = calculate_amounts_to_issue_phase2(amount)?;

            // approve vester to spend tokens
            psp22
                .increase_allowance(
                    vester.to_account_id(),
                    amount_to_vest + founders_amount_to_vest,
                )
                .unwrap();
            // mint for self tokens that will be used to create vesting schedules
            psp22_mintable
                .mint(
                    self.env().account_id(),
                    amount_to_vest + founders_amount_to_vest,
                )
                .unwrap();

            // issue tokens to founders
            psp22_mintable.mint(self.tge.founders_address.get().unwrap(), founders_amount)?;

            // create vesting schedule for founders

            vester.create_vest(
                self.tge.founders_address.get().unwrap(),
                Some(contribution_token_address),
                founders_amount_to_vest,
                VestingSchedule::Constant(
                    0,
                    Timestamp::try_from(
                        ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                            .founders
                            .vesting_params
                            .unwrap()
                            .duration,
                    )
                    .unwrap(),
                ),
                vec![],
            )?;

            // issue tokens to foundation
            psp22_mintable.mint(
                self.tge.foundation_address.get().unwrap(),
                foundation_amount,
            )?;

            // issue tokens to strategic reserves
            psp22_mintable.mint(
                self.tge.strategic_reserves_address.get().unwrap(),
                strategic_reserves_amount,
            )?;

            // issue tokens to contributor
            psp22_mintable.mint(to, amount_to_instant_release)?;

            // create vesting schedule for contributor
            vester.create_vest(
                to,
                Some(contribution_token_address),
                amount_to_vest,
                VestingSchedule::Constant(
                    0,
                    Timestamp::try_from(
                        ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                            .public_contribution
                            .vesting_params
                            .unwrap()
                            .duration,
                    )
                    .unwrap(),
                ),
                vec![],
            )?;

            Ok(amount_to_instant_release
                + amount_to_vest
                + founders_amount
                + founders_amount_to_vest
                + foundation_amount
                + strategic_reserves_amount)
        }
    }

    fn calculate_amounts_to_issue_phase1(amount: u128) -> Result<(u128, u128), TGEError> {
        let denom_e6 = ABAX_ALLOCATION_DISTRIBUTION_PARAMS
            .public_contribution
            .instant_release_percentage_e6
            + ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .vesting_params
                .unwrap()
                .amount_to_release_percentage_e6;

        let amount_to_instant_release = mul_div(
            amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .instant_release_percentage_e6,
            denom_e6,
        )?;

        let amount_to_vest = mul_div(
            amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .vesting_params
                .unwrap()
                .amount_to_release_percentage_e6,
            denom_e6,
        )?;

        Ok((amount_to_instant_release, amount_to_vest))
    }
    fn calculate_amounts_to_issue_phase2(
        amount: u128,
    ) -> Result<(u128, u128, u128, u128, u128, u128), TGEError> {
        // amount is 20% of the total amount to be issued, calculate amounts for each allocation (founders, foundation, strategic reserves)
        let total_amount = amount
            .checked_mul(E6_U128)
            .ok_or(TGEError::MathError)?
            .checked_div(
                ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                    .public_contribution
                    .instant_release_percentage_e6
                    + ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                        .public_contribution
                        .vesting_params
                        .unwrap()
                        .amount_to_release_percentage_e6,
            )
            .ok_or(TGEError::MathError)?;

        let amount_to_instant_release = mul_denom_e6(
            total_amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .instant_release_percentage_e6,
        )?;

        let amount_to_vest = mul_denom_e6(
            total_amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .vesting_params
                .unwrap()
                .amount_to_release_percentage_e6,
        )?;

        let (
            founders_amount,
            founders_amount_to_vest,
            foundation_amount,
            strategic_reserves_amount,
        ) = calculate_rest_amounts_to_issue(total_amount)?;

        Ok((
            amount_to_instant_release,
            amount_to_vest,
            founders_amount,
            founders_amount_to_vest,
            foundation_amount,
            strategic_reserves_amount,
        ))
    }

    fn calculate_rest_amounts_to_issue(
        total_amount: u128,
    ) -> Result<(u128, u128, u128, u128), TGEError> {
        let founders_amount = mul_denom_e6(
            total_amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .founders
                .instant_release_percentage_e6,
        )?;

        let founders_amount_to_vest = mul_denom_e6(
            total_amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .founders
                .vesting_params
                .unwrap()
                .amount_to_release_percentage_e6,
        )?;

        let foundation_amount = mul_denom_e6(
            total_amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .foundation
                .instant_release_percentage_e6,
        )?;
        let strategic_reserves_amount = mul_denom_e6(
            total_amount,
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .strategic_reserves
                .instant_release_percentage_e6,
        )?;
        Ok((
            founders_amount,
            founders_amount_to_vest,
            foundation_amount,
            strategic_reserves_amount,
        ))
    }

    fn mul_denom_e6(a: u128, b: u128) -> Result<u128, TGEError> {
        mul_div(a, b, E6_U128)
    }

    fn mul_div(a: u128, b: u128, c: u128) -> Result<u128, TGEError> {
        a.checked_mul(b)
            .ok_or(TGEError::MathError)?
            .checked_div(c)
            .ok_or(TGEError::MathError)
    }
}
