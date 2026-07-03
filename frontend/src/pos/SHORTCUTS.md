# POS Shortcuts

Fuente de verdad del teclado del POS.

## Reglas

- `Esc` cierra el modal visible.
- `Enter` confirma la accion primaria del modal visible si no estas escribiendo en un campo.
- `Alt+Letra` activa botones visibles con `data-shortcut-letter`.
- `F1` a `F8` activan focos o navegacion visibles con `data-shortcut-key`.
- `Ctrl+L` bloquea la pantalla.
- Si hay un modal abierto, el POS prioriza ese modal sobre la vista de fondo.

## Atajos globales

| Shortcut | Accion | Aplica en | Implementacion |
| --- | --- | --- | --- |
| `F1` | Ir al inicio | Terminal de ventas | [SalesTerminalView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesTerminalView.tsx) |
| `F2` | Enfocar buscador de productos | POS de ventas | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `F3` | Ir a ventas desde dashboard | Dashboard | [DashboardHomeView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/DashboardHomeView.tsx) |
| `F4` | Abrir cobro | Terminal de ventas | [CheckoutPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/CheckoutPanel.tsx) |
| `F6` | Enfocar telefono del cliente | POS de ventas | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `F8` | Abrir cierre de turno | Modal de opciones de cierre | [CloseOptionsModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/CloseOptionsModal.tsx) |
| `Ctrl+L` | Bloquear pantalla | Dashboard y terminal | [SalesLayoutView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesLayoutView.tsx) |

## Accesos rapidos del terminal

| Shortcut | Accion | Aplica en | Implementacion |
| --- | --- | --- | --- |
| `Alt+B` | Buscar producto | Buscador POS | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `Alt+R` | Registrar cliente rapido y seleccionar | Buscador POS / modal de confirmacion de telefono | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `Alt+V` | Mostrar u ocultar telefono | Buscador POS / modal de confirmacion de telefono | [ProductSearchPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/ProductSearchPanel.tsx) |
| `Alt+K` | Abrir ventas en espera | Terminal de ventas | [SalesTerminalView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesTerminalView.tsx) |
| `Alt+T` | Abrir opciones de cierre de caja | Sidebar POS | [SalesLayoutView.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/SalesLayoutView.tsx) |
| `Alt+P` | Pausar venta | Panel de cobro / cierre | [CheckoutPanel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/CheckoutPanel.tsx) |
| `Alt+X` | Cancelar o cerrar | Modales y acciones criticas | [PosModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/shared/PosModal.tsx) |
| `Alt+C` | Confirmar, cobrar o guardar | Modales y cobro | [PosModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/shared/PosModal.tsx) |

## Accesos rapidos de acciones rapidas

| Shortcut | Accion | Aplica en | Implementacion |
| --- | --- | --- | --- |
| `Alt+Q` | Consultar precio | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |
| `Alt+D` | Deposito banco | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |
| `Alt+V` | Cancelar venta | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |
| `Alt+E` | Devoluciones | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |
| `Alt+H` | Reimprimir ticket | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |
| `Alt+U` | Corte parcial | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |
| `Alt+I` | Autofacturacion | Accesos rapidos | [QuickActionsCarousel.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/QuickActionsCarousel.tsx) |

## Navegacion por contexto

### Buscador de productos

- `ArrowUp` / `ArrowDown`: mover seleccion de resultados.
- `Enter`: tomar el resultado seleccionado.
- `F2`: enfocar el input de busqueda.
- `Alt+B`: activar el boton Buscar.

### Carrito

- `ArrowUp` / `ArrowDown` en cantidad: subir o bajar cantidad.
- `Enter` en cantidad: confirmar edicion.

### Cobro

- `ArrowLeft` / `ArrowRight`: cambiar metodo de pago.
- `Enter`: cobrar o abrir cobro mixto.
- `Alt+C`: cobrar desde el modal de cobro.
- `Alt+X`: cancelar modal de cobro.
- `Alt+P`: pausar venta.

### Cobro mixto

- `ArrowLeft` / `ArrowRight`: cambiar entre efectivo, tarjeta y saldo a favor.
- `Enter`: agregar pago actual.
- `Alt+C`: procesar cobro mixto.
- `Alt+X`: cancelar.

### Modal QR

- `Alt+C`: verificar estado.
- `Alt+X`: cerrar y dejar pendiente.

### Registro rapido de cliente

- `Alt+R`: abrir el modal de confirmacion o registrar y seleccionar.
- `Alt+V`: mostrar u ocultar telefono.
- `Alt+X`: cancelar.

### Cierre de turno

- `F8`: abrir cierre de turno.
- `Alt+P`: corte parcial.
- `Alt+X`: cancelar.

## Implementacion

- [KeyboardShortcutsManager.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/KeyboardShortcutsManager.tsx) centraliza la resolucion de `F`, `Alt+letra`, `Enter`, `Esc` y `Ctrl+L`.
- Los modales usan [PosModal.tsx](/C:/Users/mafer/newpos/POS_LYFRGL/frontend/src/pos/components/modals/shared/PosModal.tsx) para cerrar.
- Si se agrega un boton nuevo visible en el POS, debe recibir `data-shortcut-letter` o `data-shortcut-key` y quedar documentado aqui.
