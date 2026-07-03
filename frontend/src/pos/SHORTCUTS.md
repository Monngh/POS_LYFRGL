# POS Shortcuts

Fuente de verdad del teclado del POS.

## Reglas globales

- `Esc` cierra o cancela la acción del modal visible (botón con `data-shortcut="cancel"` en el footer).
- `Enter` confirma la acción primaria del modal visible si no estás escribiendo en un campo.
- `Alt+Letra` activa botones con `data-shortcut-letter` dentro del scope activo (modal o vista).
- `F1` a `F10` activan focos o navegación con `data-shortcut-key`.
- Los accesos rápidos `Alt+Q/G/N/E/H/U/I` funcionan **siempre** en terminal de ventas, aunque el carrusel esté en otra página.
- Si hay un modal abierto, el POS prioriza ese modal sobre la vista de fondo.
- Al abrir un modal, el foco va al primer input disponible (y se selecciona el texto en inputs de texto).
- `Tab` / `Shift+Tab` ciclan el foco dentro del modal (focus trap en `PosModal`).
- Con pantalla bloqueada, todos los atajos del POS quedan desactivados.

## Atajos globales (teclas función)

| Shortcut | Acción | Aplica en | Implementación |
| --- | --- | --- | --- |
| `F1` | Ir al inicio (dashboard) | Terminal de ventas | [SalesTerminalView.tsx](components/SalesTerminalView.tsx) |
| `F2` | Enfocar buscador de productos | Terminal de ventas | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `F3` | Ir a ventas | Dashboard | [DashboardHomeView.tsx](components/DashboardHomeView.tsx) |
| `F4` | Abrir cobro | Terminal de ventas | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `F6` | Enfocar teléfono del cliente | Terminal de ventas | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `F7` | Abrir / cerrar menú lateral (hamburguesa) | Terminal de ventas | [SalesTerminalView.tsx](components/SalesTerminalView.tsx) |
| `F8` | Abrir opciones de cierre de caja | Terminal / modal cierre | [SalesLayoutView.tsx](components/SalesLayoutView.tsx), [CloseOptionsModal.tsx](components/modals/CloseOptionsModal.tsx) |
| `F10` | Bloquear pantalla | Terminal de ventas | [SalesLayoutView.tsx](components/SalesLayoutView.tsx) |

## Accesos rápidos del terminal (siempre activos)

| Shortcut | Acción | Modal destino |
| --- | --- | --- |
| `Alt+Q` | Consultar precio | price-lookup |
| `Alt+G` | Depósito banco | bank-deposit |
| `Alt+N` | Cancelar venta | cancel-sale |
| `Alt+E` | Devoluciones | returns |
| `Alt+H` | Reimprimir ticket | ticket-history |
| `Alt+U` | Corte parcial | partial-cut-summary |
| `Alt+I` | Autofacturación (nueva pestaña) | autofacturacion |

Implementación: registro oculto en [SalesTerminalView.tsx](components/SalesTerminalView.tsx) con `data-shortcut-global` + [posShortcuts.ts](constants/posShortcuts.ts).

## Accesos rápidos contextuales

| Shortcut | Acción | Aplica en | Implementación |
| --- | --- | --- | --- |
| `Alt+B` | Buscar producto | Buscador POS | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `Alt+R` | Registrar / confirmar cliente | Buscador / modales cliente | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `Alt+M` | Mostrar u ocultar teléfono | Modal confirmación teléfono | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `Alt+K` | Ventas en espera | Terminal | [SalesTerminalView.tsx](components/SalesTerminalView.tsx) |
| `Alt+T` | Opciones cierre de caja | Sidebar | [SalesLayoutView.tsx](components/SalesLayoutView.tsx) |
| `Alt+P` | Pausar venta | Panel de cobro | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+X` | Cancelar / cerrar modal | Modales (footer) | Botones `data-shortcut="cancel"` |
| `Alt+C` | Confirmar acción primaria | Modales y cobro | Botones `data-shortcut="confirm"` |
| `Alt+S` | Enviar por correo | Modales con email | `data-shortcut-action="send-email"` |
| `Alt+W` | Verificar pago pendiente | QR / depósito MP | `data-shortcut-action="verify-payment"` |
| `Alt+J` | Ver QR del primer pago pendiente | Panel de cobro | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+Z` | Eliminar venta en espera seleccionada | Ventas en espera | [ParkedSalesModal.tsx](components/modals/ParkedSalesModal.tsx) |

## Navegación por contexto

### Buscador de productos

- `↑` / `↓`: mover selección de resultados.
- `Enter`: tomar el resultado seleccionado.
- `F2`: enfocar búsqueda.
- `Alt+B`: buscar.

### Carrito

- `↑` / `↓` en cantidad: ajustar cantidad.
- `Enter` en cantidad: confirmar edición.

### Cobro

- `←` / `→`: cambiar método de pago (foco automático al abrir).
- `Enter`: cobrar o abrir cobro mixto.
- `Alt+C` / `Alt+X`: cobrar / cancelar modal.
- `Alt+P`: pausar venta.
- `Alt+J` / `Alt+W`: ver QR / verificar primer pago QR pendiente en la tabla.

### Cobro mixto

- `←` / `→`: cambiar método de pago parcial.
- `Enter`: agregar pago.
- `Alt+C` / `Alt+X`: procesar / cancelar.

### Modal QR (cobro)

- `Alt+W` / `Enter`: verificar estado.
- `Alt+X`: cerrar y dejar pendiente.

### Ventas en espera

- `↑` / `↓`: seleccionar venta.
- `Enter` / `Alt+C`: recuperar venta seleccionada.
- `Alt+Z`: eliminar venta seleccionada.
- `Esc`: cerrar modal.

### Reimprimir ticket (historial)

- `Enter` / `Alt+C`: reimprimir primera venta filtrada.
- `Esc`: cerrar.

### Envío de ticket por correo

- `Alt+S` / `Enter`: enviar (si hay email válido).
- `Alt+X` / `Esc`: cancelar.

## Inventario de modales

| Modal | Esc | Enter | Alt+S | Alt+W | Otros |
| --- | --- | --- | --- | --- | --- |
| Cobro | Sí | Cobrar | — | — | ←→ métodos |
| Cobro mixto | Sí | Agregar pago | — | — | Alt+C procesar |
| QR pendiente | Sí | Verificar | — | Verificar | Alt+X cerrar |
| Nuevo cliente | Sí | Registrar | — | — | Alt+R, Alt+X |
| Confirmación teléfono | Sí | Continuar | — | — | Alt+M, Alt+R |
| Borrador de venta | Sí | Continuar | — | — | Alt+X nueva |
| Cancelar venta | Sí | Siguiente / Confirmar | — | — | Alt+X paso 1 |
| Autorización gerente | Sí | Autorizar | — | — | Alt+C |
| Consultar precio | Sí | — | — | — | ↑↓ resultados |
| Depósito banco | Sí | Registrar | — | — | Alt+C |
| Comprobante depósito | Sí | Imprimir | Abrir email | Verificar MP | Alt+C imprimir |
| Devoluciones | Sí | Buscar / Continuar / Procesar | Abrir email | — | Alt+C |
| Ventas en espera | Sí | Recuperar | — | — | Alt+Z, ↑↓ |
| Reimprimir ticket | Sí | Reimprimir (1ª fila) | — | — | — |
| Enviar correo | Sí | Enviar | Enviar | — | Alt+X |
| Comprobantes impresión | Sí | Imprimir | Abrir email | — | Alt+C / Alt+X |

## Atajos del navegador evitados

No se usan:

- `Ctrl+L`, `Alt+D` (barra de direcciones)
- `Ctrl+T`, `Ctrl+W`, `Ctrl+N`, `Ctrl+R`, `Ctrl+F`, `Ctrl+P`
- `F5` (recargar), `F11` (pantalla completa)

Depósito banco usa **`Alt+G`** (no `Alt+D`).

## Implementación técnica

- [KeyboardShortcutsManager.tsx](components/KeyboardShortcutsManager.tsx): listener en fase capture; resuelve `F*`, `Alt+letra`, `Enter`, `Esc`, acciones `send-email` y `verify-payment`.
- [posShortcuts.ts](constants/posShortcuts.ts): mapa de accesos rápidos globales.
- [PosModal.tsx](components/modals/shared/PosModal.tsx): focus trap, foco inicial, footer `data-pos-modal-footer`.
- [useModalInitialFocus.ts](hooks/useModalInitialFocus.ts): foco en modales inline.
- Botones nuevos: `data-shortcut-letter`, `data-shortcut-key`, `data-shortcut="confirm|cancel"`, o `data-shortcut-action` según corresponda.
