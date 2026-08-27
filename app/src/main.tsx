import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ensureSettings } from './db/schema';
import { isNativeApp } from './platform';
import { hydrateOAuthClients } from './sync/credentials';
import { discoverRanchIfPresent } from './sync/ranchServer';
import { startSyncScheduler } from './sync/scheduler';
import { ErrorBoundary } from './ui/ErrorBoundary';

void (async () => {
  await ensureSettings();
  if (isNativeApp()) await discoverRanchIfPresent();
  await hydrateOAuthClients();
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

startSyncScheduler();

if ('serviceWorker' in navigator && !isNativeApp()) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
