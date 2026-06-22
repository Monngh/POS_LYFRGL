import { Suspense } from 'react';
import Dashboard from './views/Dashboard';
import { usePosTheme } from '../shared/hooks/usePosTheme';

export default function PosPage() {
  const theme = usePosTheme();
  // Wrapper con display:contents: NO genera caja propia (cero impacto en el
  // layout/responsividad del POS) pero define las variables de tema, que se
  // heredan a todo el árbol del cajero.
  return (
    <div className={`theme-aware${theme === 'dark' ? ' theme-dark' : ''}`} style={{ display: 'contents' }}>
      <Suspense fallback={<div>Cargando módulo POS...</div>}>
        <Dashboard />
      </Suspense>
    </div>
  );
}
