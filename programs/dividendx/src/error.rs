use anchor_lang::prelude::*;

#[error_code]
pub enum DividendXError {
    #[msg("the deployment domain must be nonzero")]
    ZeroDeploymentDomain,
    #[msg("the policy digest must be nonzero")]
    ZeroPolicyDigest,
    #[msg("the evidence digest must be nonzero")]
    ZeroEvidenceDigest,
    #[msg("invalid asset symbol")]
    InvalidSymbol,
    #[msg("unsupported collateral decimals")]
    UnsupportedDecimals,
    #[msg("unsupported Token-2022 mint extension")]
    UnsupportedMintExtension,
    #[msg("ScaledUiAmount is required")]
    MissingScaledUiAmount,
    #[msg("the collateral mint is not initialized")]
    MintNotInitialized,
    #[msg("default account state must be initialized")]
    DefaultAccountStateNotInitialized,
    #[msg("the transfer hook program must be null")]
    ActiveTransferHook,
    #[msg("the collateral mint is paused")]
    MintPaused,
    #[msg("invalid multiplier bits")]
    InvalidMultiplier,
    #[msg("observation expiry is invalid")]
    InvalidObservationExpiry,
    #[msg("asset admission is disabled")]
    AdmissionDisabled,
    #[msg("the reviewed observation is absent or stale")]
    ObservationStale,
    #[msg("the mint scale tuple differs from the reviewed observation")]
    ScaleTupleChanged,
    #[msg("the effective multiplier differs from the reviewed observation")]
    ActiveScaleChanged,
    #[msg("the mint control fingerprint differs from the reviewed observation")]
    ControlsChanged,
    #[msg("year is outside 2020 through 2100")]
    InvalidYear,
    #[msg("deposits and series creation are closed")]
    DepositsClosed,
    #[msg("amount must be positive")]
    ZeroAmount,
    #[msg("guard state version does not match")]
    GuardVersionMismatch,
    #[msg("guard has expired")]
    GuardExpired,
    #[msg("minimum output guard failed")]
    MinimumOutputNotMet,
    #[msg("series phase does not permit this operation")]
    InvalidPhase,
    #[msg("the series journal state does not permit deposits")]
    SeriesJournalStarted,
    #[msg("token account owner does not match the signer")]
    InvalidTokenOwner,
    #[msg("token account mint does not match")]
    InvalidTokenMint,
    #[msg("token account or mint is owned by the wrong token program")]
    InvalidTokenProgram,
    #[msg("relevant accounts must be distinct")]
    AccountsNotDistinct,
    #[msg("vault has a delegate or alternate close authority")]
    UnsafeVaultAuthority,
    #[msg("vault is not initialized or is frozen")]
    UnsafeVaultState,
    #[msg("vault custody is below total outstanding obligations")]
    CustodyDeficit,
    #[msg("amount exceeds nominal backing")]
    AmountExceedsBacking,
    #[msg("event revision must be positive")]
    InvalidRevision,
    #[msg("event status is invalid")]
    InvalidEventStatus,
    #[msg("event date is invalid")]
    InvalidCivilDate,
    #[msg("event remains unresolved")]
    EventUnresolved,
    #[msg("qualified event data is from the future")]
    FutureEventData,
    #[msg("non-qualified event factors must be zero")]
    UnexpectedEventFactor,
    #[msg("event record limit reached")]
    EventLimitReached,
    #[msg("event revision is lower than the accepted revision")]
    LowerRevision,
    #[msg("same revision contains different data")]
    RevisionConflict,
    #[msg("event account relationship is invalid")]
    InvalidEventRelationship,
    #[msg("journal version or hash does not match")]
    JournalMismatch,
    #[msg("journal has unresolved records")]
    UnresolvedJournal,
    #[msg("series has not reached maturity")]
    NotMature,
    #[msg("accumulation cursor or event index is invalid")]
    InvalidAccumulatorCursor,
    #[msg("bounded exact arithmetic exceeded 8192 bits")]
    ArithmeticBoundExceeded,
    #[msg("arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("accumulation is incomplete")]
    AccumulationIncomplete,
    #[msg("claim mint authority is invalid")]
    InvalidClaimMintAuthority,
    #[msg("claim mint freeze authority must be null")]
    InvalidClaimFreezeAuthority,
    #[msg("redemption amount exceeds the frozen nominal denominator")]
    RedemptionExceedsSupply,
    #[msg("zero-output redemption requires explicit consent")]
    ZeroOutputConsentRequired,
    #[msg("account data could not be decoded")]
    InvalidAccountData,
}
