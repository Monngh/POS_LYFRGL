# POS LYFRGL

> Sistema de Punto de Venta multi-sucursal para retail — React 19 + Express + SQL Server

---

## Descripción

POS LYFRGL es un sistema POS completo diseñado para operación en múltiples sucursales. Incluye terminal de ventas para cajeros, panel de administración para gerentes y administradores, portal de autofacturación para clientes, y una API REST con autenticación JWT + WebAuthn.

---

## Características por rol

| Funcionalidad                          | Admin | Gerente | Cajero |
|----------------------------------------|:-----:|:-------:|:------:|
| Dashboard con métricas ejecutivas      |  ✅   |   ✅    |   —    |
| Gestión de sucursales                  |  ✅   |   —     |   —    |
| Gestión de empleados                   |  ✅   |   ✅    |   —    |
| Catálogo de productos (crear/editar)   |  ✅   |   —     |   —    |
| Catálogo de productos (consultar)      |  ✅   |   ✅    |   —    |
| Inventario (ajuste y transferencia)    |  ✅   |   ✅    |   —    |
| Kardex de movimientos                  |  ✅   |   ✅    |   —    |
| Gestión de proveedores y compras       |  ✅   |   —     |   —    |
| Listas de precios por cliente          |  ✅   |   ✅    |   —    |
| Configuración de impuestos (IVA/IEPS)  |  ✅   |   —     |   —    |
| Promociones (crear/gestionar)          |  ✅   |   —     |   —    |
| Clientes y puntos de lealtad           |  ✅   |   ✅    |   —    |
| Terminal de ventas POS                 |  —    |   —     |   ✅   |
| Apertura / cierre de caja              |  —    |   —     |   ✅   |
| Corte parcial de caja                  |  —    |   —     |   ✅   |
| Pago con MercadoPago QR                |  —    |   —     |   ✅   |
| Depósitos bancarios                    |  ✅   |   ✅    |   ✅   |
| Devoluciones                           |  ✅   |   ✅    |   ✅   |
| Facturación CFDI global                |  ✅   |   —     |   —    |
| Historial de facturación               |  ✅   |   —     |   —    |
| Reportes (ventas, comisiones, cobranza)|  ✅   |   ✅    |   —    |
| Bitácora de accesos a reportes         |  ✅   |   —     |   —    |
| Bitácora de inicios de sesión          |  ✅   |   —     |   —    |
| Forzar cierre de caja remota           |  ✅   |   ✅    |   —    |
| Autofacturación (portal cliente)       |  —    |   —     |   —    |

---

## Arquitectura del sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│                            POS LYFRGL                                │
│                  Sistema de Punto de Venta Multi-Sucursal            │
└──────────────────────────────────────────────────────────────────────┘

     Tablet / PC cajero           Navegador admin / gerente
  ┌──────────────────────┐     ┌──────────────────────────┐
  │   Terminal POS        │     │     Panel Administrativo  │
  │   /pos/*              │     │     /admin/*              │
  │   (React 19 + Vite)  │     │     (React 19 + Vite)     │
  └──────────┬───────────┘     └─────────────┬─────────────┘
             │                               │
             └───────────────┬───────────────┘
                             │  HTTPS
                    ┌────────▼────────┐
                    │      Nginx      │
                    │  Reverse Proxy  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Express API   │
                    │  + TypeScript   │
                    │  (PM2 Cluster)  │
                    └───┬────┬────┬───┘
                        │    │    │
          ┌─────────────┘    │    └───────────────┐
          │                  │                    │
   ┌──────▼──────┐  ┌────────▼──────┐  ┌─────────▼──────┐
   │  SQL Server  │  │   Facturapi   │  │  MercadoPago   │
   │  (Prisma 5)  │  │  (CFDI 4.0)  │  │  (Pagos / QR)  │
   └─────────────┘  └───────────────┘  └─────────────────┘
          │
   ┌──────▼──────┐
   │  Nodemailer  │
   │ (Tickets /   │
   │  OTP email)  │
   └─────────────┘

Autenticación por rol:
  ADMIN / GERENTE → Contraseña + WebAuthn (Windows Hello / FIDO2) ó OTP
  CAJERO          → PIN de 4–6 dígitos (device-locked a la caja activa)
  CUSTOMER        → Email + contraseña ó OTP por email
```

---

## Estructura del repositorio

```
POS_LYFRGL/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma         # 31 modelos — SQL Server
│   │   └── seed.ts               # Datos iniciales con ciclo de 14 días
│   ├── src/
│   │   ├── app.ts                # Express app, CORS, rutas, healthcheck
│   │   ├── server.ts             # Entry point, graceful shutdown
│   │   ├── config/               # Configuración global
│   │   ├── controllers/          # Handlers HTTP (~25 controladores)
│   │   ├── services/             # Lógica de negocio (~25 servicios)
│   │   ├── routes/               # 13 archivos de rutas
│   │   ├── middlewares/          # auth, audit, device, error
│   │   ├── types/                # Tipos TypeScript compartidos
│   │   └── utils/                # Logger y utilidades
│   ├── scripts/
│   │   └── free-port.js          # Libera el puerto antes de nodemon
│   ├── ecosystem.config.js       # PM2 — cluster mode
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── admin/
│   │   │   ├── AdminPage.tsx     # Layout del panel admin
│   │   │   ├── views/            # 20 vistas (Dashboard, Ventas, Cajas…)
│   │   │   ├── components/       # Componentes del panel admin
│   │   │   ├── hooks/            # Custom hooks admin
│   │   │   └── services/         # Llamadas API admin
│   │   ├── pos/
│   │   │   ├── PosPage.tsx       # Layout de la terminal POS
│   │   │   ├── views/            # Dashboard y vistas POS
│   │   │   ├── components/       # Terminal, carrito, checkout, modales
│   │   │   ├── hooks/            # useCart, useCashSession, useSearch…
│   │   │   └── services/         # Llamadas API POS
│   │   ├── ecommerce/
│   │   │   ├── StorePage.tsx     # Layout portal cliente
│   │   │   └── views/            # Autofacturación, Dashboard cliente
│   │   ├── auth/                 # Login unificado + AuthContext
│   │   ├── facturacion/          # Servicio de facturación (CFDI)
│   │   ├── shared/               # Servicios API, utilidades, UI compartida
│   │   ├── router/               # AppRouter con lazy loading por módulo
│   │   └── pages/                # Páginas adicionales
│   ├── vercel.json               # SPA rewrites + headers de seguridad
│   └── package.json
└── nginx.conf                    # Reverse proxy (producción)
```

---

## Stack tecnológico

### Backend

| Tecnología        | Versión    | Uso                                       |
|-------------------|------------|-------------------------------------------|
| Node.js           | LTS        | Runtime                                   |
| Express           | 4.19.2     | Framework HTTP                            |
| TypeScript        | 5.4.5      | Tipado estático                           |
| Prisma ORM        | 5.14.0     | Acceso a base de datos                    |
| SQL Server        | —          | Base de datos relacional                  |
| jsonwebtoken      | 9.0.2      | Sesiones JWT (8 h)                        |
| bcryptjs          | 2.4.3      | Hash de contraseñas y PINs                |
| @simplewebauthn   | 13.3.1     | WebAuthn / FIDO2 (Windows Hello)          |
| express-rate-limit| 8.5.2      | Rate limiting en login y facturación      |
| helmet            | 7.1.0      | Headers HTTP de seguridad                 |
| mercadopago       | 3.1.0      | Pagos con código QR                       |
| nodemailer        | 8.0.10     | Envío de tickets y OTPs por correo        |
| nodemon           | 3.1.0      | Hot-reload en desarrollo                  |
| ts-node           | 10.9.2     | Ejecución directa de TypeScript           |

### Frontend

| Tecnología        | Versión    | Uso                                       |
|-------------------|------------|-------------------------------------------|
| React             | 19.2.6     | UI con Suspense y code splitting          |
| TypeScript        | 6.0.2      | Tipado estático                           |
| Vite              | 8.0.12     | Build tool con manual chunks              |
| React Router DOM  | 6.23.1     | Enrutamiento SPA                          |
| Axios             | 1.7.2      | Cliente HTTP con interceptores JWT        |
| Lucide React      | 1.17.0     | Iconografía                               |
| jspdf             | 4.2.1      | Generación de PDFs (tickets, reportes)    |
| jspdf-autotable   | 5.0.8      | Tablas en PDF                             |
| html2canvas       | 1.4.1      | Captura de elementos como imagen          |
| @simplewebauthn   | 13.3.0     | WebAuthn lado cliente                     |

---

## Modelo de datos

El esquema contiene **31 modelos** en SQL Server. A continuación se muestra un resumen funcional; ver `backend/prisma/schema.prisma` para los campos completos.

```
Branch              Sucursal física. Cada User, CashSession, Inventory y Sale pertenece a una.
User                Empleado (ADMIN | GERENTE | CAJERO). Soporta PIN, WebAuthn y OTP.
Customer            Cliente final. Tiene puntos de lealtad, crédito, RFC y lista de precios.

Product             Producto con SKU único, clave SAT, precio de costo y venta.
Category            Jerarquía DIVISION → DEPARTMENT → CATEGORY (árbol self-referential).
ProductCategory     Relación N-M producto ↔ categoría.
Inventory           Stock por producto y sucursal (min/max stock).
Kardex              Bitácora de cada movimiento de inventario con tipo y balance resultante.
PriceList           Lista de precios asignable a clientes.
PriceListProduct    Precio especial por producto dentro de una lista.
PriceAdjustment     Historial de ajustes de precio masivos (% o monto fijo).

TaxType             Impuesto configurable (IVA 16 %, IVA 0 %, IEPS 8 %, etc.).
ProductTax          Impuestos aplicables a cada producto.

PromotionType       Tipo de promoción (descuento %, 2x1, precio especial, etc.).
Promotion           Promoción con vigencia, valor y cantidad mínima.
PromotionProduct    Productos incluidos en una promoción.

CashSession         Sesión de caja vinculada a un cajero y dispositivo (deviceId).
CashCut             Corte parcial de caja con desglose por forma de pago.

Sale                Venta con número de folio, método de pago, puntos y datos CFDI/MercadoPago.
SaleDetail          Renglón de venta con precio, costo, impuesto y promoción aplicada.
SaleDetailTax       Snapshot del impuesto en el momento de la venta.

Return              Devolución autorizada con tipo y método de reembolso.
ReturnDetail        Renglón de devolución con destino (inventario o merma).
StoreCredit         Crédito en tienda generado por una devolución.

BankDeposit         Depósito bancario registrado desde caja (efectivo/transferencia).

Supplier            Proveedor con RFC y datos de contacto.
SupplierProduct     Catálogo de productos por proveedor.
PurchaseOrder       Orden de compra con estatus (PENDIENTE → RECIBIDA → CANCELADA).
PurchaseDetail      Renglón de orden de compra.

ReportAuditLog      Log de cada reporte descargado (quién, cuándo, qué filtros).
AuthAuditLog        Log de cada inicio de sesión (método, dispositivo, IP).
```

---

## API — Endpoints

La API corre en `http://localhost:4000`. Todas las rutas tienen el prefijo `/api`.

### Sin autenticación (público)

| Método | Ruta                                 | Descripción                              |
|--------|--------------------------------------|------------------------------------------|
| GET    | /api/auth/branches                   | Lista de sucursales activas              |
| GET    | /api/auth/cashiers/:branchId         | Cajeros disponibles en una sucursal      |
| POST   | /api/auth/cashier-login              | Login de cajero por PIN                  |
| POST   | /api/auth/admin-login                | Login de admin/gerente (rate-limited)    |
| POST   | /api/auth/webauthn/register-verify   | Registrar credencial WebAuthn            |
| POST   | /api/auth/webauthn/login-verify      | Verificar credencial WebAuthn            |
| POST   | /api/auth/request-otp                | Solicitar código OTP por email           |
| POST   | /api/auth/verify-otp                 | Verificar OTP y obtener JWT              |
| GET    | /api/public/sales/ticket/:invoice    | Ver ticket público por número de folio   |
| POST   | /api/public/sales/invoice            | Solicitar CFDI (autofacturación)         |
| GET    | /api/public/sales/invoice/:uuid/xml  | Descargar XML del CFDI (rate-limited)    |
| GET    | /api/public/sales/invoice/:uuid/pdf  | Descargar PDF del CFDI (rate-limited)    |
| GET    | /api/promotions/active               | Promociones vigentes                     |
| POST   | /api/promotions/calculate            | Calcular promoción sobre un carrito      |
| POST   | /api/mercadopago/webhook             | Webhook de notificaciones MercadoPago    |
| POST   | /api/customers/register              | Registro de cliente en portal            |
| POST   | /api/customers/login                 | Login de cliente                         |
| POST   | /api/customers/otp/send              | OTP para cliente                         |
| POST   | /api/customers/password/reset-otp    | Solicitar reset de contraseña            |
| POST   | /api/customers/password/reset        | Confirmar reset de contraseña            |
| GET    | /health                              | Healthcheck (API + BD)                   |

### Autenticadas (JWT requerido — cualquier rol)

| Método | Ruta                                  | Descripción                                      |
|--------|---------------------------------------|--------------------------------------------------|
| GET    | /api/auth/profile                     | Perfil del usuario autenticado                   |
| POST   | /api/auth/logout                      | Invalidar sesión                                 |
| POST   | /api/auth/verify-pin                  | Verificar PIN (autorización en terminal)         |
| GET    | /api/products/search                  | Buscar productos por nombre, SKU o código        |
| GET    | /api/cash-session/status              | Estado de la sesión de caja activa               |
| POST   | /api/cash-session/open                | Abrir sesión de caja                             |
| POST   | /api/cash-session/close               | Cerrar caja (device-enforced)                    |
| GET    | /api/cash-session/stats               | Estadísticas de la sesión activa                 |
| POST   | /api/cash-session/cut                 | Corte parcial (device-enforced)                  |
| GET    | /api/cash-session/cuts                | Historial de cortes de la sesión                 |
| POST   | /api/sales                            | Registrar venta (device-enforced)                |
| POST   | /api/sales/simulate                   | Simular venta sin guardarla                      |
| GET    | /api/sales/recent                     | Ventas recientes de la sucursal                  |
| GET    | /api/sales/my-recent                  | Ventas recientes del cajero autenticado          |
| POST   | /api/sales/authorize-cancel           | Solicitar cancelación (device-enforced)          |
| POST   | /api/sales/bank-deposit               | Registrar depósito bancario (device-enforced)    |
| GET    | /api/sales/deposits                   | Listar depósitos de la sesión                    |
| POST   | /api/sales/confirm-qr                 | Confirmar pago QR (device-enforced)              |
| POST   | /api/sales/retry-qr                   | Reintentar QR (device-enforced)                  |
| GET    | /api/sales/detail                     | Detalle de una venta                             |
| POST   | /api/sales/send-ticket-email          | Enviar ticket por correo                         |
| GET    | /api/sales/customers                  | Buscar clientes desde POS                        |
| GET    | /api/returns/eligible/:invoiceNumber  | Productos elegibles para devolución              |
| POST   | /api/returns                          | Registrar devolución (device-enforced)           |
| POST   | /api/mercadopago/qr-preference        | Generar preferencia de pago QR                   |
| GET    | /api/mercadopago/status/:ref          | Consultar estado de pago                         |
| GET    | /api/customers/profile                | Perfil del cliente autenticado                   |
| PUT    | /api/customers/profile                | Actualizar perfil del cliente                    |
| GET    | /api/customers/invoices               | Facturas del cliente                             |

### Solo ADMIN / GERENTE

| Método | Ruta                                      | Descripción                                   |
|--------|-------------------------------------------|-----------------------------------------------|
| GET    | /api/dashboard/metrics                    | Métricas del dashboard ejecutivo              |
| GET    | /api/admin/sales                          | Historial de ventas                           |
| GET    | /api/admin/sales/:id                      | Detalle de venta                              |
| GET    | /api/admin/inventory                      | Existencias por sucursal y producto           |
| POST   | /api/admin/inventory/adjust               | Ajuste manual de inventario                   |
| POST   | /api/admin/inventory/transfer             | Transferencia entre sucursales                |
| GET    | /api/admin/products                       | Listar productos                              |
| GET    | /api/admin/products/:id                   | Detalle de producto                           |
| GET    | /api/admin/kardex                         | Kardex de movimientos                         |
| GET    | /api/admin/customers                      | Listar clientes                               |
| POST   | /api/admin/customers                      | Crear cliente                                 |
| PUT    | /api/admin/customers/:id                  | Actualizar cliente                            |
| GET    | /api/admin/cash-sessions                  | Listar sesiones de caja                       |
| GET    | /api/admin/cash-sessions/:id              | Detalle de sesión                             |
| PUT    | /api/admin/cash-sessions/:id/force-close  | Forzar cierre de caja                         |
| GET    | /api/admin/employees                      | Listar empleados                              |
| POST   | /api/admin/employees                      | Crear empleado                                |
| PUT    | /api/admin/employees/:id                  | Actualizar empleado                           |
| GET    | /api/admin/employees/:id/operations       | Operaciones de un empleado                    |
| GET    | /api/admin/bank-deposits                  | Listar depósitos bancarios                    |
| GET    | /api/admin/returns                        | Listar devoluciones                           |
| GET    | /api/admin/returns/:id                    | Detalle de devolución                         |
| POST   | /api/admin/returns/:id/retry-refund       | Reintentar reembolso en MercadoPago           |
| POST   | /api/admin/returns/:id/create-cfdi        | Generar CFDI de devolución                    |
| GET    | /api/admin/reports                        | Resumen ejecutivo                             |
| GET    | /api/admin/reports/sales                  | Reporte de ventas con filtros                 |
| GET    | /api/admin/reports/products-sold          | Artículos vendidos                            |
| GET    | /api/admin/reports/by-seller             | Operaciones por vendedor / comisiones         |
| GET    | /api/admin/reports/receivables            | Reporte de cobranza                           |
| GET    | /api/admin-tax/taxes                      | Listar impuestos configurados                 |
| GET    | /api/admin-promotions/promotions          | Listar promociones                            |

### Solo ADMIN

| Método    | Ruta                                      | Descripción                                   |
|-----------|-------------------------------------------|-----------------------------------------------|
| POST/PUT  | /api/admin/products                       | Crear / editar producto                       |
| DELETE    | /api/admin/products/:id                   | Eliminar producto                             |
| GET/POST/PUT | /api/admin/suppliers                   | Gestión de proveedores                        |
| GET/POST  | /api/admin/suppliers/:id/products         | Productos por proveedor                       |
| GET/POST/PUT | /api/admin/purchases                   | Órdenes de compra                             |
| PUT       | /api/admin/purchases/:id/receive          | Recibir orden (actualiza inventario + Kardex) |
| PUT       | /api/admin/purchases/:id/cancel           | Cancelar orden de compra                      |
| GET/POST/PUT | /api/admin/branches                    | Gestión de sucursales                         |
| GET       | /api/admin/reports/audit-logs             | Bitácora de reportes descargados              |
| GET       | /api/admin/security/cashier-access        | Log de accesos de cajeros                     |
| POST      | /api/admin/security/admin-access          | Log de accesos de admin/gerente               |
| POST      | /api/admin/security/audit-unlock          | Desbloqueo de auditoría                       |
| POST      | /api/admin/billing/global                 | Factura global (CFDI)                         |
| GET       | /api/admin/billing/history                | Historial de facturación                      |
| POST/PUT/DELETE | /api/admin-tax/taxes                 | Crear / editar / gestionar impuestos          |
| POST/PUT/PATCH  | /api/admin-promotions/promotions     | Crear / editar / activar promociones          |
| GET/POST/PUT | /api/admin/next-sku                    | SKU siguiente disponible                      |

---

## Roles y permisos

```
ADMIN
  └─ Acceso total al sistema
  └─ Gestión de sucursales, empleados, productos, impuestos
  └─ Facturación CFDI global e historial
  └─ Bitácoras de auditoría (reportes y accesos)
  └─ Cierre forzado de cajas
  └─ Sesión desplazada al abrir una nueva (sesión única)

GERENTE
  └─ Panel admin con visibilidad de ventas, inventario, empleados y reportes
  └─ Puede ajustar inventario, transferir stock y forzar cierre de caja
  └─ No puede crear productos, sucursales, impuestos ni facturar globalmente
  └─ Sesión desplazada al abrir una nueva (sesión única)

CAJERO
  └─ Solo accede a la terminal POS (/pos/*)
  └─ Abre y cierra su propia sesión de caja
  └─ Registra ventas, depósitos bancarios y devoluciones
  └─ Pago por efectivo, tarjeta y MercadoPago QR
  └─ Las operaciones de caja están bloqueadas al dispositivo (X-Device-Id)
  └─ Login por PIN (no contraseña)

CUSTOMER
  └─ Portal de autofacturación (/store/*)
  └─ Puede consultar y descargar sus facturas
  └─ Login por email + contraseña u OTP
```

---

## Seguridad

| Mecanismo           | Descripción                                                                      |
|---------------------|----------------------------------------------------------------------------------|
| JWT (8 h)           | Bearer token en `Authorization` header                                           |
| WebAuthn / FIDO2    | Segundo factor para ADMIN y GERENTE (Windows Hello, huella, llave de seguridad)  |
| OTP por email       | Fallback cuando no hay credencial WebAuthn disponible                            |
| PIN                 | Autenticación rápida de cajeros (hash con bcrypt)                                |
| Sesión única        | Al iniciar sesión, el JWT anterior de ADMIN/GERENTE queda inválido               |
| Device enforcement  | `X-Device-Id` único por navegador/dispositivo; las operaciones de caja lo validan|
| Rate limiting       | Login admin, facturación pública y descarga de CFDIs                             |
| Helmet              | CSP, X-Frame-Options, X-Content-Type-Options y otros headers HTTP                |
| CORS                | Restringido a `localhost:5173`, `pos-fmb.vercel.app`, `pos-lyfrgl.vercel.app`   |
| Audit logs          | Todo reporte descargado queda registrado con IP, usuario y filtros               |

---

## Variables de entorno

### Backend — `backend/.env`

```env
PORT=4000
NODE_ENV=development

# JWT
JWT_SECRET=escribe_aqui_una_clave_secreta_segura
JWT_EXPIRE=8h

# Base de datos SQL Server
DATABASE_URL="sqlserver://localhost:1433;database=POS_FMB_DEV;user=sa;password=TuPassword;trustServerCertificate=true"

# Facturación CFDI (Facturapi)
FACTURAPI_API_KEY=

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_SANDBOX=true
WEBHOOK_BASE_URL=https://tu-dominio.com

# SMTP (tickets y OTPs por email)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Datos fiscales (factura global)
CORPORATE_ZIP=

# Twilio (opcional — notificaciones SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

### Frontend — `frontend/.env`

```env
VITE_API_URL=http://localhost:4000
```

---

## Instalación y configuración

### Requisitos previos

- Node.js LTS
- SQL Server (local o en red)
- npm

### 1. Clonar y preparar

```bash
git clone <repo-url>
cd POS_LYFRGL
```

### 2. Backend

```bash
cd backend
npm install

# Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Generar cliente Prisma
npm run prisma:generate

# Correr migraciones
npm run prisma:migrate

# (Opcional) Cargar datos de prueba
npx ts-node prisma/seed.ts
```

### 3. Frontend

```bash
cd ../frontend
npm install

# Copiar y configurar variables de entorno
cp .env.example .env
# Editar VITE_API_URL
```

---

## Correr el proyecto

### Desarrollo

```bash
# Terminal 1 — Backend (hot-reload con nodemon)
cd backend
npm run dev

# Terminal 2 — Frontend (Vite HMR)
cd frontend
npm run dev
```

La API queda en `http://localhost:4000`.
El frontend en `http://localhost:5173`.

### Producción (backend con PM2)

```bash
cd backend
npm run build         # tsc + prisma generate → dist/

pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### Build del frontend

```bash
cd frontend
npm run build         # genera frontend/dist/
```

El backend sirve `frontend/dist/` como estático si la carpeta existe.

---

## Despliegue

| Capa       | Plataforma   | Notas                                                        |
|------------|--------------|--------------------------------------------------------------|
| Frontend   | Vercel       | `vercel.json` con SPA rewrite y headers de seguridad         |
| Backend    | VPS + PM2    | `ecosystem.config.js` en modo cluster, logs en `logs/`       |
| Reverse proxy | Nginx     | `nginx.conf` en la raíz del repositorio                      |
| Base de datos | SQL Server | `trustServerCertificate=true` para dev; TLS en producción   |

El frontend en Vercel apunta al backend en el VPS a través de `VITE_API_URL`.

---

## Convenciones del código

### Backend
- TypeScript estricto (`strict: true`, `noImplicitAny`, `noUnusedLocals`)
- Separación en capas: `routes → controllers → services → Prisma`
- Errores de negocio con clase `AppError`; errores Prisma capturados en el middleware global
- `snake_case` para columnas en SQL Server; `camelCase` en TypeScript (Prisma los mapea)

### Frontend
- Componentes en `PascalCase`, hooks con prefijo `use`
- Módulos por dominio: `admin/`, `pos/`, `ecommerce/`, `shared/`
- Lazy loading por módulo en el router raíz
- Interceptor Axios inyecta `Authorization` y `X-Device-Id` en cada request
- Device ID generado como UUID en `localStorage` al primer uso

---

## Scripts útiles

```bash
# Backend
npm run dev               # Dev con hot-reload
npm run build             # Compilar TypeScript
npm run start             # Iniciar desde dist/
npm run prisma:generate   # Regenerar cliente Prisma
npm run prisma:migrate    # Aplicar migraciones
npm run prisma:studio     # GUI para explorar la BD

# Frontend
npm run dev               # Servidor de desarrollo Vite
npm run build             # Build de producción
npm run preview           # Vista previa del build
npm run lint              # ESLint
```

---

## Estado del proyecto

### Funcionalidades completadas ✅

- [x] Autenticación multi-rol (JWT + WebAuthn + PIN + OTP)
- [x] Sesión única y device enforcement para caja
- [x] Terminal POS con búsqueda, carrito y checkout
- [x] Ventas en efectivo, tarjeta y MercadoPago QR
- [x] Apertura, cierre y corte parcial de caja
- [x] Depósitos bancarios desde caja
- [x] Devoluciones con reembolso y store credit
- [x] Panel admin completo (ventas, inventario, empleados, cajas)
- [x] Gestión de productos, categorías e impuestos
- [x] Proveedores y órdenes de compra con recepción de inventario
- [x] Kardex de movimientos de inventario
- [x] Transferencias de inventario entre sucursales
- [x] Sistema de promociones (descuento %, precio especial, N×M)
- [x] Listas de precios por cliente
- [x] Clientes con puntos de lealtad y crédito en tienda
- [x] Facturación CFDI individual y global (Facturapi)
- [x] Portal de autofacturación para clientes
- [x] Reportes con bitácora de auditoría
- [x] Bitácora de inicios de sesión (cajeros y admin)
- [x] Cierre forzado de caja remota
- [x] Healthcheck con verificación de conexión a BD
- [x] Gestión multi-sucursal

### En desarrollo / pendiente ⏳

- [ ] Jerarquía de categorías en la UI admin (modelo ya en BD)
- [ ] Listas de precios en la UI admin (modelo ya en BD)
- [ ] Integración Twilio para notificaciones SMS
- [ ] Tests automatizados (unitarios e integración)
- [ ] Panel de métricas por sucursal en el dashboard

---

## Autor

**LYFRGL Solutions**
