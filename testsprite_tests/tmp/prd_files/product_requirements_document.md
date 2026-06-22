# Product Requirements Document (PRD): Punto de Venta LYFRGL Solutions

## 1. Product Overview & Purpose
**Punto de Venta LYFRGL Solutions** is a comprehensive, multi-branch Point of Sale (POS) and Enterprise Resource Planning (ERP) web application. Its primary purpose is to centralize and streamline business operations for retail environments. It integrates sales processing, inventory management, employee tracking, customer loyalty, and financial auditing into a single, cohesive platform. 

By automating and tracking both the flow of goods (Kardex) and the flow of cash (Cash Sessions & Cuts), the system provides business owners with real-time visibility, operational control, and robust reporting across multiple physical branch locations.

---

## 2. Target Audience
- **Cashiers/Sales Associates:** Need a fast, intuitive interface to process transactions, apply discounts, and manage daily cash registers.
- **Store Managers:** Require tools to oversee branch inventory, manage employee shifts (cash sessions), authorize returns, and handle bank deposits.
- **Inventory/Purchasing Managers:** Rely on the system to track stock levels, issue purchase orders to suppliers, and monitor product movements via Kardex.
- **Business Owners/Administrators:** Need high-level reporting, audit logs, and global configuration capabilities (taxes, promotions, multi-branch oversight).

---

## 3. Technology Stack & Architecture
The system is built on a modern, robust web stack:
- **Frontend:** React 19 (via Vite) with TypeScript, utilizing React Router for navigation, Lucide React for iconography, and jsPDF for document generation (receipts/reports).
- **Backend:** Node.js with Express, written in TypeScript. 
- **Database:** Microsoft SQL Server, orchestrated via Prisma ORM for type-safe database access and schema management.
- **Integrations:** 
  - **Mercado Pago:** For processing digital payments and generating QR codes.
  - **Nodemailer:** For sending automated emails (e.g., electronic receipts/CFDI).
  - **Security:** JWT for authentication, bcrypt for password hashing, and Helmet for HTTP header security.

---

## 4. Core Features

### 4.1. Multi-Branch Architecture
- **Centralized Data:** All branches operate from a single database, allowing for cross-branch inventory visibility and centralized customer databases.
- **Branch-Specific Operations:** Sales, cash sessions, and inventory tracking are tightly scoped to specific branches to ensure accurate local reporting.

### 4.2. Role-Based Access & Authentication
- **User Roles:** Distinct roles (e.g., Admin, Manager, Cashier) dictate what features and data a user can access.
- **Authentication:** Users log in via email/password. A fast "PIN Code" system is also supported for quick operations at the POS terminal.
- **Commission & Salary Tracking:** The system tracks base salaries and commission rates for sales staff.

### 4.3. Point of Sale (POS) & Checkout
- **Transaction Processing:** Fast barcode scanning (SKU/Barcode) and product lookup.
- **Payment Methods:** Support for Cash, Credit/Debit Cards, Mercado Pago (digital/QR), and Store Credit.
- **Dynamic Pricing & Taxes:** Automatic calculation of product-specific taxes (e.g., IVA), sub-totals, and change due.
- **Promotions Engine:** Support for complex promotions (e.g., buy-X-get-Y, percentage discounts, special pricing) based on timeframes and specific product groups.
- **Invoicing:** Generates invoice numbers and can capture CFDI email addresses for electronic tax receipts.

### 4.4. Inventory & Purchasing Management
- **Product Catalog:** Detailed product tracking including cost price, selling price, return policies, and SAT tax keys.
- **Kardex (Inventory Tracking):** A strict, immutable ledger of all product movements (sales, returns, restocks, adjustments) to ensure perfect inventory accountability.
- **Supplier & Purchase Orders:** Create, track, and receive purchase orders from suppliers. Updating a PO to "Received" automatically updates inventory and Kardex.
- **Low Stock Alerts:** Tracks minimum and maximum stock thresholds per branch.

### 4.5. Cash Management & Security
- **Cash Sessions (Cajas):** Cashiers must open a session with an initial float. All transactions are tied to this session.
- **Cash Cuts (Cortes de Caja):** At the end of a shift, the system calculates expected cash vs. declared cash, highlighting any discrepancies (shortages/overages).
- **Bank Deposits:** Managers can record and track physical cash deposits made to the bank, closing the loop on cash management.

### 4.6. Returns & Customer Service
- **Return Authorization:** Robust return handling that supports returning to inventory or writing off damaged goods. High-value returns require manager authorization.
- **Customer Profiles:** Tracks customer details, purchase history, and tax (RFC/CFDI) information.
- **Loyalty Program:** Customers can earn and redeem points on purchases, or maintain a Store Credit balance.

### 4.7. Reporting & Auditing
- **Comprehensive Reports:** Real-time generation of sales reports, inventory valuations, and cash flow summaries.
- **Exporting:** Reports can be exported to PDF (via jsPDF) for physical record-keeping.
- **Audit Logs:** The system logs critical actions (e.g., when a user runs a specific report) including IP addresses and timestamps to prevent internal fraud.

---

## 5. How It Works (Typical Daily Workflow)

1. **Store Opening (Manager/Cashier):**
   - An employee logs in using their credentials or PIN.
   - They open a **Cash Session**, declaring the initial cash amount in the register.
2. **Daily Operations (Cashier):**
   - Customers bring items to the counter. The cashier scans products.
   - The system calculates totals, applying any active **Promotions** or **Taxes**.
   - The customer pays via cash, card, or Mercado Pago. If applicable, loyalty points are awarded.
   - Inventory is immediately deducted, and a **Kardex** entry is logged.
3. **Inventory Management (Manager):**
   - A delivery arrives from a **Supplier**. The manager pulls up the pending **Purchase Order**.
   - They mark the items as received, which automatically increments the branch's inventory.
4. **Store Closing (Manager/Cashier):**
   - The cashier declares the physical cash in the drawer to initiate a **Cash Cut**.
   - The system compares the declared amount to the expected amount (Initial Cash + Cash Sales - Refunds).
   - The **Cash Session** is closed.
   - The manager records a **Bank Deposit** for the day's earnings, ensuring the physical cash is tracked until it hits the corporate bank account.
