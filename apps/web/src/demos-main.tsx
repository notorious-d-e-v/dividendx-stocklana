import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tokens/tokens.css';
import './demos/demos.css';
import './hosted/hosted.css';
import { GuidedDemosApp } from './demos/GuidedDemosApp';
import { createGuidedClient } from './demos/client';
import { HostedSessionGate } from './hosted/session';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{import.meta.env.VITE_DIVIDENDX_HOSTED === '1'
    ? <HostedSessionGate kind="guided">{(session, expire, reset) => <GuidedDemosApp
      key={session.sessionId!}
      client={createGuidedClient(session.runtimeUrl!, { expectedRuntimeId: session.runtimeId!, onExpired: expire, hosted: true })}
      onHostedReset={reset}
    />}</HostedSessionGate>
    : <GuidedDemosApp />}</React.StrictMode>,
);
