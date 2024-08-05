use crate::modules::new_storage_field::NewStorageField;

#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct Reserved {
    #[lazy]
    pub version: u8,
    #[lazy]
    pub new_field: NewStorageField,
    #[lazy]
    pub counter: u32,
}
