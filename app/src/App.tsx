import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CowCalfFormPage, CowCalfListPage } from './pages/CowCalfPages';
import { BreedingFormPage, BreedingListPage } from './pages/BreedingPages';
import { PastureFormPage, PastureListPage } from './pages/PasturePages';
import { SalesFormPage, SalesListPage } from './pages/SalesPages';
import { GestationPage } from './pages/GestationPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="cow-calf" element={<CowCalfListPage />} />
          <Route path="cow-calf/:id" element={<CowCalfFormPage />} />
          <Route path="breeding" element={<BreedingListPage />} />
          <Route path="breeding/:id" element={<BreedingFormPage />} />
          <Route path="pasture" element={<PastureListPage />} />
          <Route path="pasture/:id" element={<PastureFormPage />} />
          <Route path="sales" element={<SalesListPage />} />
          <Route path="sales/:id" element={<SalesFormPage />} />
          <Route path="gestation" element={<GestationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
