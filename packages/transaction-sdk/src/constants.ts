import { PublicKey } from '@solana/web3.js';

export const DIVIDENDX_PROGRAM_ID = new PublicKey('2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE');
export const DEFAULT_RPC_ENDPOINT = 'http://127.0.0.1:8899';
export const DEFAULT_CLUSTER_DOMAIN = 'localnet';

export const MAX_U64 = (1n << 64n) - 1n;
export const MAX_I64 = (1n << 63n) - 1n;
export const MIN_I64 = -(1n << 63n);
export const MAX_EVENTS = 64;
export const MAX_RATIONAL_BYTES = 1024;

export const EVENT_STATUS = {
  pending: 0,
  qualified: 1,
  confirmedZero: 2,
  cancelled: 3,
  unsupported: 4,
} as const;

export const CLAIM_SIDE = { pt: 0, dr: 1 } as const;

export type EventStatusName = keyof typeof EVENT_STATUS;
export type ClaimSideName = keyof typeof CLAIM_SIDE;
