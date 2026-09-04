import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ensureSettings } from './db/schema';
import { isNativeApp } from './platform';
import { startSyncScheduler } from './sync/scheduler';
import { resumeImportIfNeeded } from './interop/applyImport';
import { ErrorBoundary } from './ui/ErrorBoundary';

void ensureSettings().then(() => resumeImportIfNeeded());

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
