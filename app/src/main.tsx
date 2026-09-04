import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ensureSettings } from './db/schema';
import { isNativeApp } from './platform';
import { startSyncScheduler } from './sync/scheduler';
import { prepareNativeOAuthReturn } from './sync/oauthReturn';
import { ErrorBoundary } from './ui/ErrorBoundary';

void ensureSettings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

startSyncScheduler();
void prepareNativeOAuthReturn();

if ('serviceWorker' in navigator && !isNativeApp()) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
