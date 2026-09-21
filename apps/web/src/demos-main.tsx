import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tokens/tokens.css';
import './demos/demos.css';
import './hosted/hosted.css';
import { GuidedDemosApp } from './demos/GuidedDemosApp';
import { HostedGuidedDemos } from './hosted/HostedGuidedDemos';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{import.meta.env.VITE_DIVIDENDX_HOSTED === '1'
    ? <HostedGuidedDemos />
    : <GuidedDemosApp />}</React.StrictMode>,
);
