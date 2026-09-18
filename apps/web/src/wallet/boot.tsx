import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tokens/tokens.css';
import '../product.css';
import './wallet.css';
import { WalletApp } from './WalletApp';
import { resolveRuntimeConfig } from './runtime';

const hosted = import.meta.env.VITE_DIVIDENDX_HOSTED === '1';
const runtimeConfig = hosted ? { ...resolveRuntimeConfig({ VITE_DIVIDENDX_NETWORK: 'devnet' }), hostedSite: true } : undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WalletApp runtimeConfig={runtimeConfig} /></React.StrictMode>);
