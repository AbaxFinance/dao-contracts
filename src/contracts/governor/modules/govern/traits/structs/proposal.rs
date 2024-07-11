use pendzl::traits::String;
/// A Proposal is what can be proposed
#[derive(Debug, Clone, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct Proposal {
    /// Proposed transaction for execution.
    pub transactions: Vec<Transaction>,
    pub description_hash: Hash,
    pub description_url: String,
    pub earliest_execution: Option<Timestamp>,
}
