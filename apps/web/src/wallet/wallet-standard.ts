import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount, WalletIcon } from '@wallet-standard/base';
import { StandardConnect, StandardEvents, type StandardEventsChangeProperties } from '@wallet-standard/features';
import { SolanaSignTransaction } from '@solana/wallet-standard-features';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import type { CompatibleWallet } from './types';

export const LOCAL_CHAIN = 'solana:localnet' as const;
const TEMP_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMxNTJmNTYiLz48L3N2Zz4=' as WalletIcon;

export function isCompatibleWallet(wallet: Wallet): wallet is CompatibleWallet {
  const connect = wallet.features[StandardConnect] as { version?: string } | undefined;
  const events = wallet.features[StandardEvents] as { version?: string } | undefined;
  const sign = wallet.features[SolanaSignTransaction] as { version?: string; supportedTransactionVersions?: readonly unknown[] } | undefined;
  return connect?.version === '1.0.0' && events?.version === '1.0.0' && sign?.version === '1.0.0'
    && Boolean(sign.supportedTransactionVersions?.includes('legacy'));
}

export function discoverWallets(): CompatibleWallet[] {
  return getWallets().get().filter(isCompatibleWallet);
}

export function compatibleAccount(accounts: readonly WalletAccount[]): WalletAccount | undefined {
  return accounts.find((account) => {
    try {
      if (!new PublicKey(account.publicKey).equals(new PublicKey(account.address))) return false;
    } catch { return false; }
    return account.chains.some((chain) => chain.startsWith('solana:')) && account.features.includes(SolanaSignTransaction);
  });
}

export async function connectWallet(wallet: CompatibleWallet): Promise<WalletAccount> {
  const output = await wallet.features[StandardConnect].connect();
  const account = compatibleAccount(output.accounts);
  if (!account) throw new Error(`${wallet.name} did not provide a Solana account with legacy transaction signing.`);
  return account;
}

export function watchWallet(wallet: CompatibleWallet, listener: (properties: StandardEventsChangeProperties) => void): () => void {
  return wallet.features[StandardEvents].on('change', listener);
}

export async function signLegacyTransaction(wallet: CompatibleWallet, account: WalletAccount, transaction: Transaction): Promise<Transaction> {
  const [output] = await wallet.features[SolanaSignTransaction].signTransaction({
    account,
    transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
    options: { preflightCommitment: 'confirmed' },
  });
  if (!output) throw new Error('Wallet returned no signed transaction.');
  return Transaction.from(output.signedTransaction);
}

export function createTemporaryWallet(): CompatibleWallet {
  const keypair = Keypair.generate();
  const account = Object.freeze({
    address: keypair.publicKey.toBase58(),
    publicKey: keypair.publicKey.toBytes(),
    chains: [LOCAL_CHAIN] as const,
    features: [SolanaSignTransaction] as const,
    label: 'Disposable browser account',
  }) satisfies WalletAccount;
  const listeners = new Set<(properties: StandardEventsChangeProperties) => void>();
  return Object.freeze({
    version: '1.0.0',
    name: 'DividendX temporary test wallet',
    icon: TEMP_ICON,
    chains: [LOCAL_CHAIN],
    accounts: [account],
    features: {
      [StandardConnect]: { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
      [StandardEvents]: {
        version: '1.0.0',
        on: (_event: 'change', listener: (properties: StandardEventsChangeProperties) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      [SolanaSignTransaction]: {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy'],
        signTransaction: async (...inputs: readonly { account: WalletAccount; transaction: Uint8Array }[]) => inputs.map((input) => {
          if (input.account.address !== account.address) throw new Error('Temporary wallet account changed.');
          const transaction = Transaction.from(input.transaction);
          transaction.partialSign(keypair);
          return { signedTransaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }) };
        }),
      },
    },
  } as unknown as CompatibleWallet);
}

export function subscribeWalletRegistry(listener: () => void): () => void {
  const wallets = getWallets();
  const offRegister = wallets.on('register', listener);
  const offUnregister = wallets.on('unregister', listener);
  return () => { offRegister(); offUnregister(); };
}
