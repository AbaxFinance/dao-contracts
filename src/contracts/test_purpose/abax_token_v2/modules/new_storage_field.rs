use pendzl::traits::{Balance, Timestamp};

#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct NewStorageField {
    #[lazy]
    a: Balance,
    #[lazy]
    b: Balance,
}
