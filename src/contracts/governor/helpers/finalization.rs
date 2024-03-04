use pendzl::traits::{Balance, Timestamp};

use crate::{ProposalState, VotingRules};

pub fn minimum_to_finalize(
    state: &ProposalState,
    rules: &VotingRules,
    now: Timestamp,
    current_counter: u128,
) -> Balance {
    let initial_period_end = state.start + rules.initial_period;
    let flat_period_end = initial_period_end + rules.flat_period;
    let final_period_end = flat_period_end + rules.final_period;

    let counter_diff = current_counter.overflowing_sub(state.counter_at_start).0;
    let total_votes = state.votes_at_start + counter_diff;

    //print all of args and above
    ink::env::debug_println!("state.start: {:?}", state.start);
    ink::env::debug_println!("rules.initial_period: {:?}", rules.initial_period);
    ink::env::debug_println!("initial_period_end: {:?}", initial_period_end);
    ink::env::debug_println!("rules.flat_period: {:?}", rules.flat_period);
    ink::env::debug_println!("flat_period_end: {:?}", flat_period_end);
    ink::env::debug_println!("rules.final_period: {:?}", rules.final_period);
    ink::env::debug_println!("final_period_end: {:?}", final_period_end);
    ink::env::debug_println!("counter_diff: {:?}", counter_diff);
    ink::env::debug_println!("state.counter_at_start: {:?}", state.counter_at_start);
    ink::env::debug_println!("state.votes_at_start: {:?}", state.votes_at_start);
    ink::env::debug_println!("total_votes: {:?}", total_votes);
    ink::env::debug_println!("now: {:?}", now);

    if now <= initial_period_end {
        ink::env::debug_println!("initial");
        total_votes / 2 * (initial_period_end - now) as u128 / rules.initial_period as u128
            + total_votes / 2
    } else if now <= flat_period_end {
        ink::env::debug_println!("mid");
        total_votes / 2
    } else if now <= final_period_end {
        ink::env::debug_println!("final");
        total_votes / 2 * (final_period_end - now) as u128 / rules.final_period as u128
    } else {
        ink::env::debug_println!("last");
        0
    }
}
