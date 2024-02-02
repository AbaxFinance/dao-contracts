use ethnum::U256;
use pendzl::math::errors::MathError;

pub fn mul_div_r_down(x: u128, y: u128, denominator: u128) -> Result<u128, MathError> {
    if denominator == 0 {
        return Err(MathError::DivByZero);
    }

    if x == 0 || y == 0 {
        return Ok(0);
    }

    let x_u256 = U256::try_from(x).unwrap();
    let y_u256 = U256::try_from(y).unwrap();
    let denominator_u256 = U256::try_from(denominator).unwrap();

    // this can not overflow
    let mul_u256 = x_u256.checked_mul(y_u256).unwrap();
    // denom is not 0
    let res_u256: U256 = mul_u256.checked_div(denominator_u256).unwrap();
    let res = match u128::try_from(res_u256) {
        Ok(v) => Ok(v),
        _ => Err(MathError::Overflow),
    }?;

    Ok(res)
}
