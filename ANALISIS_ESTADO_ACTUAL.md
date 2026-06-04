# Reporte de Estado Actual y Análisis del Sistema POS

Este documento detalla el análisis del espacio de trabajo, el esquema de base de datos en Prisma y el estado de las ramas de Git y GitHub para el Punto de Venta (POS) corporativo de FMB Solutions.

---

## 📂 1. Análisis del Espacio de Trabajo

El proyecto está organizado en una arquitectura de monorepositorio con dos carpetas principales:

1. **`backend/`**: Servidor de APIs REST construido con:
   * **Node.js** + **TypeScript** + **Express**.
   * **Prisma ORM** como motor de acceso de datos conectado a una base de datos **Microsoft SQL Server**.
   * **Facturapi REST API** para el timbrado real del CFDI 4.0 (autofacturación).
   * Middleware de seguridad como **Helmet** y **Cors**, y autenticación robusta mediante tokens **JWT** y códigos PIN cifrados con **bcryptjs**.

2. **`frontend/`**: Aplicación de interfaz de usuario construida con:
   * **React** + **TypeScript** + **Vite**.
   * Rutas y componentes estructurados para distintos roles:
     * **Cajeros/Vendedores**: Terminal de ventas optimizada para velocidad (escaneo de códigos de barra, calculadora de promociones en tiempo real, arqueos de caja y depósitos bancarios).
     * **Administradores**: Panel administrativo central (`AdminDashboard`) para visualizar estadísticas de ventas, reportes financieros de margen neto, catálogo de productos e inventarios por sucursal.
     * **Clientes**: Portal de Autofacturación para emitir CFDI 4.0 directamente mediante el folio del ticket de compra.

---

## 🌿 2. Estado de Ramas en Git y GitHub

Realizamos un análisis exhaustivo del repositorio de Git y su homólogo en GitHub (`origin`):

* **Rama Activa**: Estamos en la rama **`develop`**.
* **Sincronización**: Ejecutamos un `git fetch` y `git pull` de `origin develop` y verificamos que nuestra rama local coincide al 100% con la versión remota en GitHub (`git diff origin/develop` no reportó diferencias).
* **Ramas en GitHub**:
  * Todas las ramas de características (`feature/dashboard`, `feature/refinamientos-v2`, `feature/portal-autofacturacion`, etc.) ya se encuentran totalmente fusionadas en la rama **`develop`** a través del PR #6 de integración.
* **Política de Git Flow**:
  * Cada cambio de rama te será notificado de inmediato.
  * No subiremos cambios a GitHub (`git push`) a menos que indiques explícitamente lo contrario.

---

## 🗄️ 3. Base de Datos (Prisma y SQL Server)

El backend está configurado con **Prisma ORM** apuntando a una base de datos SQL Server (`POS_FMB_DEV`). El estado de la base de datos es **saludable y conectado** (verificado a través del endpoint `/health` que devolvió un estado exitoso).

### Modelos de Prisma Definidos:
* **`Branch`** (Sucursales): Manejo multi-sucursal físico.
* **`User`** (Usuarios): Soporte de roles (`ADMIN`, `GERENTE`, `CAJERO`) con PIN de 4 dígitos para autorización en caja.
* **`Product`** (Productos): Control de SKU, código de barras, precio de costo y precio de venta.
* **`Inventory`** (Inventarios): Relación única de stock por producto y sucursal.
* **`Kardex`** (Kardex): Historial inmutable y auditoría de movimientos de almacén (`COMPRA`, `VENTA`, `DEVOLUCION`, etc.).
* **`CashSession`** (Sesión de Caja): Control de turnos de cajeros con montos iniciales, esperados, declarados, diferencias, y flujos de efectivo.
* **`Customer`** (Clientes): Base de datos de clientes con límites de crédito y saldos.
* **`Sale`** y **`SaleDetail`** (Ventas y Detalle): Almacenamiento transaccional de ventas, folios únicos e información fiscal de autofacturación (`cfdiUuid` y `cfdiEmail`).
* **`BankDeposit`** (Depósitos Bancarios): Registro físico de slips de depósito bancario para retiros parciales de efectivo.
* **`PromotionType`, `Promotion`, `PromotionProduct`** (Promociones): Motor de descuentos dinámicos (Porcentaje, Monto Fijo, 2x1, Precio Especial).
* **`CashCut`** (Cortes de Caja): Registro de arqueos y desglose de cobro por método (efectivo, tarjeta, reembolsos).

---

## 🚀 4. Cómo Probar el Flujo de Trabajo (Sin Simulaciones)

Tanto el backend como el frontend ya están levantados y ejecutándose en tu entorno local.

* **Backend**: `http://localhost:4000`
* **Frontend**: `http://localhost:5173`

Sigue este flujo de pruebas completo para experimentar el comportamiento real:

### Paso A: Terminal de Ventas y Apertura de Caja (Rol Cajero)
1. Abre `http://localhost:5173` en tu navegador.
2. Inicia sesión con las credenciales de cajero sembradas en la base de datos:
   * **Email**: `juan.centro@fmb.com`
   * **Contraseña**: (Contraseña de tu base de datos)
   * **PIN**: `1234`
3. Serás forzado a ingresar un **Fondo Inicial** (Apertura de Caja). Escribe un monto de prueba (ej. `1000.00`) y presiona **ABRIR TURNO**. Esto creará un registro `CashSession` real en SQL Server.
4. En la terminal de ventas, escanea o busca productos (ej. agrega productos al carrito).
5. Observa cómo el sistema calcula los descuentos reales basados en las promociones configuradas y activas en la base de datos.
6. Haz clic en **COBRAR**. Elige el método de pago:
   * Si seleccionas **EFECTIVO**, ingresa la cantidad recibida (debe ser mayor o igual al total) para calcular el cambio.
   * Si seleccionas **TARJETA**, elige si es Crédito o Débito.
   * Si seleccionas **MIXTO**, distribuye el pago entre efectivo y tarjeta.
7. Al finalizar la venta, se generará el folio en SQL Server, se restará el stock de la tabla `Inventory` mediante una transacción ACID, y se registrará la entrada en `Kardex`.

### Paso B: Cancelaciones y Depósitos (Rol Cajero + Admin/Gerente)
1. **Cancelar Venta**: En la terminal, intenta cancelar la venta actual o una del historial. El sistema te solicitará un **PIN de autorización**.
   * Si ingresas el PIN de administrador (`9999`), la venta cambiará su estado a `CANCELADA`, reintegrando el stock al inventario y registrando el movimiento de devolución en el Kardex.
2. **Depósito Bancario**:
   * Utiliza la opción de depósito bancario para registrar el retiro de efectivo de la caja chica a una cuenta bancaria. Esto incrementará la columna `cashOut` de tu `CashSession` actual en SQL Server de manera inmediata.

### Paso C: Panel Administrativo Central (Rol Administrador)
1. Inicia sesión con la cuenta de administrador:
   * **Email**: `admin@fmb.com`
   * **PIN**: `9999`
2. Serás dirigido al panel de control central donde podrás ver gráficos interactivos de ventas en tiempo real, niveles de stock críticos por sucursal, historial de transacciones e informes de margen neto basados en la diferencia entre el `costPrice` y `sellPrice` del producto.

### Paso D: Portal de Autofacturacion (Rol Cliente)
1. Ve a la ruta de autofacturación: `http://localhost:5173/autofacturacion` (o accede desde el enlace de facturación).
2. Ingresa el folio de la venta completada (ej: `V-xxxxxx`).
3. El sistema buscará la venta directamente en la base de datos SQL Server y mostrará el desglose.
4. Ingresa tus datos fiscales reales del SAT.
5. Haz clic en **Emitir Factura SAT**. El sistema enviará la petición REST a **Facturapi**, timbrará la factura con el SAT, y te permitirá descargar el PDF y XML reales de forma inmediata.

---

## 📈 5. Utilidad de este Flujo en un POS Real

En un entorno comercial real, estas características garantizan tres pilares clave:
1. **Seguridad e Integridad Financiera**: Los arqueos de caja (`CashSession` y `CashCut`) previenen mermas y robos hormiga al comparar el efectivo declarado contra el registrado por el software.
2. **Auditoría de Almacén**: La actualización síncrona de inventarios mediante transacciones ACID y el registro inmutable en el `Kardex` aseguran que ningún producto se venda sin descontarse, impidiendo la venta de mercancía inexistente y manteniendo un control fiscal estricto de las existencias.
3. **Cumplimiento Fiscal y Automatización**: El portal de autofacturación libera al cajero de realizar facturas manualmente durante el cobro, permitiendo al cliente final timbrar su propio CFDI desde cualquier lugar de forma 100% automatizada e integrada con el SAT.
