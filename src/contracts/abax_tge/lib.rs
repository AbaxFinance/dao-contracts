// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "std"), no_std, no_main)]

mod constants;
mod modules;

/// A contract repsonsible for generating the Abax Token.
#[pendzl::implementation(AccessControl, SetCodeHash)]
#[ink::contract]
pub mod abax_tge_contract {
    pub use crate::{
        constants::{
            ALL_TO_PUBLIC_RATIO, BONUS_DENOMINATOR, BONUS_FOR_REFERRER_USE_E3, BONUS_MAX_E3,
            E12_U128, E3_U128, E6_U128, E8_U128, INSTANT_CONTRIBUTOR_RELEASE_E3,
            INSTANT_FOUNDERS_RELEASE_E3, PART_OD_FOUNDATION_E3, PART_OF_FOUNDERS_E3,
            REWARD_FOR_REFERER_E3, VEST_DURATION,
        },
        modules::tge::{
            errors::TGEError,
            events::{BonusMultiplierSet, Contribution, PhaseChanged, Stakedrop},
            storage_fields::public_contribution::PublicContributionStorage,
            traits::{AbaxTGE, AbaxTGEView, AbaxToken, AbaxTokenRef},
        },
    };
    pub use ink::{
        codegen::Env,
        prelude::{vec, vec::Vec},
        ToAccountId,
    };
    use pendzl::math::errors::MathError;
    pub use pendzl::{
        contracts::{
            general_vest::{GeneralVest, GeneralVestRef, VestingSchedule},
            psp22::{PSP22Ref, PSP22},
        },
        math::operations::*,
    };

    const ADMIN: RoleType = 0;
    /// A role type for access to stakedrop functions - 4_193_574_647_u32.
    pub const STAKEDROP_ADMIN: RoleType = ink::selector_id!("STAKEDROP_ADMIN");

    pub const MINIMUM_AMOUNT: Balance = 40_000_000_000_000; // 10 WAZERO in phase one

    pub enum Generate {
        // used to generate for referrers
        Reserve,
        // used to generate for contributors
        Distribute,
    }

    #[ink(storage)]
    #[derive(StorageFieldGetter)]
    pub struct TGEContract {
        #[storage_field]
        access_control: AccessControlData,
        #[storage_field]
        tge: PublicContributionStorage,
    }

    impl TGEContract {
        #[ink(constructor)]
        pub fn new(
            start_time: Timestamp,
            phase_two_duration: Timestamp,
            generated_token_address: AccountId,
            wazero_address: AccountId,
            vester_address: AccountId,
            founders_address: AccountId,
            foundation_address: AccountId,
            strategic_reserves_address: AccountId,
            phase_one_token_cap: u128,
            cost_to_mint_milion_tokens: u128,
            stakedrop_admin: AccountId,
        ) -> Self {
            let mut instance = Self {
                access_control: Default::default(),
                tge: PublicContributionStorage::new(
                    start_time,
                    phase_two_duration,
                    generated_token_address,
                    wazero_address,
                    vester_address,
                    founders_address,
                    foundation_address,
                    strategic_reserves_address,
                    phase_one_token_cap,
                    cost_to_mint_milion_tokens,
                ),
            };
            // set admin to caller
            instance
                ._grant_role(ADMIN, Some(Self::env().caller()))
                .unwrap();
            // set stakedrop admin to stakedrop_admin
            instance
                ._grant_role(STAKEDROP_ADMIN, Some(stakedrop_admin))
                .unwrap();
            instance
        }
    }

    impl AbaxTGE for TGEContract {
        #[ink(message)]
        fn init(&mut self) -> Result<(), TGEError> {
            if self.tge.total_amount_minted() > 0 {
                return Err(TGEError::AlreadyInitialized);
            }

            self.generate_to_self(mul_div(
                80,
                self.tge.phase_one_token_cap,
                100,
                Rounding::Down,
            )?)?;
            self.tge.reserve_tokens(
                self.tge.founders_address,
                mul_div(20, self.tge.phase_one_token_cap, 100, Rounding::Down)?,
            )?;
            self.tge.reserve_tokens(
                self.tge.foundation_address,
                mul_div(2, self.tge.phase_one_token_cap, 100, Rounding::Down)?,
            )?;
            self.tge.reserve_tokens(
                self.tge.strategic_reserves_address,
                mul_div(58, self.tge.phase_one_token_cap, 100, Rounding::Down)?,
            )?;
            Ok(())
        }

        // creates tokens for the contributor (amount + bonus)
        // 40% of the tokens are instantly transfered to the contributor
        // the rest is scheduled to be vested over 4 years
        // takes into account the exp bonus, contribution bonus and refferer bonus
        // if refferer is passed generates tokens for the referer
        // updates the base created and bonus created amounts
        #[ink(message)]
        fn contribute(
            &mut self,
            to_create: Balance,
            receiver: AccountId,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
            ink::env::debug_println!("");
            ink::env::debug_println!("=======contribute start=======");
            self._ensure_has_started()?;
            self._ensure_is_not_finished()?;
            _ensure_minimum_amount(to_create)?;
            self._ensure_caller_is_not_contract()?;
            self._ensure_referrer_is_registered(referrer)?;

            let contributor = self.env().caller();

            let cost = self.calculate_cost(to_create)?;
            ink::env::debug_println!("cost {:?}", cost);
            self.tge.wazero.transfer_from(
                contributor,
                self.tge.strategic_reserves_address,
                cost,
                vec![],
            )?;
            ink::env::debug_println!("post transfer");
            self.tge.increase_contributed_amount(contributor, cost)?;

            let bonus = self.calculate_bonus_and_update_created_base_and_bonus(
                contributor,
                to_create,
                referrer,
            )?;

            ink::env::debug_println!("bonus {:?}", bonus);
            ink::env::debug_println!("to_create {:?}", to_create);

            self.generate_tokens(
                receiver,
                to_create.checked_add(bonus).ok_or(MathError::Overflow)?,
                Generate::Distribute,
            )?;

            if referrer.is_some() {
                let referer_reward = mul_denom_e3(to_create, REWARD_FOR_REFERER_E3 as u128)?;
                self.generate_tokens(referrer.unwrap(), referer_reward, Generate::Reserve)?;
            }

            self.env().emit_event(Contribution {
                contributor,
                receiver,
                to_create,
                referrer,
            });
            ink::env::debug_println!("=======contribute end=======");
            Ok(cost)
        }

        // reserves amount.checked_add(bonus).ok_or(MathError::Overflow)? of tokens for the receiver
        // updates the contributed amount of the  by the fee_paid
        // updates the base created and bonus created amounts
        #[ink(message)]
        fn stakedrop(
            &mut self,
            amount: Balance,
            fee_paid: Balance,
            receiver: AccountId,
        ) -> Result<(), TGEError> {
            self._ensure_has_role(STAKEDROP_ADMIN, Some(self.env().caller()))?;
            self._ensure_has_not_started()?;
            self.tge.increase_contributed_amount(receiver, fee_paid)?;

            let bonus =
                self.calculate_bonus_and_update_created_base_and_bonus(receiver, amount, None)?;
            ink::env::debug_println!("bonus {:?}", bonus);
            self.generate_to_self(amount.checked_add(bonus).ok_or(MathError::Overflow)?)?;
            self.tge.reserve_tokens(
                receiver,
                amount.checked_add(bonus).ok_or(MathError::Overflow)?,
            )?;

            self.env().emit_event(Stakedrop {
                receiver,
                amount,
                fee_paid,
            });
            Ok(())
        }

        // collects reserved tokens for the caller
        // distributes the reserved tokens to the caller according to the rules (instnant / vesting)
        // deletes the reserved tokens
        #[ink(message)]
        fn collect_reserved(&mut self, account: AccountId) -> Result<Balance, TGEError> {
            self._ensure_has_started()?;

            let reserved_amount = self.tge.collect_reserved_tokens(account)?;

            if account == self.tge.strategic_reserves_address
                || account == self.tge.foundation_address
            {
                self.distribute(account, reserved_amount, E3_U128 as u16)?;
            } else if account == self.tge.founders_address {
                self.distribute(account, reserved_amount, INSTANT_FOUNDERS_RELEASE_E3)?;
            } else {
                self.distribute(account, reserved_amount, INSTANT_CONTRIBUTOR_RELEASE_E3)?;
            }
            Ok(reserved_amount)
        }

        #[ink(message)]
        fn set_exp_bonus_multiplier_e3(
            &mut self,
            contributor: AccountId,
            bonus_multiplier_e3: u16,
        ) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;
            self.tge
                .set_exp_bonus_multiplier_of_e3(&contributor, &bonus_multiplier_e3);
            self.env().emit_event(BonusMultiplierSet {
                account: contributor,
                multiplier: bonus_multiplier_e3,
            });
            Ok(())
        }

        #[ink(message)]
        fn register_referrer(&mut self, referrer: AccountId) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;
            self.tge.add_referrer(&referrer);
            Ok(())
        }
    }

    impl AbaxTGEView for TGEContract {
        //returns a tuple with all of the TGE state properties that are not mappings
        #[ink(message)]
        fn tge_parameters(
            &self,
        ) -> (
            u64,
            Option<u64>,
            u64,
            AccountId,
            AccountId,
            AccountId,
            AccountId,
            AccountId,
            AccountId,
            u128,
            u128,
        ) {
            (
                self.tge.start_time,
                self.tge.phase_two_start_time,
                self.tge.phase_two_duration,
                self.tge.generated_token_address,
                self.tge.wazero.to_account_id(),
                self.tge.vester.to_account_id(),
                self.tge.founders_address,
                self.tge.foundation_address,
                self.tge.strategic_reserves_address,
                self.tge.phase_one_token_cap,
                self.tge.cost_to_mint_milion_tokens,
            )
        }

        #[ink(message)]
        fn total_amount_minted(&self) -> Balance {
            self.tge.total_amount_minted()
        }

        #[ink(message)]
        fn exp_bonus_multiplier_of_e3(&self, account: AccountId) -> u16 {
            self.tge.exp_bonus_multiplier_of_e3(&account)
        }

        #[ink(message)]
        fn contribution_bonus_multiplier_of_e3(&self, account: AccountId) -> u16 {
            self.get_contribution_bonus_multiplier_e3(account)
        }
        #[ink(message)]
        fn is_referrer(&self, account: AccountId) -> bool {
            self.tge.is_referrer(&account)
        }

        #[ink(message)]
        fn reserved_for(&self, account: AccountId) -> Balance {
            self.tge.reserved_tokens(&account)
        }

        #[ink(message)]
        fn contributed_amount_by(&self, account: AccountId) -> Balance {
            self.tge.contributed_amount_by(&account)
        }

        #[ink(message)]
        fn generated_base_amount_by(&self, account: AccountId) -> Balance {
            self.tge.base_amount_created(&account)
        }

        #[ink(message)]
        fn generated_bonus_amount_by(&self, account: AccountId) -> Balance {
            self.tge.bonus_amount_created(&account)
        }
    }

    fn _ensure_minimum_amount(to_create: u128) -> Result<(), TGEError> {
        if to_create < MINIMUM_AMOUNT {
            return Err(TGEError::AmountLessThanMinimum);
        }
        Ok(())
    }

    impl TGEContract {
        fn _ensure_has_started(&self) -> Result<(), TGEError> {
            ink::env::debug_println!("block_timestamp {:?}", self.env().block_timestamp());
            ink::env::debug_println!("start_time      {:?}", self.tge.start_time);
            if self.env().block_timestamp() < self.tge.start_time {
                return Err(TGEError::TGENotStarted);
            }
            if self.tge.total_amount_minted() == 0 {
                return Err(TGEError::TGENotStarted);
            }
            Ok(())
        }

        fn _ensure_has_not_started(&self) -> Result<(), TGEError> {
            if self.env().block_timestamp() >= self.tge.start_time {
                return Err(TGEError::TGEStarted);
            }
            Ok(())
        }

        fn _ensure_is_not_finished(&self) -> Result<(), TGEError> {
            if let Some(phase_two_start_time) = self.tge.phase_two_start_time {
                if self.env().block_timestamp()
                    > (phase_two_start_time
                        .checked_add(self.tge.phase_two_duration)
                        .ok_or(MathError::Overflow)?)
                {
                    return Err(TGEError::TGEEnded);
                }
            }
            Ok(())
        }

        fn _ensure_caller_is_not_contract(&self) -> Result<(), TGEError> {
            if self.env().is_contract(&self.env().caller()) {
                Err(TGEError::ContributionViaContract)
            } else {
                Ok(())
            }
        }

        fn _ensure_referrer_is_registered(
            &self,
            referrer: Option<AccountId>,
        ) -> Result<(), TGEError> {
            if let Some(referrer) = referrer {
                if !self.tge.is_referrer(&referrer) {
                    return Err(TGEError::InvalidReferrer);
                }
            }
            Ok(())
        }

        fn _is_phase_one(&self) -> bool {
            self.tge.phase_two_start_time.is_none()
        }
    }
    impl TGEContract {
        // return bonus multiplier awarded for contribution
        fn get_contribution_bonus_multiplier_e3(&self, contributor: AccountId) -> u16 {
            let amount_contributed = self.tge.contributed_amount_by(&contributor);
            // if overflow happens return maximal bonus
            u16::try_from(
                mul_div(amount_contributed, 10, BONUS_DENOMINATOR, Rounding::Down).unwrap_or(100),
            )
            .unwrap_or(100)
        }

        /// returns the bonus amount of tokens based on the base_amount and zealy exp bonus, contribution bonus and refferer
        /// updates the base amount received and the bonus amount received
        fn calculate_bonus_and_update_created_base_and_bonus(
            &mut self,
            contributor: AccountId,
            to_create: u128,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
            ink::env::debug_println!(
                "=======calculate_bonus_and_update_created_base_and_bonus start======="
            );
            let mut bonus_multiplier_e3 = self
                .tge
                .exp_bonus_multiplier_of_e3(&contributor)
                .checked_add(self.get_contribution_bonus_multiplier_e3(contributor))
                .ok_or(MathError::Overflow)?;

            if referrer.is_some() {
                bonus_multiplier_e3 = bonus_multiplier_e3
                    .checked_add(BONUS_FOR_REFERRER_USE_E3)
                    .ok_or(MathError::Overflow)?;
            }

            if bonus_multiplier_e3 > BONUS_MAX_E3 {
                bonus_multiplier_e3 = BONUS_MAX_E3;
            }

            self.tge
                .increase_base_amount_created(&contributor, to_create)?;
            let received_base = self.tge.base_amount_created(&contributor);

            let eligible_bonus = mul_denom_e3(received_base, bonus_multiplier_e3 as u128)?;
            let bonus_already_received = self.tge.bonus_amount_created(&contributor);

            // it may happen that the previously one used refferers code and now one is not using one.
            // This may result in a bonus_already_received being greater than eligible_bonus
            let bonus = eligible_bonus.saturating_sub(bonus_already_received);
            self.tge
                .increase_bonus_amount_created(&contributor, bonus)?;
            ink::env::debug_println!(
                "=======calculate_bonus_and_update_created_base_and_bonus end======="
            );
            Ok(bonus)
        }

        // Calculates the cost of creating tokens (doesn't include bonuses)
        // During phase 1
        // The cost is amount_to_create * phase_one_cost_per_milllion_tokens / 100_000_000
        // During phase 2
        // The cost is
        // amount_to_create * effective_cost_per_million / 1_000_000
        // where effective cost is equal to the cost  before and price after the minting
        // the cost is given by COST_TO_MINT_MILLION_TOKENS * total_amount_minted * phase_one_cost_per_milllion_tokens / 100_000_000
        fn calculate_cost(&self, to_create: Balance) -> Result<u128, TGEError> {
            let mut amount_phase1 = 0;
            let mut amount_phase2 = 0;
            let total_amount_minted = self.tge.total_amount_minted();

            if total_amount_minted >= self.tge.phase_one_token_cap {
                amount_phase2 = to_create;
            } else if total_amount_minted
                .checked_add(to_create)
                .ok_or(MathError::Overflow)?
                <= self.tge.phase_one_token_cap
            {
                amount_phase1 = to_create;
            } else {
                amount_phase1 = self
                    .tge
                    .phase_one_token_cap
                    .checked_sub(total_amount_minted)
                    .ok_or(MathError::Underflow)?;
                amount_phase2 = to_create
                    .checked_sub(amount_phase1)
                    .ok_or(MathError::Underflow)?;
            }

            let cost_phase1: Balance =
                mul_denom_e6(amount_phase1, self.tge.cost_to_mint_milion_tokens)?;

            let cost_phase2: Balance = {
                if amount_phase2 == 0 {
                    0
                } else {
                    // take into account that during 2nd phase contributor also generates tokens to founders foundation and strategic reserves to keep 20/20/2/58 ratio.
                    let effective_tokens = to_create
                        .checked_mul(ALL_TO_PUBLIC_RATIO)
                        .ok_or(MathError::Overflow)?;
                    ink::env::debug_println!("effective_tokens: {:?}", effective_tokens);

                    let averaged_amount =
                        if self.tge.total_amount_minted() <= self.tge.phase_one_token_cap {
                            self.tge
                                .phase_one_token_cap
                                .checked_add(effective_tokens)
                                .ok_or(MathError::Overflow)?
                                / 2
                        } else {
                            self.tge
                                .total_amount_minted()
                                .checked_add(effective_tokens)
                                .ok_or(MathError::Overflow)?
                                / 2
                        };
                    ink::env::debug_println!("averaged_amount: {:?}", averaged_amount);

                    let effective_cost_per_million = mul_denom_e12(self.tge.cost_to_mint_milion_tokens, averaged_amount)?  // denom avaradged amount to get human number of tokens 
                            .checked_div(E8_U128) // from the formula
                            .unwrap().checked_add(1).ok_or(MathError::Overflow)?;
                    ink::env::debug_println!(
                        "effective_cost_per_million: {:?}",
                        effective_cost_per_million
                    );

                    mul_denom_e6(amount_phase2, effective_cost_per_million)?
                }
            };

            ink::env::debug_println!("cost_phase1: {:?}", cost_phase1);
            ink::env::debug_println!("cost_phase2: {:?}", cost_phase2);

            Ok(cost_phase1
                .checked_add(cost_phase2)
                .ok_or(MathError::Overflow)?)
        }

        // Generates tokens
        // it approperiatly distributes/resereves tokens to "to"
        // if in phase_two it additionally mints tokens to self and reserves tokens for founders,foundation and strategic reserves
        fn generate_tokens(
            &mut self,
            to: AccountId,
            amount: Balance,
            gen: Generate,
        ) -> Result<(), TGEError> {
            ink::env::debug_println!("=======generate_tokens start=======");
            ink::env::debug_println!("amount: {:?}", amount);
            let total_amount_minted = self.tge.total_amount_minted();
            let total_amount_minted_plus_amount = total_amount_minted
                .checked_add(amount)
                .ok_or(MathError::Overflow)?;

            if total_amount_minted < self.tge.phase_one_token_cap
                && total_amount_minted_plus_amount >= self.tge.phase_one_token_cap
            {
                ink::env::debug_println!("phase changed");
                self.tge.phase_two_start_time = Some(self.env().block_timestamp());
                self.env().emit_event(PhaseChanged {});
            }

            let mut amount_phase1 = 0;
            let mut amount_phase2 = 0;

            if total_amount_minted >= self.tge.phase_one_token_cap {
                amount_phase2 = amount;
            } else if total_amount_minted_plus_amount <= self.tge.phase_one_token_cap {
                amount_phase1 = amount;
            } else {
                amount_phase1 = self
                    .tge
                    .phase_one_token_cap
                    .checked_sub(total_amount_minted)
                    .ok_or(MathError::Underflow)?;
                amount_phase2 = amount
                    .checked_sub(amount_phase1)
                    .ok_or(MathError::Underflow)?;
            }

            // in phase 2 whenever a token is generated during contribution appropariate amount of tokens is created for foundation, founders, strategic reserves to keep the 20/20/2/58 ratio.
            let amount_to_mint_phase2 = ALL_TO_PUBLIC_RATIO
                .checked_mul(amount_phase2)
                .ok_or(MathError::Overflow)?;
            let amount_to_mint = amount_phase1
                .checked_add(amount_to_mint_phase2)
                .ok_or(MathError::Overflow)?;

            ink::env::debug_println!("total_amount_minted: {:?}", total_amount_minted);
            ink::env::debug_println!(
                "total_amount_minted_plus_amount: {:?}",
                total_amount_minted_plus_amount
            );
            ink::env::debug_println!("amount_phase1: {:?}", amount_phase1);
            ink::env::debug_println!("amount_phase2: {:?}", amount_phase2);
            ink::env::debug_println!("amount_to_mint_phase2: {:?}", amount_to_mint_phase2);
            ink::env::debug_println!("amount_to_mint: {:?}", amount_to_mint);

            self.generate_to_self(amount_to_mint)?;

            match gen {
                Generate::Reserve => {
                    self.tge.reserve_tokens(
                        to,
                        amount_phase1
                            .checked_add(amount_phase2)
                            .ok_or(MathError::Overflow)?,
                    )?;
                }
                Generate::Distribute => {
                    self.distribute(
                        to,
                        amount_phase1
                            .checked_add(amount_phase2)
                            .ok_or(MathError::Overflow)?,
                        INSTANT_CONTRIBUTOR_RELEASE_E3,
                    )?;
                }
            }

            if amount_phase2 > 0 {
                let founders_amount =
                    mul_denom_e3(amount_to_mint_phase2, PART_OF_FOUNDERS_E3 as u128)?;
                self.tge
                    .reserve_tokens(self.tge.founders_address, founders_amount)?;
                let foundation_amount =
                    mul_denom_e3(amount_to_mint_phase2, PART_OD_FOUNDATION_E3 as u128)?;
                self.tge
                    .reserve_tokens(self.tge.foundation_address, foundation_amount)?;
                let strategic_reserves_amount = amount_to_mint_phase2
                    .checked_sub(
                        founders_amount
                            .checked_sub(foundation_amount)
                            .ok_or(MathError::Underflow)?
                            .checked_sub(amount_phase2)
                            .ok_or(MathError::Underflow)?,
                    )
                    .ok_or(MathError::Underflow)?;
                self.tge.reserve_tokens(
                    self.tge.strategic_reserves_address,
                    strategic_reserves_amount,
                )?;
            }
            ink::env::debug_println!("=======generate_tokens end=======");
            Ok(())
        }

        fn generate_to_self(&mut self, amount: Balance) -> Result<(), TGEError> {
            let mut abax: AbaxTokenRef = self.tge.generated_token_address.into();

            abax.generate(self.env().account_id(), amount)?;
            ink::env::debug_println!("increase total amount minted by: {:?}", amount);
            self.tge.increase_total_amount_minted(amount)?;
            Ok(())
        }

        /// Distributes tokens to "to"
        /// instant_e3 / E3 part of the amount is instantly transfered to "to"
        /// the rest is scheduled to be vested
        fn distribute(
            &self,
            to: AccountId,
            amount: Balance,
            instant_e3: u16,
        ) -> Result<(), TGEError> {
            ink::env::debug_println!("=======distribute start=======");
            let amount_to_transfer = mul_denom_e3(amount, instant_e3 as u128)?;
            let amount_to_vest = amount
                .checked_sub(amount_to_transfer)
                .ok_or(MathError::Underflow)?;

            ink::env::debug_println!("amount_to_transfer: {:?}", amount_to_transfer);
            ink::env::debug_println!("amount_to_vest: {:?}", amount_to_vest);
            ink::env::debug_println!("amount: {:?}", amount);
            let mut psp22: PSP22Ref = self.tge.generated_token_address.into();
            psp22.transfer(to, amount_to_transfer, Vec::<u8>::new())?;

            ink::env::debug_println!("post transfer");

            if amount_to_vest > 0 {
                self.schedule_vest(to, amount_to_vest)?;
            }

            ink::env::debug_println!("=======distribute end=======");
            Ok(())
        }

        // creates a vesting schedule for "to" with "amount" of tokens
        fn schedule_vest(&self, to: AccountId, amount: Balance) -> Result<(), TGEError> {
            let mut general_vest: GeneralVestRef = self.tge.vester.to_account_id().into();
            let mut psp22: PSP22Ref = self.tge.generated_token_address.into();

            psp22.approve(self.tge.vester.to_account_id(), amount)?;
            general_vest.create_vest(
                to,
                Some(psp22.to_account_id()),
                amount,
                VestingSchedule::Constant(0, VEST_DURATION),
                vec![],
            )?;
            Ok(())
        }
    }
    fn mul_denom_e12(a: u128, b: u128) -> Result<u128, MathError> {
        mul_div(a, b, E12_U128, Rounding::Down)
    }
    fn mul_denom_e6(a: u128, b: u128) -> Result<u128, MathError> {
        mul_div(a, b, E6_U128, Rounding::Down)
    }

    fn mul_denom_e3(a: u128, b: u128) -> Result<u128, MathError> {
        mul_div(a, b, E3_U128, Rounding::Down)
    }
}
