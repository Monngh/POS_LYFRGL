# Informe de Integración: Restauración de Resguardos con Mercado Pago

Este informe documenta la restauración del soporte para depósitos digitales (resguardos de efectivo) usando **Mercado Pago** en el Punto de Venta (POS), permitiendo que los cajeros realicen depósitos a través de corresponsalías físicas (OXXO, 7-Eleven, BBVA, Santander, Citibanamex) de forma automatizada.

---

## 🔍 Diagnóstico del Problema

El backend de la aplicación ya contaba con soporte robusto para depósitos a través de Mercado Pago (`createBankDeposit`), el cual crea la transacción con estado inicial `PENDING`, genera un código de barras o convenio en Mercado Pago, y descuenta el dinero de caja chica. Sin embargo, en la interfaz del cajero:
1. El selector de tipo de depósito había sido removido del frontend, forzando la petición HTTP fija a `"paymentType": "EFECTIVO"`.
2. El formulario exigía datos manuales (cuenta target de 16 dígitos y beneficiario) incompatibles con depósitos automáticos de Mercado Pago.
3. El comprobante y el historial de depósitos no proveían un mecanismo visual para ver las referencias (convenios, códigos de barra y enlaces al ticket de pago) ni para sincronizar/verificar el estado del pago.

---

## 🛠️ Solución Implementada

Se modificó el archivo de la terminal del cajero [Dashboard.tsx](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/frontend/src/pages/Dashboard.tsx) realizando las siguientes mejoras:

1. **Estado del Formulario y Dropdown:**
   - Se reincorporó la variable de estado `depType` con valor inicial `"EFECTIVO"`.
   - Se añadió un componente `<select>` en el modal para elegir entre:
     - Efectivo en Caja Chica (Manual)
     - Mercado Pago - OXXO
     - Mercado Pago - BBVA Bancomer
     - Mercado Pago - Santander
     - Mercado Pago - Citibanamex
     - Mercado Pago - 7-Eleven
   - Se ocultaron dinámicamente los campos "Número de Cuenta Target" y "Nombre del Beneficiario" cuando se selecciona cualquier opción de Mercado Pago.

2. **Validación y Envío Síncrono:**
   - La función `handleDepositSubmit` ahora valida los 16 dígitos de la cuenta y el nombre del beneficiario únicamente para depósitos manuales de efectivo.
   - Envia el parámetro `paymentType` dinámico (ej. `MERCADOPAGO_OXXO`) al backend.

3. **Visualización de Metadatos del Comprobante (Fase Premium):**
   - Para depósitos manuales se muestra el comprobante tradicional.
   - Para depósitos de Mercado Pago, la interfaz parsea el objeto de metadatos almacenado en la base de datos para mostrar:
     - Método de retiro (OXXO, BBVA, etc.)
     - Referencia de pago completa generada por Mercado Pago (sin enmascarar).
     - Convenio de depósito bancario (si aplica).
     - Fecha de vencimiento de la referencia de pago (3 días).
     - Código de barras detallado.
     - **Enlace de Pago Interactivo:** Un botón `"Ver Instrucciones de Pago"` que abre el ticket digital de Mercado Pago para que el cajero complete la operación.

4. **Sincronización Interactiva:**
   - Se implementó `handleSyncDeposit` que consume `/api/sales/deposits/:id/sync`.
   - Se colocó un botón de **"Verificar Pago" / "Sincronizar"** en el comprobante y en cada fila del historial si el depósito está `PENDIENTE`. Al presionarlo, el backend consulta con Mercado Pago y si el pago fue acreditado, actualiza el estado a `COMPLETED` liberando la salida definitiva de caja.

---

## 🧪 Instrucciones de Prueba

Para probar el flujo en modo simulación (sin gastar dinero físico real):

1. **Crear el Resguardo:**
   - Abre la ventana de **Resguardo de Efectivo (Cash Deposit)** en la terminal del cajero.
   - Selecciona **"Mercado Pago - OXXO"** o cualquier banco del dropdown. Note que los inputs de cuenta y beneficiario desaparecen.
   - Ingresa un monto válido (por ejemplo, `$100.00`) y presiona **Registrar Resguardo**.
   - Se abrirá el ticket de comprobante. Verás el estado inicial `PENDIENTE`, la referencia larga de Mercado Pago y un enlace interactivo para abrir las instrucciones de cobro.

2. **Verificar Sincronización (Modo Simulación / Mock):**
   - En el comprobante o en el historial, busca tu depósito pendiente y haz clic en **Verificar Pago / Sincronizar**.
   - El sistema detectará que es un depósito de prueba (cuyo ID de pago inicia con `mock-`), lo actualizará instantáneamente a **Exitoso (COMPLETED)** y reflejará los movimientos de caja correspondientes en el dashboard.
