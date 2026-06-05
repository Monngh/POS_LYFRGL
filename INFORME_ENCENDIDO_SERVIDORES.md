# Informe de Operación: Encendido de Servidores locales

Este documento detalla el inicio de los servidores del Punto de Venta (POS) y la verificación del estado de conectividad con la base de datos de producción/pruebas.

---

## 🛠️ Acciones Realizadas

1. **Liberación de Puertos y Encendido del Backend**:
   - Se ejecutó el comando de arranque de desarrollo:
     ```bash
     npm run dev
     ```
   - El script interno liberó automáticamente el puerto `4000` si estaba ocupado.
   - El servidor Express se inició mediante `nodemon` y `ts-node` de forma correcta.

2. **Encendido del Frontend (Vite)**:
   - Se ejecutó el servidor de desarrollo de Vite en el frontend en el puerto `5173`.
   - La aplicación SPA React/Vite quedó lista para recibir peticiones y renderizar la interfaz.

3. **Prueba de Diagnóstico de Salud (Healthcheck)**:
   - Realizamos una petición HTTP GET al endpoint `/health` del backend obteniendo un estado óptimo:
     ```json
     {
       "status": "OK",
       "timestamp": "2026-06-04T18:34:03.447Z",
       "services": {
         "api": "healthy",
         "database": "connected"
       }
     }
     ```
   - Esto certifica que la API responde con éxito y que la conexión física con la base de datos SQL Server mediante el puente de ngrok está totalmente activa y respondiendo.

---

## 📈 Utilidad de este Flujo en un POS Real

Mantener servidores locales de pruebas con autoreload (nodemon en backend y Hot Module Replacement en Vite frontend) conectados a una base de datos centralizada de desarrollo es vital por las siguientes razones:

1. **Retroalimentación Instantánea (FSE - Fast Feedback)**:
   - Permite a los desarrolladores realizar cambios en los controladores o vistas (como los módulos de impuestos o cancelaciones) y ver el resultado reflejado en tiempo de ejecución de manera inmediata, simulando fielmente el comportamiento de caja real en una sucursal sin tener que compilar bundles pesados de producción en cada iteración.

2. **Coexistencia de Datos Reales**:
   - Al estar conectados directamente a la base de datos remota SQL Server (emulada por ngrok), las transacciones y las pruebas de inventario, kardex y facturación son reales y compartidas por todo el equipo, garantizando que no existan inconsistencias de datos simulados localmente.

---

## 🚀 Cómo Probar el Flujo de Trabajo

1. Abre tu navegador en la dirección local del frontend:
   - [http://localhost:5173/](http://localhost:5173/)
2. Inicia sesión con las credenciales de caja del seed:
   - **Email**: `juan.centro@fmb.com`
   - **PIN**: `1234`
3. Explora la terminal de ventas para verificar la carga de productos y el cobro síncrono.
