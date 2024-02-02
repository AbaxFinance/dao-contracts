#[derive(Debug, Clone, Copy, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct UserVote {
    /// chosen Vote by user
    pub vote: Vote,
    /// amount of votes
    pub amount: Balance,
}
