import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App/App';
import { registerPwa } from './pwa';
import './styles/base.css';

registerPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
