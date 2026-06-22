import { Suspense } from 'react';
import Dashboard from './views/Dashboard';

export default function CajeroPage() {
  return (
    <Suspense fallback={<div>Cargando módulo cajero...</div>}>
      <Dashboard />
    </Suspense>
  );
}
