use crate::Vec;
use ink::env::{
    call::{
        build_call,
        utils::{Argument, ArgumentList, EmptyArgumentList},
        Call, CallParams, ExecutionInput,
    },
    CallFlags, DefaultEnvironment, Environment,
};

#[derive(Debug, Clone, PartialEq, scale::Encode, scale::Decode)]
#[cfg_attr(
    feature = "std",
    derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
)]
pub struct Transaction<E: Environment = DefaultEnvironment> {
    /// The `AccountId` of the contract that is called in this transaction.
    pub callee: E::AccountId,
    /// The selector bytes that identifies the function of the callee that should be called.
    pub selector: [u8; 4],
    /// The SCALE encoded parameters that are passed to the called function.
    pub input: Vec<u8>,
    /// The amount of chain balance that is transferred to the callee.
    pub transferred_value: E::Balance,
}

type Args = ArgumentList<Argument<OpaqueTypes>, EmptyArgumentList>;

impl<E: Environment> Transaction<E> {
    pub fn build_call(self) -> CallParams<E, Call<E>, Args, OpaqueTypes> {
        build_call::<E>()
            .call(self.callee)
            .transferred_value(self.transferred_value)
            .call_flags(CallFlags::default().set_allow_reentry(true))
            .exec_input(ExecutionInput::new(self.selector.into()).push_arg(OpaqueTypes(self.input)))
            .returns::<OpaqueTypes>()
            .params()
    }
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
            loop {
                match input.read_byte() {
                    Ok(b) => bytes.push(b),
                    Err(_) => break,
                }
            }
        };

        Ok(OpaqueTypes(bytes))
    }
}
