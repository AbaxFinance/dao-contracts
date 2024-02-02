pub mod errors;
pub mod events;
pub mod structs;

pub use errors::*;
pub use events::*;
pub use structs::*;

use pendzl::traits::String;

use ink::prelude::vec::Vec;
use ink::primitives::Hash;

include!("govern.trait.rs");
include!("govern_manage.trait.rs");
include!("govern_view.trait.rs");
include!("govern_internal.trait.rs");
