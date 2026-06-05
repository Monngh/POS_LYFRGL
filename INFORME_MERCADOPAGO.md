# Guía de Integración y Pruebas: Mercado Pago

Este documento explica cómo configurar las credenciales de Mercado Pago en el Punto de Venta (POS) y cómo realizar pruebas completas y demostraciones de forma gratuita (sin gastar dinero real).

---

## 🔑 Configuración de Credenciales

En este sistema, la integración con Mercado Pago está centralizada en el backend. Por lo tanto, **solo necesitas configurar la credencial en el archivo de variables de entorno del backend (`backend/.env`)**.

No es necesario configurar nada en el frontend (ni la Public Key) ya que la terminal de cobro interactúa directamente con los endpoints del backend, el cual gestiona la seguridad y comunicación con los servidores de Mercado Pago.

### Paso para configurar:
1. Abre el archivo [backend/.env](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/backend/.env).
2. Agrega o modifica la siguiente variable de entorno con tu token de Mercado Pago:
   ```env
   MERCADOPAGO_ACCESS_TOKEN="TU_ACCESS_TOKEN_AQUI"
   ```

---

## 🆓 Cómo Probar y Hacer Demos Gratis (Sin Gastar Dinero)

No tienes que gastar dinero real ni realizar depósitos reales para probar el sistema. Tienes dos opciones de prueba gratuitas:

### Opción 1: Modo Simulación Integrado (Recomendado para Demos Rápidas)
Si **no** configuras ningún token en el `.env` (o dejas el valor de prueba por defecto), el backend entra automáticamente en **Modo Simulación (Mock Mode)**:
1. Al seleccionar **Mercado Pago** en la caja del POS y presionar cobrar, el sistema simulará una preferencia de pago.
2. El frontend mostrará una pantalla de simulación con un código QR y enlace simulado.
3. Al hacer clic en **Verificar Pago** en el POS, el backend responderá inmediatamente con estado `approved` (aprobado), finalizando la venta, descontando stock del inventario y emitiendo el ticket sin realizar peticiones externas.

### Opción 2: Sandbox Oficial de Mercado Pago (Pruebas con APIs Reales)
Si deseas validar que las llamadas a la API de Mercado Pago funcionen realmente ante sus servidores, debes usar tus **Credenciales de Prueba (Sandbox)**:
1. Ve al panel de [Mercado Pago Developers](https://www.mercadopago.com/developers/).
2. Accede a tu aplicación de desarrollo y copia el **Access Token de prueba (Sandbox)**, el cual comienza siempre con el prefijo **`TEST-`**.
3. Pega este token en tu archivo `backend/.env` en la variable `MERCADOPAGO_ACCESS_TOKEN`.
4. **Tarjetas de Prueba**: Cuando el sistema genere el link/QR de Mercado Pago, puedes abrirlo e ingresar los datos de las [Tarjetas de prueba oficiales de Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-api/integration-test/test-cards). Por ejemplo, ingresando el número de tarjeta `4000-1111-2222-3333` con cualquier fecha de vencimiento y el CVV `123`, el pago se procesará y aprobará en sus servidores Sandbox de manera **100% gratuita**.

---

## 📈 Utilidad de Mercado Pago en un POS Real

En un comercio moderno, la integración de cobros digitales integrados (QR/Link) aporta ventajas críticas:

1. **Agilidad en Caja y Reducción de Errores**:
   - El cajero no tiene que digitar manualmente el monto en una terminal física. El POS envía la información del importe exacto al QR de Mercado Pago. Esto elimina pérdidas de dinero por errores humanos de captura ("dedazos").
2. **Conciliación Automatizada**:
   - Cuando el cliente escanea el QR y paga, el sistema detecta de forma síncrona la confirmación (`approved`). La venta se cierra en el POS automáticamente asociando el ID de pago real de Mercado Pago, facilitando el arqueo de caja al final del día.
3. **Seguridad y Menos Efectivo en Tienda**:
   - Permite reducir el volumen de efectivo guardado físicamente en caja chica, disminuyendo el riesgo ante robos y mejorando los costos de traslado de valores.
