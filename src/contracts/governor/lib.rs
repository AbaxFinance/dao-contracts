#![cfg_attr(not(feature = "std"), no_std, no_main)]

pub mod governor_storage;
pub mod helpers;
pub mod traits;

pub use governor_storage::*;
pub use helpers::*;
pub use traits::*;

/// This is Abax Governor Contract implementation.
/// It allows for staking PSP22 token (Abax token) in exchange for PSP22Vault shares (votes).
/// The shares are non-transferrable.
/// Withdrawing assets is possible only after unstake period - unstaking is handled by GeneralVest contract.
///
/// The contract allows for proposing and voting on proposals by implementing Govern trait.
/// To create a proposal, the proposer must have enough votes (shares) to meet the minimum stake part.
/// While proposal is created the proposer must deposit a part of his votes. This votes are returned when proposal is finalized unless the proposal is finalized with 'DefeatedWithSlash' status.
///
/// Contract is using pendzl Access Control to manage access to the messages

#[pendzl::implementation(PSP22, PSP22Vault, PSP22Metadata, AccessControl)]
#[ink::contract]
mod governor {
    pub use super::*;

    use governor_storage::{
        govern_storage_item::GovernData, locked_shares_storage_item::LockedSharesData,
        unstake_storage_item::UnstakeData, vault_counter_storage_item::VaultCounterData,
    };
    use helpers::hashes::{hash_description, hash_proposal};
    use ink::{
        codegen::Env,
        env::{
            call::{build_call, ExecutionInput},
            CallFlags, DefaultEnvironment,
        },
        ToAccountId,
    };

    use pendzl::contracts::finance::general_vest::ExternalTimeConstraint;
    pub use pendzl::{
        contracts::{
            access::access_control::RoleType,
            finance::general_vest::{GeneralVest, VestingSchedule},
            token::psp22::{extensions::vault::implementation::PSP22VaultInternalDefaultImpl, *},
        },
        traits::Flush,
    };

    const EXECUTOR: RoleType = ink::selector_id!("EXECUTOR");

    #[derive(Default, StorageFieldGetter)]
    #[ink(storage)]
    pub struct Governor {
        // pendzl storage fields
        #[storage_field]
        access_control: AccessControlData,
        #[storage_field]
        psp22: PSP22Data,
        #[storage_field]
        vault: PSP22VaultData,
        #[storage_field]
        metadata: PSP22MetadataData,
        // non-pendzl storage fields
        #[storage_field]
        govern: GovernData,
        #[storage_field]
        counter: VaultCounterData,
        #[storage_field]
        lock: LockedSharesData,
        #[storage_field]
        unstake: UnstakeData,
    }

    #[overrider(PSP22VaultInternal)]
    fn _deposit(
        &mut self,
        caller: &AccountId,
        receiver: &AccountId,
        assets: &Balance,
        shares: &Balance,
    ) -> Result<(), PSP22Error> {
        self.counter.increase_counter(*shares);
        self._deposit_default_impl(caller, receiver, assets, shares)
    }

    #[overrider(PSP22VaultInternal)]
    fn _withdraw(
        &mut self,
        caller: &AccountId,
        receiver: &AccountId,
        owner: &AccountId,
        shares: &Balance,
        assets: &Balance,
    ) -> Result<(), PSP22Error> {
        if caller != owner {
            self._decrease_allowance_from_to(owner, caller, shares)?;
        }

        self._burn_from(owner, shares)?;

        self.vault
            .asset()
            .approve(self.unstake.general_vester().to_account_id(), *assets)?;

        match self.unstake.general_vester().create_vest(
            *receiver,
            Some(self.vault.asset().to_account_id()),
            *assets,
            VestingSchedule::External(ExternalTimeConstraint {
                account: self.env().account_id(),
                fallback_values: (self.unstake.unstake_period(), 0),
            }),
            Vec::<u8>::new(),
        ) {
            Ok(_) => {}
            Err(_) => {
                return Err(PSP22Error::Custom(
                    "Failed during create vest call".to_string(),
                ))
            }
        }

        ink::env::emit_event::<DefaultEnvironment, Withdraw>(Withdraw {
            sender: *caller,
            receiver: *receiver,
            owner: *owner,
            assets: *assets,
            shares: *shares,
        });
        Ok(())
    }

    #[overrider(PSP22)]
    fn transfer(&mut self, to: AccountId, value: Balance, data: Vec<u8>) -> Result<(), PSP22Error> {
        Err(PSP22Error::Custom("Transfer is not allowed".to_string()))
    }

    #[overrider(PSP22)]
    fn transfer_from(
        &mut self,
        from: AccountId,
        to: AccountId,
        value: Balance,
        data: Vec<u8>,
    ) -> Result<(), PSP22Error> {
        Err(PSP22Error::Custom("Transfer is not allowed".to_string()))
    }

    impl Governor {
        #[ink(constructor)]
        pub fn new(
            asset: AccountId,
            vester: AccountId,
            unstake_period: Timestamp,
            name: String,
            symbol: String,
        ) -> Self {
            let mut instance = Self::default();
            // ACCESS CONTROL
            //set admin to self
            instance
                ._grant_role(Self::_default_admin(), Some(Self::env().account_id()))
                .expect("caller should become admin");
            // PSP22VAULT
            // set underlying asset
            let psp22: PSP22Ref = asset.into();
            instance.vault.asset.set(&psp22);
            // query underlying asset decimals
            let (success, asset_decimals) = instance._try_get_asset_decimals();
            let decimals_to_set = if success { asset_decimals } else { 12 };
            // set underlying asset decimals
            instance.vault.underlying_decimals.set(&decimals_to_set);

            // Unstaking
            // set general vester
            instance.unstake.set_general_vester(&vester);
            instance.unstake.set_unstake_period(unstake_period);

            //Metadata
            instance.metadata.name.set(&Some(name));
            instance.metadata.symbol.set(&Some(symbol));

            instance
        }
    }

    impl Govern for Governor {
        #[ink(message)]
        fn propose(&mut self, proposal: Proposal, description: String) -> Result<(), GovernError> {
            let description_hash = hash_description(&description);
            if description_hash != proposal.describtion_hash {
                return Err(GovernError::WrongDescriptionHash);
            }
            self._propose(&self.env().caller(), &proposal)
        }

        #[ink(message)]
        fn finalize(&mut self, proposal_id: ProposalId) -> Result<(), GovernError> {
            self._finalize(&proposal_id)
        }

        #[ink(message)]
        fn execute(&mut self, proposal: Proposal) -> Result<(), GovernError> {
            self._ensure_has_role(EXECUTOR, Some(self.env().caller()))?;
            self._execute(&proposal)
        }

        #[ink(message)]
        fn vote(
            &mut self,
            proposal_id: ProposalId,
            vote: Vote,
            _reason: Vec<u8>,
        ) -> Result<(), GovernError> {
            self._cast_vote(&self.env().caller(), proposal_id, vote, _reason)
        }
    }

    impl GovernInternal for Governor {
        fn _propose(
            &mut self,
            proposer: &AccountId,
            proposal: &Proposal,
        ) -> Result<(), GovernError> {
            //check if the proposer has enoough votes to create a proposal
            let total_votes = self._total_supply();
            let minimum_votes_to_propose = total_votes / u16::MAX as u128
                * u16::from(self.govern.rules().minimum_stake_part_u16) as u128;
            let proposer_votes = self._balance_of(proposer);
            if proposer_votes < minimum_votes_to_propose {
                return Err(GovernError::InnsuficientVotes);
            }

            // create proposal
            let (proposal_id, proposal_hash) = self.govern.register_new_proposal(
                proposer,
                proposal,
                total_votes,
                self.counter.counter(),
            )?;

            // make a proposer deposit
            let proposer_deposit = total_votes / u16::MAX as u128
                * u16::from(self.govern.rules().proposer_deposit_part_u16) as u128;

            self.lock.lock(&proposal_id, proposer_deposit)?;
            self._transfer(
                proposer,
                &ink::env::account_id::<DefaultEnvironment>(),
                &proposer_deposit,
            )?;

            ink::env::emit_event::<DefaultEnvironment, ProposalCreated>(ProposalCreated {
                proposal_id,
                proposal_hash,
                proposal: proposal.clone(),
            });
            Ok(())
        }

        fn _cast_vote(
            &mut self,
            voter: &AccountId,
            proposal_id: ProposalId,
            vote: Vote,
            #[allow(unused_variables)] reason: Vec<u8>,
        ) -> Result<(), GovernError> {
            self.govern
                .update_vote_of_for(voter, &proposal_id, &vote, &0)?;

            ink::env::emit_event::<DefaultEnvironment, VoteCasted>(VoteCasted {
                account: *voter,
                proposal_id,
                vote,
            });

            Ok(())
        }

        fn _finalize(&mut self, proposal_id: &ProposalId) -> Result<(), GovernError> {
            let status = self.govern.finalize(proposal_id, self.counter.counter())?;

            // return the proposer deposit if proposal was not 'DefeatedWithSlash'
            if status != ProposalStatus::DefeatedWithSlash {
                let locked = self.lock.locked(proposal_id);
                self.lock.unlock(proposal_id, locked)?;
                self._transfer(
                    &ink::env::account_id::<DefaultEnvironment>(),
                    &self.govern.state_of(proposal_id).unwrap().proposer,
                    &locked,
                )?;
            }

            ink::env::emit_event::<DefaultEnvironment, ProposalFinalized>(ProposalFinalized {
                proposal_id: *proposal_id,
                status,
            });
            Ok(())
        }

        fn _execute(&mut self, proposal: &Proposal) -> Result<(), GovernError> {
            let proposal_hash = hash_proposal(proposal);

            let proposal_id = &self
                .govern
                .proposal_hash_to_id(&proposal_hash)
                .ok_or(GovernError::ProposalDoesntExist)?;

            self.govern.mark_as_executed(proposal_id)?;

            for tx in &proposal.transactions {
                self.flush();

                let result = build_call::<DefaultEnvironment>()
                    .call(tx.callee)
                    .transferred_value(tx.transferred_value)
                    .exec_input(ExecutionInput::new(tx.selector.into()).push_arg(&tx.input))
                    .call_flags(CallFlags::default().set_allow_reentry(true))
                    .returns::<()>()
                    .try_invoke()
                    .map_err(|_| GovernError::UnderlyingTransactionReverted);
                self.load();
                result?.unwrap()
            }

            ink::env::emit_event::<DefaultEnvironment, ProposalExecuted>(ProposalExecuted {
                proposal_id: *proposal_id,
            });

            Ok(())
        }
    }
}
