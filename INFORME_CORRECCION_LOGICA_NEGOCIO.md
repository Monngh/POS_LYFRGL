# Informe: Corrección de Restricciones Lógicas en Ventas, Devoluciones y Depósitos

**Rama:** `feature/fix-qr-pending-modal`

## 🌟 Qué se corrigió

Se implementaron validaciones y restricciones en el backend para salvaguardar la integridad de los datos y evitar descuadres financieros o de stock en los siguientes escenarios críticos:

1. **Restricción de Cancelación Directa:**
   - **Archivo:** [sale.controller.ts](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/backend/src/controllers/sale.controller.ts) (método `authorizeAndCancelSale`).
   - **Corrección:** Se agregó una validación que bloquea la cancelación completa directa de un ticket si este ya cuenta con registros de devoluciones parciales en la tabla `Return`.
   - **Importancia:** Evita que el cajero haga una doble reintegración de stock y doble reembolso de caja de productos que ya fueron devueltos previamente.

2. **Validación de Inventario en Cambios de Producto:**
   - **Archivo:** [return.controller.ts](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/backend/src/controllers/return.controller.ts) (método `processReturn`).
   - **Corrección:** Se añadió una verificación de inventario (`currentStock < requestedQty`) para los artículos del intercambio (`exchangeItems`). Si no hay suficientes existencias en la sucursal, la transacción se aborta arrojando un error `400`.
   - **Importancia:** Impide que los movimientos del Kardex y las ventas de intercambio generen inventarios negativos no deseados en la sucursal.

3. **Cálculo de Flujo de Caja en Vales de Devolución por Intercambio:**
   - **Archivo:** [return.controller.ts](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/backend/src/controllers/return.controller.ts) (método `processReturn`).
   - **Corrección:** Al realizar un intercambio con saldo a favor del cliente y reembolsar la diferencia con un Vale (`VALE_DEVOLUCION`), se corrigió el cálculo de `refundDiffCash`. Ahora, solo se decrementa el efectivo de caja (`cashIn`) si el método de reembolso elegido es realmente `EFECTIVO`.
   - **Importancia:** Resuelve un descuadre en donde la caja chica reportaba falsamente una salida de efectivo físico, provocando un sobrante de dinero en el arqueo del cajero.

4. **Protección de Depósitos en Sesiones Cerradas:**
   - **Archivo:** [sale.controller.ts](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/backend/src/controllers/sale.controller.ts) (método `cancelDeposit`).
   - **Corrección:** Se bloqueó la posibilidad de cancelar depósitos/resguardos de efectivo si la sesión de caja chica asociada ya está en estado `CERRADA`.
   - **Importancia:** Mantiene bloqueados e inmutables los registros históricos de cortes de turnos pasados.

---

## 🛠️ Cómo probar los escenarios

### Scenario 1: Bloqueo de Cancelación Directa
1. Realiza una venta de 2 piezas de un artículo.
2. Ve al módulo de devoluciones y realiza una devolución parcial de **1 pieza**.
3. Posteriormente, intenta utilizar la acción rápida **"Solicitar Cancelación"** ingresando el folio de la venta original.
4. **Resultado esperado:** El sistema rechazará la solicitud mostrando el mensaje: *"No se puede cancelar directamente una venta que ya tiene devoluciones parciales registradas. Utilice el módulo de devoluciones..."*

### Scenario 2: Validación de Stock en Intercambio
1. Busca un producto que tenga **0 piezas** de stock en tu inventario.
2. Inicia una devolución de una venta válida y selecciona la opción **Cambio de Producto**.
3. Intenta agregar el producto sin stock en la sección de intercambio.
4. **Resultado esperado:** El sistema detendrá la transacción indicando: *"Inventario insuficiente para el artículo de cambio..."*

### Scenario 3: Prueba de Vale en Intercambio (Caja Chica)
1. Realiza una devolución parcial con saldo a favor para el cliente utilizando **Cambio de Producto**.
2. Selecciona **Vale de Devolución** para el saldo a favor.
3. Finaliza la transacción y revisa las estadísticas del turno de caja (`getSessionStats`).
4. **Resultado esperado:** La variable `cashIn` no debe verse afectada (el efectivo real en caja sigue intacto), pero `expectedAmount` del turno sí se reduce por la diferencia, manteniendo el arqueo perfectamente balanceado.

### Scenario 4: Cancelación de Depósito de Turno Cerrado
1. Genera un depósito bancario (resguardo) de $100.
2. Cierra el turno de caja activa.
3. Intenta cancelar el depósito generado desde el panel de depósitos.
4. **Resultado esperado:** El sistema bloqueará la acción indicando que la sesión de caja está cerrada.

---

## 💼 Utilidad en un POS Real

En el retail corporativo, la robustez de las transacciones ACID y la coherencia del flujo de caja son primordiales:
* **Auditoría Clara:** Previene la alteración de datos de turnos antiguos y garantiza que cada movimiento de inventario esté justificado en Kardex.
* **Caja Cuadrada:** Elimina los "fantasmas" de dinero que solían ocurrir al emitir notas de crédito/vales de monedero.
* **Control de Stock:** Salvaguarda la veracidad del stock del inventario físico en tiempo real de la tienda.
