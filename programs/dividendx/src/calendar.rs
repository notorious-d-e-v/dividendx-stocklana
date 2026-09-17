use anchor_lang::prelude::*;

use crate::error::DividendXError;

pub fn year_bounds(year: u16) -> Result<(i64, i64)> {
    require!((2020..=2100).contains(&year), DividendXError::InvalidYear);
    let start = unix_days(year as i32, 1, 1)
        .checked_mul(86_400)
        .ok_or(DividendXError::ArithmeticOverflow)?;
    let maturity = unix_days(year as i32 + 1, 1, 1)
        .checked_mul(86_400)
        .ok_or(DividendXError::ArithmeticOverflow)?;
    Ok((start, maturity))
}

pub fn parse_civil_date(value: u32) -> Result<(u16, u8, u8)> {
    let full_year = value / 10_000;
    require!((2020..=2101).contains(&full_year), DividendXError::InvalidCivilDate);
    let year = u16::try_from(full_year).map_err(|_| DividendXError::InvalidCivilDate)?;
    let month = ((value / 100) % 100) as u8;
    let day = (value % 100) as u8;
    require!((1..=12).contains(&month), DividendXError::InvalidCivilDate);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(year) => 29,
        2 => 28,
        _ => 0,
    };
    require!(day >= 1 && day <= max_day, DividendXError::InvalidCivilDate);
    Ok((year, month, day))
}

pub fn is_in_year(ex_date: u32, year: u16) -> bool {
    ex_date / 10_000 == year as u32
}

fn is_leap(year: u16) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn unix_days(mut year: i32, month: i32, day: i32) -> i64 {
    year -= i32::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    i64::from(era * 146_097 + day_of_era - 719_468)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_january_boundaries() {
        assert_eq!(year_bounds(2020).unwrap().0, 1_577_836_800);
        assert_eq!(year_bounds(2027).unwrap(), (1_798_761_600, 1_830_297_600));
        assert_eq!(year_bounds(2100).unwrap().1, 4_133_980_800);
    }

    #[test]
    fn validates_leap_dates() {
        assert!(parse_civil_date(20240229).is_ok());
        assert!(parse_civil_date(21000229).is_err());
        assert!(parse_civil_date(20270229).is_err());
        assert!(parse_civil_date(20271231).is_ok());
        assert!(parse_civil_date(u32::MAX).is_err());
    }
}
