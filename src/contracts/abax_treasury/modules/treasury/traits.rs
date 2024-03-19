use super::{
    errors::AbaxTreasuryError,
    structs::{Operation, Order, OrderId},
};
use ink::prelude::vec::Vec;
use pendzl::traits::{AccountId, Timestamp};

#[ink::trait_definition]
/// Trait defining the functions for the Abax Treasury module.
pub trait AbaxTreasury {
    /// sets a new vester for the treasury module.
    ///
    /// On success Emits a 'VesterChanged' event.
    ///
    /// # Errors
    ///
    /// Returns 'AccessControlError' if the caller is not allowed to set vester.
    #[ink(message)]
    fn set_vester(&mut self, vester: AccountId) -> Result<(), AbaxTreasuryError>;

    /// Sumbits new order for execution.
    ///
    /// On success Emits 'OrderCreated' event.
    ///
    /// # Errors
    ///
    /// Returns 'AccessControlError' if the caller is not allowed to submit orders.

    #[ink(message)]
    fn create_order(
        &mut self,
        earliest_execution: Timestamp,
        latest_execution: Timestamp,
        operation: Vec<Operation>,
    ) -> Result<OrderId, AbaxTreasuryError>;

    /// Executes the order with the given ID.
    ///
    /// On success Emits 'OrderExecuted' event.
    ///
    /// # Errors
    ///
    /// Returns 'NoSuchOrder' if the order with the given ID does not exist.
    /// Returns 'OrderAlreadyExecuted' if the order with the given ID has already been executed.
    /// Returns 'AccessControlError' if the caller is not allowed to execute orders.
    #[ink(message)]
    fn execute_order(&mut self, id: OrderId) -> Result<(), AbaxTreasuryError>;

    /// Cancels the order with the given ID.
    ///
    /// On success Emits 'OrderCancelled' event.
    ///
    /// # Errors
    ///
    /// Returns 'NoSuchOrder' if the order with the given ID does not exist.
    /// Returns 'OrderAlreadyExecuted' if the order with the given ID has already been executed.
    /// Returns 'AccessControlError' if the caller is not allowed to cancel orders.
    #[ink(message)]
    fn cancel_order(&mut self, id: OrderId) -> Result<(), AbaxTreasuryError>;
}

#[ink::trait_definition]
pub trait AbaxTreasuryView {
    /// Returns the account ID of the current vester.
    #[ink(message)]
    fn vester(&self) -> AccountId;

    /// Returns the next order ID.
    #[ink(message)]
    fn next_order_id(&self) -> OrderId;

    /// Returns the order with the given ID.
    #[ink(message)]
    fn order(&self, id: OrderId) -> Option<Order>;
}
