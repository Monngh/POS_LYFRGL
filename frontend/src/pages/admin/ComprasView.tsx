import React, { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, CheckCircle2, Package, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import api from "../../services/api";
import {
  collectRoundedDecimalMessages,
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  type DecimalFieldValue,
  validateDecimalField,
} from "../../utils/decimalInput";
import { normalizeIntegerInput, validateInteger, validateReference } from "../../utils/formValidation";
import {
  ui,
  type ViewProps,
  Panel,
  TableState,
  SectionHeader,
  Badge,
  FilterSelect,
  Toolbar,
  money,
  fmtDate,
  fmtTime,
  useMediaQuery,
} from "./shared";

interface BranchOption {
  id: number;
  name: string;
}
interface ProductOption {
  id: number;
  sku: string;
  name: string;
  costPrice: number;
}
interface SupplierOption {
  id: number;
  name: string;
}
interface PurchaseRow {
  id: number;
  reference: string;
  purchaseDate: string;
  supplier: { id: number; name: string };
  branch: { id: number; name: string };
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string;
  details: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitCost: number;
    subtotal: number;
    product: { id: number; sku: string; name: string };
  }>;
  createdByUser: { id: number; name: string };
}

interface Line {
  productId: string;
  quantity: string;
  unitCost: string;
}

type TopFieldErrors = Partial<Record<"branchId" | "supplierId" | "reference" | "notes", string>>;
type LineFieldErrors = Record<number, Partial<Record<keyof Line, string>>>;

interface ProductTaxEntry {
  id: number;
  name: string;
  rate: number;
}

const newLine = (): Line => ({ productId: "", quantity: "", unitCost: "" });
const MAX_PURCHASE_QUANTITY = 100_000;
const MAX_PURCHASE_UNIT_COST = 1_000_000;

const statusTone = (s: string) =>
  s === "RECIBIDA" ? "green" : s === "CANCELADA" ? "red" : "amber";

const ComprasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedPurchases, setExpandedPurchases] = useState<Record<number, boolean>>({});
  const toggleExpand = (id: number) => {
    setExpandedPurchases((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Formulario nueva orden
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [fieldErrors, setFieldErrors] = useState<TopFieldErrors>({});
  const [lineErrors, setLineErrors] = useState<LineFieldErrors>({});
  const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>({ 0: true });
  // Caché de impuestos por productId (se carga al seleccionar)
  const [productTaxes, setProductTaxes] = useState<Record<string, ProductTaxEntry[]>>({});

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Historial de órdenes
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [receiving, setReceiving] = useState<number | null>(null);

  // Catálogos
  useEffect(() => {
    api
      .get<{ branches: BranchOption[] }>("/api/auth/branches")
      .then((r) => setBranches(r.data.branches))
      .catch(() => {});
    api
      .get<{ products: ProductOption[] }>("/api/admin/inventory")
      .then((r) => setProducts(r.data.products))
      .catch(() => {});
    api
      .get<SupplierOption[]>("/api/admin/suppliers")
      .then((r) => setSuppliers(r.data))
      .catch(() => {});
  }, []);

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const res = await api.get<PurchaseRow[]>("/api/admin/purchases");
      setPurchases(res.data);
    } catch {
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }, [refreshToken]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  // Cargar productos del proveedor seleccionado
  useEffect(() => {
    if (!supplierId) {
      setSupplierProducts([]);
      return;
    }
    setLoadingProducts(true);
    api
      .get<ProductOption[]>(`/api/admin/suppliers/${supplierId}/products`)
      .then((r) => setSupplierProducts(r.data))
      .catch(() => setSupplierProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [supplierId]);

  const setLine = (i: number, k: keyof Line, v: string) => {
    const value = k === "quantity" ? normalizeIntegerInput(v) : v;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: value } : l)));
    setLineErrors((prev) => {
      const next = { ...prev };
      const invalidInteger = k === "quantity" && v.trim() !== "" && value !== v;
      if (invalidInteger) {
        next[i] = { ...(next[i] || {}), quantity: "La cantidad solo puede contener numeros enteros." };
      } else if (next[i]) {
        next[i] = { ...next[i] };
        delete next[i][k];
      }
      return next;
    });
    setFormError(null);
  };

  const setDecimalLine = (i: number, k: "unitCost", value: string) => {
    const rawValue = value.trim();
    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
      setLineErrors((prev) => ({
        ...prev,
        [i]: { ...(prev[i] || {}), unitCost: "El costo unitario debe ser un numero valido con maximo 3 decimales." },
      }));
      return;
    }
    handleDecimalInputChange(rawValue, (nextValue) => setLine(i, k, nextValue));
  };

  const onPickProduct = (i: number, productId: string) => {
    const pool = supplierId && supplierProducts.length > 0 ? supplierProducts : products;
    const prod = pool.find((p) => String(p.id) === productId);
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? { ...l, productId, unitCost: l.unitCost || (prod ? String(prod.costPrice) : "") }
          : l
      )
    );
    setLineErrors((prev) => {
      const next = { ...prev };
      const duplicate = productId && lines.some((line, index) => index !== i && line.productId === productId);
      next[i] = { ...(next[i] || {}) };
      if (duplicate) next[i].productId = "Este producto ya fue agregado en otro renglon.";
      else delete next[i].productId;
      return next;
    });
    setFormError(null);
    // Cargar impuestos del producto si no están en caché
    if (productId && productTaxes[productId] === undefined) {
      api
        .get<{ data: { taxes: Array<{ id: number; name: string; rate: number | string; active: boolean }> } }>(
          `/api/admin-tax/products/${productId}/taxes`
        )
        .then((r) => {
          const activeTaxes: ProductTaxEntry[] = r.data.data.taxes
            .filter((t) => t.active)
            .map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }));
          setProductTaxes((prev) => ({ ...prev, [productId]: activeTaxes }));
        })
        .catch(() => {
          setProductTaxes((prev) => ({ ...prev, [productId]: [] }));
        });
    }
  };

  const addLine = () => {
    const hasIncomplete = lines.some((l) => {
      if (!l.productId) return true;
      const qty = Number(l.quantity);
      if (!l.quantity || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) return true;
      const cost = Number(l.unitCost);
      if (!l.unitCost || isNaN(cost) || cost < 0) return true;
      return false;
    });

    if (hasIncomplete) {
      setFormError("Debe completar los datos del producto anterior antes de agregar uno nuevo.");
      return;
    }
    setFormError(null);
    setLines((ls) => {
      const nextLines = [...ls, newLine()];
      setExpandedLines((prev) => ({ ...prev, [nextLines.length - 1]: true }));
      return nextLines;
    });
  };

  const removeLine = (i: number) => {
    if (lines.length === 1) return;
    setLines((ls) => ls.filter((_, idx) => idx !== i));
    setLineErrors((prev) => {
      const next: LineFieldErrors = {};
      Object.entries(prev).forEach(([rawIndex, errors]) => {
        const index = Number(rawIndex);
        if (index < i) next[index] = errors;
        if (index > i) next[index - 1] = errors;
      });
      return next;
    });
    setExpandedLines((prev) => {
      const next = { ...prev };
      delete next[i];
      const updated: Record<number, boolean> = {};
      Object.keys(next).forEach((k) => {
        const idx = Number(k);
        updated[idx > i ? idx - 1 : idx] = next[idx];
      });
      return updated;
    });
  };

  const computedTotals = (() => {
    let subtotal = 0;
    const taxMap: Record<string, { name: string; amount: number }> = {};

    for (const l of lines) {
      const lineSubtotal = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
      subtotal += lineSubtotal;
      const taxes = l.productId ? (productTaxes[l.productId] ?? []) : [];
      for (const tax of taxes) {
        const taxAmount = lineSubtotal * tax.rate;
        if (!taxMap[tax.name]) taxMap[tax.name] = { name: tax.name, amount: 0 };
        taxMap[tax.name].amount += taxAmount;
      }
    }

    const taxEntries = Object.values(taxMap);
    const totalTax = taxEntries.reduce((s, t) => s + t.amount, 0);
    return { subtotal, taxEntries, totalTax, total: subtotal + totalTax };
  })();

  const submit = async () => {
    if (saving) return;
    setFormError(null);
    setSuccess(null);
    const nextFieldErrors: TopFieldErrors = {};
    const nextLineErrors: LineFieldErrors = {};
    if (!branchId || !branches.some((branch) => String(branch.id) === branchId)) {
      nextFieldErrors.branchId = "Seleccione una sucursal de destino valida.";
    }
    if (!supplierId || !suppliers.some((supplier) => String(supplier.id) === supplierId)) {
      nextFieldErrors.supplierId = "Seleccione un proveedor valido.";
    }
    const referenceError = validateReference(reference, "La referencia", { required: true, max: 80 });
    if (referenceError) {
      nextFieldErrors.reference = referenceError;
    }
    const notesError = validateReference(notes, "Las notas", { required: false, max: 200 });
    if (notesError) {
      nextFieldErrors.notes = notesError;
    }
    const selectedLines = lines
      .map((line, originalIndex) => ({ line, originalIndex }))
      .filter(({ line }) => line.productId);
    if (selectedLines.length === 0) {
      nextLineErrors[0] = { productId: "Agregue al menos un producto." };
    }
    const productCounts = selectedLines.reduce<Record<string, number>>((counts, { line }) => {
      counts[line.productId] = (counts[line.productId] || 0) + 1;
      return counts;
    }, {});
    const details: Array<{ productId: number; quantity: number; unitCost: number }> = [];
    const roundedValues: Array<DecimalFieldValue | null> = [];
    for (const [index, selectedLine] of selectedLines.entries()) {
      const { line, originalIndex } = selectedLine;
      const rowErrors: Partial<Record<keyof Line, string>> = {};
      if (!supplierProducts.some((product) => String(product.id) === line.productId)) {
        rowErrors.productId = `El producto del renglon ${index + 1} no pertenece al catalogo del proveedor.`;
      } else if (productCounts[line.productId] > 1) {
        rowErrors.productId = "Este producto esta repetido en la orden de compra.";
      }
      const quantity = Number(line.quantity);
      const quantityError = validateInteger(line.quantity, `La cantidad del renglon ${index + 1}`, {
        min: 1,
        max: MAX_PURCHASE_QUANTITY,
      });
      if (quantityError || !Number.isInteger(quantity) || quantity <= 0) {
        rowErrors.quantity = quantityError || `La cantidad del renglon ${index + 1} debe ser un entero mayor a 0.`;
      }

      const unitCostValidation = line.unitCost.trim()
        ? validateDecimalField(line.unitCost, `El costo unitario del renglon ${index + 1}`, {
            invalidMessage: `El costo unitario del renglon ${index + 1} debe ser un numero valido con maximo 3 decimales.`,
            max: MAX_PURCHASE_UNIT_COST,
            maxMessage: `El costo unitario del renglon ${index + 1} no puede exceder ${MAX_PURCHASE_UNIT_COST}.`,
          })
        : null;
      if (unitCostValidation && !unitCostValidation.ok) {
        rowErrors.unitCost = unitCostValidation.error;
      }
      if (!line.unitCost.trim()) {
        rowErrors.unitCost = `El costo unitario del renglon ${index + 1} es obligatorio.`;
      }
      if (Object.keys(rowErrors).length > 0) {
        nextLineErrors[originalIndex] = rowErrors;
        continue;
      }
      const unitCostValue = unitCostValidation ? getDecimalValidationValue(unitCostValidation) : null;
      roundedValues.push(unitCostValue);
      details.push({
        productId: Number(line.productId),
        quantity,
        unitCost: unitCostValue?.value ?? 0,
      });
    }
    if (Object.keys(nextFieldErrors).length > 0 || Object.keys(nextLineErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setLineErrors(nextLineErrors);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }
    const roundingMessages = collectRoundedDecimalMessages(roundedValues);

    setSaving(true);
    setFieldErrors({});
    setLineErrors({});
    try {
      if (roundingMessages.length > 0) {
        alert(roundingMessages.join("\n"));
      }

      const res = await api.post<PurchaseRow>("/api/admin/purchases", {
        supplierId: Number(supplierId),
        branchId: Number(branchId),
        reference: reference.trim(),
        notes: notes.trim() || undefined,
        details,
      });
      setSuccess(
        `Orden #${res.data.id} creada (${res.data.reference}) — Proveedor: ${res.data.supplier.name}. Total: ${money(Number(res.data.total))}. Estado: PENDIENTE.`
      );
      setLines([newLine()]);
      setSupplierId("");
      setReference("");
      setNotes("");
      setFieldErrors({});
      setLineErrors({});
      setProductTaxes({});
      await loadPurchases();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo registrar la compra.");
    } finally {
      setSaving(false);
    }
  };

  const receive = async (purchaseId: number) => {
    setReceiving(purchaseId);
    try {
      await api.put(`/api/admin/purchases/${purchaseId}/receive`);
      await loadPurchases();
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al recibir la compra.");
    } finally {
      setReceiving(null);
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterSupplierId !== "all" && String(p.supplier.id) !== filterSupplierId) return false;
    return true;
  });

  return (
    <div>
      <SectionHeader
        title="Compras"
        subtitle="Órdenes de compra — el inventario se actualiza al recibir la mercancía"
      />

      {/* Formulario nueva orden */}
      <Panel style={{ padding: 20, marginBottom: 22 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}
        >
          <div>
            <label style={ui.fieldLabel}>Sucursal de destino *</label>
            <select
              style={ui.input}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setFieldErrors((prev) => ({ ...prev, branchId: undefined }));
              }}
            >
              <option value="">Seleccione...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors.branchId && <p style={styles.fieldError}>{fieldErrors.branchId}</p>}
          </div>
          <div>
            <label style={ui.fieldLabel}>Proveedor *</label>
            <select
              style={ui.input}
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setSupplierProducts([]);
                setLines([newLine()]);
                setLineErrors({});
                setFieldErrors((prev) => ({ ...prev, supplierId: undefined }));
              }}
            >
              <option value="">Seleccione proveedor...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {fieldErrors.supplierId && <p style={styles.fieldError}>{fieldErrors.supplierId}</p>}
          </div>
          <div>
            <label style={ui.fieldLabel}>Referencia / Factura *</label>
            <input
              style={ui.input}
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setFieldErrors((prev) => ({ ...prev, reference: validateReference(e.target.value, "La referencia", { required: true, max: 80 }) }));
              }}
              placeholder="Folio o nota"
              maxLength={80}
            />
            {fieldErrors.reference && <p style={styles.fieldError}>{fieldErrors.reference}</p>}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={ui.fieldLabel}>Notas (opcional)</label>
          <textarea
            style={{ ...ui.input, resize: "vertical", minHeight: 52, fontSize: 13 }}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setFieldErrors((prev) => ({ ...prev, notes: validateReference(e.target.value, "Las notas", { required: false, max: 200 }) }));
            }}
            placeholder="Observaciones sobre la compra..."
            maxLength={200}
          />
          {fieldErrors.notes && <p style={styles.fieldError}>{fieldErrors.notes}</p>}
        </div>

        {isMobile ? (
          <div
            style={{
              maxHeight: "380px",
              overflowY: "auto",
              paddingRight: 4,
              marginBottom: 16,
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "8px",
              backgroundColor: "#f8fafc",
            }}
          >
            {lines.map((l, i) => {
              const pool = supplierId && supplierProducts.length > 0 ? supplierProducts : products;
              const prod = pool.find((p) => String(p.id) === l.productId);
              const isExpanded = expandedLines[i] !== false;
              const hasTaxes = l.productId && productTaxes[l.productId] !== undefined;

              const toggleLineExpand = (idx: number) => {
                setExpandedLines((prev) => ({
                  ...prev,
                  [idx]: prev[idx] === false ? true : false,
                }));
              };

              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {/* Header of the card */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleLineExpand(i)}
                  >
                    <div style={{ flex: 1, paddingRight: 8 }}>
                      {prod ? (
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                          {prod.name} ({prod.sku})
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#64748b" }}>
                          Seleccione producto...
                        </div>
                      )}
                      {hasTaxes && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                          {productTaxes[l.productId].length > 0
                            ? productTaxes[l.productId].map((t) => {
                                const pct = `${(t.rate * 100).toFixed(0)}%`;
                                return t.name.includes(pct) ? t.name : `${t.name} ${pct}`;
                              }).join(" · ")
                            : "Sin impuestos"}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", color: "#64748b" }}>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {/* Card Body */}
                  {isExpanded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                      {/* Product Selector in expanded body */}
                      <div>
                        <label style={ui.fieldLabel}>Producto *</label>
                        <select
                          style={{ ...ui.input, padding: "8px 10px" }}
                          value={l.productId}
                          onChange={(e) => onPickProduct(i, e.target.value)}
                          disabled={!supplierId || loadingProducts}
                        >
                          <option value="">
                            {loadingProducts
                              ? "Cargando productos..."
                              : supplierId && supplierProducts.length === 0
                              ? "Sin productos asignados a este proveedor"
                              : "Seleccione producto..."}
                          </option>
                          {(supplierId ? supplierProducts : products).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku}) — ${p.costPrice}
                            </option>
                          ))}
                        </select>
                        {lineErrors[i]?.productId && <p style={styles.fieldError}>{lineErrors[i]?.productId}</p>}
                      </div>

                      {/* Cantidad Input */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>Cantidad</span>
                        <div style={{ width: 120 }}>
                          <input
                            style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                            value={l.quantity}
                            onChange={(e) => setLine(i, "quantity", e.target.value)}
                            placeholder="0"
                          />
                          {lineErrors[i]?.quantity && <p style={{ ...styles.fieldError, textAlign: "right" }}>{lineErrors[i]?.quantity}</p>}
                        </div>
                      </div>

                      {/* Costo unitario Input */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>Costo unitario</span>
                        <div style={{ width: 120 }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                            value={l.unitCost}
                            onChange={(e) => setDecimalLine(i, "unitCost", e.target.value)}
                            placeholder="0.00"
                          />
                          {lineErrors[i]?.unitCost && <p style={{ ...styles.fieldError, textAlign: "right" }}>{lineErrors[i]?.unitCost}</p>}
                        </div>
                      </div>

                      {/* Importe row and Trash button inside highlight box */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "#f0f5fa",
                          borderRadius: "8px",
                          padding: "10px 12px",
                          marginTop: 4,
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>Importe</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                            {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                          </span>
                          <button
                            onClick={() => removeLine(i)}
                            style={{
                              backgroundColor: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "#dc2626",
                              padding: 0,
                            }}
                            className="active-tap"
                            title="Quitar renglón"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
            <table style={ui.table}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={ui.th}>Producto</th>
                  <th style={{ ...ui.th, width: 120, textAlign: "center" }}>Cantidad</th>
                  <th style={{ ...ui.th, width: 150, textAlign: "center" }}>Costo unitario</th>
                  <th style={{ ...ui.th, width: 130, textAlign: "right" }}>Importe</th>
                  <th style={{ ...ui.th, width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td style={ui.td}>
                      <select
                        style={{ ...ui.input, padding: "8px 10px" }}
                        value={l.productId}
                        onChange={(e) => onPickProduct(i, e.target.value)}
                        disabled={!supplierId || loadingProducts}
                      >
                        <option value="">
                          {loadingProducts
                            ? "Cargando productos..."
                            : supplierId && supplierProducts.length === 0
                            ? "Sin productos asignados a este proveedor"
                            : "Seleccione producto..."}
                        </option>
                        {(supplierId ? supplierProducts : products).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) — ${p.costPrice}
                          </option>
                        ))}
                      </select>
                      {l.productId && productTaxes[l.productId] !== undefined && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                          {productTaxes[l.productId].length > 0
                            ? productTaxes[l.productId].map((t) => {
                                const pct = `${(t.rate * 100).toFixed(0)}%`;
                                return t.name.includes(pct) ? t.name : `${t.name} ${pct}`;
                              }).join(" · ")
                            : "Sin impuestos"}
                        </div>
                      )}
                      {lineErrors[i]?.productId && <p style={styles.fieldError}>{lineErrors[i]?.productId}</p>}
                    </td>
                    <td style={ui.td}>
                      <input
                        style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                        value={l.quantity}
                        onChange={(e) => setLine(i, "quantity", e.target.value)}
                        placeholder="0"
                        inputMode="numeric"
                        maxLength={6}
                      />
                      {lineErrors[i]?.quantity && <p style={styles.fieldError}>{lineErrors[i]?.quantity}</p>}
                    </td>
                    <td style={ui.td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                        value={l.unitCost}
                        onChange={(e) => setDecimalLine(i, "unitCost", e.target.value)}
                        placeholder="0.00"
                        maxLength={11}
                      />
                      {lineErrors[i]?.unitCost && <p style={styles.fieldError}>{lineErrors[i]?.unitCost}</p>}
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>
                      {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <button
                        onClick={() => removeLine(i)}
                        style={{ background: "none", border: "none", cursor: "pointer" }}
                        title="Quitar renglón"
                      >
                        <Trash2 size={16} color="#b91c1c" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          <button style={ui.ghostBtn} className="active-tap" onClick={addLine}>
            <Plus size={15} /> Agregar producto
          </button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Subtotal: <strong style={{ color: "var(--text)" }}>{money(computedTotals.subtotal)}</strong>
            </div>
            {computedTotals.taxEntries.map((t) => (
              <div key={t.name} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t.name}: <span>{money(t.amount)}</span>
              </div>
            ))}
            {computedTotals.taxEntries.length === 0 && computedTotals.subtotal > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>
                Sin impuestos asignados
              </div>
            )}
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--accent-strong)", borderTop: "1px solid var(--border)", paddingTop: 4, marginTop: 2 }}>
              Total estimado: {money(computedTotals.total)}
            </div>
          </div>
        </div>

        {formError && (
          <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>
            {formError}
          </p>
        )}
        {success && (
          <p
            style={{
              color: "#15803d",
              fontSize: 13,
              fontWeight: 700,
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} /> {success}
          </p>
        )}

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={ui.primaryBtn}
            className="active-tap"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Crear orden de compra"}
          </button>
        </div>
      </Panel>

      {/* Historial de órdenes de compra */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>
          Órdenes de compra
        </h3>
        <Toolbar>
          <FilterSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "all", label: "Todos los estados" },
              { value: "PENDIENTE", label: "Pendiente" },
              { value: "RECIBIDA", label: "Recibida" },
              { value: "CANCELADA", label: "Cancelada" },
            ]}
          />
          <FilterSelect
            value={filterSupplierId}
            onChange={setFilterSupplierId}
            options={[
              { value: "all", label: "Todos los proveedores" },
              ...suppliers.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
          />
        </Toolbar>
      </div>

      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
          {purchasesLoading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {!purchasesLoading && filteredPurchases.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay órdenes de compra con los filtros seleccionados.
            </div>
          )}

          {!purchasesLoading &&
            filteredPurchases.map((p) => {
              const isExpanded = expandedPurchases[p.id];
              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--surface-3)",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      {/* Top: Referencia & Total */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#2563eb" }}>
                          {p.reference}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                          {money(Number(p.total))}
                        </span>
                      </div>

                      {/* Sucursal y Proveedor */}
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
                        {p.branch.name} <span style={{ color: "var(--border-strong)", margin: "0 6px" }}>|</span> {p.supplier.name}
                      </div>

                      {/* Fecha */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                        <Calendar size={14} color="#2563eb" />
                        <span>{fmtDate(p.purchaseDate)} {fmtTime(p.purchaseDate)}</span>
                      </div>
                    </div>

                    {/* Chevron Button */}
                    <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                      <button
                        onClick={() => toggleExpand(p.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--surface)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 8,
                          width: 38,
                          height: 38,
                          cursor: "pointer",
                          color: "#2563eb",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--surface-3)" }}>
                      {/* Details container */}
                      <div style={{
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        padding: 16,
                      }}>
                        {/* Estado */}
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Estado de la Orden</h4>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                          {p.status === "PENDIENTE" && (
                            <button
                              style={{
                                ...ui.primaryBtn,
                                fontSize: 12,
                                padding: "6px 12px",
                                height: 30,
                                backgroundColor: "#15803d",
                              }}
                              onClick={() => receive(p.id)}
                              disabled={receiving === p.id}
                              className="active-tap"
                            >
                              {receiving === p.id ? "Recibiendo..." : "✓ Recibir mercancía"}
                            </button>
                          )}
                        </div>

                        {/* Artículos */}
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Artículos ({p.details.length})</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {p.details.map((d) => (
                            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, borderBottom: "1px dashed #e2e8f0", paddingBottom: 6 }}>
                              <div>
                                <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{d.product.name}</span>
                                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>SKU: {d.product.sku}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{d.quantity} u.</span>
                                <span style={{ color: "var(--text-faint)", margin: "0 4px" }}>x</span>
                                <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{money(d.unitCost)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Notas si existen */}
                        {p.notes && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Notas:</div>
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{p.notes}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
          <table style={ui.table}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>Proveedor</th>
                <th style={ui.th}>Sucursal</th>
                <th style={ui.th}>Referencia</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Artículos</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                <th style={ui.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={8}
                loading={purchasesLoading}
                empty={!purchasesLoading && filteredPurchases.length === 0}
                emptyText="No hay órdenes de compra con los filtros seleccionados."
              />
              {!purchasesLoading &&
                filteredPurchases.map((p) => (
                  <tr key={p.id}>
                    <td style={ui.td}>
                      {fmtDate(p.purchaseDate)}{" "}
                      <span style={{ color: "var(--text-faint)" }}>{fmtTime(p.purchaseDate)}</span>
                    </td>
                    <td style={{ ...ui.td, fontWeight: 600, color: "var(--text)" }}>
                      {p.supplier.name}
                    </td>
                    <td style={ui.td}>{p.branch.name}</td>
                    <td style={ui.td}>{p.reference}</td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Package size={13} color="#64748b" />
                        {p.details.length}
                      </span>
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, color: "var(--accent-strong)" }}>
                      {money(Number(p.total))}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </td>
                    <td style={ui.td}>
                      {p.status === "PENDIENTE" ? (
                        <button
                          style={{
                            ...ui.primaryBtn,
                            fontSize: 12,
                            padding: "6px 12px",
                            height: 30,
                            backgroundColor: "#15803d",
                          }}
                          onClick={() => receive(p.id)}
                          disabled={receiving === p.id}
                        >
                          {receiving === p.id ? "Recibiendo..." : "✓ Recibir"}
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
  },
};

export default ComprasView;
