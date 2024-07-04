pub use ink::prelude::vec::Vec;

#[derive(Debug, Clone, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct Transaction {
    /// The `AccountId` of the contract that is called in this transaction.
    pub callee: AccountId,
    /// The selector bytes that identifies the function of the callee that should be called.
    pub selector: [u8; 4],
    /// The SCALE encoded parameters that are passed to the called function.
    pub input: Vec<u8>,
    /// The amount of chain balance that is transferred to the callee.
    pub transferred_value: Balance,
}

#[cfg_attr(
    feature = "std",
    derive(
        PartialEq,
        Eq,
        scale_info::TypeInfo,
        ink::storage::traits::StorageLayout
    )
)]
#[derive(Clone, Debug)]
pub struct OpaqueTypes(pub Vec<u8>);

impl scale::Encode for OpaqueTypes {
    #[inline]
    fn size_hint(&self) -> usize {
        self.0.len()
    }

    #[inline]
    fn encode_to<O: scale::Output + ?Sized>(&self, output: &mut O) {
        output.write(&self.0);
    }
}

impl scale::Decode for OpaqueTypes {
    #[inline]
    fn decode<I: scale::Input>(input: &mut I) -> Result<Self, scale::Error> {
        let len = input.remaining_len()?;

        let mut bytes;

        if let Some(len) = len {
            bytes = ink::prelude::vec![0; len];
            input.read(&mut bytes[..len])?;
        } else {
            bytes = Vec::new();
            while let Ok(b) = input.read_byte() {
                bytes.push(b);
            }
        };

        Ok(OpaqueTypes(bytes))
    }
}
