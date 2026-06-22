import { Suspense } from 'react';
import Dashboard from './views/Dashboard';

export default function PosPage() {
  return (
    <Suspense fallback={<div>Cargando módulo POS...</div>}>
      <Dashboard />
    </Suspense>
  );
}
