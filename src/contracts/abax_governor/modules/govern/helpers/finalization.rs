use pendzl::{
    math::errors::MathError,
    traits::{Balance, Timestamp},
};

use crate::modules::govern::{
    helpers::mul_div::mul_div_r_down,
    traits::{ProposalState, VotingRules},
};

pub fn minimum_to_finalize(
    state: &ProposalState,
    rules: &VotingRules,
    now: Timestamp,
    current_counter: u128,
) -> Result<Balance, MathError> {
    let initial_period_end = state
        .start
        .checked_add(rules.initial_period)
        .ok_or(MathError::Overflow)?;
    let flat_period_end = initial_period_end
        .checked_add(rules.flat_period)
        .ok_or(MathError::Overflow)?;
    let final_period_end = flat_period_end
        .checked_add(rules.final_period)
        .ok_or(MathError::Overflow)?;

    let counter_diff = current_counter.overflowing_sub(state.counter_at_start).0;
    let total_votes = state
        .votes_at_start
        .checked_add(counter_diff)
        .ok_or(MathError::Overflow)?;

    //print all of args and above

    let half_total_votes = total_votes.checked_div(2).ok_or(MathError::DivByZero)?;

    Ok(if now <= initial_period_end {
        let time_in_initial_period = initial_period_end
            .checked_sub(now)
            .ok_or(MathError::Underflow)? as u128;
        let over_half = mul_div_r_down(
            half_total_votes,
            time_in_initial_period,
            rules.initial_period as u128,
        )?;
        half_total_votes
            .checked_add(over_half)
            .ok_or(MathError::Overflow)?
    } else if now <= flat_period_end {
        half_total_votes
    } else if now <= final_period_end {
        let time_in_final_period = final_period_end
            .checked_sub(now)
            .ok_or(MathError::Underflow)? as u128;
        mul_div_r_down(
            half_total_votes,
            time_in_final_period,
            rules.final_period as u128,
        )?
    } else {
        0
    })
}
