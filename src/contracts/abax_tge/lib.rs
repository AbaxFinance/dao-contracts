// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "std"), no_std, no_main)]

pub mod modules;

//TODO events
#[pendzl::implementation(AccessControl)]
#[ink::contract]
pub mod abax_tge {
    use crate::modules::{
        constants::{
            ALL_TO_PUBLIC_RATIO, BONUSE_FOR_CODE_USE_E3, CONTRIBUTION_BONUS_DENOMINATOR, E3_U128,
            E6_U128, FOUNDATION_PART_E3, FOUNDERS_INSTANT_RELEASE_E3, FOUNDERS_PART_E3,
            PUBLIC_INSTANT_RELEASE_E3, REFERER_REWARD_E3, VEST_DURATION,
        },
        errors::TGEError,
        events::{Contribution, PhaseChanged, Stakedrop},
        storage_fields::public_contribution::PublicContributionStorage,
        traits::AbaxTGE,
    };
    use ink::{
        prelude::{vec, vec::Vec},
        ToAccountId,
    };
    use pendzl::contracts::{
        finance::general_vest::{GeneralVest, GeneralVestRef, VestingSchedule},
        token::psp22::{
            extensions::mintable::{PSP22Mintable, PSP22MintableRef},
            PSP22Ref, PSP22,
        },
    };

    use ink::codegen::Env;

    const ADMIN: RoleType = ink::selector_id!("ADMIN");

    const MINIMUM_AMOUNT: Balance = 1_000_000_000_000;

    enum Generate {
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
            total_staking_airdrop_cap: u128,
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
                    total_staking_airdrop_cap,
                ),
            };
            // set admin to caller
            instance
                ._grant_role(ADMIN, Some(Self::env().caller()))
                .unwrap();
            //

            let mut psp22_mintable: PSP22MintableRef = instance.tge.generated_token_address.into();
            psp22_mintable
                .mint(
                    instance.env().account_id(),
                    80 * instance.tge.phase_one_token_cap / 100,
                )
                .expect("mint failed");
            instance.tge.reserve_tokens(
                instance.tge.founders_address,
                20 * instance.tge.phase_one_token_cap / 100,
            );
            instance.tge.reserve_tokens(
                instance.tge.foundation_address,
                2 * instance.tge.phase_one_token_cap / 100,
            );
            instance.tge.reserve_tokens(
                instance.tge.strategic_reserves_address,
                58 * instance.tge.phase_one_token_cap / 100,
            );
            instance
        }
    }

    impl AbaxTGE for TGEContract {
        #[ink(message)]
        fn contribute(
            &mut self,
            to_create: Balance,
            receiver: AccountId,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
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
            )?; //TODO handle reentrancy // I think reentrancy is not required and not possible
            self.tge.increase_contributed_amount(contributor, cost);

            let bonus = self.get_bonus(contributor, to_create, referrer)?;

            self.generate_tokens(receiver, to_create + bonus, Generate::Distribute)?;

            if referrer.is_some() {
                let referer_reward = mul_denom_e3(to_create, REFERER_REWARD_E3 as u128)?;
                self.generate_tokens(referrer.unwrap(), referer_reward, Generate::Reserve)?;
            }

            self.env().emit_event(Contribution {
                contributor,
                receiver,
                to_create,
                bonus,
                referrer,
            });
            Ok(cost)
        }

        #[ink(message)]
        fn stakedrop(
            &mut self,
            amount: Balance,
            fee_paid: Balance,
            receiver: AccountId,
        ) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;

            self.tge.increase_contributed_amount(receiver, fee_paid);

            self.generate_tokens(receiver, amount, Generate::Distribute)?;

            self.env().emit_event(Stakedrop {
                receiver,
                amount,
                fee_paid,
            });
            Ok(())
        }

        #[ink(message)]
        fn collect_reserved(&mut self) -> Result<(), TGEError> {
            self._ensure_has_started()?;

            let collector = self.env().caller();
            let reserved_amount = self.tge.collect_reserved_tokens(collector)?;

            if collector == self.tge.strategic_reserves_address {
                self.distribute(collector, reserved_amount, E3_U128 as u16)?;
            } else if collector == self.tge.foundation_address {
                self.distribute(collector, reserved_amount, E3_U128 as u16)?;
            } else if collector == self.tge.founders_address {
                self.distribute(collector, reserved_amount, FOUNDERS_INSTANT_RELEASE_E3)?;
            } else {
                self.distribute(collector, reserved_amount, PUBLIC_INSTANT_RELEASE_E3)?;
            }
            Ok(())
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
            if self.env().block_timestamp() < self.tge.start_time {
                return Err(TGEError::TGENotStarted);
            }
            if self.tge.total_amount_distributed() == 0 {
                return Err(TGEError::TGENotStarted);
            }
            Ok(())
        }

        fn _ensure_is_not_finished(&self) -> Result<(), TGEError> {
            if self.env().block_timestamp() < self.tge.start_time {
                if self
                    .tge
                    .phase_two_start_time
                    .is_some_and(|phase_two_start_time| {
                        self.env().block_timestamp()
                            > (phase_two_start_time + self.tge.phase_two_duration)
                    })
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
                if !self.tge.referrers.contains(&referrer) {
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
        //returns a tuple with all of the TGE state properties
        #[ink(message)]
        pub fn get_tge_params(
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
            u128,
            u128,
        ) {
            (
                self.tge.start_time,
                self.tge.phase_two_start_time,
                self.tge.phase_two_duration,
                self.tge.generated_token_address,
                self.tge.vester.to_account_id(),
                self.tge.founders_address,
                self.tge.foundation_address,
                self.tge.strategic_reserves_address,
                self.tge.wazero.to_account_id(),
                self.tge.phase_one_token_cap,
                self.tge.cost_to_mint_milion_tokens,
                self.tge.total_amount_distributed(),
                self.tge.total_staking_airdrop_amount,
            )
        }

        #[ink(message)]
        pub fn set_bonus_multiplier_e3(
            &mut self,
            contributor: AccountId,
            bonus_multiplier_e3: u16,
        ) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;
            self.tge
                .bonus_multiplier_e3_by_address
                .insert(contributor, &bonus_multiplier_e3);
            Ok(())
        }

        #[ink(message)]
        pub fn register_referrer(&mut self, referrer: AccountId) -> Result<(), TGEError> {
            self._ensure_has_role(ADMIN, Some(self.env().caller()))?;
            self.tge.referrers.insert(referrer, &());
            Ok(())
        }

        #[ink(message)]
        pub fn get_bonus_multiplier_e3(&self, contributor: AccountId) -> u16 {
            self.tge
                .bonus_multiplier_e3_by_address
                .get(&contributor)
                .unwrap_or(0)
        }

        // returns bonus multiplier awarded for zealy exp
        fn get_exp_bonus_multiplier_e3(&self, contributor: AccountId) -> u16 {
            self.tge
                .bonus_multiplier_e3_by_address
                .get(&contributor)
                .unwrap_or(0)
        }

        // return bonus multiplier awarded for contribution
        fn get_contribution_bonus_multiplier_e3(&self, contributor: AccountId) -> u16 {
            let amount_contributed = self
                .tge
                .contributed_amount_by_account
                .get(&contributor)
                .unwrap_or(0);

            u16::try_from(10 * amount_contributed / CONTRIBUTION_BONUS_DENOMINATOR).unwrap_or(100)
        }

        /// returns the bonus amouunt of tokens based on the base_amount and zealy exp bonus, contribution bonus, referal bonus
        fn get_bonus(
            &self,
            contributor: AccountId,
            base_amount: u128,
            referrer: Option<AccountId>,
        ) -> Result<u128, TGEError> {
            let mut bonus_multiplier_e3 = self.get_exp_bonus_multiplier_e3(contributor)
                + self.get_contribution_bonus_multiplier_e3(contributor);

            if referrer.is_some() {
                bonus_multiplier_e3 += BONUSE_FOR_CODE_USE_E3;
            }

            if bonus_multiplier_e3 > 1000 {
                bonus_multiplier_e3 = 1000;
            }

            mul_denom_e3(base_amount, bonus_multiplier_e3 as u128)
        }

        // Calculates the cost of creating tokens (doesn't include bonuses)
        // During phase 1
        // The cost is amount_to_create * phase_one_cost_per_milllion_tokens / 1_000_000
        // During phase 2
        // The cost is
        // amount_to_create * effective_cost_per_million / 1_000_000
        // where effective cost is equal amount_to_create * (total_amount_distributed + amount_to_create/2) / 1_000_000
        fn calculate_cost(&self, to_create: Balance) -> Result<u128, TGEError> {
            let mut amount_phase1 = 0;
            let mut amount_phase2 = 0;

            if self.tge.total_amount_distributed() >= self.tge.phase_one_token_cap {
                amount_phase2 = to_create;
            } else if self.tge.total_amount_distributed() + to_create
                <= self.tge.phase_one_token_cap
            {
                amount_phase1 = to_create;
            } else {
                amount_phase1 = self.tge.phase_one_token_cap - self.tge.total_amount_distributed();
                amount_phase2 = to_create - amount_phase1;
            }

            let cost_phase1: Balance =
                mul_denom_e6(amount_phase1, self.tge.cost_to_mint_milion_tokens)?;

            let cost_phase2: Balance = {
                if amount_phase2 == 0 {
                    0
                } else {
                    let avaraged_amount =
                        if self.tge.total_amount_distributed() < self.tge.phase_one_token_cap {
                            self.tge.phase_one_token_cap + to_create / 2
                        } else {
                            self.tge.total_amount_distributed() + to_create / 2
                        };

                    let effective_cost_per_million =
                        mul_denom_e6(avaraged_amount, self.tge.cost_to_mint_milion_tokens)? + 1;

                    ink::env::debug_println!("avaraged_amount: {:?}", avaraged_amount);
                    ink::env::debug_println!(
                        "effective_cost_per_million: {:?}",
                        effective_cost_per_million
                    );

                    mul_denom_e6(amount_phase2, effective_cost_per_million)?
                }
            };

            Ok(cost_phase1 + cost_phase2)
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
            let new_total_amount_distributed = self.tge.total_amount_distributed() + amount;

            if self.tge.total_amount_distributed() < self.tge.phase_one_token_cap
                && new_total_amount_distributed > self.tge.phase_one_token_cap
            {
                self.env().emit_event(PhaseChanged {});
            }

            let mut amount_phase1 = 0;
            let mut amount_phase2 = 0;

            if self.tge.total_amount_distributed() >= self.tge.phase_one_token_cap {
                amount_phase2 = amount;
            } else if new_total_amount_distributed <= self.tge.phase_one_token_cap {
                amount_phase1 = amount;
            } else {
                amount_phase1 = self.tge.phase_one_token_cap - self.tge.total_amount_distributed();
                amount_phase2 = amount - amount_phase1;
            }

            self.tge.increase_total_amount_distributed(amount);

            if amount_phase1 > 0 {
                match gen {
                    Generate::Reserve => {
                        self.tge.reserve_tokens(to, amount_phase1);
                    }
                    Generate::Distribute => {
                        self.distribute(to, amount_phase1, PUBLIC_INSTANT_RELEASE_E3)?;
                    }
                }
            }

            if amount_phase2 > 0 {
                let mut psp22: PSP22MintableRef = self.tge.generated_token_address.into();
                let amount_to_mint = ALL_TO_PUBLIC_RATIO * amount_phase2;
                psp22.mint(self.env().account_id(), amount_to_mint)?;
                match gen {
                    Generate::Reserve => {
                        self.tge.reserve_tokens(to, amount_phase2);
                    }
                    Generate::Distribute => {
                        self.distribute(to, amount_phase2, PUBLIC_INSTANT_RELEASE_E3)?;
                    }
                }
                let founders_amount = mul_denom_e3(amount_to_mint, FOUNDERS_PART_E3 as u128)?;
                self.tge
                    .reserve_tokens(self.tge.founders_address, founders_amount);
                let foundation_amount = mul_denom_e3(amount_to_mint, FOUNDATION_PART_E3 as u128)?;
                self.tge
                    .reserve_tokens(self.tge.foundation_address, foundation_amount);
                let strategic_reserves_amount =
                    amount_to_mint - founders_amount - foundation_amount - amount_phase2;
                self.tge.reserve_tokens(
                    self.tge.strategic_reserves_address,
                    strategic_reserves_amount,
                );
            }
            Ok(())
        }

        /// Distributes tokens to "to"
        /// instant_e3 / E3 part of the amount is instantly transfered to "to"
        /// the rest is scheduled to be vested
        fn distribute(
            &mut self,
            to: AccountId,
            amount: Balance,
            instant_e3: u16,
        ) -> Result<(), TGEError> {
            let amount_to_transfer = mul_denom_e3(amount, instant_e3 as u128)?;
            let amount_to_vest = amount - amount_to_transfer;

            let mut psp22: PSP22Ref = self.tge.generated_token_address.into();
            psp22.transfer(to, amount_to_transfer, Vec::<u8>::new())?;

            self.schedule_vest(to, amount_to_vest)?;

            Ok(())
        }

        // creates a vesting schedule for "to" with "amount" of tokens
        fn schedule_vest(&self, to: AccountId, amount: Balance) -> Result<(), TGEError> {
            let mut general_vest: GeneralVestRef = self.tge.vester.to_account_id().into();
            let mut psp22: PSP22Ref = self.tge.generated_token_address.into();

            psp22.approve(self.tge.vester.to_account_id(), amount)?;
            general_vest.create_vest(
                to,
                Some(self.tge.wazero.to_account_id()),
                amount,
                VestingSchedule::Constant(0, VEST_DURATION),
                vec![],
            )?;
            Ok(())
        }
    }
    fn mul_denom_e6(a: u128, b: u128) -> Result<u128, TGEError> {
        mul_div(a, b, E6_U128)
    }

    fn mul_denom_e3(a: u128, b: u128) -> Result<u128, TGEError> {
        mul_div(a, b, E3_U128)
    }

    fn mul_div(a: u128, b: u128, c: u128) -> Result<u128, TGEError> {
        a.checked_mul(b)
            .ok_or(TGEError::MathError)?
            .checked_div(c)
            .ok_or(TGEError::MathError)
    }
}
