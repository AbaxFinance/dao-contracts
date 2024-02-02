#[ink::trait_definition]
pub trait GovernManage {
    /// change `VotingRules` used for voting
    ///
    /// On Success emits `VotingRulesChanged` event.
    ///
    /// #Errors
    ///
    /// Returns `AccessControlError` if the `caller` has not access to the method.
    #[ink(message)]
    fn change_voting_rules(&mut self, rules: VotingRules) -> Result<(), GovernError>;
}
