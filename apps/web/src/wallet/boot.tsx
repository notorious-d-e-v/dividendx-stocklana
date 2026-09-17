import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tokens/tokens.css';
import '../product.css';
import './wallet.css';
import { WalletApp } from './WalletApp';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WalletApp /></React.StrictMode>);
