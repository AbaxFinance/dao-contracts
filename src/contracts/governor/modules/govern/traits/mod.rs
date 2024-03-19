pub mod errors;
pub mod events;
pub mod structs;

pub use errors::*;
pub use events::*;
pub use structs::*;

pub use pendzl::traits::String;

pub use ink::{
    prelude::{string::ToString, vec::Vec},
    primitives::Hash,
};

include!("govern.trait.rs");
include!("govern_manage.trait.rs");
include!("govern_view.trait.rs");
include!("govern_internal.trait.rs");
