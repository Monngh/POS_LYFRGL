# Informe: Adición de Enlace de Pago en Modal QR

**Rama:** `develop`

## 🌟 Qué se corrigió

Se detectó que en el modal de cobro inmediato de Mercado Pago (cuando el cajero presiona "Cobrar" con el método QR seleccionado) se mostraba el código QR, pero no aparecía el enlace de pago interactivo debajo de él.

- **Archivo modificado:** [Dashboard.tsx](file:///c:/Users/gaelo/Desktop/PuntoDeVentaFMB/frontend/src/pages/Dashboard.tsx).
- **Acción:** Se añadió una caja con la etiqueta `🔗 Abrir enlace de pago / Sandbox` que referencia la variable `qrUrl` debajo de la imagen del código QR generado.
- **Resultado:** Ahora el modal de cobro inmediato tiene el mismo comportamiento visual y funcionalidad que los modales de la tabla de pagos pendientes, permitiendo al cajero dar clic para abrir el simulador de pruebas (Sandbox) de Mercado Pago de forma manual.

---

## 🛠️ Cómo probar

1. Inicia sesión como cajero.
2. Agrega productos al carrito y selecciona el método de pago **QR Mercado Pago**.
3. Presiona **Cobrar**.
4. **Resultado esperado:** En el modal emergente con el código QR, verás debajo de la imagen el enlace en color azul con fondo gris claro: `🔗 Abrir enlace de pago / Sandbox`. Al dar clic, se abrirá la pestaña de pago simulado de Mercado Pago.
