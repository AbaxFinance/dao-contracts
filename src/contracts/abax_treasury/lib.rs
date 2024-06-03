#![cfg_attr(not(feature = "std"), no_std, no_main)]

mod modules;

#[pendzl::implementation(AccessControl, SetCodeHash)]
#[ink::contract]
pub mod abax_treasury {
    pub use crate::modules::treasury::{
        errors::AbaxTreasuryError,
        events::{OrderCancelled, OrderCreated, OrderExecuted, VesterChanged},
        storage_fields::operations::OrdersStorage,
        structs::{Operation, Order, OrderId},
        traits::{AbaxTreasury, AbaxTreasuryView},
    };
    use ink::codegen::TraitCallBuilder;
    pub use ink::{prelude::vec::Vec, ToAccountId};
    pub use pendzl::contracts::{
        general_vest::{GeneralVest, GeneralVestRef},
        psp22::{PSP22Ref, PSP22},
    };

    pub const PARAMETERS_ADMIN: RoleType = ink::selector_id!("PARAMETERS_ADMIN"); // 368_001_360_u32
    pub const SPENDER: RoleType = ink::selector_id!("SPENDER"); // 3_684_413_446_u32
    pub const EXECUTOR: RoleType = ink::selector_id!("EXECUTOR"); // 3_551_554_066_u32
    pub const CANCELLER: RoleType = ink::selector_id!("CANCELLER"); //4_141_332_106_u32

    #[ink(storage)]
    #[derive(pendzl::traits::StorageFieldGetter)]
    pub struct AbaxTreasuryContract {
        #[storage_field]
        access: AccessControlData,
        #[storage_field]
        orders: OrdersStorage,
    }

    impl AbaxTreasuryContract {
        #[ink(constructor)]
        pub fn new(
            governor: AccountId,
            foundation: AccountId,
            vester: AccountId,
        ) -> Result<Self, AbaxTreasuryError> {
            let mut instance = AbaxTreasuryContract {
                access: AccessControlData::new(Some(governor)),
                orders: OrdersStorage::new(&vester),
            };

            instance._grant_role(SPENDER, Some(governor))?;
            instance._grant_role(EXECUTOR, Some(foundation))?;
            instance._grant_role(CANCELLER, Some(foundation))?;

            Ok(instance)
        }
    }

    impl AbaxTreasury for AbaxTreasuryContract {
        #[ink(message)]
        fn set_vester(&mut self, vester: AccountId) -> Result<(), AbaxTreasuryError> {
            let caller = self.env().caller();
            self._ensure_has_role(PARAMETERS_ADMIN, Some(caller))?;

            self.orders.set_vester(&vester);
            self.env()
                .emit_event::<VesterChanged>(VesterChanged { vester });

            Ok(())
        }

        #[ink(message)]
        fn create_order(
            &mut self,
            earliest_execution: Timestamp,
            latest_execution: Timestamp,
            operations: Vec<Operation>,
        ) -> Result<OrderId, AbaxTreasuryError> {
            let caller = self.env().caller();
            self._ensure_has_role(SPENDER, Some(caller))?;

            let order_id =
                self.orders
                    .insert_order(earliest_execution, latest_execution, &operations)?;
            self.env().emit_event::<OrderCreated>(OrderCreated {
                id: order_id,
                earliest_execution,
                latest_execution,
                operations,
            });

            Ok(order_id)
        }

        #[ink(message)]
        fn execute_order(&mut self, id: OrderId) -> Result<(), AbaxTreasuryError> {
            let caller = self.env().caller();
            self._ensure_has_role(EXECUTOR, Some(caller))?;

            let order = self.orders.remove_order(id)?;

            let now = self.env().block_timestamp();
            if now < order.earliest_execution {
                return Err(AbaxTreasuryError::ToEarlyToExecute);
            }

            if now > order.latest_execution {
                return Err(AbaxTreasuryError::ToLateToExecute);
            }

            for operation in order.operations {
                match operation {
                    Operation::PSP22Transfer(transfer) => {
                        let mut psp22: PSP22Ref = transfer.asset.into();
                        psp22
                            .call_mut()
                            .transfer(transfer.to, transfer.amount, Vec::<u8>::new())
                            .call_v1()
                            .invoke()?;
                    }
                    Operation::NativeTransfer(transfer) => {
                        match self.env().transfer(transfer.to, transfer.amount) {
                            Ok(_) => {}
                            Err(_) => return Err(AbaxTreasuryError::NativeTransferFailed),
                        }
                    }
                    Operation::Vest(vest) => {
                        let mut vester: GeneralVestRef = self.orders.vester();

                        if let Some(asset) = vest.asset {
                            let mut psp22: PSP22Ref = asset.into();

                            psp22
                                .call_mut()
                                .approve(vester.to_account_id(), vest.amount)
                                .call_v1()
                                .invoke()?;

                            vester
                                .call_mut()
                                .create_vest(
                                    vest.receiver,
                                    Some(asset),
                                    vest.amount,
                                    vest.schedule,
                                    Vec::<u8>::new(),
                                )
                                .call_v1()
                                .invoke()?;
                        } else {
                            //TODO create a tx with value transfer
                            vester
                                .call_mut()
                                .create_vest(
                                    vest.receiver,
                                    None,
                                    vest.amount,
                                    vest.schedule,
                                    Vec::<u8>::new(),
                                )
                                .call_v1()
                                .invoke()?;
                        }
                    }
                }
            }

            self.env().emit_event::<OrderExecuted>(OrderExecuted { id });

            Ok(())
        }

        #[ink(message)]
        fn cancel_order(&mut self, id: OrderId) -> Result<(), AbaxTreasuryError> {
            let caller = self.env().caller();
            self._ensure_has_role(CANCELLER, Some(caller))?;

            self.orders.remove_order(id)?;
            self.env()
                .emit_event::<OrderCancelled>(OrderCancelled { id });

            Ok(())
        }
    }

    impl AbaxTreasuryView for AbaxTreasuryContract {
        #[ink(message)]
        fn vester(&self) -> AccountId {
            self.orders.vester().to_account_id()
        }

        #[ink(message)]
        fn next_order_id(&self) -> OrderId {
            self.orders.next_order_id()
        }

        #[ink(message)]
        fn order(&self, id: OrderId) -> Option<Order> {
            self.orders.order(id)
        }
    }
}
