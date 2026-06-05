const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/admin/InventarioView.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to \n
content = content.replace(/\r\n/g, '\n');
const lines = content.split('\n');

// Find all conflict marker indices
const markerIndices = [];
lines.forEach((line, idx) => {
  if (line.startsWith('<<<<<<<') || line.startsWith('=======') || line.startsWith('>>>>>>>')) {
    markerIndices.push({
      lineNum: idx + 1,
      text: line
    });
  }
});

console.log("Found conflict markers:", markerIndices);

if (markerIndices.length !== 12) {
  console.error("Expected exactly 12 conflict markers (4 conflicts), found " + markerIndices.length);
  process.exit(1);
}

// Conflict 1: lines 1 to 7 (index 0 to 6 in lines array)
// Resolve by replacing lines 0-6 with resolved imports
const resolvedImports = [
  'import React, { useEffect, useRef, useState, useCallback } from "react";',
  'import { AlertTriangle, Printer, X, Plus, BadgePercent } from "lucide-react";'
];

// Conflict 2: lines 40 to 133 (index 39 to 132 in lines array)
// Resolve by replacing lines 39-132 with resolved interfaces/helpers/states
const resolvedConflict2 = [
  'interface ProductDetail {',
  '  id: number;',
  '  sku: string;',
  '  barcode: string | null;',
  '  name: string;',
  '  description: string | null;',
  '  costPrice: number;',
  '  sellPrice: number;',
  '  active: boolean;',
  '  trackingType: string;',
  '  isReturnable: boolean;',
  '  returnWindowDays: number;',
  '  createdAt: string;',
  '  updatedAt: string;',
  '  inventories: {',
  '    id: number;',
  '    branch: string;',
  '    branchId: number;',
  '    quantity: number;',
  '    minStock: number;',
  '    maxStock: number;',
  '  }[];',
  '  recentKardex: {',
  '    id: number;',
  '    date: string;',
  '    branch: string;',
  '    user: string;',
  '    movementType: string;',
  '    quantityChange: number;',
  '    balanceAfter: number;',
  '    reason: string | null;',
  '  }[];',
  '}',
  '',
  'interface SupplierOption {',
  '  id: number;',
  '  name: string;',
  '}',
  '',
  'const subModalStyle: React.CSSProperties = {',
  '  ...({} as any),',
  '  position: "fixed",',
  '  inset: 0,',
  '  backgroundColor: "rgba(15,23,42,0.55)",',
  '  display: "flex",',
  '  alignItems: "center",',
  '  justifyContent: "center",',
  '  zIndex: 300,',
  '  padding: 20,',
  '};',
  '',
  'interface TaxOption {',
  '  id: number;',
  '  name: string;',
  '  description: string | null;',
  '  rate: number | string;',
  '  active: boolean;',
  '}',
  '',
  'interface TaxListResponse {',
  '  data: TaxOption[];',
  '}',
  '',
  'interface ProductTaxResponse {',
  '  data: {',
  '    productId: number;',
  '    taxIds: number[];',
  '    taxes: TaxOption[];',
  '  };',
  '}',
  '',
  'const emptyForm = { sku: "", barcode: "", name: "", description: "", costPrice: "", sellPrice: "" };',
  '',
  'const getErrorMessage = (err: unknown, fallback: string) => {',
  '  if (typeof err === "object" && err !== null && "response" in err) {',
  '    const apiError = err as { response?: { data?: { message?: string } } };',
  '    return apiError.response?.data?.message || fallback;',
  '  }',
  '',
  '  return fallback;',
  '};',
  '',
  'const extractTaxOptions = (payload: TaxListResponse | { data?: unknown }) => {',
  '  return Array.isArray(payload.data) ? payload.data as TaxOption[] : [];',
  '};',
  '',
  'const formatTaxRate = (rate: number | string) => {',
  '  const value = Number(rate);',
  '  const percent = Number.isFinite(value) ? value * 100 : 0;',
  '  return `${percent.toLocaleString("es-MX", {',
  '    minimumFractionDigits: percent % 1 === 0 ? 0 : 2,',
  '    maximumFractionDigits: 4,',
  '  })}%`;',
  '};'
];

// Conflict 3: lines 632 to 882 (index 631 to 881 in lines array)
// Resolve by keeping the ours block, but:
// 1. Changing `() => { setCreateError(null); setCreateOpen(true); }` to `handleOpenCreate`
// 2. Discarding the theirs block
const oursBlock3Lines = lines.slice(632, 820); // index 632 to 819 (lines 633 to 820)
const resolvedConflict3 = oursBlock3Lines.map(line => {
  if (line.includes('() => { setCreateError(null); setCreateOpen(true); }')) {
    return line.replace('() => { setCreateError(null); setCreateOpen(true); }', 'handleOpenCreate');
  }
  return line;
});

// Conflict 4: lines 919 to 1541 (index 918 to 1540 in lines array)
// Resolve by:
// 1. Getting ours block lines (lines 920 to 1380, i.e., indices 919 to 1379)
// 2. Editing detail modal footer in ours block
// 3. Removing createOpen modal block from ours block
// 4. Appending showForm modal from theirs block (lines 1410 to 1540, i.e., indices 1409 to 1539)
const oursBlock4Lines = lines.slice(919, 1380);

// Find and replace footer in oursBlock4Lines
let footerStartIndex = -1;
let footerEndIndex = -1;
for (let i = 0; i < oursBlock4Lines.length; i++) {
  if (oursBlock4Lines[i].includes('{/* Footer */}')) {
    footerStartIndex = i;
  }
  if (footerStartIndex !== -1 && oursBlock4Lines[i].includes('</div>') && footerEndIndex === -1 && i > footerStartIndex + 2) {
    footerEndIndex = i;
  }
}

console.log("Footer bounds in oursBlock4Lines:", footerStartIndex, footerEndIndex);

const detailFooterNew = [
  '            {/* Footer */}',
  '            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e2e8f0", alignItems: "center" }}>',
  '              {selectedProduct && (',
  '                <>',
  '                  <button',
  '                    onClick={() => handleToggleActive(selectedProduct)}',
  '                    style={{',
  '                      ...ui.ghostBtn,',
  '                      color: selectedProduct.active ? "#b91c1c" : "#15803d",',
  '                      borderColor: selectedProduct.active ? "#fca5a5" : "#86efac",',
  '                      marginRight: "auto"',
  '                    }}',
  '                  >',
  '                    {selectedProduct.active ? "Desactivar" : "Activar"}',
  '                  </button>',
  '                  <button',
  '                    onClick={() => handleEdit(selectedProduct)}',
  '                    style={{',
  '                      ...ui.ghostBtn,',
  '                      color: "#2563eb",',
  '                      borderColor: "#93c5fd",',
  '                    }}',
  '                  >',
  '                    Editar producto',
  '                  </button>',
  '                  <button onClick={printProduct} style={ui.primaryBtn}>',
  '                    <Printer size={15} /> Imprimir ficha',
  '                  </button>',
  '                </>',
  '              )}',
  '              <button onClick={closeDetail} style={ui.ghostBtn}>Cerrar</button>',
  '            </div>'
];

if (footerStartIndex !== -1 && footerEndIndex !== -1) {
  oursBlock4Lines.splice(footerStartIndex, footerEndIndex - footerStartIndex + 1, ...detailFooterNew);
} else {
  console.error("Could not find detail modal footer in ours block 4!");
  process.exit(1);
}

// Find createOpen modal in oursBlock4Lines and replace with showForm modal from theirsBlock
let createOpenStartIndex = -1;
for (let i = 0; i < oursBlock4Lines.length; i++) {
  if (oursBlock4Lines[i].includes('=================== MODAL: CREAR PRODUCTO ===================')) {
    createOpenStartIndex = i - 1; // start of comment block or condition
    break;
  }
}
if (createOpenStartIndex === -1) {
  for (let i = 0; i < oursBlock4Lines.length; i++) {
    if (oursBlock4Lines[i].includes('{createOpen && (')) {
      createOpenStartIndex = i;
      break;
    }
  }
}

console.log("createOpen modal start index in oursBlock4Lines:", createOpenStartIndex);

if (createOpenStartIndex === -1) {
  console.error("Could not find createOpen modal start in ours block 4!");
  process.exit(1);
}

// Remove createOpen modal from oursBlock4Lines (from createOpenStartIndex to the end of oursBlock4Lines)
oursBlock4Lines.splice(createOpenStartIndex);

// Extract showForm modal from theirsBlock (lines 1410 to 1540, which are indices 1409 to 1539)
const showFormModalLines = lines.slice(1409, 1540);

// Combine oursBlock4Lines and showFormModalLines
const resolvedConflict4 = [...oursBlock4Lines, ...showFormModalLines];

// Now construct the final lines array
const finalLines = [];

// Part 1: before Conflict 1
finalLines.push(...lines.slice(0, 0)); // empty

// Add resolved Conflict 1
finalLines.push(...resolvedImports);

// Part 2: between Conflict 1 and Conflict 2
finalLines.push(...lines.slice(7, 39));

// Add resolved Conflict 2
finalLines.push(...resolvedConflict2);

// Part 3: between Conflict 2 and Conflict 3
finalLines.push(...lines.slice(133, 631));

// Add resolved Conflict 3
finalLines.push(...resolvedConflict3);

// Part 4: between Conflict 3 and Conflict 4
finalLines.push(...lines.slice(882, 918));

// Add resolved Conflict 4
finalLines.push(...resolvedConflict4);

// Part 5: after Conflict 4
finalLines.push(...lines.slice(1541));

let newContent = finalLines.join('\n');

// 5. Replace handleEdit and handleToggleActive signatures outside of conflicts
newContent = newContent.replace(
  'const handleEdit = (p: ProductRow) => {',
  `const handleEdit = (p: ProductRow | ProductDetail) => {
    closeDetail();`
);

const oldHandleToggleActive = `  const handleToggleActive = async (p: ProductRow) => {
    try {
      if (p.active) {
        // Soft delete (desactivar)
        await api.delete(\`/api/admin/products/\${p.id}\`);
      } else {
        // Activar (usando PUT con active: true)
        await api.put(\`/api/admin/products/\${p.id}\`, {
          name: p.name,
          description: p.description || undefined,
          barcode: p.barcode || undefined,
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          active: true,
        });
      }
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "No se pudo cambiar el estado del producto."));
    }
  };`;

const newHandleToggleActive = `  const handleToggleActive = async (p: ProductRow | ProductDetail) => {
    try {
      if (p.active) {
        // Soft delete (desactivar)
        await api.delete(\`/api/admin/products/\${p.id}\`);
      } else {
        // Activar (usando PUT con active: true)
        await api.put(\`/api/admin/products/\${p.id}\`, {
          name: p.name,
          description: p.description || undefined,
          barcode: p.barcode || undefined,
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          active: true,
        });
      }
      if (detailOpen && selectedProduct?.id === p.id) {
        await fetchDetail(p.id);
      }
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "No se pudo cambiar el estado del producto."));
    }
  };`;

newContent = newContent.replace(oldHandleToggleActive, newHandleToggleActive);

// Convert line endings back to CRLF
newContent = newContent.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, newContent, 'utf8');
console.log("Successfully resolved and merged InventarioView.tsx line-by-line!");
