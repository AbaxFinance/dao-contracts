use pendzl::{
    contracts::{access_control::AccessControlError, psp22::PSP22Error},
    math::errors::MathError,
    traits::String,
};

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum AssetRulesError {
    /// returned if the asset_rule to be set is invalid.
    InvalidAssetRule,
}

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum ReserveDataError {
    /// returned if activating, disactivating, freezing, unfreezing action is redundant.
    AlreadySet,
    /// returned if reserve is inactive
    Inactive,
    /// returned if reserve is frozen
    Frozen,
}

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum FlashLoanReceiverError {
    MathErorr(MathError),
    Custom(String),
}

impl From<MathError> for FlashLoanReceiverError {
    fn from(error: MathError) -> Self {
        FlashLoanReceiverError::MathErorr(error)
    }
}
#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum PriceFeedError {
    /// The asset is not supported by the price feed.
    NoSuchAsset,
    /// The price feed is not available.
    NoPriceFeed,
}

use ink::prelude::format;

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum ReserveRestrictionsError {
    /// returned if after the action total debt of an asset is freater than the maximal total debt restriocion.
    MaxDebtReached,
    /// returned if after the action total deposit of an asset is grreater then the maximal total deposit restriction.
    MaxDepositReached,
    /// returned if after the action minimal debt restricion would be no satisfied.
    MinimalDebt,
    /// returned if after the action minimal collaetral restricion would be no satisfied.
    MinimalCollateral,
}

/// Possible errors returned by `LendingPool` messages.
#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum LendingPoolError {
    PSP22Error(PSP22Error),
    AccessControlError(AccessControlError),

    MathError(MathError),

    AssetRulesError(AssetRulesError),
    ReserveDataError(ReserveDataError),
    ReserveRestrictionsError(ReserveRestrictionsError),

    PriceFeedError(PriceFeedError),
    FlashLoanReceiverError(FlashLoanReceiverError),

    /// returned if the `amount` argument is zero.
    AmountNotGreaterThanZero,
    /// returned if asset that is alerady registered is tried to be registered again.
    AlreadyRegistered,
    /// returned if an asset that is not registered is passed as an argument to message.
    AssetNotRegistered,
    /// returned if Abax native Stable Tokens AccountId is passed as argument to the message where these tokens are not supported.
    AssetIsProtocolStablecoin,
    /// returned if an operation reserved only to abax stable tokens is calles on normal asset.
    AssetIsNotProtocolStablecoin,
    /// returned if one tries to borrow an asset that id not allowed to be borrowed based on the market rule chosen by one.
    RuleBorrowDisable,
    /// returned if one tries to use as colalteral an asset that id not allowed to be borrowed based on the market rule chosen by one.
    RuleCollateralDisable,
    /// returned if after the action account would become undercollaterized
    InsufficientCollateral,
    /// returned if one is trying to transfer a debt one doesn't have.
    InsufficientDebt,
    /// returned if one is trying to liquidate collaterized account.
    Collaterized,
    /// returned if one is trying to transfer or withdraw a deposit one doesn't have.
    InsufficientDeposit,
    /// returned if the liquidation would result in not enough recompensation per repaid token.
    MinimumRecieved,
    /// returned if there is nothing to be repaid (in an asset) during repay liquidation.
    NothingToRepay,
    /// returned if there is nothing (in an asset) to to recompensate the liquidation.
    NothingToCompensateWith,
    /// returned if a liquidator tries to take an asset that is not a collateral as a compensation.
    TakingNotACollateral,
    /// returned if a pair of vectors used during the operation has inconsistent lengths.
    VectorsInconsistentLengths,
    /// returned if passed 'market_rule_id' that is not used.
    MarketRuleInvalidId,
    /// returned if the fee is too high (greater then 1 = 10^6).
    DepositFeeTooHigh,
    /// returned if the calculated to be used tw entry's index is invalid - points to a non existing entry or the entry's value is too recent.
    TwEntryInvalidIndex(u8),
    /// returned if the attempt to adjust the rate is made earlier then the minimal time between adjustments.
    TooEarlyToAdjustRate,
}

impl From<AssetRulesError> for LendingPoolError {
    fn from(error: AssetRulesError) -> Self {
        LendingPoolError::AssetRulesError(error)
    }
}
impl From<ReserveDataError> for LendingPoolError {
    fn from(error: ReserveDataError) -> Self {
        LendingPoolError::ReserveDataError(error)
    }
}

impl From<ReserveRestrictionsError> for LendingPoolError {
    fn from(error: ReserveRestrictionsError) -> Self {
        LendingPoolError::ReserveRestrictionsError(error)
    }
}

impl From<MathError> for LendingPoolError {
    fn from(error: MathError) -> Self {
        LendingPoolError::MathError(error)
    }
}

impl From<PSP22Error> for LendingPoolError {
    fn from(error: PSP22Error) -> Self {
        LendingPoolError::PSP22Error(error)
    }
}

impl From<PriceFeedError> for LendingPoolError {
    fn from(error: PriceFeedError) -> Self {
        LendingPoolError::PriceFeedError(error)
    }
}

impl From<AccessControlError> for LendingPoolError {
    fn from(error: AccessControlError) -> Self {
        LendingPoolError::AccessControlError(error)
    }
}

impl From<LendingPoolError> for PSP22Error {
    fn from(error: LendingPoolError) -> Self {
        match error {
            LendingPoolError::MathError(MathError::Underflow) => PSP22Error::InsufficientBalance,
            e => PSP22Error::Custom(format!("{e:?}")),
        }
    }
}

impl From<FlashLoanReceiverError> for LendingPoolError {
    fn from(flash_error: FlashLoanReceiverError) -> Self {
        LendingPoolError::FlashLoanReceiverError(flash_error)
    }
}

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub enum MultiOpError {
    OperationError(u32, LendingPoolError),
}
