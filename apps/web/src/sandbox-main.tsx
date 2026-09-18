import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tokens/tokens.css';
import './product.css';
import './wallet/wallet.css';
import './hosted/hosted.css';
import { HostedSessionGate } from './hosted/session';
import { WalletApp } from './wallet/WalletApp';
import { hostedRuntimeConfig } from './wallet/runtime';

globalThis.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <HostedSessionGate kind="wallet">{(session, expire, reset) => <WalletApp
    key={session.sessionId!}
    runtimeConfig={hostedRuntimeConfig({ sessionId: session.sessionId!, runtimeId: session.runtimeId!, runtimeUrl: session.runtimeUrl!, expiresAt: session.expiresAt! }, expire)}
    onReset={reset}
  />}</HostedSessionGate>
</React.StrictMode>);
