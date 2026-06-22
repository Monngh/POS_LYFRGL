import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '../pages/Login';

// Lazy load por dominio para code splitting
const PosPage = lazy(() => import('../pos/PosPage'));
const AdminPage = lazy(() => import('../admin/AdminPage'));
const StorePage = lazy(() => import('../ecommerce/StorePage'));

const AppRouter = () => (
  <Routes>
    <Route path="/login" element={<Login />} />

    <Route
      path="/pos/*"
      element={
        <Suspense fallback={<div style={{ padding: '2rem' }}>Cargando módulo POS...</div>}>
          <PosPage />
        </Suspense>
      }
    />

    <Route
      path="/admin/*"
      element={
        <Suspense fallback={<div style={{ padding: '2rem' }}>Cargando módulo admin...</div>}>
          <AdminPage />
        </Suspense>
      }
    />

    <Route
      path="/store/*"
      element={
        <Suspense fallback={<div style={{ padding: '2rem' }}>Cargando módulo ecommerce...</div>}>
          <StorePage />
        </Suspense>
      }
    />

    <Route path="/" element={<Navigate to="/pos" />} />
  </Routes>
);

export default AppRouter;
