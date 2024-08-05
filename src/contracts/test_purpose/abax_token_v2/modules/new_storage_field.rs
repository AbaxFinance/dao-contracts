use pendzl::traits::Balance;
// new struct added
#[derive(Default, Debug)]
#[pendzl::storage_item]
pub struct NewStorageField {
    #[lazy]
    pub a: Balance,
    #[lazy]
    pub b: Balance,
}

#[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
#[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
pub struct NewStorageFieldView {
    pub a: Balance,
    pub b: Balance,
}
