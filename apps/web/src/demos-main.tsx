import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tokens/tokens.css';
import './demos/demos.css';
import { GuidedDemosApp } from './demos/GuidedDemosApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><GuidedDemosApp /></React.StrictMode>,
);
