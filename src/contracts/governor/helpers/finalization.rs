use pendzl::traits::{Balance, Timestamp};

use crate::{ProposalState, VotingRules};

pub fn minimum_to_finalize(
    state: &ProposalState,
    rules: &VotingRules,
    now: Timestamp,
    current_counter: u128,
) -> Balance {
    let end_initial_period = state.start + rules.initial_period;
    let end_flat_period = end_initial_period + rules.flat_period;
    let end_final_period = end_flat_period + rules.final_period;

    let counter_diff = current_counter.overflowing_sub(state.counter_at_start).0;
    let total_votes = counter_diff + state.votes_at_start;

    if now <= end_initial_period {
        ink::env::debug_println!("initial");
        total_votes / 2 * (end_initial_period - now) as u128 / rules.initial_period as u128
            + total_votes / 2
    } else if now <= end_flat_period {
        ink::env::debug_println!("mid");
        total_votes / 2
    } else if now <= end_final_period {
        ink::env::debug_println!("final");
        total_votes / 2 * (end_final_period - now) as u128 / rules.final_period as u128
    } else {
        ink::env::debug_println!("last");
        0
    }
}
