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
- Al restaurar sesión abierta, el POS abre directamente el **terminal de ventas** (no el dashboard).

## Atajos globales (teclas función)

| Shortcut | Acción | Aplica en | Implementación |
| --- | --- | --- | --- |
| `F1` | Ir al inicio (dashboard) | Terminal de ventas | [SalesTerminalView.tsx](components/SalesTerminalView.tsx) |
| `F2` | Enfocar buscador de productos | Terminal de ventas | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `F3` | Ir a ventas / Enfocar calculadora | Terminal / Cobro | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `F4` | Abrir cobro | Terminal de ventas | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `F6` | Enfocar teléfono de cliente (Buscar cliente) | Terminal de ventas | [CustomerCheckoutBar.tsx](components/CustomerCheckoutBar.tsx) |
| `F7` | Abrir / cerrar menú lateral (hamburguesa) | Terminal de ventas | [SalesTerminalView.tsx](components/SalesTerminalView.tsx) |
| `F8` | Abrir opciones de cierre de caja | Terminal / modal cierre | [SalesLayoutView.tsx](components/SalesLayoutView.tsx), [CloseOptionsModal.tsx](components/modals/CloseOptionsModal.tsx) |
| `F9` | Mostrar / ocultar panel de atajos | Terminal de ventas | [ShortcutsHelpPanel.tsx](components/ShortcutsHelpPanel.tsx) |
| `F10` | Bloquear pantalla | Terminal de ventas | [QuickActionsCarousel.tsx](components/QuickActionsCarousel.tsx) |

## Accesos rápidos del terminal (siempre activos)

| Shortcut | Acción | Modal destino |
| --- | --- | --- |
| `Alt+Q` | Consultar precio | price-lookup |
| `Alt+G` | Depósito banco | bank-deposit |
| `Alt+N` | Cancelar venta | cancel-sale |
| `Alt+D` | Devoluciones | returns |
| `Alt+H` | Reimprimir ticket | ticket-history |
| `Alt+U` | Corte parcial | partial-cut-summary |
| `Alt+I` | Autofacturación (nueva pestaña) | autofacturacion |
| `Alt+L` | Cerrar sesión (logout cajero) | — |

Implementación: registro oculto en [SalesTerminalView.tsx](components/SalesTerminalView.tsx) con `data-shortcut-global` + [posShortcuts.ts](constants/posShortcuts.ts).

## Accesos rápidos contextuales

| Shortcut | Acción | Aplica en | Implementación |
| --- | --- | --- | --- |
| `Alt+R` | Registrar / confirmar cliente | Buscador / modales cliente | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `Alt+M` | Mostrar u ocultar teléfono del cliente | Buscador / confirmación teléfono | [ProductSearchPanel.tsx](components/ProductSearchPanel.tsx) |
| `Alt+M` *(depósito)* | Tab "Registrar Resguardo" | Modal depósito banco (scope) | [BankDepositModal.tsx](components/modals/BankDepositModal.tsx) |
| `Alt+E` | Abrir Ventas en espera | Terminal de ventas | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+S` | Abrir Pagos pendientes | Terminal de ventas | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `R` | Recuperar venta / Verificar pago (al tener foco) | Listas de espera/pendientes | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `E` | Eliminar venta / Ver QR (al tener foco) | Listas de espera/pendientes | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+K` | Ventas en espera (Deprecado/Anterior) | Terminal de ventas | [SalesTerminalView.tsx](components/SalesTerminalView.tsx) |
| `Alt+K` *(depósito)* | Tab "Buscar / Historial" | Modal depósito banco (scope) | [BankDepositModal.tsx](components/modals/BankDepositModal.tsx) |
| `Alt+W` | Pausar venta | Panel de cobro | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+P` | Enfocar promociones activas | Terminal de ventas | [PromotionsGrid.tsx](components/PromotionsGrid.tsx) |
| `R` | Seleccionar promoción (al tener foco) | Promociones activas | [PromotionsGrid.tsx](components/PromotionsGrid.tsx) |
| `Alt+V` | Cancelar compra (vaciar carrito) | Panel de cobro | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+X` | Cancelar / cerrar modal | Modales (footer) | Botones `data-shortcut="cancel"` |
| `Alt+C` | Confirmar acción primaria | Modales y cobro | Botones `data-shortcut="confirm"` |
| `Alt+S` | Enviar por correo | Modales con email | `data-shortcut-action="send-email"` |
| `Alt+W` | Verificar pago pendiente | QR / depósito MP | `data-shortcut-action="verify-payment"` |
| `Alt+J` | Ver QR del primer pago pendiente | Panel de cobro | [CheckoutPanel.tsx](components/CheckoutPanel.tsx) |
| `Alt+Z` | Eliminar venta en espera seleccionada | Ventas en espera | [ParkedSalesModal.tsx](components/modals/ParkedSalesModal.tsx) |

> **Nota sobre scope:** cuando el modal de Depósito Banco está abierto, `Alt+M` y `Alt+K` se resuelven dentro del scope del modal (pestaña Registrar / Buscar) en lugar de sus acciones globales. Al cerrar el modal, recuperan su comportamiento original.

## Navegación por contexto

### Buscador de productos

- `↑` / `↓`: mover selección de resultados.
- `Enter`: tomar el resultado seleccionado.
- `F2`: enfocar búsqueda.

### Carrito

- `↑` / `↓` en cantidad: ajustar cantidad.
- `Enter` en cantidad: confirmar edición.

### Cobro (dos fases)

El modal de cobro opera en **dos fases** de teclado:

**Fase 1 – Seleccionar método** (al abrir el modal):
- `←` / `→`: cambiar método de pago.
- `Enter`: confirmar método → pasa a Fase 2 y da foco al primer campo requerido.

**Fase 2 – Llenar campos y cobrar:**
- Si el método tiene campos (efectivo: cambio; tarjeta: confirmación): llenar y presionar `Enter` para cobrar.
- Si el método no tiene campos extra (tarjeta, crédito): se cobra directamente.
- Método mixto: `Enter` abre el modal de cobro mixto.
- `Alt+C` / `Alt+X`: cobrar / cancelar modal.
- `Alt+W`: pausar venta.
- `Alt+J` / `Alt+W`: ver QR / verificar primer pago QR pendiente en la tabla.

### Cobro mixto

- `←` / `→`: cambiar método de pago parcial.
- `Enter`: agregar pago.
- `Alt+C` / `Alt+X`: procesar / cancelar.

### Modal QR (cobro)

- `Alt+W` / `Enter`: verificar estado (autoFocus al abrir).
- `Alt+X`: cerrar y dejar pendiente.

### Ventas en espera

- `↑` / `↓`: seleccionar venta.
- `Enter` / `Alt+C`: recuperar venta seleccionada.
- `Alt+Z`: eliminar venta seleccionada.
- `Esc`: cerrar modal.

### Reimprimir ticket (historial)

- `↑` / `↓`: navegar entre resultados filtrados (la lista recibe foco automático al cargar).
- `Enter` / `Alt+C`: reimprimir el ticket seleccionado (resaltado en azul).
- Click en fila: seleccionar sin reimprimir.
- `Esc`: cerrar.

### Devoluciones

**Paso 1 – Buscar:** `Enter` busca por folio.

**Paso 2 – Seleccionar artículos:**
- `↑` / `↓`: navegar entre checkboxes (auto-foco al entrar al paso).
- `Espacio` / `Enter` en checkbox: marcar/desmarcar → foco pasa a campo de cantidad.
- `Enter` en cantidad: foco pasa a select de destino.
- `Enter` en destino: foco pasa al siguiente checkbox o al campo de motivo (si fue el último).
- `Enter` en motivo: foco al botón "Continuar".
- `Alt+C`: continuar al paso 3.

**Paso 3 – Confirmar + PIN:**
- El campo de PIN recibe foco automático al entrar al paso.
- `Enter` en PIN: procesar devolución.

### Depósito banco

**Tab "Registrar"** (`Alt+M`):
- El primer campo recibe foco automático al abrir.
- `Enter`: guardar registro (si no hay errores de validación).
- `Alt+C`: guardar depósito.

**Tab "Buscar/Historial"** (`Alt+K`):
- La lista recibe foco automático cuando hay resultados.
- `↑` / `↓`: navegar entre depósitos (la fila seleccionada se resalta).
- `Enter`: ver detalles del depósito seleccionado.
- Click en fila: seleccionar sin abrir detalles.

### Envío de ticket por correo

- `Alt+S` / `Enter`: enviar (si hay email válido).
- `Alt+X` / `Esc`: cancelar.

## Inventario de modales

| Modal | Esc | Enter | Alt+S | Alt+W | Otros |
| --- | --- | --- | --- | --- | --- |
| Cobro | Sí | Fase 1: seleccionar método → Fase 2: cobrar | — | — | ←→ métodos, Alt+V cancelar |
| Cobro mixto | Sí | Agregar pago | — | — | Alt+C procesar |
| QR pendiente | Sí | Verificar | — | Verificar | Alt+X cerrar |
| Nuevo cliente | Sí | Registrar | — | — | Alt+R, Alt+X |
| Confirmación teléfono | Sí | Continuar | — | — | Alt+R |
| Borrador de venta | Sí | Continuar | — | — | Alt+X nueva |
| Cancelar venta | Sí | Siguiente / Confirmar | — | — | Alt+X paso 1 |
| Autorización gerente | Sí | Autorizar | — | — | Alt+C |
| Consultar precio | Sí | — | — | — | ↑↓ resultados |
| Depósito banco | Sí | Guardar (tab registrar) / Ver (tab buscar) | — | — | Alt+M tab registrar, Alt+K tab buscar, ↑↓ lista |
| Comprobante depósito | Sí | Imprimir | Abrir email | Verificar MP | Alt+C imprimir |
| Devoluciones | Sí | Buscar / Continuar / Procesar (PIN Enter) | Abrir email | — | ↑↓ checkboxes, autoFocus PIN |
| Ventas en espera | Sí | Recuperar | — | — | Alt+Z, ↑↓ |
| Reimprimir ticket | Sí | Reimprimir fila seleccionada | — | — | ↑↓ navegar |
| Enviar correo | Sí | Enviar | Enviar | — | Alt+X |
| Comprobantes impresión | Sí | Imprimir | Abrir email | — | Alt+C / Alt+X |

## Atajos del navegador evitados

No se usan:

- `Ctrl+L`, `Alt+D` (barra de direcciones)
- `Ctrl+T`, `Ctrl+W`, `Ctrl+N`, `Ctrl+R`, `Ctrl+F`, `Ctrl+P`
- `F5` (recargar), `F11` (pantalla completa)
- `Alt+F` bloqueado para evitar menú archivo en Firefox

Depósito banco usa **`Alt+G`** (no `Alt+D`). Logout usa **`Alt+L`**. Cancelar compra usa **`Alt+V`**.

## Implementación técnica

- [KeyboardShortcutsManager.tsx](components/KeyboardShortcutsManager.tsx): listener en fase capture; resuelve `F*`, `Alt+letra`, `Enter`, `Esc`, acciones `send-email` y `verify-payment`. Maneja `Alt+L` (logout) y `Alt+V` (cancelar compra) de forma directa.
- [posShortcuts.ts](constants/posShortcuts.ts): mapa de accesos rápidos globales. Array `POS_ALT_LETTERS` incluye `L`, `V`, `F` para bloquear el navegador.
- [PosModal.tsx](components/modals/shared/PosModal.tsx): focus trap, foco inicial, footer `data-pos-modal-footer`.
- [useModalInitialFocus.ts](hooks/useModalInitialFocus.ts): foco en modales inline.
- [useCashSession.ts](hooks/useCashSession.ts): abre `sales-terminal` directamente al restaurar sesión (no el dashboard).
- Botones nuevos: `data-shortcut-letter`, `data-shortcut-key`, `data-shortcut="confirm|cancel"`, o `data-shortcut-action` según corresponda.
- Listas navegables: contenedor con `tabIndex={-1}` + `onKeyDown` + `ref`. Auto-foco al cargar resultados. Fila activa con `backgroundColor: var(--surface-2)`.
