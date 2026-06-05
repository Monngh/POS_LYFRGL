# Informe de Configuración: Conexión Centralizada de Base de Datos (ngrok)

Este documento detalla la modificación realizada para enlazar el monorepositorio local del POS con la base de datos centralizada de Microsoft SQL Server a través del puente de ngrok.

---

## 🛠️ Modificaciones Realizadas

1. **Actualización de Variables de Entorno (`backend/.env`)**:
   - Se modificó la variable `DATABASE_URL` para reemplazar el servidor local (`localhost:1433`) por la dirección del túnel TCP activo de ngrok: `8.tcp.ngrok.io:12405`.
   - La nueva cadena de conexión queda estructurada de la siguiente manera:
     ```env
     DATABASE_URL="sqlserver://8.tcp.ngrok.io:12405;database=POS_FMB_DEV;user=sa;password=TuPassword#2026;trustServerCertificate=true"
     ```
   - Esto permite que todas las consultas y transacciones realizadas a través del Prisma ORM apunten al servidor centralizado compartido.

2. **Verificación de Conectividad**:
   - Ejecutamos con éxito el script de prueba interno `backend/scripts/check-branches.ts` para validar la conexión y realizar consultas reales sobre el esquema central.
   - El resultado arrojó la conexión exitosa y reportó el estado actual de las sucursales y sus relaciones:
     - **Sucursal Centro LYFRGL** (ID: 1): 4 usuarios, 33 ventas, 20 sesiones de caja.
     - **Sucursal Norte LYFRGL** (ID: 2): 3 usuarios, 0 ventas, 0 sesiones de caja.
     - **Sucursal Poniente LYFRGL** (ID: 3): 3 usuarios, 0 ventas, 0 sesiones de caja.

---

## 📈 Utilidad de una Base de Datos Centralizada en un POS Real

En un entorno comercial real con múltiples sucursales y terminales de cobro, la centralización de la base de datos mediante un servidor accesible (en este caso emulado por ngrok para el desarrollo conjunto) es vital por las siguientes razones:

1. **Integridad del Inventario en Tiempo Real**:
   - Previene la "doble venta" de mercancía. Si un producto con stock crítico de 1 unidad se vende en una terminal o en la tienda física, el inventario se actualiza de manera síncrona y transaccional, reflejando inmediatamente la indisponibilidad del stock en el resto de las sucursales o canales digitales.

2. **Consolidación Financiera y Auditoría Directa**:
   - Los cortes de caja y arqueos de turnos (`CashCut` y `CashSession`) se registran en una única fuente de verdad. Los auditores y administradores pueden visualizar desde las oficinas corporativas o desde el panel administrativo las ventas y retiros de efectivo al instante, sin necesidad de realizar procesos de sincronización al cierre de la jornada (los cuales son vulnerables a pérdida de datos o alteración de registros).

3. **Autenticación y Seguridad Centralizada**:
   - La gestión de usuarios y códigos PIN se mantiene centralizada. Si se da de baja a un cajero por mal comportamiento o se cambia el PIN de supervisor para cancelaciones, el cambio surte efecto inmediato en todas las terminales de venta físicas del sistema, evitando fraudes o accesos no autorizados.

---

## 🚀 Cómo Probar el Flujo de Trabajo

Puedes comprobar de manera autónoma que la conexión a la base de datos de pruebas compartida se encuentra activa y respondiendo correctamente ejecutando los siguientes pasos:

1. Abre tu terminal de línea de comandos (PowerShell o Git Bash).
2. Navega al directorio del backend:
   ```bash
   cd backend
   ```
3. Ejecuta el script de diagnóstico de sucursales:
   ```bash
   npx ts-node scripts/check-branches.ts
   ```
4. Si visualizas el listado de las sucursales, su número de usuarios y las ventas contables en la terminal, la conexión a la base de datos compartida a través de ngrok está operando al 100% de manera transparente para el ORM de Prisma.
