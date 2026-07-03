# POS Shortcuts

Fuente de verdad del teclado del POS.

## Reglas

- `Esc` cierra el modal visible.
- `Enter` confirma la accion primaria del modal visible si no estas escribiendo en un campo.
- `Alt+Letra` activa botones visibles con `data-shortcut-letter`.
- `F1` a `F6` activan focos o navegacion visibles con `data-shortcut-key`.
- `Ctrl+L` bloquea la pantalla.
- Si hay un modal abierto, el POS prioriza ese modal sobre la vista de fondo.

## Atajos

| Shortcut | Accion | Aplica en | Implementacion |
| --- | --- | --- | --- |
| `F1` | Ir al dashboard | Terminal de ventas | [SalesTerminalView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesTerminalView.tsx) |
| `F2` | Enfocar buscador de productos | POS de ventas | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `F3` | Ir a ventas desde dashboard | Dashboard | [DashboardHomeView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/DashboardHomeView.tsx) |
| `F4` | Abrir cobro | Terminal de ventas | [CheckoutPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/CheckoutPanel.tsx) |
| `F6` | Enfocar telefono del cliente | POS de ventas | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `Ctrl+L` | Bloquear pantalla | Dashboard y terminal | [SalesLayoutView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesLayoutView.tsx) |
| `Alt+B` | Buscar producto | Buscador POS | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `Alt+R` | Registrar cliente rapido | Buscador POS / modal rapido | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `Alt+K` | Abrir ventas en espera | Terminal de ventas | [SalesTerminalView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesTerminalView.tsx) |
| `Alt+T` | Abrir cerrar caja | Sidebar POS | [SalesLayoutView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesLayoutView.tsx) |
| `Alt+P` | Pausar venta / avanzar en modales de caja | POS de ventas | [CheckoutPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/CheckoutPanel.tsx), [CloseOptionsModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/CloseOptionsModal.tsx) |
| `Alt+X` | Cancelar o cerrar | Modales y acciones criticas | [PosModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/shared/PosModal.tsx) |
| `Alt+C` | Confirmar / cobrar | Modales y cobro | [PosModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/shared/PosModal.tsx) |
| `Alt+F` | Cierre de turno | Opciones de cierre | [CloseOptionsModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/CloseOptionsModal.tsx) |

## Navegacion por contexto

### Buscador

- `ArrowUp` / `ArrowDown`: mover seleccion de resultados.
- `Enter`: tomar el resultado seleccionado.

### Carrito

- `ArrowUp` / `ArrowDown` en cantidad: subir o bajar cantidad.
- `Enter` en cantidad: confirmar edicion.

### Cobro

- `ArrowLeft` / `ArrowRight`: cambiar metodo de pago.
- `Enter`: cobrar o abrir cobro mixto.
- `Alt+C`: cobrar desde el modal de cobro.
- `Alt+X`: cancelar modal de cobro.

### Cobro mixto

- `ArrowLeft` / `ArrowRight`: cambiar entre efectivo, tarjeta y saldo a favor.
- `Enter`: agregar pago actual.
- `Alt+C`: procesar cobro mixto.
- `Alt+X`: cancelar.

### Modal QR

- `Alt+C`: verificar estado.
- `Alt+X`: cerrar y dejar pendiente.

### Registro rapido de cliente

- `Alt+R`: registrar y seleccionar.
- `Alt+X`: cancelar.

## Implementacion

- [KeyboardShortcutsManager.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/KeyboardShortcutsManager.tsx) centraliza la resolucion de `F`, `Alt+letra`, `Enter`, `Esc` y `Ctrl+L`.
- Los modales usan [PosModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/shared/PosModal.tsx) para confirmar y cerrar.
- Si se agrega un boton nuevo visible en el POS, debe recibir `data-shortcut-letter` o `data-shortcut-key` y quedar documentado aqui.
