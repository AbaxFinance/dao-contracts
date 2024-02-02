use ink::{
    env::hash::{HashOutput, Sha2x256},
    primitives::Hash,
};

use crate::Proposal;

pub fn hash_description(description: &String) -> Hash {
    let mut output = <Sha2x256 as HashOutput>::Type::default();
    ink::env::hash_bytes::<Sha2x256>(description.as_bytes(), &mut output);
    output.into()
}
pub fn hash_proposal(proposal: &Proposal) -> Hash {
    let mut hash_data: Vec<u8> = Vec::new();

    hash_data.append(&mut scale::Encode::encode(&proposal));

    let mut output = <Sha2x256 as HashOutput>::Type::default();
    ink::env::hash_bytes::<Sha2x256>(&hash_data, &mut output);
    output.into()
}
