use ink::{env::DefaultEnvironment, storage::Mapping};
use pendzl::{
    contracts::general_vest::GeneralVestRef,
    math::errors::MathError,
    traits::{AccountId, Timestamp},
};

use crate::modules::treasury::{
    errors::AbaxTreasuryError,
    events::VesterChanged,
    structs::{Operation, Order},
};

#[derive(Debug)]
#[pendzl::storage_item]
pub struct OrdersStorage {
    #[lazy]
    vester: GeneralVestRef,
    #[lazy]
    next_order_id: u32,
    orders: Mapping<u32, Order>,
}

impl OrdersStorage {
    pub fn new(vester: &AccountId) -> Self {
        let mut instance = OrdersStorage {
            vester: Default::default(),
            next_order_id: Default::default(),
            orders: Mapping::new(),
        };

        instance.set_vester(vester);
        ink::env::emit_event::<DefaultEnvironment, VesterChanged>(VesterChanged {
            vester: *vester,
        });

        instance
    }

    pub fn vester(&self) -> GeneralVestRef {
        self.vester.get().unwrap()
    }

    pub fn set_vester(&mut self, vester: &AccountId) {
        let vester: GeneralVestRef = (*vester).into();
        self.vester.set(&vester);
    }

    pub fn next_order_id(&self) -> u32 {
        self.next_order_id.get().unwrap_or(0)
    }

    pub fn order(&self, id: u32) -> Option<Order> {
        self.orders.get(id)
    }

    pub fn insert_order(
        &mut self,
        earliest_execution: Timestamp,
        latest_execution: Timestamp,
        operations: &[Operation],
    ) -> Result<u32, AbaxTreasuryError> {
        let order_id = self.next_order_id();

        self.orders.insert(
            order_id,
            &Order {
                earliest_execution,
                latest_execution,
                operations: operations.to_vec(),
            },
        );

        self.next_order_id
            .set(&(order_id.checked_add(1).ok_or(MathError::Overflow)?));
        Ok(order_id)
    }

    pub fn remove_order(&mut self, id: u32) -> Result<Order, AbaxTreasuryError> {
        if let Some(order) = self.orders.take(id) {
            Ok(order)
        } else {
            Err(AbaxTreasuryError::NoSuchOrder)
        }
    }
}
