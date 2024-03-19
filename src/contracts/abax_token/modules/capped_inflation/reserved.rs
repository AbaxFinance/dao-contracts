#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct Reserved {
    #[lazy]
    pub version: u8,
}
