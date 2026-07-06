import React, { useEffect, useRef, useState } from "react";
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Package, Plus, Trash2 } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ConfirmModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { useToast } from "../../shared/context/ToastContext";
import {
  collectRoundedDecimalMessages,
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  type DecimalFieldValue,
  validateDecimalField,
} from "../../shared/utils/decimalInput";
import { normalizeIntegerInput, validateInteger, validateReference } from "../../shared/utils/formValidation";
import {
  ui,
  type ViewProps,
  Panel,
  SectionHeader,
  Badge,
  FilterSelect,
  Toolbar,
  money,
  fmtDate,
  fmtTime,
  useMediaQuery,
  filterProductsBySearch,
  usePagination,
  Pagination,
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
    unit?: string;
  }>;
  createdByUser: { id: number; name: string };
}

interface Line {
  productId: string;
  quantity: string;
  unitCost: string;
  unit: string;
}

type TopFieldErrors = Partial<Record<"branchId" | "supplierId" | "reference" | "notes", string>>;
type LineFieldErrors = Record<number, Partial<Record<keyof Line, string>>>;

const generateReferenceCode = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomStr = Math.floor(1000 + Math.random() * 9000);
  return `OC-${dateStr}-${randomStr}`;
};

const statusTone = (s: string) =>
  s === "RECIBIDA" ? "green" : s === "CANCELADA" ? "red" : "amber";

const UNIT_OPTIONS = [
  { value: "PIEZA", label: "Pieza" },
  { value: "LOTE", label: "Lote" },
  { value: "CAJA", label: "Caja" },
  { value: "KILO", label: "Kilo" },
  { value: "LITRO", label: "Litro" },
];

const ComprasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedPurchases, setExpandedPurchases] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpandedPurchases((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Formulario nueva orden
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState(() => generateReferenceCode());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [fieldErrors, setFieldErrors] = useState<TopFieldErrors>({});
  const [lineErrors, setLineErrors] = useState<LineFieldErrors>({});

  // Modales y buscadores
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Historial de órdenes
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [receiving, setReceiving] = useState<number | null>(null);

  // Catálogos via useAdminData
  const { data: branchesData } = useAdminData<{ branches: BranchOption[] }>("/api/auth/branches");
  const branches = branchesData?.branches ?? [];

  const { data: suppliersData } = useAdminData<SupplierOption[]>("/api/admin/suppliers");
  const suppliers = suppliersData ?? [];

  // Historial de compras via useAdminData
  const { data: purchasesData, loading: purchasesLoading, refetch: refetchPurchases } =
    useAdminData<PurchaseRow[]>("/api/admin/purchases");
  const purchases = purchasesData ?? [];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetchPurchases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Catálogo de productos (todos)
  useEffect(() => {
    api
      .get<{ products: ProductOption[] }>("/api/admin/inventory")
      .then((r) => setProducts(r.data.products))
      .catch(() => {});
  }, []);

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

  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
    setLineErrors({});
  };

  const computedTotals = (() => {
    let subtotal = 0;
    for (const l of lines) {
      subtotal += (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
    }
    return { total: subtotal };
  })();

  const submit = async () => {
    setFormError(null);
    setSuccess(null);
    const nextFieldErrors: TopFieldErrors = {};
    const nextLineErrors: LineFieldErrors = {};
    if (!branchId) {
      nextFieldErrors.branchId = "Seleccione la sucursal de destino.";
    }
    if (!supplierId) {
      nextFieldErrors.supplierId = "Seleccione el proveedor.";
    }
    const referenceError = validateReference(reference, "La referencia", { required: true, max: 80 });
    if (referenceError) {
      nextFieldErrors.reference = referenceError;
    }
    const notesError = validateReference(notes, "Las notas", { required: false, max: 200 });
    if (notesError) {
      nextFieldErrors.notes = notesError;
    }
    const selectedLines = lines.filter((l) => l.productId);
    if (selectedLines.length === 0) {
      setFormError("Debe agregar al menos un producto a la compra.");
      return;
    }
    const details: Array<{ productId: number; quantity: number; unitCost: number; unit: string }> = [];
    const roundedValues: Array<DecimalFieldValue | null> = [];
    for (const [index, line] of selectedLines.entries()) {
      const originalIndex = lines.indexOf(line);
      const rowErrors: Partial<Record<keyof Line, string>> = {};
      const quantity = Number(line.quantity);
      const quantityError = validateInteger(line.quantity, `La cantidad del renglon ${index + 1}`, { min: 1 });
      if (quantityError || !Number.isInteger(quantity) || quantity <= 0) {
        rowErrors.quantity = `La cantidad debe ser un entero mayor a 0.`;
      }

      const unitCostValidation = line.unitCost.trim()
        ? validateDecimalField(line.unitCost, `El costo unitario del renglon ${index + 1}`, {
            invalidMessage: `El costo unitario debe ser un numero valido con maximo 3 decimales.`,
          })
        : null;
      if (unitCostValidation && !unitCostValidation.ok) {
        rowErrors.unitCost = unitCostValidation.error;
      }
      if (!line.unitCost.trim()) {
        rowErrors.unitCost = `El costo unitario es obligatorio.`;
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
        unit: line.unit,
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
        showToast(roundingMessages.join(" | "), "warning");
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
      setLines([]);
      setSupplierId("");
      setReference(generateReferenceCode());
      setNotes("");
      setFieldErrors({});
      setLineErrors({});
      await refetchPurchases();
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
      await refetchPurchases();
    } catch {
      // Manejado por el interceptor global de errores (api.ts) — mismo mensaje.
    } finally {
      setReceiving(null);
    }
  };

  const cancelPurchase = (purchaseId: number) => {
    setCancelConfirmId(purchaseId);
  };

  const confirmCancelPurchase = async () => {
    const purchaseId = cancelConfirmId;
    if (!purchaseId) return;
    setCancelConfirmId(null);
    try {
      await api.put(`/api/admin/purchases/${purchaseId}/cancel`);
      await refetchPurchases();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al cancelar la compra.", "error");
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterSupplierId !== "all" && String(p.supplier.id) !== filterSupplierId) return false;
    return true;
  });
  const paged = usePagination(filteredPurchases, { resetKey: `${filterStatus}|${filterSupplierId}` });

  const purchaseColumns: Column<PurchaseRow>[] = [
    {
      key: "purchaseDate",
      header: "Fecha",
      render: (p) => (
        <>
          {fmtDate(p.purchaseDate)}{" "}
          <span style={{ color: "var(--text-faint)" }}>{fmtTime(p.purchaseDate)}</span>
        </>
      ),
    },
    {
      key: "supplier",
      header: "Proveedor",
      render: (p) => <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.supplier.name}</span>,
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (p) => p.branch.name,
    },
    { key: "reference", header: "Referencia" },
    {
      key: "details",
      header: "Artículos",
      align: "center",
      render: (p) => (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Package size={13} color="#64748b" />
          {p.details.length}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (p) => <span style={{ fontWeight: 700, color: "var(--accent-strong)" }}>{money(Number(p.total))}</span>,
    },
    {
      key: "status",
      header: "Estado",
      align: "center",
      render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge>,
    },
    {
      key: "id",
      header: "Acciones",
      render: (p) =>
        p.status === "PENDIENTE" ? (
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
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
            <button
              style={{
                ...ui.primaryBtn,
                fontSize: 12,
                padding: "6px 12px",
                height: 30,
                backgroundColor: "#dc2626",
              }}
              onClick={() => cancelPurchase(p.id)}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
        ),
    },
  ];

  const selectedSupplier = suppliers.find((s) => String(s.id) === supplierId);

  return (
    <div>
      <style>{`
        .hover-bg:hover {
          background-color: var(--surface-2) !important;
        }
        .modal-item {
          transition: all 0.2s ease;
        }
        .modal-item:hover {
          border-color: var(--accent) !important;
          background-color: var(--surface-2) !important;
        }
      `}</style>

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
            <button
              type="button"
              style={{
                ...ui.input,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                textAlign: "left",
                backgroundColor: "var(--surface)",
                cursor: "pointer",
                height: 38,
              }}
              onClick={() => {
                setSupplierSearch("");
                setSupplierModalOpen(true);
              }}
            >
              <span style={{ color: selectedSupplier ? "var(--text)" : "var(--text-muted)", fontSize: 14 }}>
                {selectedSupplier ? selectedSupplier.name : "Seleccione proveedor..."}
              </span>
              <ChevronDown size={16} color="var(--text-muted)" />
            </button>
            {fieldErrors.supplierId && <p style={styles.fieldError}>{fieldErrors.supplierId}</p>}
          </div>
          <div>
            <label style={ui.fieldLabel}>Referencia / Factura *</label>
            <input
              style={{ ...ui.input, backgroundColor: "var(--surface-2)", cursor: "not-allowed" }}
              value={reference}
              readOnly
              placeholder="Folio o nota"
            />
            {fieldErrors.reference && <p style={styles.fieldError}>{fieldErrors.reference}</p>}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ ...ui.fieldLabel, marginBottom: 0 }}>Notas (opcional)</label>
            <span style={{ fontSize: 11, color: notes.length >= 200 ? "var(--color-danger)" : "var(--text-muted)", fontWeight: 600 }}>
              {notes.length} / 200
            </span>
          </div>
          <textarea
            style={{ ...ui.input, resize: "vertical", minHeight: 52, fontSize: 13 }}
            value={notes}
            maxLength={200}
            onChange={(e) => {
              setNotes(e.target.value);
              setFieldErrors((prev) => ({ ...prev, notes: undefined }));
            }}
            placeholder="Observaciones sobre la compra..."
          />
          {fieldErrors.notes && <p style={styles.fieldError}>{fieldErrors.notes}</p>}
        </div>

        <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Producto</th>
              <th style={{ ...ui.th, width: 120, textAlign: "center" }}>Cantidad</th>
              <th style={{ ...ui.th, width: 140, textAlign: "center" }}>Unidad</th>
              <th style={{ ...ui.th, width: 150, textAlign: "center" }}>Costo unitario</th>
              <th style={{ ...ui.th, width: 130, textAlign: "right" }}>Importe</th>
              <th style={{ ...ui.th, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px 12px", fontSize: 13 }}>
                  No hay productos seleccionados. Use "Agregar producto" para añadir elementos a esta compra.
                </td>
              </tr>
            ) : (
              lines.map((l, i) => {
                const pool = supplierProducts.length > 0 ? supplierProducts : products;
                const prod = pool.find((p) => String(p.id) === l.productId);
                return (
                  <tr key={i}>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{prod?.name || "Desconocido"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>SKU: {prod?.sku || "—"}</div>
                      {lineErrors[i]?.productId && <p style={styles.fieldError}>{lineErrors[i]?.productId}</p>}
                    </td>
                    <td style={ui.td}>
                      <input
                        style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                        value={l.quantity}
                        onChange={(e) => setLine(i, "quantity", e.target.value)}
                        placeholder="0"
                      />
                      {lineErrors[i]?.quantity && <p style={styles.fieldError}>{lineErrors[i]?.quantity}</p>}
                    </td>
                    <td style={ui.td}>
                      <select
                        style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                        value={l.unit}
                        onChange={(e) => setLine(i, "unit", e.target.value)}
                      >
                        {UNIT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={ui.td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                        value={l.unitCost}
                        onChange={(e) => setDecimalLine(i, "unitCost", e.target.value)}
                        placeholder="0.00"
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
                );
              })
            )}
          </tbody>
        </table>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          <button
            style={ui.ghostBtn}
            className="active-tap"
            onClick={() => {
              if (!supplierId) {
                setFormError("Por favor, seleccione un proveedor primero.");
                return;
              }
              setProductSearch("");
              setProductModalOpen(true);
            }}
          >
            <Plus size={15} /> Agregar producto
          </button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-strong)", paddingTop: 4 }}>
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
            paged.pageItems.map((p) => {
              const isExpanded = expandedPurchases[p.id];
              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
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
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>
                          {p.reference}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                          {money(Number(p.total))}
                        </span>
                      </div>

                      {/* Sucursal y Proveedor */}
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
                        {p.branch.name} <span style={{ color: "#cbd5e1", margin: "0 6px" }}>|</span> {p.supplier.name}
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
                          color: "var(--accent)",
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
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
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
                            <div style={{ display: "flex", gap: 6 }}>
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
                                {receiving === p.id ? "Recibiendo..." : "✓ Recibir"}
                              </button>
                              <button
                                style={{
                                  ...ui.primaryBtn,
                                  fontSize: 12,
                                  padding: "6px 12px",
                                  height: 30,
                                  backgroundColor: "#dc2626",
                                }}
                                onClick={() => cancelPurchase(p.id)}
                                className="active-tap"
                              >
                                Cancelar
                              </button>
                            </div>
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
                                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                                  {d.quantity} {d.unit ? d.unit.toLowerCase() : "pieza(s)"}
                                </span>
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
        <DataTable
          columns={purchaseColumns}
          data={paged.pageItems}
          loading={purchasesLoading}
          emptyMessage="No hay órdenes de compra con los filtros seleccionados."
          keyExtractor={(p) => p.id}
        />
      )}

      {!purchasesLoading && (
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="órdenes" />
      )}

      {/* MODAL SELECCION PROVEEDOR */}
      {supplierModalOpen && (
        <div style={ui.overlay} onClick={() => setSupplierModalOpen(false)}>
          <div style={{ ...ui.modal, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <h3 style={ui.modalTitle}>Seleccionar Proveedor</h3>
              <button
                onClick={() => setSupplierModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", fontWeight: 700 }}
              >
                ×
              </button>
            </div>
            <div style={ui.modalBody}>
              <input
                style={{ ...ui.input, marginBottom: 12 }}
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Buscar proveedor..."
                autoFocus
              />
              <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {suppliers
                  .filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                  .map((s) => (
                    <button
                      key={s.id}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "none",
                        backgroundColor: String(s.id) === supplierId ? "var(--surface-2)" : "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: String(s.id) === supplierId ? 700 : 500,
                        transition: "background-color 0.15s ease",
                      }}
                      className="active-tap hover-bg"
                      onClick={() => {
                        setSupplierId(String(s.id));
                        setLines([]);
                        setLineErrors({});
                        setFieldErrors((prev) => ({ ...prev, supplierId: undefined }));
                        setSupplierModalOpen(false);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                {suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 12, fontSize: 13 }}>
                    No se encontraron proveedores.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SELECCION PRODUCTOS */}
      {productModalOpen && (
        <div style={ui.overlay} onClick={() => setProductModalOpen(false)}>
          <div style={{ ...ui.modal, maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <h3 style={ui.modalTitle}>Agregar Productos</h3>
              <button
                onClick={() => setProductModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", fontWeight: 700 }}
              >
                ×
              </button>
            </div>
            <div style={ui.modalBody}>
              <input
                style={{ ...ui.input, marginBottom: 12 }}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU..."
                autoFocus
              />
              <div style={{ maxHeight: 350, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {loadingProducts ? (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 12, fontSize: 13 }}>
                    Cargando productos del proveedor...
                  </div>
                ) : (() => {
                  const pool = supplierProducts.length > 0 ? supplierProducts : products;
                  const filtered = filterProductsBySearch(pool, productSearch);
                  if (filtered.length === 0) {
                    return (
                      <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 12, fontSize: 13 }}>
                        No se encontraron productos con esa búsqueda.
                      </div>
                    );
                  }
                  return filtered.map((p) => {
                    const isAdded = lines.some((l) => l.productId === String(p.id));
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: "1px solid var(--border-soft)",
                          backgroundColor: "var(--surface)",
                        }}
                        className="modal-item"
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            SKU: {p.sku} | Costo base: {money(p.costPrice)}
                          </div>
                        </div>
                        <button
                          type="button"
                          style={{
                            ...ui.primaryBtn,
                            padding: "6px 12px",
                            height: 30,
                            fontSize: 12,
                            backgroundColor: isAdded ? "#475569" : "#1e3a8a",
                          }}
                          className="active-tap"
                          onClick={() => {
                            setLines((prevLines) => {
                              const existingIndex = prevLines.findIndex((l) => l.productId === String(p.id));
                              if (existingIndex > -1) {
                                return prevLines.map((l, idx) =>
                                  idx === existingIndex
                                    ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) }
                                    : l
                                );
                              } else {
                                const newLineItem: Line = {
                                  productId: String(p.id),
                                  quantity: "1",
                                  unitCost: String(p.costPrice),
                                  unit: "PIEZA",
                                };
                                return [...prevLines, newLineItem];
                              }
                            });
                            setFormError(null);
                          }}
                        >
                          {isAdded ? "Agregar +1" : "Agregar"}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={cancelConfirmId !== null}
        onClose={() => setCancelConfirmId(null)}
        onConfirm={confirmCancelPurchase}
        variant="danger"
        title="Cancelar orden de compra"
        message="¿Seguro que deseas cancelar esta orden de compra?"
      />
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
