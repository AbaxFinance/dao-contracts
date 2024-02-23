use ink::storage::Mapping;
use pendzl::{
    contracts::{finance::general_vest::GeneralVestRef, token::psp22::PSP22Ref},
    traits::{AccountId, Balance, Timestamp},
};

use crate::modules::errors::TGEError;

#[derive(Debug)]
#[pendzl::storage_item]
pub struct PublicContributionStorage {
    // after thet timestamp accounts can start to contribute.
    pub start_time: Timestamp,
    // The timestamp at which phase one was concluded and phase two started.
    pub phase_two_start_time: Option<Timestamp>,
    // The duration of phase two.
    pub phase_two_duration: Timestamp,
    // token that is generated by the TGE.
    pub generated_token_address: AccountId,
    // token that is contributed by the public.
    pub wazero: PSP22Ref,
    // contract used to create vesting schedules.
    pub vester: GeneralVestRef,
    // account of the founders.
    pub founders_address: AccountId,
    // account of the foundation.
    pub foundation_address: AccountId,
    // account of the strategic reserves.
    pub strategic_reserves_address: AccountId,

    // total amount of tokens created in phase one and stakedrop.
    pub phase_one_token_cap: Balance,
    // cost to mint 1 million tokens [ in wzero]
    pub cost_to_mint_milion_tokens: u128,
    // total amount of distributed tokens.
    total_amount_distributed: Balance,
    // bonus multiplier based on the Zealy EXP.
    pub bonus_multiplier_e3_by_address: Mapping<AccountId, u16>,
    // amount of tokens contributed by each account.
    pub contributed_amount_by_account: Mapping<AccountId, Balance>,
    // reserved tokens for beneficiaries of referals / foundation / strategic reserves / founders.
    reserved_tokens: Mapping<AccountId, Balance>,
    pub referrers: Mapping<AccountId, ()>,
    pub total_staking_airdrop_amount: Balance,
    pub total_staking_airdrop_cap: Balance,
}

impl PublicContributionStorage {
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
        let instance = Self {
            start_time,
            phase_two_start_time: None,
            phase_two_duration,
            generated_token_address,
            wazero: wazero_address.into(),
            vester: vester_address.into(),
            phase_one_token_cap,
            founders_address,
            foundation_address,
            strategic_reserves_address,
            cost_to_mint_milion_tokens,
            total_amount_distributed: 0,
            bonus_multiplier_e3_by_address: Default::default(),
            contributed_amount_by_account: Default::default(),
            reserved_tokens: Default::default(),
            referrers: Default::default(),
            total_staking_airdrop_amount: 0,
            total_staking_airdrop_cap,
        };
        instance
    }

    pub fn total_amount_distributed(&self) -> Balance {
        self.total_amount_distributed
    }

    pub fn increase_total_amount_distributed(&mut self, amount: Balance) {
        self.total_amount_distributed += amount;
    }

    pub fn increase_contributed_amount(&mut self, account: AccountId, amount: Balance) {
        let contributed_amount = self
            .contributed_amount_by_account
            .get(&account)
            .unwrap_or_default();
        self.contributed_amount_by_account
            .insert(account, &(contributed_amount + amount));
    }

    pub fn reserve_tokens(&mut self, account: AccountId, amount: Balance) {
        let reserved_amount = self.reserved_tokens.get(&account).unwrap_or_default();
        self.reserved_tokens
            .insert(account, &(reserved_amount + amount));

        let total_distributed = self.total_amount_distributed;
        self.total_amount_distributed = total_distributed + amount;
    }

    pub fn collect_reserved_tokens(&mut self, account: AccountId) -> Result<Balance, TGEError> {
        self.reserved_tokens
            .take(&account)
            .ok_or(TGEError::NoReservedTokens)
    }
}
