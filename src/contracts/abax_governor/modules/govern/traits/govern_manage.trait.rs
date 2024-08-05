#[ink::trait_definition]
pub trait AbaxGovernManage {
    /// change `VotingRules` used for voting
    ///
    /// On Success emits `VotingRulesChanged` event.
    ///
    /// #Errors
    ///
    /// Returns `UnstakeShorterThanVotingPeriod` if the unstake period is shorter than the rules' total voting period.
    /// Returns `AccessControlError` if the `caller` has not access to the method.
    #[ink(message)]
    fn change_voting_rules(&mut self, rules: VotingRules) -> Result<(), GovernError>;

    /// change unstake period
    ///
    /// On Success emits `UnstakePeriodChanged` event.
    ///
    /// #Errors
    ///
    /// Returns `UnstakeShorterThanVotingPeriod` if the `period` is shorter than the total voting period.
    /// Returns `AccessControlError` if the `caller` has not access to the method.
    #[ink(message)]
    fn change_unstake_period(&mut self, period: Timestamp) -> Result<(), GovernError>;
}
