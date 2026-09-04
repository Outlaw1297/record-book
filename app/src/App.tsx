import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CowCalfFormPage, CowCalfListPage } from './pages/CowCalfPages';
import { BreedingFormPage, BreedingListPage } from './pages/BreedingPages';
import { PastureFormPage, PastureListPage } from './pages/PasturePages';
import { SalesFormPage, SalesListPage } from './pages/SalesPages';
import { GestationPage } from './pages/GestationPage';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AccountPage } from './pages/AccountPage';
import { HerdDetailPage, HerdListPage } from './pages/HerdPages';
import { InteropPage } from './pages/InteropPage';
import { ScanEidPage } from './pages/ScanEidPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { ToastProvider } from './ui/Toast';
import { BrandWordmark } from './ui/BrandMark';
import { getSettings } from './db/schema';
import { isNativeApp } from './platform';
import {
  deliverNativeOAuthReturn,
  isOAuthCallbackLocation,
} from './sync/oauthReturn';

function NativeOAuthBounce() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const delivered = deliverNativeOAuthReturn(params);
    navigate(delivered ? '/settings?sync=connected' : '/settings', { replace: true });
  }, [navigate, params]);

  return (
    <div className="onboard">
      <div className="onboard-card" style={{ textAlign: 'center' }}>
        <BrandWordmark />
        <p className="hint" style={{ marginTop: '1rem' }}>
          Finishing sign-in…
        </p>
      </div>
    </div>
  );
}

function AppGate() {
  const location = useLocation();
  if (isOAuthCallbackLocation(location.pathname, window.location.hostname)) {
    return isNativeApp() ? <NativeOAuthBounce /> : <OAuthCallbackPage />;
  }
  return <MainApp />;
}

function MainApp() {
  const settings = useLiveQuery(() => getSettings());

  if (!settings) {
    return (
      <div className="onboard">
        <div className="onboard-card" style={{ textAlign: 'center' }}>
          <BrandWordmark />
          <p className="hint" style={{ marginTop: '1rem' }}>
            Opening HerdLedger…
          </p>
        </div>
      </div>
    );
  }

  if (!settings.onboardingComplete) {
    return (
      <OnboardingPage onDone={() => undefined} />
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="herd" element={<HerdListPage />} />
        <Route path="herd/new" element={<HerdDetailPage />} />
        <Route path="herd/:herdId" element={<HerdDetailPage />} />
        <Route path="cow-calf" element={<CowCalfListPage />} />
        <Route path="cow-calf/:id" element={<CowCalfFormPage />} />
        <Route path="breeding" element={<BreedingListPage />} />
        <Route path="breeding/:id" element={<BreedingFormPage />} />
        <Route path="pasture" element={<PastureListPage />} />
        <Route path="pasture/:id" element={<PastureFormPage />} />
        <Route path="sales" element={<SalesListPage />} />
        <Route path="sales/:id" element={<SalesFormPage />} />
        <Route path="gestation" element={<GestationPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="import" element={<InteropPage />} />
        <Route path="eid" element={<ScanEidPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="book" element={<Navigate to="/cow-calf" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppGate />
      </BrowserRouter>
    </ToastProvider>
  );
}
