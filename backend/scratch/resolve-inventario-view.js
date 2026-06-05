const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/admin/InventarioView.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to \n
content = content.replace(/\r\n/g, '\n');

// 1. Resolve Conflict 1 (Imports)
const conflict1 = `<<<<<<< ours
import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Printer, X, Plus } from "lucide-react";
=======
import React, { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, BadgePercent, Plus, X } from "lucide-react";
>>>>>>> theirs`;

const resolvedConflict1 = `import React, { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, Printer, X, Plus, BadgePercent } from "lucide-react";`;

content = content.replace(conflict1, resolvedConflict1);

// 2. Resolve Conflict 2 (Interfaces, helper, states)
const resolvedConflict2 = `interface ProductDetail {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: number;
  sellPrice: number;
  active: boolean;
  trackingType: string;
  isReturnable: boolean;
  returnWindowDays: number;
  createdAt: string;
  updatedAt: string;
  inventories: {
    id: number;
    branch: string;
    branchId: number;
    quantity: number;
    minStock: number;
    maxStock: number;
  }[];
  recentKardex: {
    id: number;
    date: string;
    branch: string;
    user: string;
    movementType: string;
    quantityChange: number;
    balanceAfter: number;
    reason: string | null;
  }[];
}

interface SupplierOption {
  id: number;
  name: string;
}

const subModalStyle: React.CSSProperties = {
  ...({} as any),
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 300,
  padding: 20,
};

interface TaxOption {
  id: number;
  name: string;
  description: string | null;
  rate: number | string;
  active: boolean;
}

interface TaxListResponse {
  data: TaxOption[];
}

interface ProductTaxResponse {
  data: {
    productId: number;
    taxIds: number[];
    taxes: TaxOption[];
  };
}

const emptyForm = { sku: "", barcode: "", name: "", description: "", costPrice: "", sellPrice: "" };

const getErrorMessage = (err: unknown, fallback: string) => {
  if (typeof err === "object" && err !== null && "response" in err) {
    const apiError = err as { response?: { data?: { message?: string } } };
    return apiError.response?.data?.message || fallback;
  }

  return fallback;
};

const extractTaxOptions = (payload: TaxListResponse | { data?: unknown }) => {
  return Array.isArray(payload.data) ? payload.data as TaxOption[] : [];
};

const formatTaxRate = (rate: number | string) => {
  const value = Number(rate);
  const percent = Number.isFinite(value) ? value * 100 : 0;
  return \`\${percent.toLocaleString("es-MX", {
    minimumFractionDigits: percent % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  })}%\`;
};`;

const conflict2StartIdx = content.indexOf('<<<<<<< ours\ninterface ProductDetail {');
const conflict2EndIdx = content.indexOf('>>>>>>> theirs\n};', conflict2StartIdx);

if (conflict2StartIdx !== -1 && conflict2EndIdx !== -1) {
  content = content.substring(0, conflict2StartIdx) + resolvedConflict2 + content.substring(conflict2EndIdx + '>>>>>>> theirs\n};'.length);
} else {
  console.error("Conflict 2 indices not found!");
  process.exit(1);
}

// Remove unused Feature 4 state declarations
content = content.replace(
  /.*Feature 4: create product[\s\S]*?const \[createOpen, setCreateOpen\] = useState\(false\);[\s\S]*?const \[newProd, setNewProd\] = useState\([\s\S]*?\);[\s\S]*?const \[createError, setCreateError\] = useState<string \| null>\(null\);/,
  ''
);

// Delete the old submitCreateProduct function
content = content.replace(
  /.*Feature 4: create product[\s\S]*?const submitCreateProduct = async \(\) => {[\s\S]*?};/,
  ''
);

// Update handleEdit and handleToggleActive signatures to accept ProductDetail as well
content = content.replace(
  'const handleEdit = (p: ProductRow) => {',
  `const handleEdit = (p: ProductRow | ProductDetail) => {
    closeDetail();`
);

content = content.replace(
  'const handleToggleActive = async (p: ProductRow) => {',
  `const handleToggleActive = async (p: ProductRow | ProductDetail) => {
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
  };

  const old_handleToggleActive_to_remove = async (p: ProductRow) => {`
);

// Remove the old duplicate handleToggleActive
const oldDuplicate = `  const old_handleToggleActive_to_remove = async (p: ProductRow) => {
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
content = content.replace(oldDuplicate, '');

// 4. Resolve Conflict 3 & 4 (Render method merge)
const firstRenderConflictIdx = content.indexOf('<<<<<<< ours\n        subtitle={activeTab === "existencias" ? `Existencias ${scope}` : undefined}\n      />');
const lastRenderConflictIdx = content.indexOf('>>>>>>> theirs\n        </div>\n      )}\n    </div>\n  );\n};\n\nconst styles');

if (firstRenderConflictIdx === -1 || lastRenderConflictIdx === -1) {
  console.error("Render conflict boundary indices not found!");
  process.exit(1);
}

const dividerIndex = content.indexOf('\n=======\n', firstRenderConflictIdx);
if (dividerIndex === -1 || dividerIndex > lastRenderConflictIdx) {
  console.error("Conflict 3 separator not found!");
  process.exit(1);
}

let oursBlock = content.substring(firstRenderConflictIdx, dividerIndex);
oursBlock = oursBlock.replace('<<<<<<< ours\n', '');

// Replace button click
oursBlock = oursBlock.replace(
  /onClick=\{\(\) => \{ setCreateError\(null\); setCreateOpen\(true\); \}\}/g,
  'onClick={handleOpenCreate}'
);

// Replace detail modal footer
const detailFooterOld = `            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e2e8f0" }}>
              <button onClick={closeDetail} style={ui.ghostBtn}>Cerrar</button>
              {selectedProduct && (
                <button onClick={printProduct} style={ui.primaryBtn}>
                  <Printer size={15} /> Imprimir ficha
                </button>
              )}
            </div>`;

const detailFooterNew = `            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e2e8f0", alignItems: "center" }}>
              {selectedProduct && (
                <>
                  <button
                    onClick={() => handleToggleActive(selectedProduct)}
                    style={{
                      ...ui.ghostBtn,
                      color: selectedProduct.active ? "#b91c1c" : "#15803d",
                      borderColor: selectedProduct.active ? "#fca5a5" : "#86efac",
                      marginRight: "auto"
                    }}
                  >
                    {selectedProduct.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => handleEdit(selectedProduct)}
                    style={{
                      ...ui.ghostBtn,
                      color: "#2563eb",
                      borderColor: "#93c5fd",
                    }}
                  >
                    Editar producto
                  </button>
                  <button onClick={printProduct} style={ui.primaryBtn}>
                    <Printer size={15} /> Imprimir ficha
                  </button>
                </>
              )}
              <button onClick={closeDetail} style={ui.ghostBtn}>Cerrar</button>
            </div>`;

oursBlock = oursBlock.replace(detailFooterOld, detailFooterNew);

// Replace createOpen modal block with showForm modal block
const createModalIndex = oursBlock.indexOf('createOpen');
if (createModalIndex === -1) {
  console.error("createOpen not found in oursBlock!");
  process.exit(1);
}

const createModalStart = oursBlock.lastIndexOf('{', createModalIndex);
if (createModalStart === -1) {
  console.error("Create modal start bracket not found!");
  process.exit(1);
}

let oursBlockClean = oursBlock.substring(0, createModalStart);

const showFormModal = `      {/* =================== MODAL: ALTA Y EDICIÓN (IMPUESTOS) =================== */}
      {showForm && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, maxWidth: 600 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editingId !== null ? "Editar producto" : "Registrar nuevo producto"}
              </span>
              <button type="button" style={ui.linkBtn} onClick={closeForm}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>SKU *</label>
                  <input
                    style={{ ...ui.input, backgroundColor: editingId !== null ? "#f1f5f9" : "#ffffff" }}
                    value={form.sku}
                    onChange={set("sku")}
                    placeholder="SKU-XXX"
                    autoFocus={editingId === null}
                    readOnly={editingId !== null}
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Código de barras</label>
                  <input style={ui.input} value={form.barcode} onChange={set("barcode")} placeholder="7501000000000" />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del producto" />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Descripción</label>
                <textarea
                  style={{ ...ui.input, resize: "vertical", minHeight: 60 }}
                  value={form.description}
                  onChange={set("description")}
                  placeholder="Detalle o descripción opcional"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Precio Costo ($) *</label>
                  <input style={ui.input} value={form.costPrice} onChange={set("costPrice")} placeholder="0.00" />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Precio Venta ($) *</label>
                  <input style={ui.input} value={form.sellPrice} onChange={set("sellPrice")} placeholder="0.00" />
                </div>
              </div>

              {editingId !== null && (
                <div style={styles.taxSection}>
                  <div style={styles.taxHeader}>
                    <div style={styles.taxTitleWrap}>
                      <BadgePercent size={16} color="#1e3a8a" />
                      <span style={styles.taxTitle}>Impuestos aplicables</span>
                    </div>
                    {!taxLoading && !taxError && (
                      <span style={styles.taxCounter}>
                        {taxOptions.filter((tax) => selectedTaxIds.includes(tax.id)).length} seleccionado(s)
                      </span>
                    )}
                  </div>

                  {taxLoading && <p style={styles.taxMuted}>Cargando impuestos aplicables...</p>}

                  {!taxLoading && taxError && (
                    <div style={styles.taxErrorBox}>
                      <span>{taxError}</span>
                      <button type="button" style={ui.linkBtn} onClick={() => void loadProductTaxes(editingId)}>
                        Reintentar
                      </button>
                    </div>
                  )}

                  {!taxLoading && !taxError && taxOptions.length === 0 && (
                    <p style={styles.taxMuted}>No hay impuestos activos para asignar.</p>
                  )}

                  {!taxLoading && !taxError && taxOptions.length > 0 && (
                    <div style={styles.taxGrid}>
                      {taxOptions.map((tax) => {
                        const checked = selectedTaxIds.includes(tax.id);
                        return (
                          <label
                            key={tax.id}
                            style={{
                              ...styles.taxOption,
                              borderColor: checked ? "#93c5fd" : "#e2e8f0",
                              backgroundColor: checked ? "#eff6ff" : "#ffffff",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={() => toggleTax(tax.id)}
                              style={styles.taxCheckbox}
                            />
                            <span style={styles.taxOptionText}>
                              <span style={styles.taxOptionName}>{tax.name}</span>
                              <span style={styles.taxOptionMeta}>{formatTaxRate(tax.rate)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 14 }}>{formError}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : "Guardar producto"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}`;

// We append the closing tags of the render function
const resolvedConflict3 = oursBlockClean + showFormModal + '\n        </div>\n      )}\n    </div>\n  );\n};\n\n';

const beforeConflict3 = content.substring(0, firstRenderConflictIdx);
// Slice starting after final conflict ending and closing tags
const afterConflict3 = content.substring(lastRenderConflictIdx + '>>>>>>> theirs\n        </div>\n      )}\n    </div>\n  );\n};\n\n'.length);

content = beforeConflict3 + resolvedConflict3 + afterConflict3;

// Convert line endings back to CRLF
content = content.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully resolved all conflicts in InventarioView.tsx");
