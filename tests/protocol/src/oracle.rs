//! Big-integer oracle built independently of the on-chain implementation.

use num_bigint::BigUint;
use num_integer::Integer;
use num_traits::{One, Zero};

pub const MAX_COMPONENT_BYTES: usize = 1_024;
pub const MAX_COMPONENT_BITS: u64 = 8_192;
pub const PROVEN_FACTOR_PRODUCT_BITS: u64 = 7_424;
pub const PROVEN_QUANTITY_PRODUCT_BITS: u64 = 7_488;
pub const MIN_MULTIPLIER_BITS: u64 = 0x3df0_0000_0000_0000; // 2^-32
pub const MAX_MULTIPLIER_EXCLUSIVE_BITS: u64 = 0x41f0_0000_0000_0000; // 2^32

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleError {
    InvalidMultiplier,
    DecreasingMultiplier,
    RatioAboveOne,
    ComponentTooLarge,
    InvalidDecimal,
    InvalidDate,
    Arithmetic,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactRatio {
    pub numerator: BigUint,
    pub denominator: BigUint,
}

impl ExactRatio {
    pub fn one() -> Self {
        Self {
            numerator: BigUint::one(),
            denominator: BigUint::one(),
        }
    }

    pub fn new(numerator: BigUint, denominator: BigUint) -> Result<Self, OracleError> {
        if denominator.is_zero() {
            return Err(OracleError::Arithmetic);
        }
        let gcd = numerator.gcd(&denominator);
        Ok(Self {
            numerator: numerator / &gcd,
            denominator: denominator / gcd,
        })
    }

    pub fn from_f64_bits(bits: u64) -> Result<Self, OracleError> {
        validate_multiplier(bits)?;
        let exponent_field = ((bits >> 52) & 0x7ff) as i32;
        let mut significand = (1u64 << 52) | (bits & ((1u64 << 52) - 1));
        let mut exponent = exponent_field - 1023 - 52;

        // Canonicalize powers of two first. This is exact integer arithmetic.
        let trailing = significand.trailing_zeros() as i32;
        significand >>= trailing;
        exponent += trailing;

        let mut numerator = BigUint::from(significand);
        let mut denominator = BigUint::one();
        if exponent >= 0 {
            numerator <<= exponent as usize;
        } else {
            denominator <<= (-exponent) as usize;
        }
        Self::new(numerator, denominator)
    }

    pub fn multiply(&mut self, rhs: &Self) -> Result<(), OracleError> {
        let next = Self::new(
            &self.numerator * &rhs.numerator,
            &self.denominator * &rhs.denominator,
        )?;
        if next.numerator.bits() > MAX_COMPONENT_BITS
            || next.denominator.bits() > MAX_COMPONENT_BITS
        {
            return Err(OracleError::ComponentTooLarge);
        }
        *self = next;
        Ok(())
    }

    pub fn component_bytes(&self) -> (usize, usize) {
        (
            self.numerator.to_bytes_le().len(),
            self.denominator.to_bytes_le().len(),
        )
    }
}

pub fn validate_multiplier(bits: u64) -> Result<(), OracleError> {
    let sign = bits >> 63;
    let exponent = (bits >> 52) & 0x7ff;
    if sign != 0
        || exponent == 0
        || exponent == 0x7ff
        || bits < MIN_MULTIPLIER_BITS
        || bits >= MAX_MULTIPLIER_EXCLUSIVE_BITS
    {
        return Err(OracleError::InvalidMultiplier);
    }
    Ok(())
}

pub fn active_multiplier_bits(
    current_bits: u64,
    pending_bits: u64,
    pending_effective_timestamp: i64,
    clock_unix_timestamp: i64,
) -> Result<u64, OracleError> {
    validate_multiplier(current_bits)?;
    validate_multiplier(pending_bits)?;
    if pending_effective_timestamp < 0 {
        return Err(OracleError::Arithmetic);
    }
    Ok(if clock_unix_timestamp >= pending_effective_timestamp {
        pending_bits
    } else {
        current_bits
    })
}

pub fn factor(m0_bits: u64, m1_bits: u64) -> Result<ExactRatio, OracleError> {
    validate_multiplier(m0_bits)?;
    validate_multiplier(m1_bits)?;
    if m1_bits < m0_bits {
        return Err(OracleError::DecreasingMultiplier);
    }
    let m0 = ExactRatio::from_f64_bits(m0_bits)?;
    let m1 = ExactRatio::from_f64_bits(m1_bits)?;
    let result = ExactRatio::new(
        m0.numerator * m1.denominator,
        m0.denominator * m1.numerator,
    )?;
    if result.numerator > result.denominator {
        return Err(OracleError::RatioAboveOne);
    }
    Ok(result)
}

pub fn accumulate(events: &[(u64, u64)]) -> Result<ExactRatio, OracleError> {
    let mut ratio = ExactRatio::one();
    for &(m0, m1) in events {
        ratio.multiply(&factor(m0, m1)?)?;
    }
    Ok(ratio)
}

/// Reproduces the deliberately unreduced on-chain accumulator shape. Pool
/// allocation uses `accumulate`; this is only for independent storage bounds.
pub fn accumulate_unreduced(events: &[(u64, u64)]) -> Result<ExactRatio, OracleError> {
    let mut numerator = BigUint::one();
    let mut denominator = BigUint::one();
    for &(m0_bits, m1_bits) in events {
        validate_multiplier(m0_bits)?;
        validate_multiplier(m1_bits)?;
        if m1_bits < m0_bits {
            return Err(OracleError::DecreasingMultiplier);
        }
        let (m0_significand, m0_exponent) = raw_binary_parts(m0_bits);
        let (m1_significand, m1_exponent) = raw_binary_parts(m1_bits);
        numerator *= BigUint::from(m0_significand);
        denominator *= BigUint::from(m1_significand);
        let shift = m0_exponent - m1_exponent;
        if shift >= 0 {
            numerator <<= shift as usize;
        } else {
            denominator <<= (-shift) as usize;
        }
        if numerator.bits() > MAX_COMPONENT_BITS || denominator.bits() > MAX_COMPONENT_BITS {
            return Err(OracleError::ComponentTooLarge);
        }
    }
    Ok(ExactRatio { numerator, denominator })
}

fn raw_binary_parts(bits: u64) -> (u64, i32) {
    let exponent_field = ((bits >> 52) & 0x7ff) as i32;
    let significand = (1u64 << 52) | (bits & ((1u64 << 52) - 1));
    (significand, exponent_field - 1023 - 52)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pools {
    pub pt: BigUint,
    pub dr: BigUint,
}

pub fn pools(quantity: u64, ratio: &ExactRatio) -> Result<Pools, OracleError> {
    if ratio.numerator > ratio.denominator {
        return Err(OracleError::RatioAboveOne);
    }
    let quantity = BigUint::from(quantity);
    let dr = (&quantity * (&ratio.denominator - &ratio.numerator)) / &ratio.denominator;
    let pt = quantity - &dr;
    Ok(Pools { pt, dr })
}

pub fn cumulative_payout(
    prior_burned: u64,
    burn: u64,
    pool: u64,
    nominal_supply: u64,
) -> Result<u64, OracleError> {
    if nominal_supply == 0 {
        return Err(OracleError::Arithmetic);
    }
    let before = (prior_burned as u128)
        .checked_mul(pool as u128)
        .ok_or(OracleError::Arithmetic)?
        / nominal_supply as u128;
    let through = (prior_burned as u128)
        .checked_add(burn as u128)
        .and_then(|total| total.checked_mul(pool as u128))
        .ok_or(OracleError::Arithmetic)?
        / nominal_supply as u128;
    u64::try_from(through - before).map_err(|_| OracleError::Arithmetic)
}

pub fn decimal_ratio(value: &str) -> Result<ExactRatio, OracleError> {
    let (integer, fraction) = value.split_once('.').unwrap_or((value, ""));
    if integer.is_empty()
        || !integer.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(OracleError::InvalidDecimal);
    }
    let digits = format!("{integer}{fraction}");
    let numerator = BigUint::parse_bytes(digits.as_bytes(), 10)
        .ok_or(OracleError::InvalidDecimal)?;
    let denominator = BigUint::from(10u8).pow(fraction.len() as u32);
    ExactRatio::new(numerator, denominator)
}

pub fn decimal_factor(m0: &str, m1: &str) -> Result<ExactRatio, OracleError> {
    let m0 = decimal_ratio(m0)?;
    let m1 = decimal_ratio(m1)?;
    ExactRatio::new(
        m0.numerator * m1.denominator,
        m0.denominator * m1.numerator,
    )
}

pub fn valid_civil_date(encoded: u32) -> Result<(), OracleError> {
    if encoded == 0 {
        return Err(OracleError::InvalidDate);
    }
    let year = encoded / 10_000;
    let month = (encoded / 100) % 100;
    let day = encoded % 100;
    if !(2020..=2100).contains(&year) || !(1..=12).contains(&month) {
        return Err(OracleError::InvalidDate);
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if day == 0 || day > month_days[(month - 1) as usize] {
        return Err(OracleError::InvalidDate);
    }
    Ok(())
}

pub fn jan1_unix_timestamp(year: u16) -> Result<i64, OracleError> {
    if !(2020..=2101).contains(&year) {
        return Err(OracleError::InvalidDate);
    }
    let mut days = 0i64;
    for candidate in 1970..year as i32 {
        let leap = candidate % 4 == 0 && (candidate % 100 != 0 || candidate % 400 == 0);
        days += if leap { 366 } else { 365 };
    }
    days.checked_mul(86_400).ok_or(OracleError::Arithmetic)
}
