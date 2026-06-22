import { Suspense } from 'react';
import AdminDashboard from './views/AdminDashboard';

export default function AdminPage() {
  return (
    <Suspense fallback={<div>Cargando módulo admin...</div>}>
      <AdminDashboard />
    </Suspense>
  );
}
