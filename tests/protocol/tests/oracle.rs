use dividendx_protocol_tests::oracle::{
    accumulate, accumulate_unreduced, active_multiplier_bits, cumulative_payout, decimal_factor, factor,
    jan1_unix_timestamp, pools, valid_civil_date, validate_multiplier, ExactRatio, OracleError, MAX_COMPONENT_BITS,
    MAX_MULTIPLIER_EXCLUSIVE_BITS, MIN_MULTIPLIER_BITS, PROVEN_FACTOR_PRODUCT_BITS,
    PROVEN_QUANTITY_PRODUCT_BITS,
};
use num_bigint::BigUint;
use num_traits::One;

#[test]
fn f64_bit_decomposition_is_exact() {
    let ratio = ExactRatio::from_f64_bits(1.1f64.to_bits()).unwrap();
    assert_eq!(ratio.numerator, BigUint::from(2_476_979_795_053_773u64));
    assert_eq!(ratio.denominator, BigUint::from(2_251_799_813_685_248u64));
}

#[test]
fn multiplier_range_and_ieee_classes_are_closed() {
    assert!(validate_multiplier(MIN_MULTIPLIER_BITS).is_ok());
    assert_eq!(
        validate_multiplier(MAX_MULTIPLIER_EXCLUSIVE_BITS),
        Err(OracleError::InvalidMultiplier)
    );
    for bits in [
        0,
        1,
        (-1.0f64).to_bits(),
        f64::NAN.to_bits(),
        f64::INFINITY.to_bits(),
        f64::NEG_INFINITY.to_bits(),
        MIN_MULTIPLIER_BITS - 1,
    ] {
        assert_eq!(
            validate_multiplier(bits),
            Err(OracleError::InvalidMultiplier),
            "accepted bits {bits:#018x}"
        );
    }
    assert!(validate_multiplier(MAX_MULTIPLIER_EXCLUSIVE_BITS - 1).is_ok());
}

#[test]
fn pending_scale_activates_at_timestamp_equality() {
    let current = 1.0f64.to_bits();
    let pending = 1.1f64.to_bits();
    assert_eq!(active_multiplier_bits(current, pending, 50, 49).unwrap(), current);
    assert_eq!(active_multiplier_bits(current, pending, 50, 50).unwrap(), pending);
    assert_eq!(active_multiplier_bits(current, pending, 50, 51).unwrap(), pending);
}

#[test]
fn decreasing_factor_is_rejected_from_bits() {
    assert_eq!(
        factor(2.0f64.to_bits(), 1.0f64.to_bits()),
        Err(OracleError::DecreasingMultiplier)
    );
}

#[test]
fn four_event_product_matches_exact_binary_oracle() {
    let ratio = accumulate(&[
        (1.0f64.to_bits(), 1.1f64.to_bits()),
        (1.0f64.to_bits(), 1.1f64.to_bits()),
        (1.0f64.to_bits(), 1.1f64.to_bits()),
        (1.0f64.to_bits(), 1.1f64.to_bits()),
    ])
    .unwrap();
    let allocation = pools(10_000, &ratio).unwrap();
    assert_eq!(&allocation.pt + &allocation.dr, BigUint::from(10_000u64));
    assert_eq!(allocation.dr, BigUint::from(3_169u64));
}

#[test]
fn event_product_is_order_independent() {
    let events = [
        (1.0f64.to_bits(), 1.03f64.to_bits()),
        (1.01f64.to_bits(), 1.07f64.to_bits()),
        (2.0f64.to_bits(), 2.02f64.to_bits()),
        (3.1f64.to_bits(), 3.2f64.to_bits()),
    ];
    let reversed = [events[3], events[2], events[1], events[0]];
    assert_eq!(accumulate(&events).unwrap(), accumulate(&reversed).unwrap());
}

#[test]
fn cumulative_product_retains_sub_unit_accrual() {
    let ratio = accumulate(&[(1.0f64.to_bits(), 1.01f64.to_bits()); 4]).unwrap();
    assert_eq!(pools(30, &ratio).unwrap().dr, BigUint::one());
}

#[test]
fn pool_rounding_assigns_remainder_to_pt() {
    let ratio = factor(1.0f64.to_bits(), 3.0f64.to_bits()).unwrap();
    let allocation = pools(10, &ratio).unwrap();
    assert_eq!(allocation.dr, BigUint::from(6u8));
    assert_eq!(allocation.pt, BigUint::from(4u8));
}

#[test]
fn cumulative_redemption_telescopes_for_any_partition_order() {
    assert_eq!(cumulative_payout(0, 3, 6, 10).unwrap(), 1);
    assert_eq!(cumulative_payout(3, 7, 6, 10).unwrap(), 5);
    assert_eq!(cumulative_payout(0, 7, 6, 10).unwrap(), 4);
    assert_eq!(cumulative_payout(7, 3, 6, 10).unwrap(), 2);
}

#[test]
fn seeded_redemption_partitions_conserve_pool() {
    let mut seed = 0x5eedu64;
    let mut remaining = 10_000u64;
    let mut burned = 0u64;
    let mut paid = 0u64;
    while remaining != 0 {
        seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345) & 0x7fff_ffff;
        let upper = remaining.min(311);
        let part = seed % upper + 1;
        paid += cumulative_payout(burned, part, 2_701, 10_000).unwrap();
        burned += part;
        remaining -= part;
    }
    assert_eq!(paid, 2_701);
}

#[test]
fn sourced_factor_regressions_use_f64_bits_not_decimal_text() {
    let ko_binary = factor(
        1.0183317967386898f64.to_bits(),
        1.0225601246249238f64.to_bits(),
    )
    .unwrap();
    let ko_decimal = decimal_factor("1.0183317967386898", "1.0225601246249238").unwrap();
    assert_eq!(pools(9_819_982_084, &ko_binary).unwrap().dr, BigUint::from(40_606_027u64));
    assert_eq!(pools(9_819_982_084, &ko_decimal).unwrap().dr, BigUint::from(40_606_027u64));

    let mu_binary = factor(1.0f64.to_bits(), 1.000106726714702f64.to_bits()).unwrap();
    let mu_decimal = decimal_factor("1", "1.000106726714702").unwrap();
    assert_eq!(pools(100_000_000, &mu_binary).unwrap().dr, BigUint::from(10_671u64));
    assert_eq!(pools(100_000_000, &mu_decimal).unwrap().dr, BigUint::from(10_671u64));

    // The source regressions happen to round equally at their fixture Q. A
    // maximum-u64 comparison proves that decimal text is not interchangeable
    // with the canonical binary64 inputs.
    assert_eq!(
        pools(u64::MAX, &ko_binary).unwrap().dr,
        BigUint::from(76_278_040_282_178_123u64)
    );
    assert_eq!(
        pools(u64::MAX, &ko_decimal).unwrap().dr,
        BigUint::from(76_278_040_282_177_003u64)
    );
    assert_eq!(
        pools(u64::MAX, &mu_binary).unwrap().dr,
        BigUint::from(1_968_550_295_028_238u64)
    );
    assert_eq!(
        pools(u64::MAX, &mu_decimal).unwrap().dr,
        BigUint::from(1_968_550_295_029_894u64)
    );
}

#[test]
fn sixty_four_worst_range_factors_stay_inside_proven_bound() {
    let ratio = accumulate_unreduced(&[(MIN_MULTIPLIER_BITS, MAX_MULTIPLIER_EXCLUSIVE_BITS - 1); 64])
        .unwrap();
    assert!(ratio.numerator.bits() <= PROVEN_FACTOR_PRODUCT_BITS);
    assert!(ratio.denominator.bits() <= PROVEN_FACTOR_PRODUCT_BITS);
    assert!(ratio.numerator.bits() + 64 <= PROVEN_QUANTITY_PRODUCT_BITS);
    assert!(ratio.denominator.bits() + 64 <= PROVEN_QUANTITY_PRODUCT_BITS);
    assert!(PROVEN_QUANTITY_PRODUCT_BITS < MAX_COMPONENT_BITS);
    assert_eq!(ratio.numerator.bits(), 3_329);
    assert_eq!(ratio.denominator.bits(), 7_424);
    let allocation = pools(u64::MAX, &ratio).unwrap();
    assert_eq!(allocation.pt, BigUint::one());
    assert_eq!(allocation.dr, BigUint::from(u64::MAX - 1));
}

#[test]
fn sixty_four_one_ulp_events_beat_per_event_flooring() {
    let ratio = accumulate(&[(1.0f64.to_bits(), 1.0f64.to_bits() + 1); 64]).unwrap();
    let allocation = pools(u64::MAX, &ratio).unwrap();
    assert_eq!(allocation.dr, BigUint::from(262_143u64));
    assert_eq!(allocation.pt, BigUint::from(18_446_744_073_709_289_472u64));
    assert_ne!(allocation.dr, BigUint::from(64u64 * 4_095));
}

#[test]
fn component_limit_rejects_oversize_intermediate() {
    let mut ratio = ExactRatio::one();
    ratio.numerator = BigUint::one() << (MAX_COMPONENT_BITS - 1);
    let growth = ExactRatio::new(BigUint::from(3u8), BigUint::one()).unwrap();
    assert_eq!(ratio.multiply(&growth), Err(OracleError::ComponentTooLarge));
}

#[test]
fn civil_date_validation_handles_boundaries_and_leap_years() {
    for date in [20200101, 20240229, 20271231, 21001231] {
        valid_civil_date(date).unwrap();
    }
    for date in [0, 20191231, 20230229, 20270229, 20271301, 20270001, 21010101] {
        assert_eq!(valid_civil_date(date), Err(OracleError::InvalidDate));
    }
    assert_eq!(jan1_unix_timestamp(2020).unwrap(), 1_577_836_800);
    assert_eq!(jan1_unix_timestamp(2027).unwrap(), 1_798_761_600);
    assert_eq!(jan1_unix_timestamp(2028).unwrap(), 1_830_297_600);
    assert_eq!(jan1_unix_timestamp(2101).unwrap(), 4_133_980_800);
}
