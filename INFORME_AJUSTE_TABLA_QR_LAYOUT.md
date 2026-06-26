# Informe: Ajuste Visual Tabla QR Pendientes

**Rama:** `feature/fix-qr-pending-modal`  
**Commit:** `496216a`  
**Archivo:** `frontend/src/pages/Dashboard.tsx`

---

## Cambios Realizados

### Problema
La tabla de "Pagos QR Pendientes" desbordaba visualmente sobre los botones CANCELAR COMPRA / COBRAR, y el texto era demasiado pequeño (8.5–10px) comparado con el resto del cajero (13px de referencia).

### Correcciones

| Elemento | Antes | Después |
|----------|-------|---------|
| `maxHeight` contenedor | `110px` | `72px` |
| `padding` contenedor | `4px 8px` | `5px 10px` |
| Título "Pagos QR Pendientes" | `9px` | `11px` |
| Tabla `fontSize` base | `10px` | `12px` |
| Celdas folio / monto | sin `fontSize` explícito | `12px` |
| Badge estado (Pendiente/Aprobado) | `8.5px` | `11px` |
| Botones QR / Verificar / Imprimir | `9px`, `padding: 2px 7px` | `11px`, `padding: 3px 10px` |
| Botón 🗑️ | `11px` | `13px` |
| `padding` celdas `<td>` | `3px 4px` | `4px 6px` |

### Por qué `72px`
Con `maxHeight: 72px` y filas de ~26px de alto (12px texto + 4px padding×2):
- **2 filas** caben perfectamente visibles sin scroll
- **3+ filas** activan el `overflowY: auto` con scroll interno
- El área total del `terminalSummary` (tabla + totales + botones) no desborda

---

## Prueba
1. Tener 1–3 ventas en la cola de QR pendientes
2. Verificar que la tabla **no toca** los botones CANCELAR / COBRAR
3. Verificar que el texto es legible (mismo peso visual que los totales de la derecha)
4. Con 3+ ventas, debe aparecer scroll interno en la tabla
