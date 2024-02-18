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
        constants::{ABAX_ALLOCATION_DISTRIBUTION_PARAMS, E12_U128, E6_U128},
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
        fn contribute(
            &mut self,
            to_create: Balance,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
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
            if self.env().is_contract(&contributor) {
                return Err(TGEError::ContributionViaContract);
            }

            if to_create < E12_U128 {
                return Err(TGEError::AmountLessThanMinimum);
            }

            self.tge.total_amount_distributed +=
                self.ensure_phase1_non_contributor_actions_performed()?;

            let is_phase_one = self.tge.phase_two_start_time.get().is_none();

            ink::env::debug_println!("is_phase_one {:?}", is_phase_one);

            let cost = match is_phase_one {
                true => self.contribute_phase1(contributor, to_create, referrer)?,
                false => self.contribute_phase2(contributor, to_create, referrer)?,
            };

            ink::env::debug_println!("cost {:?}", cost);

            let mut wazero: PSP22Ref = self.tge.wazero_address.get().unwrap().into();

            wazero.transfer_from(contributor, self.env().account_id(), cost, vec![])?; //TODO handle reentrancy

            self.env().emit_event(Contribution {
                contributor,
                to_create,
            });
            Ok(cost)
        }
    }

    impl TGEContract {
        #[ink(constructor)]
        pub fn new() -> Self {
            let mut instance = Self::default();
            // set admin to self
            instance
                ._grant_role(Self::_default_admin(), Some(Self::env().account_id()))
                .unwrap();
            instance
                ._grant_role(ADMIN, Some(Self::env().caller()))
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
            AccountId,
            u128,
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
                    .generated_token_address
                    .get()
                    .unwrap_or(default_addr),
                self.tge.vester.get().unwrap_or(default_addr),
                self.tge.founders_address.get().unwrap_or(default_addr),
                self.tge.foundation_address.get().unwrap_or(default_addr),
                self.tge
                    .strategic_reserves_address
                    .get()
                    .unwrap_or(default_addr),
                self.tge.wazero_address.get().unwrap_or(default_addr),
                self.tge.phase_one_token_cap,
                self.tge.cost_to_mint_milion_tokens,
                self.tge.total_amount_distributed,
                self.tge.total_staking_airdrop_amount,
            )
        }

        #[ink(message)]
        pub fn set_tge_params(
            &mut self,
            start_time: Timestamp,
            phase_one_token_cap: u128,
            cost_to_mint_milion_tokens: u128,
            phase_two_duration: Timestamp,
            contribution_token_address: AccountId,
            vester: AccountId,
            founders_address: AccountId,
            foundation_address: AccountId,
            strategic_reserves_address: AccountId,
            wazero_address: AccountId,
            total_staking_airdrop_amount: u128,
        ) {
            self.tge.start_time.set(&start_time);
            self.tge.phase_one_token_cap = phase_one_token_cap;
            self.tge.cost_to_mint_milion_tokens = cost_to_mint_milion_tokens;
            self.tge.phase_two_duration.set(&phase_two_duration);
            self.tge
                .generated_token_address
                .set(&contribution_token_address);
            self.tge.vester.set(&vester);
            self.tge.founders_address.set(&founders_address);
            self.tge.foundation_address.set(&foundation_address);
            self.tge
                .strategic_reserves_address
                .set(&strategic_reserves_address);
            self.tge.wazero_address.set(&wazero_address);
            self.tge.total_staking_airdrop_amount = total_staking_airdrop_amount;
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
        pub fn register_referrer(&mut self, referrer: AccountId) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;
            self.tge.referrer_by_address.insert(referrer, &());
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

            let contribution_token_address = self.tge.generated_token_address.get().unwrap();
            let mut psp22: PSP22Ref = contribution_token_address.into();

            let mut vester: GeneralVestRef = self.tge.vester.get().unwrap().into();

            let (founders_amount, founders_amount_to_vest, foundation_amount, _) =
                calculate_rest_amounts_to_issue(0, self.tge.phase_one_token_cap)?;

            let strategic_reserves_amount = mul_denom_e6(
                self.tge.phase_one_token_cap,
                ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                    .strategic_reserves
                    .instant_release_percentage_e6,
            )?;

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
            // print all amounts
            ink::env::debug_println!(
                "ensure_phase1_non_contributor_actions_performed\n
self.tge.phase_one_token_cap {:?}\n
founders_amount: {:?}\n
founders_amount_to_vest: {:?}\n
foundation_amount: {:?}\n
strategic_reserves_amount: {:?}",
                self.tge.phase_one_token_cap,
                founders_amount,
                founders_amount_to_vest,
                foundation_amount,
                strategic_reserves_amount
            );

            Ok(founders_amount
                + founders_amount_to_vest
                + foundation_amount
                + strategic_reserves_amount
                + self.tge.total_staking_airdrop_amount)
        }

        fn contribute_phase1(
            &mut self,
            contributor: AccountId,
            to_create: u128,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
            let bonus = self.get_bonus(contributor, to_create)?;
            let amount_for_contributor = to_create + bonus;
            let (referral_bonus, referrer_share) =
                match self.get_referral_bonus(referrer, amount_for_contributor)? {
                    Some(referral_bonus) => (
                        referral_bonus,
                        mul_denom_e6(amount_for_contributor, 20_000)?, //2%
                    ),
                    None => (0, 0),
                };
            let cost = self.calculate_cost_phase1(to_create);
            ink::env::debug_println!("fn contribute_phase1");
            ink::env::debug_println!("to_create {:?} cost: {:?} ", to_create, cost);
            self.issue_tokens_phase1(contributor, to_create, bonus, referral_bonus)?;
            Ok(cost)
        }

        fn contribute_phase2(
            &mut self,
            contributor: AccountId,
            to_create: u128,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
            let referral_bonus = self.get_referral_bonus(referrer, to_create)?;
            let bonus = self.get_bonus(contributor, to_create)?;

            let total_amount_to_be_issued = calc_total_amount_from_amount_on_behalf_of_contributor(
                to_create + bonus + referral_bonus,
            )?;
            let cost = self.calculate_cost_phase2(to_create, total_amount_to_be_issued);
            ink::env::debug_println!("fn contribute_phase2");
            ink::env::debug_println!("to_create {:?} cost: {:?} ", to_create, cost);

            self.issue_tokens_phase2(contributor, to_create, bonus, referral_bonus)?;

            Ok(cost)
        }

        /// Calculates the amount of tokens to be issued for a contribution
        /// The amount is calculated as follows:
        /// base_amount * bonus_multiplier / 1_000_000
        fn get_bonus(&self, contributor: AccountId, base_amount: u128) -> Result<u128, TGEError> {
            match self.tge.bonus_multiplier_e6_by_address.get(&contributor) {
                Some(bonus_multiplier_e6) => mul_denom_e6(base_amount, bonus_multiplier_e6),
                None => Ok(0),
            }
        }

        /// Calculates the amount of tokens to be issued for a contribution
        /// The amount is calculated as follows:
        /// base_amount * bonus_multiplier / 1_000_000
        fn get_referral_bonus(
            &self,
            referrer: Option<AccountId>,
            base_amount: u128,
        ) -> Result<Option<u128>, TGEError> {
            match referrer {
                Some(referrer) => match self.tge.referrer_by_address.get(&referrer) {
                    Some(()) => Ok(Some(mul_denom_e6(base_amount, 10_000)?)), // 1%
                    None => Err(TGEError::InvalidReferrer),
                },
                None => Ok(None),
            }
        }

        /// Calculates the base amount of tokens to be issued for a contribution in phase 1
        /// The base amount is the amount of tokens that would be issued if the contributor had no bonus
        /// The base amount is calculated as follows:
        /// amount * phase_one_cost_per_milllion_tokens / 1_000_000
        fn calculate_cost_phase1(&self, to_create: Balance) -> u128 {
            ink::env::debug_println!("calculate_cost_phase1");
            ink::env::debug_println!("to_create: {:?}", to_create);
            ink::env::debug_println!(
                "self.tge.cost_to_mint_milion_tokens: {:?}",
                self.tge.cost_to_mint_milion_tokens
            );
            u128::try_from(
                U256::from(to_create) * U256::from(self.tge.cost_to_mint_milion_tokens)
                    / U256::from(E12_U128)
                    / U256::from(E6_U128),
            )
            .unwrap()
        }

        fn calculate_cost_phase2(
            &self,
            to_create: Balance,
            total_amount_to_be_issued: Balance,
        ) -> u128 {
            let cost_per_million_before = U256::from(self.tge.cost_to_mint_milion_tokens)
                * U256::from(self.tge.total_amount_distributed)
                / U256::from(self.tge.phase_one_token_cap);

            let cost_per_million_after = U256::from(self.tge.cost_to_mint_milion_tokens)
                * U256::from(self.tge.total_amount_distributed + total_amount_to_be_issued)
                / U256::from(self.tge.phase_one_token_cap);

            ink::env::debug_println!(
                "cost_per_million_before: {:?}, cost_per_million_after: {:?}",
                cost_per_million_before,
                cost_per_million_after
            );

            let effective_cost_per_million =
                (cost_per_million_after + cost_per_million_before) / 2 + 1;

            ink::env::debug_println!(
                "effective_cost_per_million: {:?}",
                effective_cost_per_million
            );

            u128::try_from(
                effective_cost_per_million * U256::from(to_create)
                    / U256::from(E12_U128)
                    / U256::from(E6_U128),
            )
            .unwrap()
        }
        fn issue_tokens_phase1(
            &mut self,
            to: AccountId,
            to_create: Balance,
            bonus: Balance,
            referral_bonus: Balance,
        ) -> Result<(), TGEError> {
            let new_total_issued_so_far = self.tge.total_amount_distributed + to_create;
            ink::env::debug_println!(
                "total_amount_distributed: {:?}\nto_create: {:?}\nnew_total_issued_so_far: {:?}",
                self.tge.total_amount_distributed,
                to_create,
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

            let amount = to_create + bonus;
            self.tge.total_amount_distributed = new_total_issued_so_far + bonus + referral_bonus;

            //todo check roundings

            let generated_token_address = self.tge.generated_token_address.get().unwrap();
            let mut psp22: PSP22Ref = generated_token_address.into();
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
                Some(generated_token_address),
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

        fn issue_tokens_phase2(
            &mut self,
            to: AccountId,
            to_create: Balance,
            bonus: u128,
            referral_bonus: u128,
        ) -> Result<u128, TGEError> {
            let contributor_amount = to_create + bonus;

            let contribution_token_address = self.tge.generated_token_address.get().unwrap();
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
            ) = calculate_amounts_to_issue_phase2(contributor_amount, referral_bonus)?;

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

            // print all amounts
            ink::env::debug_println!(
                "fn issue_tokens_phase2\n
amount_to_instant_release: {:?}\n
amount_to_vest: {:?}\n
founders_amount: {:?}\n
founders_amount_to_vest: {:?}\n
foundation_amount: {:?}\n
strategic_reserves_amount: {:?}",
                amount_to_instant_release,
                amount_to_vest,
                founders_amount,
                founders_amount_to_vest,
                foundation_amount,
                strategic_reserves_amount
            );
            self.tge.total_amount_distributed = self
                .tge
                .total_amount_distributed
                .checked_add(
                    amount_to_instant_release
                        + amount_to_vest
                        + founders_amount
                        + founders_amount_to_vest
                        + foundation_amount
                        + strategic_reserves_amount
                        + referral_bonus,
                )
                .ok_or(TGEError::MathError)?;

            Ok(amount_to_instant_release
                + amount_to_vest
                + founders_amount
                + founders_amount_to_vest
                + foundation_amount
                + strategic_reserves_amount
                + referral_bonus)
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
        created_amount: u128,
        referral_bonus: u128,
    ) -> Result<(u128, u128, u128, u128, u128, u128), TGEError> {
        let public_contribution_total_percentage_e6 = ABAX_ALLOCATION_DISTRIBUTION_PARAMS
            .public_contribution
            .instant_release_percentage_e6
            + ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .vesting_params
                .unwrap()
                .amount_to_release_percentage_e6;
        let instant_release_relative_percentage_e6 = mul_div(
            ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .instant_release_percentage_e6,
            E6_U128,
            public_contribution_total_percentage_e6,
        )?;
        let amount_to_instant_release =
            mul_denom_e6(created_amount, instant_release_relative_percentage_e6)?;

        let amount_to_vest = created_amount - amount_to_instant_release;

        let amount_on_behalf_of_contributor = created_amount
            .checked_add(referral_bonus)
            .ok_or(TGEError::MathError)?;
        let total_amount = calc_total_amount_from_amount_on_behalf_of_contributor(
            amount_on_behalf_of_contributor,
        )?;

        let (
            founders_amount,
            founders_amount_to_vest,
            foundation_amount,
            strategic_reserves_amount,
        ) = calculate_rest_amounts_to_issue(amount_on_behalf_of_contributor, total_amount)?;

        ink::env::debug_println!(
            "calculate_amounts_to_issue_phase2\n
amount: {:?}\n
total_amount: {:?}\n
amount_to_instant_release: {:?}\n
amount_to_vest: {:?}\n
founders_amount: {:?}\n
founders_amount_to_vest: {:?}\n
foundation_amount: {:?}\n
strategic_reserves_amount: {:?}",
            created_amount,
            total_amount,
            amount_to_instant_release,
            amount_to_vest,
            founders_amount,
            founders_amount_to_vest,
            foundation_amount,
            strategic_reserves_amount
        );

        Ok((
            amount_to_instant_release,
            amount_to_vest,
            founders_amount,
            founders_amount_to_vest,
            foundation_amount,
            strategic_reserves_amount,
        ))
    }

    fn calc_total_amount_from_amount_on_behalf_of_contributor(
        amount_on_behalf_of_contributor: u128,
    ) -> Result<u128, TGEError> {
        let public_contribution_total_percentage_e6 = ABAX_ALLOCATION_DISTRIBUTION_PARAMS
            .public_contribution
            .instant_release_percentage_e6
            + ABAX_ALLOCATION_DISTRIBUTION_PARAMS
                .public_contribution
                .vesting_params
                .unwrap()
                .amount_to_release_percentage_e6;
        // amount is 20% of the total amount to be issued, calculate amounts for each allocation (founders, foundation, strategic reserves)
        let total_amount = amount_on_behalf_of_contributor
            .checked_mul(E6_U128)
            .ok_or(TGEError::MathError)?
            .checked_div(public_contribution_total_percentage_e6)
            .ok_or(TGEError::MathError)?;
        Ok(total_amount)
    }

    fn calculate_rest_amounts_to_issue(
        amount_on_behalf_of_contributor: u128,
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
        let strategic_reserves_amount = total_amount
            - (founders_amount
                + founders_amount_to_vest
                + foundation_amount
                + amount_on_behalf_of_contributor);
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
