use crate::Vec;
#[derive(Debug, Clone, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct Transaction {
    /// The `AccountId` of the contract that is called in this transaction.
    pub callee: AccountId,
    /// The selector bytes that identifies the function of the callee that should be called.
    pub selector: [u8; 4],
    /// The SCALE encoded parameters that are passed to the called function.
    pub input: Vec<u8>,
    /// The amount of chain balance that is transferred to the callee.
    pub transferred_value: Balance,
}
