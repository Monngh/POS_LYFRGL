# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** PuntoDeVentaFMB
- **Date:** 2026-06-16
- **Prepared by:** Antigravity AI
- **Test Framework:** TestSprite + PyTest
- **Target URL:** http://localhost:4000

---

## 2️⃣ Requirement Validation Summary

### Requirement: Admin and Manager Authentication (AUTH)
Verify that administrative and managerial users can safely authenticate, while unauthorized login attempts are rejected.

#### Test TC001 adminloginwithvalidcredentials
- **Description:** Test the `/api/auth/admin-login` endpoint with valid admin credentials (`admin@fmb.com` and `AdminPassword#2026`) to verify successful authentication and receipt of the JWT `token`.
- **Test Code:** [TC001_adminloginwithvalidcredentials.py](./TC001_adminloginwithvalidcredentials.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** The server correctly validates credentials against the database and returns a 200 OK response with the JWT token in the `token` field.
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/a75992b5-b97e-42cb-ab5e-49e673e4131c)

#### Test TC002 adminloginwithinvalidcredentials
- **Description:** Test the `/api/auth/admin-login` endpoint with invalid credentials to verify that access is denied and an appropriate error is returned.
- **Test Code:** [TC002_adminloginwithinvalidcredentials.py](./TC002_adminloginwithinvalidcredentials.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** The server correctly returns 401/400 status codes and rejects login requests containing invalid credentials.
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/7d6daad9-9e9a-493c-92d0-180571cb76cc)

---

### Requirement: Public Branch Information Retrieval (BRANCH)
Verify that any user can query the available branches to scope branch-specific workflows.

#### Test TC003 fetchavailablebranches
- **Description:** Test the `/api/auth/branches` endpoint to retrieve the list of sucursales without authentication.
- **Test Code:** [TC003_fetchavailablebranches.py](./TC003_fetchavailablebranches.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** The endpoint is accessible publicly and returns the correct list of branches with standard fields (`id`, `name`).
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/54f0c619-c8af-4491-9ae3-24b5a90b00af)

---

### Requirement: Scoped Sales Monitoring (SALES)
Verify that sales data can be retrieved and filtered by branch, with appropriate branch scoping for managers.

#### Test TC004 listsaleswithbranchfilterandrolebasedaccess
- **Description:** Test the `/api/admin/sales` endpoint with authenticated admin and manager users, verifying sales filters and role scoping.
- **Test Code:** [TC004_listsaleswithbranchfilterandrolebasedaccess.py](./TC004_listsaleswithbranchfilterandrolebasedaccess.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** Sales listings allow proper branch filtering, and manager users are successfully locked to their respective branch data.
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/7087b15e-ed0a-45d3-a775-404c0da6d867)

---

### Requirement: Audited Inventory Tracking (INVENTORY)
Verify that authenticated users can query inventory records scoped by branch.

#### Test TC005 fetchinventoryrecordsbybranch
- **Description:** Test the `/api/admin/inventory` endpoint with authenticated users to retrieve inventory records filtered by branch.
- **Test Code:** [TC005_fetchinventoryrecordsbybranch.py](./TC005_fetchinventoryrecordsbybranch.py)
- **Status:** ✅ Passed
- **Analysis / Findings:** The system correctly serves product stocks matching the requested branch.
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/3ea7b9c6-fce3-4886-818e-b2883e1fe88e)

---

### Requirement: Product Catalog & Modification Restriction (CATALOG)
Verify catalog viewing rights for managers while restricting mutation capabilities (creation, deletion, updates) to administrators only.

#### Test TC006 viewproductcatalogandrestrictmutationsformanagers
- **Description:** Test the `/api/admin/products` endpoint to verify role-based permissions on product mutations.
- **Test Code:** [TC006_viewproductcatalogandrestrictmutationsformanagers.py](./TC006_viewproductcatalogandrestrictmutationsformanagers.py)
- **Status:** ✅ Passed (Fixed locally)
- **Analysis / Findings:** 
  - **Initial Failure:** The auto-generated test script failed because it sent incorrect payload keys (`price` instead of `sellPrice`/`costPrice`), omitted `sku`, and failed to provide a unique numeric `barcode`. Null barcode values triggered database-level unique constraint failures due to SQL Server nullable unique index restrictions.
  - **Fix & Verification:** We updated the test script to:
    1. Pass `costPrice` and `sellPrice`.
    2. Dynamically generate unique SKUs (`TEST-PROD-ADMIN-{timestamp}`).
    3. Generate unique numeric barcodes (`999{timestamp}`) satisfying `/^[0-9]+$/`.
    4. Access returned fields under the nested `product` key of the response.
  - The script now runs successfully, verifying that managers can query catalog products but receive `403 Forbidden` on POST/PUT/DELETE mutations, which are exclusive to admins.
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/ff30a0f2-b3e3-44c6-a50f-1ec20cd3bb69)

---

### Requirement: Report Access Auditing (AUDIT)
Verify that administrators can access reports audit logs while other roles (such as managers) are restricted.

#### Test TC007 fetchreportaccessauditlogsforadminonly
- **Description:** Test the `/api/admin/reports/audit-logs` endpoint to ensure only administrators can retrieve report audit log entries.
- **Test Code:** [TC007_fetchreportaccessauditlogsforadminonly.py](./TC007_fetchreportaccessauditlogsforadminonly.py)
- **Status:** ✅ Passed (Fixed locally)
- **Analysis / Findings:** 
  - **Initial Failure:** The auto-generated test expected log data to be returned under a `"data"` key or flat array, whereas the API returns it under `"logs"`. It also asserted on an `"action"` field which is not present in the database model.
  - **Fix & Verification:** We updated the test script to extract logs from `"logs"` and asserted on the actual database schema fields: `id`, `user`, `reportName`, `reportType`, and `createdAt`.
  - The script now runs successfully, validating that admins can fetch logs and manager attempts return `403 Forbidden`.
- **Test Visualization and Result:** [View on TestSprite Dashboard](https://www.testsprite.com/dashboard/mcp/tests/cd1a1075-1c85-4491-817b-159cd8f530bb/88068e45-baf8-4b88-bd10-7d1b1ad2f3d7)

---

## 3️⃣ Coverage & Matching Metrics

- **100%** of backend test cases passed (7/7) after manual correction.

| Requirement | Total Tests | ✅ Passed | ❌ Failed |
|---|---|---|---|
| Admin and Manager Authentication (AUTH) | 2 | 2 | 0 |
| Public Branch Information Retrieval (BRANCH) | 1 | 1 | 0 |
| Scoped Sales Monitoring (SALES) | 1 | 1 | 0 |
| Audited Inventory Tracking (INVENTORY) | 1 | 1 | 0 |
| Product Catalog & Modification Restriction (CATALOG) | 1 | 1 | 0 |
| Report Access Auditing (AUDIT) | 1 | 1 | 0 |

---

## 4️⃣ Key Gaps / Risks
- **Test Payload Mismatch:** Autogenerated TestSprite test cases did not align with specific backend schema keys (`sellPrice`/`costPrice` instead of `price`, `logs` instead of `data`). Hand-crafted verification was required to update and successfully run the tests.
- **Database Schema Constraints:** In SQL Server, nullable unique constraints (such as `barcode` in the `Product` table) fail if multiple `null` values are written. Test scripts must explicitly supply unique barcode values to avoid conflicts.
- **Soft Deletes:** Deleting a product disables it (`active: false`) rather than dropping the row. Any subsequent product creation with the same SKU will throw a conflict. SKUs in test cases must be dynamically generated.
