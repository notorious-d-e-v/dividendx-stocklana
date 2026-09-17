use anchor_lang::prelude::*;
use num_bigint::BigUint;

use crate::{
    error::DividendXError,
    state::MAX_BIGINT_BYTES,
};

const FRACTION_MASK: u64 = (1_u64 << 52) - 1;
const MIN_NORMAL_BITS: u64 = (1023_u64 - 32) << 52;
const MAX_EXCLUSIVE_BITS: u64 = (1023_u64 + 32) << 52;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BinaryFactor {
    pub significand: u64,
    pub exponent: i16,
}

pub fn decode_multiplier(bits: u64) -> Result<BinaryFactor> {
    let sign = bits >> 63;
    let exponent_bits = ((bits >> 52) & 0x7ff) as i16;
    let fraction = bits & FRACTION_MASK;
    require!(sign == 0, DividendXError::InvalidMultiplier);
    require!(exponent_bits != 0 && exponent_bits != 0x7ff, DividendXError::InvalidMultiplier);
    require!(bits >= MIN_NORMAL_BITS && bits < MAX_EXCLUSIVE_BITS, DividendXError::InvalidMultiplier);
    Ok(BinaryFactor {
        significand: (1_u64 << 52) | fraction,
        exponent: exponent_bits - 1023 - 52,
    })
}

pub fn require_qualified_factor(m0_bits: u64, m1_bits: u64) -> Result<()> {
    decode_multiplier(m0_bits)?;
    decode_multiplier(m1_bits)?;
    require!(m1_bits >= m0_bits, DividendXError::InvalidMultiplier);
    Ok(())
}

pub fn multiply_ratio(
    numerator_bytes: &[u8],
    denominator_bytes: &[u8],
    m0_bits: u64,
    m1_bits: u64,
) -> Result<(Vec<u8>, Vec<u8>)> {
    require!(numerator_bytes.len() <= MAX_BIGINT_BYTES, DividendXError::ArithmeticBoundExceeded);
    require!(denominator_bytes.len() <= MAX_BIGINT_BYTES, DividendXError::ArithmeticBoundExceeded);
    require_qualified_factor(m0_bits, m1_bits)?;
    let m0 = decode_multiplier(m0_bits)?;
    let m1 = decode_multiplier(m1_bits)?;
    let mut numerator = BigUint::from_bytes_le(numerator_bytes);
    let mut denominator = BigUint::from_bytes_le(denominator_bytes);
    require!(numerator != BigUint::from(0_u8), DividendXError::InvalidAccountData);
    require!(denominator != BigUint::from(0_u8), DividendXError::InvalidAccountData);

    numerator *= BigUint::from(m0.significand);
    denominator *= BigUint::from(m1.significand);
    let shift = i32::from(m0.exponent) - i32::from(m1.exponent);
    if shift >= 0 {
        numerator <<= shift as usize;
    } else {
        denominator <<= (-shift) as usize;
    }
    let numerator = bounded_bytes(numerator)?;
    let denominator = bounded_bytes(denominator)?;
    Ok((numerator, denominator))
}

pub fn split_pools(quantity: u64, numerator_bytes: &[u8], denominator_bytes: &[u8]) -> Result<(u64, u64)> {
    require!(numerator_bytes.len() <= MAX_BIGINT_BYTES, DividendXError::ArithmeticBoundExceeded);
    require!(denominator_bytes.len() <= MAX_BIGINT_BYTES, DividendXError::ArithmeticBoundExceeded);
    let numerator = BigUint::from_bytes_le(numerator_bytes);
    let denominator = BigUint::from_bytes_le(denominator_bytes);
    require!(
        numerator != BigUint::from(0_u8) && denominator != BigUint::from(0_u8) && numerator <= denominator,
        DividendXError::InvalidAccountData
    );
    let dividend_numerator = BigUint::from(quantity) * (&denominator - &numerator);
    require!(dividend_numerator.to_bytes_le().len() <= MAX_BIGINT_BYTES, DividendXError::ArithmeticBoundExceeded);
    let dividend = dividend_numerator / denominator;
    let dr = biguint_to_u64(&dividend)?;
    let pt = quantity.checked_sub(dr).ok_or(DividendXError::ArithmeticOverflow)?;
    Ok((pt, dr))
}

pub fn redemption_payout(redeemed_before: u64, amount: u64, pool: u64, supply: u64) -> Result<u64> {
    if supply == 0 {
        require!(amount == 0, DividendXError::RedemptionExceedsSupply);
        return Ok(0);
    }
    let redeemed_after = redeemed_before
        .checked_add(amount)
        .ok_or(DividendXError::ArithmeticOverflow)?;
    require!(redeemed_after <= supply, DividendXError::RedemptionExceedsSupply);
    let before = (u128::from(redeemed_before) * u128::from(pool)) / u128::from(supply);
    let after = (u128::from(redeemed_after) * u128::from(pool)) / u128::from(supply);
    u64::try_from(after - before).map_err(|_| DividendXError::ArithmeticOverflow.into())
}

fn bounded_bytes(value: BigUint) -> Result<Vec<u8>> {
    let bytes = value.to_bytes_le();
    require!(!bytes.is_empty() && bytes.len() <= MAX_BIGINT_BYTES, DividendXError::ArithmeticBoundExceeded);
    Ok(bytes)
}

fn biguint_to_u64(value: &BigUint) -> Result<u64> {
    let bytes = value.to_bytes_le();
    require!(bytes.len() <= 8, DividendXError::ArithmeticOverflow);
    let mut raw = [0_u8; 8];
    raw[..bytes.len()].copy_from_slice(&bytes);
    Ok(u64::from_le_bytes(raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bits(value: f64) -> u64 {
        value.to_bits()
    }

    #[test]
    fn rejects_noncanonical_factors() {
        for value in [0.0, -1.0, f64::NAN, f64::INFINITY, f64::MIN_POSITIVE / 2.0, 2_f64.powi(-33), 2_f64.powi(32)] {
            assert!(decode_multiplier(bits(value)).is_err(), "{value:?}");
        }
        assert!(decode_multiplier(bits(2_f64.powi(-32))).is_ok());
        assert!(decode_multiplier(MAX_EXCLUSIVE_BITS - 1).is_ok());
    }

    #[test]
    fn compounds_before_rounding() {
        let (n, d) = multiply_ratio(&[1], &[1], bits(1.0), bits(1.1)).unwrap();
        let (n, d) = multiply_ratio(&n, &d, bits(1.1), bits(1.21)).unwrap();
        assert_eq!(split_pools(1_000_000, &n, &d).unwrap(), (826_447, 173_553));
    }

    #[test]
    fn redemption_telescopes() {
        let pool = 173_553;
        let supply = 1_000_000;
        let a = redemption_payout(0, 333_333, pool, supply).unwrap();
        let b = redemption_payout(333_333, 444_444, pool, supply).unwrap();
        let c = redemption_payout(777_777, 222_223, pool, supply).unwrap();
        assert_eq!(a + b + c, pool);
    }

    #[test]
    fn sixty_four_extreme_products_stay_bounded() {
        let mut n = vec![1];
        let mut d = vec![1];
        let low = bits(2_f64.powi(-32));
        let high = bits(2_f64.powi(32) - 1.0);
        for _ in 0..64 {
            (n, d) = multiply_ratio(&n, &d, low, high).unwrap();
        }
        assert!(n.len() <= MAX_BIGINT_BYTES);
        assert!(d.len() <= MAX_BIGINT_BYTES);
        assert!(d.len() * 8 <= 7_424);
        split_pools(u64::MAX, &n, &d).unwrap();
    }

    #[test]
    fn fixture_bit_patterns_match_independent_oracle() {
        let cases = [
            (
                9_819_982_084_u64,
                4_607_264_977_872_978_803_u64,
                4_607_284_020_568_871_647_u64,
                (9_779_376_057_u64, 40_606_027_u64),
            ),
            (
                100_000_000_u64,
                4_607_182_418_800_017_408_u64,
                4_607_182_899_454_409_970_u64,
                (99_989_329_u64, 10_671_u64),
            ),
        ];
        for (quantity, m0, m1, expected) in cases {
            let (n, d) = multiply_ratio(&[1], &[1], m0, m1).unwrap();
            assert_eq!(split_pools(quantity, &n, &d).unwrap(), expected);
        }
    }

    #[test]
    fn fractional_one_ulp_events_round_only_once() {
        let mut n = vec![1];
        let mut d = vec![1];
        let m0 = 4_607_182_418_800_017_408_u64;
        let m1 = 4_607_182_418_800_017_409_u64;
        for _ in 0..64 {
            (n, d) = multiply_ratio(&n, &d, m0, m1).unwrap();
        }
        assert_eq!(
            split_pools(u64::MAX, &n, &d).unwrap(),
            (18_446_744_073_709_289_472, 262_143)
        );
    }
}
