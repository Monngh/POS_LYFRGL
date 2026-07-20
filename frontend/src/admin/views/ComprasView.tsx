import React, { useEffect, useRef, useState } from "react";
import {
  Ban, Building2, Calendar, CheckCircle, CheckCircle2, ChevronDown, ChevronUp,
  Minus, Package, Plus, Search, ShoppingCart, Trash2, Truck, X,
} from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData, useBodyScrollLock } from "../../shared/hooks";
import { DataTable } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { useToast } from "../../shared/context/ToastContext";
import { useConfirm } from "../../shared/context/ConfirmContext";
import {
  collectRoundedDecimalMessages,
  getDecimalValidationValue,
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
  satUnitKey?: string;
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
  // Conversión de unidades capturada manualmente (solo aplica según `unit`):
  // CAJA usa piecesPerBox; LOTE usa piecesPerLot (modo directo) o
  // boxesPerLot + piecesPerBox (modo por cajas), según lotMode.
  piecesPerBox: string;
  boxesPerLot: string;
  piecesPerLot: string;
  lotMode: "boxes" | "direct";
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
const statusLabel = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase());

// ---------------------------------------------------------------------------
// Unidad de compra derivada del producto (clave de unidad SAT). Evita pedir
// «1 kilo» de un artículo por pieza o «1 litro» de uno que se cuenta por piezas:
// los productos discretos NO ofrecen peso/volumen, y los de peso/volumen
// arrancan en su unidad natural.
// ---------------------------------------------------------------------------
const UNIT_LABELS: Record<string, string> = { PIEZA: "Pieza", CAJA: "Caja", LOTE: "Lote", KILO: "Kilo", LITRO: "Litro" };
const SAT_WEIGHT = new Set(["KGM", "GRM", "MGM", "TNE", "LBR", "ONZ"]);
const SAT_VOLUME = new Set(["LTR", "MLT", "DLT", "GLL"]);
const SAT_BOX = new Set(["XBX", "XCA", "XCT", "XPK", "XPA", "XBG"]);

const unitProfile = (satUnitKey?: string): { def: string; units: string[] } => {
  const key = (satUnitKey || "").toUpperCase().trim();
  if (SAT_WEIGHT.has(key)) return { def: "KILO", units: ["KILO", "CAJA", "LOTE", "PIEZA"] };
  if (SAT_VOLUME.has(key)) return { def: "LITRO", units: ["LITRO", "CAJA", "LOTE", "PIEZA"] };
  if (SAT_BOX.has(key)) return { def: "CAJA", units: ["CAJA", "LOTE", "PIEZA"] };
  return { def: "PIEZA", units: ["PIEZA", "CAJA", "LOTE"] };
};

// Rejilla de columnas del editor de renglones (pantallas medianas y grandes).
const LINE_COLS = "minmax(150px, 1fr) 152px 120px 138px 112px 44px";

const ComprasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Teléfono real: por debajo de 640px se usan tarjetas apiladas. De ahí hacia
  // arriba (incluidas pantallas medianas) se usa el diseño de rejilla mejorado.
  const isPhone = useMediaQuery("(max-width: 640px)");
  // Layout de 2 columnas (form + historial lado a lado) solo desde 1025px en
  // adelante. Por debajo (tablet incluido) se mantiene el apilado vertical,
  // igual que el resto del panel admin (sidebar colapsa en el mismo punto).
  const isStackedLayout = useMediaQuery("(max-width: 1024px)");
  const [expandedPurchases, setExpandedPurchases] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpandedPurchases((prev) => ({ ...prev, [id]: !prev[id] }));
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
  const [productSearch, setProductSearch] = useState("");
  useBodyScrollLock(supplierModalOpen);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Historial de órdenes
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [filterBranchId, setFilterBranchId] = useState("all");
  const [receiving, setReceiving] = useState<number | null>(null);

  // Catálogos via useAdminData
  const { data: branchesData } = useAdminData<{ branches: BranchOption[] }>("/api/auth/branches");
  const branches = branchesData?.branches ?? [];

  const { data: suppliersData } = useAdminData<SupplierOption[]>("/api/admin/suppliers");
  const suppliers = suppliersData ?? [];

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
      .catch(() => { });
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

  const productPool = supplierProducts.length > 0 ? supplierProducts : products;
  const productById = (id: string) => productPool.find((p) => String(p.id) === id);

  // Campos de conversión de unidades: solo enteros, con su propia etiqueta de error.
  const INTEGER_LINE_FIELD_LABELS: Partial<Record<keyof Line, string>> = {
    quantity: "La cantidad",
    piecesPerBox: "Piezas por caja",
    boxesPerLot: "Cajas en el lote",
    piecesPerLot: "Piezas totales del lote",
  };

  const setLine = (i: number, k: keyof Line, v: string) => {
    const isIntegerField = k in INTEGER_LINE_FIELD_LABELS;
    const value = isIntegerField ? normalizeIntegerInput(v) : v;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: value } : l)));
    setLineErrors((prev) => {
      const next = { ...prev };
      const invalidInteger = isIntegerField && v.trim() !== "" && value !== v;
      if (invalidInteger) {
        next[i] = { ...(next[i] || {}), [k]: `${INTEGER_LINE_FIELD_LABELS[k]} solo puede contener números enteros.` };
      } else if (next[i]) {
        next[i] = { ...next[i] };
        delete next[i][k];
      }
      return next;
    });
    setFormError(null);
  };

  // Ajusta la cantidad con los botones +/- (mínimo 1).
  const stepQuantity = (i: number, delta: number) => {
    const current = Number(lines[i]?.quantity) || 0;
    setLine(i, "quantity", String(Math.max(1, current + delta)));
  };

  // Costo unitario: acepta dígitos y un punto, recorta suavemente a 3 decimales
  // en lugar de rechazar el tecleo con un error (mejor control al escribir).
  const setDecimalLine = (i: number, value: string) => {
    let v = value.replace(/[^\d.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "").slice(0, 3);
    }
    setLine(i, "unitCost", v);
  };

  // Toggle "Por cajas" / "Total directo" para renglones con unidad LOTE.
  const setLineLotMode = (i: number, mode: Line["lotMode"]) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, lotMode: mode } : l)));
    setFormError(null);
  };

  // Cambiar la unidad de un renglón: limpia los campos de conversión que ya no
  // aplican para evitar enviar valores obsoletos de una unidad anterior.
  const changeLineUnit = (i: number, nextUnit: string) => {
    setLines((ls) =>
      ls.map((l, idx) => {
        if (idx !== i) return l;
        if (nextUnit === "CAJA" || nextUnit === "LOTE") return { ...l, unit: nextUnit };
        return { ...l, unit: nextUnit, piecesPerBox: "", boxesPerLot: "", piecesPerLot: "" };
      })
    );
    setLineErrors((prev) => {
      if (!prev[i]) return prev;
      const rowErrors = { ...prev[i] };
      delete rowErrors.piecesPerBox;
      delete rowErrors.boxesPerLot;
      delete rowErrors.piecesPerLot;
      return { ...prev, [i]: rowErrors };
    });
    setFormError(null);
  };

  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
    setLineErrors({});
  };

  const addProduct = (p: ProductOption) => {
    setLines((prevLines) => {
      const existingIndex = prevLines.findIndex((l) => l.productId === String(p.id));
      if (existingIndex > -1) {
        return prevLines.map((l, idx) =>
          idx === existingIndex ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l
        );
      }
      return [
        ...prevLines,
        {
          productId: String(p.id),
          quantity: "1",
          unitCost: String(p.costPrice),
          unit: unitProfile(p.satUnitKey).def,
          piecesPerBox: "",
          boxesPerLot: "",
          piecesPerLot: "",
          lotMode: "boxes",
        },
      ];
    });
    setFormError(null);
  };

  const computedTotals = (() => {
    let subtotal = 0;
    let items = 0;
    for (const l of lines) {
      subtotal += (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
      items += Number(l.quantity) || 0;
    }
    return { total: subtotal, items };
  })();

  const submit = async () => {
    setFormError(null);
    setSuccess(null);
    const nextFieldErrors: TopFieldErrors = {};
    const nextLineErrors: LineFieldErrors = {};
    if (!branchId) nextFieldErrors.branchId = "Seleccione la sucursal de destino.";
    if (!supplierId) nextFieldErrors.supplierId = "Seleccione el proveedor.";
    const referenceError = validateReference(reference, "La referencia", { required: true, max: 80 });
    if (referenceError) nextFieldErrors.reference = referenceError;
    const notesError = validateReference(notes, "Las notas", { required: false, max: 200 });
    if (notesError) nextFieldErrors.notes = notesError;
    const selectedLines = lines.filter((l) => l.productId);
    if (selectedLines.length === 0) {
      setFormError("Debe agregar al menos un producto a la compra.");
      return;
    }
    const details: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
      unit: string;
      piecesPerBox?: number;
      boxesPerLot?: number;
      piecesPerLot?: number;
    }> = [];
    const roundedValues: Array<DecimalFieldValue | null> = [];
    for (const [index, line] of selectedLines.entries()) {
      const originalIndex = lines.indexOf(line);
      const rowErrors: Partial<Record<keyof Line, string>> = {};
      const quantity = Number(line.quantity);
      const quantityError = validateInteger(line.quantity, `La cantidad del renglón ${index + 1}`, { min: 1 });
      if (quantityError || !Number.isInteger(quantity) || quantity <= 0) {
        rowErrors.quantity = `La cantidad debe ser un entero mayor a 0.`;
      }

      const unitCostValidation = line.unitCost.trim()
        ? validateDecimalField(line.unitCost, `El costo unitario del renglón ${index + 1}`, {
          invalidMessage: `El costo unitario debe ser un número válido con máximo 3 decimales.`,
        })
        : null;
      if (unitCostValidation && !unitCostValidation.ok) {
        rowErrors.unitCost = unitCostValidation.error;
      }
      if (!line.unitCost.trim()) {
        rowErrors.unitCost = `El costo unitario es obligatorio.`;
      }

      // Conversión de unidades: obligatoria solo para CAJA y LOTE (piezas físicas
      // reales para inventario; no afecta el cálculo de dinero del renglón).
      const piecesPerBoxNum = Number(line.piecesPerBox);
      const boxesPerLotNum = Number(line.boxesPerLot);
      const piecesPerLotNum = Number(line.piecesPerLot);
      if (line.unit === "CAJA") {
        if (!line.piecesPerBox.trim() || !Number.isInteger(piecesPerBoxNum) || piecesPerBoxNum <= 0) {
          rowErrors.piecesPerBox = "Piezas por caja es obligatorio y debe ser un entero mayor a 0.";
        }
      } else if (line.unit === "LOTE") {
        if (line.lotMode === "direct") {
          if (!line.piecesPerLot.trim() || !Number.isInteger(piecesPerLotNum) || piecesPerLotNum <= 0) {
            rowErrors.piecesPerLot = "Piezas totales del lote es obligatorio y debe ser un entero mayor a 0.";
          }
        } else {
          if (!line.boxesPerLot.trim() || !Number.isInteger(boxesPerLotNum) || boxesPerLotNum <= 0) {
            rowErrors.boxesPerLot = "Cajas en el lote es obligatorio y debe ser un entero mayor a 0.";
          }
          if (!line.piecesPerBox.trim() || !Number.isInteger(piecesPerBoxNum) || piecesPerBoxNum <= 0) {
            rowErrors.piecesPerBox = "Piezas por caja es obligatorio y debe ser un entero mayor a 0.";
          }
        }
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
        ...(line.unit === "CAJA" ? { piecesPerBox: piecesPerBoxNum } : {}),
        ...(line.unit === "LOTE" && line.lotMode === "direct" ? { piecesPerLot: piecesPerLotNum } : {}),
        ...(line.unit === "LOTE" && line.lotMode === "boxes" ? { boxesPerLot: boxesPerLotNum, piecesPerBox: piecesPerBoxNum } : {}),
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
      if (roundingMessages.length > 0) showToast(roundingMessages.join(" | "), "warning");

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

  const receive = async (p: PurchaseRow) => {
    const ok = await confirm({
      title: "Recibir orden de compra",
      message: `¿Confirmas la recepción de la orden ${p.reference}?\n\nEl inventario de ${p.branch.name} se incrementará con los ${p.details.length} artículo(s) de esta orden por un total de ${money(Number(p.total))}. Esta acción no se puede deshacer.`,
      variant: "warning",
      confirmLabel: "Sí, recibir",
    });
    if (!ok) return;
    setReceiving(p.id);
    try {
      await api.put(`/api/admin/purchases/${p.id}/receive`);
      await refetchPurchases();
      showToast(`Orden ${p.reference} recibida. Inventario actualizado.`, "success");
    } catch {
      // Manejado por el interceptor global de errores (api.ts).
    } finally {
      setReceiving(null);
    }
  };

  const cancelPurchase = async (p: PurchaseRow) => {
    const ok = await confirm({
      title: "Cancelar orden de compra",
      message: `¿Seguro que deseas cancelar la orden ${p.reference} (${p.supplier.name})?\n\nLa orden quedará marcada como CANCELADA y no podrá recibirse.`,
      variant: "danger",
      confirmLabel: "Sí, cancelar orden",
      cancelLabel: "No, volver",
    });
    if (!ok) return;
    try {
      await api.put(`/api/admin/purchases/${p.id}/cancel`);
      await refetchPurchases();
      showToast(`Orden ${p.reference} cancelada.`, "info");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al cancelar la compra.", "error");
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterSupplierId !== "all" && String(p.supplier.id) !== filterSupplierId) return false;
    if (filterBranchId !== "all" && String(p.branch.id) !== filterBranchId) return false;
    return true;
  });
  const paged = usePagination(filteredPurchases, { resetKey: `${filterStatus}|${filterSupplierId}|${filterBranchId}` });

  const actionBtn = (bg: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: bg, color: "#fff",
    border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, padding: "7px 12px", height: 32,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  });

  const purchaseColumns: Column<PurchaseRow>[] = [
    {
      key: "reference",
      header: "Referencia",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--accent-strong)" }}>{p.reference}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} /> {fmtDate(p.purchaseDate)} · {fmtTime(p.purchaseDate)}
          </div>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Proveedor / Sucursal",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>{p.supplier.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <Building2 size={11} /> {p.branch.name}
          </div>
        </div>
      ),
    },
    {
      key: "details",
      header: "Artículos",
      align: "center",
      render: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, color: "var(--text-secondary)", fontWeight: 600 }}>
          <Package size={13} color="var(--text-muted)" /> {p.details.length}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (p) => <span style={{ fontWeight: 800, color: "var(--text)" }}>{money(Number(p.total))}</span>,
    },
    {
      key: "status",
      header: "Estado",
      align: "center",
      render: (p) => <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>,
    },
    {
      key: "id",
      header: "Acciones",
      align: "right",
      render: (p) =>
        p.status === "PENDIENTE" ? (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button style={actionBtn("#1e3a8a")} onClick={() => receive(p)} disabled={receiving === p.id} className="active-tap">
              {receiving === p.id ? "Recibiendo…" : <><CheckCircle size={13} /> Recibir</>}
            </button>
            <button style={actionBtn("#dc2626")} onClick={() => cancelPurchase(p)} className="active-tap">
              <Ban size={13} /> Cancelar
            </button>
          </div>
        ) : (
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
        ),
    },
  ];

  const selectedSupplier = suppliers.find((s) => String(s.id) === supplierId);

  // ---- Editor de renglones (rejilla, para medianas y grandes) ----
  // Campos de conversión de unidades (Piezas por caja / Cajas en el lote / Piezas
  // totales del lote), compartidos entre la rejilla de escritorio y las tarjetas de
  // teléfono. Solo se renderiza cuando la unidad del renglón es CAJA o LOTE.
  const renderUnitConversionRow = (l: Line, i: number, variant: "grid" | "card") => {
    if (l.unit !== "CAJA" && l.unit !== "LOTE") return null;
    const err = lineErrors[i] || {};

    const wrapStyle: React.CSSProperties =
      variant === "grid"
        ? { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12, padding: "10px 14px", backgroundColor: "var(--surface-2)", borderTop: "1px dashed var(--border-soft)" }
        : { display: "flex", flexDirection: "column", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border-soft)" };

    const conversionField = (label: string, key: "piecesPerBox" | "boxesPerLot" | "piecesPerLot") => (
      <div style={{ minWidth: 130 }}>
        <label style={styles.miniLabel}>{label}</label>
        <input
          type="text"
          inputMode="numeric"
          value={l[key]}
          onChange={(e) => setLine(i, key, e.target.value)}
          placeholder="0"
          style={{ ...ui.input, padding: "8px 10px", height: 36, borderColor: err[key] ? "#fca5a5" : "var(--border)" }}
        />
        {err[key] && <p style={styles.fieldError}>{err[key]}</p>}
      </div>
    );

    if (l.unit === "CAJA") {
      return <div style={wrapStyle}>{conversionField("Piezas por caja", "piecesPerBox")}</div>;
    }

    // LOTE: toggle entre "Por cajas" (boxesPerLot × piecesPerBox) y "Total directo" (piecesPerLot).
    return (
      <div style={wrapStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
            <button
              type="button"
              onClick={() => setLineLotMode(i, "boxes")}
              className="active-tap"
              style={{
                padding: "6px 12px", fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
                backgroundColor: l.lotMode === "boxes" ? "var(--accent)" : "var(--surface)",
                color: l.lotMode === "boxes" ? "#fff" : "var(--text-secondary)",
              }}
            >
              Por cajas
            </button>
            <button
              type="button"
              onClick={() => setLineLotMode(i, "direct")}
              className="active-tap"
              style={{
                padding: "6px 12px", fontSize: 11, fontWeight: 700, border: "none", borderLeft: "1px solid var(--border)", cursor: "pointer",
                backgroundColor: l.lotMode === "direct" ? "var(--accent)" : "var(--surface)",
                color: l.lotMode === "direct" ? "#fff" : "var(--text-secondary)",
              }}
            >
              Total directo
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {l.lotMode === "direct"
              ? conversionField("Piezas totales del lote", "piecesPerLot")
              : (
                <>
                  {conversionField("Cajas en el lote", "boxesPerLot")}
                  {conversionField("Piezas por caja", "piecesPerBox")}
                </>
              )}
          </div>
        </div>
      </div>
    );
  };

  const renderLineGrid = () => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: LINE_COLS, gap: 12, alignItems: "center", padding: "9px 14px", backgroundColor: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
        {["Producto", "Cantidad", "Unidad", "Costo unit.", "Importe", ""].map((h, idx) => (
          <span key={idx} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: idx >= 3 && idx <= 4 ? "right" : idx === 1 || idx === 2 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {lines.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "26px 12px", fontSize: 13 }}>
          Aún no hay productos. Usa el buscador de arriba para incluir artículos en la orden.
        </div>
      ) : (
        lines.map((l, i) => {
          const prod = productById(l.productId);
          const units = unitProfile(prod?.satUnitKey).units;
          const err = lineErrors[i] || {};
          return (
            <div key={i} style={{ borderBottom: i < lines.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: LINE_COLS, gap: 12, alignItems: "start", padding: "12px 14px" }}>
                <div style={{ minWidth: 0, paddingTop: 4 }}>
                  <div style={{ fontWeight: 600, color: "var(--text)", overflowWrap: "anywhere" }}>{prod?.name || "Desconocido"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>SKU: {prod?.sku || "—"}</div>
                </div>
                <div>
                  <QtyStepper value={l.quantity} onChange={(v) => setLine(i, "quantity", v)} onStep={(d) => stepQuantity(i, d)} error={!!err.quantity} />
                  {err.quantity && <p style={styles.fieldError}>{err.quantity}</p>}
                </div>
                <select style={{ ...ui.input, padding: "8px 6px", textAlign: "center", height: 38 }} value={l.unit} onChange={(e) => changeLineUnit(i, e.target.value)}>
                  {units.map((u) => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                  {!units.includes(l.unit) && <option value={l.unit}>{UNIT_LABELS[l.unit] || l.unit}</option>}
                </select>
                <div>
                  <input type="text" inputMode="decimal" style={{ ...ui.input, padding: "8px 10px", textAlign: "right", height: 38, borderColor: err.unitCost ? "#fca5a5" : "var(--border)" }} value={l.unitCost} onChange={(e) => setDecimalLine(i, e.target.value)} placeholder="0.00" />
                  {err.unitCost && <p style={styles.fieldError}>{err.unitCost}</p>}
                </div>
                <div style={{ textAlign: "right", fontWeight: 800, color: "var(--accent-strong)", paddingTop: 9 }}>
                  {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                </div>
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, marginTop: 3, justifySelf: "center" }} title="Quitar renglón" className="active-tap">
                  <Trash2 size={16} color="#b91c1c" />
                </button>
              </div>
              {renderUnitConversionRow(l, i, "grid")}
            </div>
          );
        })
      )}
    </div>
  );

  // ---- Editor de renglones (tarjetas, para teléfono) ----
  const renderLineCards = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px 12px", fontSize: 13, backgroundColor: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--border)" }}>
          Aún no hay productos. Usa el buscador de arriba para incluir artículos en la orden.
        </div>
      ) : (
        lines.map((l, i) => {
          const prod = productById(l.productId);
          const units = unitProfile(prod?.satUnitKey).units;
          const err = lineErrors[i] || {};
          return (
            <div key={i} style={{ padding: 14, backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", overflowWrap: "anywhere" }}>{prod?.name || "Desconocido"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>SKU: {prod?.sku || "—"}</div>
                </div>
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }} title="Quitar renglón">
                  <Trash2 size={16} color="#b91c1c" />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={styles.miniLabel}>Cantidad</label>
                  <QtyStepper value={l.quantity} onChange={(v) => setLine(i, "quantity", v)} onStep={(d) => stepQuantity(i, d)} error={!!err.quantity} compact />
                  {err.quantity && <p style={styles.fieldError}>{err.quantity}</p>}
                </div>
                <div>
                  <label style={styles.miniLabel}>Unidad</label>
                  <select style={{ ...ui.input, padding: "8px 6px", textAlign: "center", height: 38 }} value={l.unit} onChange={(e) => changeLineUnit(i, e.target.value)}>
                    {units.map((u) => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                    {!units.includes(l.unit) && <option value={l.unit}>{UNIT_LABELS[l.unit] || l.unit}</option>}
                  </select>
                </div>
                <div>
                  <label style={styles.miniLabel}>Costo unit.</label>
                  <input type="text" inputMode="decimal" style={{ ...ui.input, padding: "8px 10px", textAlign: "right", height: 38, borderColor: err.unitCost ? "#fca5a5" : "var(--border)" }} value={l.unitCost} onChange={(e) => setDecimalLine(i, e.target.value)} placeholder="0.00" />
                  {err.unitCost && <p style={styles.fieldError}>{err.unitCost}</p>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <label style={{ ...styles.miniLabel, textAlign: "right" }}>Importe</label>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "var(--accent-strong)", paddingTop: 8 }}>
                    {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                  </div>
                </div>
              </div>
              {renderUnitConversionRow(l, i, "card")}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div>
      <style>{`
        .cmp-modal-item { transition: border-color .15s ease, background-color .15s ease; }
        .cmp-modal-item:hover { border-color: var(--accent) !important; background-color: var(--surface-2) !important; }
        .cmp-supplier-row:hover { background-color: var(--surface-2) !important; }
        .cmp-step:hover { background-color: var(--surface-3) !important; }
      `}</style>

      <SectionHeader
        title="Compras"
        subtitle="Órdenes de compra — el inventario se actualiza al recibir la mercancía"
      />

      {/* En desktop (>1024px) el formulario y el historial van lado a lado (38/62).
          En tablet/móvil se mantiene el apilado vertical original. */}
      <div
        style={
          isStackedLayout
            ? undefined
            : { display: "grid", gridTemplateColumns: "minmax(320px, 38%) minmax(0, 1fr)", gap: 20, alignItems: "start" }
        }
      >
        <div style={isStackedLayout ? undefined : { minWidth: 0 }}>
          {/* ============ NUEVA ORDEN ============ */}
          <Panel style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
              <span style={{ display: "inline-flex", width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                <ShoppingCart size={17} />
              </span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Nueva orden de compra</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Selecciona proveedor y sucursal, agrega productos y registra la orden.</div>
              </div>
            </div>

            <div style={{ padding: 15 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
                <div>
                  <label style={ui.fieldLabel}>Sucursal de destino *</label>
                  <select
                    style={{ ...ui.input, ...(fieldErrors.branchId ? { borderColor: "#fca5a5" } : {}) }}
                    value={branchId}
                    onChange={(e) => { setBranchId(e.target.value); setFieldErrors((prev) => ({ ...prev, branchId: undefined })); }}
                  >
                    <option value="">Seleccione…</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {fieldErrors.branchId && <p style={styles.fieldError}>{fieldErrors.branchId}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Proveedor *</label>
                  <button
                    type="button"
                    style={{ ...ui.input, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", cursor: "pointer", height: 38, ...(fieldErrors.supplierId ? { borderColor: "#fca5a5" } : {}) }}
                    onClick={() => { setSupplierSearch(""); setSupplierModalOpen(true); }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: selectedSupplier ? "var(--text)" : "var(--text-muted)", fontSize: 14, minWidth: 0 }}>
                      <Truck size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedSupplier ? selectedSupplier.name : "Seleccione proveedor…"}</span>
                    </span>
                    <ChevronDown size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  </button>
                  {fieldErrors.supplierId && <p style={styles.fieldError}>{fieldErrors.supplierId}</p>}
                </div>
              </div>

              {/* Selección de productos: buscador + resultados + editor de renglones + total, agrupados en una sola tarjeta */}
              <div style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ marginBottom: 10 }}>
                  <SearchBox
                    value={productSearch}
                    onChange={setProductSearch}
                    placeholder={supplierId ? "Buscar producto por nombre o SKU para agregar…" : "Selecciona un proveedor para buscar productos"}
                    disabled={!supplierId}
                    autoFocus={false}
                  />
                  {supplierId && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "1px solid var(--border-soft)", borderRadius: 8, backgroundColor: "var(--surface)" }}>
                        {loadingProducts ? (
                          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 12, fontSize: 12 }}>Cargando productos del proveedor…</div>
                        ) : (() => {
                          const filtered = filterProductsBySearch(productPool, productSearch);
                          if (filtered.length === 0) {
                            return <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 12, fontSize: 12 }}>No se encontraron productos con esa búsqueda.</div>;
                          }
                          return filtered.map((p) => {
                            return (
                              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", backgroundColor: "var(--surface)" }} className="cmp-modal-item">
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflowWrap: "anywhere" }}>{p.name}</div>
                                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>SKU: {p.sku} · Costo base: {money(p.costPrice)} · {UNIT_LABELS[unitProfile(p.satUnitKey).def]}</div>
                                </div>
                                <button type="button" style={{ ...actionBtn("#1e3a8a"), flexShrink: 0 }} className="active-tap" onClick={() => addProduct(p)}>
                                  <Plus size={13} /> Agregar
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0" }} />

                <label style={{ ...ui.fieldLabel, marginBottom: 6 }}>Productos en la orden ({lines.length})</label>
                {isPhone || !isStackedLayout ? renderLineCards() : renderLineGrid()}

                {/* Barra: total (con wrap para evitar encimados) */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "flex-end", alignItems: "center", marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "8px 16px", borderRadius: 10, backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
                      {computedTotals.items} artículo{computedTotals.items === 1 ? "" : "s"}
                    </span>
                    <span style={{ width: 1, height: 20, backgroundColor: "var(--border)" }} />
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Total estimado</span>
                    <span style={{ fontSize: 19, fontWeight: 800, color: "var(--accent-strong)", whiteSpace: "nowrap" }}>{money(computedTotals.total)}</span>
                  </div>
                </div>
              </div>

              {formError && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>{formError}</p>}
              {success && (
                <p style={{ color: "#15803d", fontSize: 13, fontWeight: 700, marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={16} /> {success}
                </p>
              )}

              {/* Notas + acción */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ ...ui.fieldLabel, marginBottom: 0 }}>Notas (opcional)</label>
                    <span style={{ fontSize: 11, color: notes.length >= 200 ? "var(--color-danger)" : "var(--text-muted)", fontWeight: 600 }}>{notes.length} / 200</span>
                  </div>
                  <textarea
                    style={{ ...ui.input, resize: "vertical", minHeight: 44, fontSize: 13, ...(fieldErrors.notes ? { borderColor: "#fca5a5" } : {}) }}
                    value={notes}
                    maxLength={200}
                    onChange={(e) => { setNotes(e.target.value); setFieldErrors((prev) => ({ ...prev, notes: undefined })); }}
                    placeholder="Observaciones sobre la compra…"
                  />
                  {fieldErrors.notes && <p style={styles.fieldError}>{fieldErrors.notes}</p>}
                </div>
                <button style={{ ...ui.primaryBtn, height: 40, flexShrink: 0 }} className="active-tap" onClick={submit} disabled={saving}>
                  <CheckCircle2 size={16} /> {saving ? "Guardando…" : "Crear orden de compra"}
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <div style={isStackedLayout ? undefined : { minWidth: 0 }}>
          {/* ============ HISTORIAL ============ */}
          <Panel style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: isPhone ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, flexDirection: isPhone ? "column" : "row", padding: "14px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                Órdenes de compra
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 10px" }}>{filteredPurchases.length}</span>
              </h3>
              <Toolbar style={isPhone ? { width: "100%", flexWrap: "wrap", marginBottom: 0 } : { marginBottom: 0 }}>
                <FilterSelect
                  value={filterStatus}
                  onChange={setFilterStatus}
                  style={isPhone ? { flex: 1, minWidth: 120 } : undefined}
                  options={[
                    { value: "all", label: "Todos los estados" },
                    { value: "PENDIENTE", label: "Pendiente" },
                    { value: "RECIBIDA", label: "Recibida" },
                    { value: "CANCELADA", label: "Cancelada" },
                  ]}
                />
                <FilterSelect
                  value={filterBranchId}
                  onChange={setFilterBranchId}
                  style={isPhone ? { flex: 1, minWidth: 120 } : undefined}
                  options={[{ value: "all", label: "Todas las sucursales" }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]}
                />
                <FilterSelect
                  value={filterSupplierId}
                  onChange={setFilterSupplierId}
                  style={isPhone ? { flex: 1, minWidth: 120 } : undefined}
                  options={[{ value: "all", label: "Todos los proveedores" }, ...suppliers.map((s) => ({ value: String(s.id), label: s.name }))]}
                />
              </Toolbar>
            </div>

            <div style={{ padding: 15 }}>
              {isPhone ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {purchasesLoading && (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información…</div>
                  )}
                  {!purchasesLoading && filteredPurchases.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>No hay órdenes de compra con los filtros seleccionados.</div>
                  )}
                  {!purchasesLoading && paged.pageItems.map((p) => {
                    const isExpanded = expandedPurchases[p.id];
                    return (
                      <div key={p.id} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, boxShadow: "var(--shadow-card, 0 1px 2px rgba(0,0,0,0.05))" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)", overflowWrap: "anywhere" }}>{p.reference}</span>
                              <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <Truck size={13} /> {p.supplier.name} <span style={{ color: "var(--border-strong)" }}>·</span> <Building2 size={13} /> {p.branch.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                              <Calendar size={13} color="var(--accent)" /> {fmtDate(p.purchaseDate)} {fmtTime(p.purchaseDate)}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-strong)", marginTop: 6 }}>{money(Number(p.total))}</div>
                          </div>
                          <button onClick={() => toggleExpand(p.id)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0, flexShrink: 0 }} className="active-tap">
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>

                        {p.status === "PENDIENTE" && (
                          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            <button style={{ ...actionBtn("#1e3a8a"), flex: 1, justifyContent: "center", height: 38 }} onClick={() => receive(p)} disabled={receiving === p.id} className="active-tap">
                              <CheckCircle size={15} /> {receiving === p.id ? "Recibiendo…" : "Recibir"}
                            </button>
                            <button style={{ ...actionBtn("#dc2626"), flex: 1, justifyContent: "center", height: 38 }} onClick={() => cancelPurchase(p)} className="active-tap">
                              <Ban size={15} /> Cancelar
                            </button>
                          </div>
                        )}

                        {isExpanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                            <div style={{ backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 14 }}>
                              <h4 style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Artículos ({p.details.length})</h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {p.details.map((d) => (
                                  <div key={d.id} style={{ borderBottom: "1px dashed var(--border)", paddingBottom: 10 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere", marginBottom: 2 }}>{d.product.name}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>SKU: {d.product.sku}</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{d.quantity} {(UNIT_LABELS[(d.unit || "").toUpperCase()] || d.unit || "pieza").toLowerCase()}</span>
                                      <span style={{ color: "var(--text-faint)", fontSize: 12 }}>×</span>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{money(d.unitCost)}</span>
                                      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>=</span>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>{money(d.quantity * d.unitCost)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {p.notes && (
                                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Notas</div>
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
                  maxHeight="calc(100vh - 275px)"
                />
              )}

              {!purchasesLoading && (
                <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="órdenes" />
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* MODAL SELECCIÓN PROVEEDOR */}
      {supplierModalOpen && (
        <div style={ui.overlay} onClick={() => setSupplierModalOpen(false)}>
          <div style={{ ...ui.modal, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <h3 style={ui.modalTitle}>Seleccionar proveedor</h3>
              <button onClick={() => setSupplierModalOpen(false)} style={styles.modalClose} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div style={ui.modalBody}>
              <SearchBox value={supplierSearch} onChange={setSupplierSearch} placeholder="Buscar proveedor…" />
              <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
                {suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map((s) => (
                  <button
                    key={s.id}
                    style={{ textAlign: "left", padding: "11px 14px", borderRadius: 8, border: "1px solid transparent", backgroundColor: String(s.id) === supplierId ? "var(--surface-2)" : "transparent", color: "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: String(s.id) === supplierId ? 700 : 500, display: "flex", alignItems: "center", gap: 9 }}
                    className="active-tap cmp-supplier-row"
                    onClick={() => { setSupplierId(String(s.id)); setLines([]); setLineErrors({}); setFieldErrors((prev) => ({ ...prev, supplierId: undefined })); setSupplierModalOpen(false); }}
                  >
                    <Truck size={15} color="var(--text-muted)" /> {s.name}
                  </button>
                ))}
                {suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 16, fontSize: 13 }}>No se encontraron proveedores.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Stepper de cantidad con botones − / +.
const QtyStepper: React.FC<{ value: string; onChange: (v: string) => void; onStep: (delta: number) => void; error?: boolean; compact?: boolean }> = ({ value, onChange, onStep, error }) => (
  <div style={{ display: "flex", alignItems: "center", border: `1px solid ${error ? "#fca5a5" : "var(--border)"}`, borderRadius: 8, overflow: "hidden", height: 38, backgroundColor: "var(--input-bg)" }}>
    <button type="button" onClick={() => onStep(-1)} className="cmp-step active-tap" style={stepBtnStyle} title="Disminuir" aria-label="Disminuir cantidad"><Minus size={14} /></button>
    <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" placeholder="0" style={{ flex: 1, width: "100%", minWidth: 0, border: "none", outline: "none", textAlign: "center", fontSize: 13, fontWeight: 700, background: "transparent", color: "var(--text)", fontFamily: "inherit" }} />
    <button type="button" onClick={() => onStep(1)} className="cmp-step active-tap" style={stepBtnStyle} title="Aumentar" aria-label="Aumentar cantidad"><Plus size={14} /></button>
  </div>
);

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; autoFocus?: boolean }> = ({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus = true,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", height: 40, backgroundColor: disabled ? "var(--surface-2)" : "var(--input-bg)", opacity: disabled ? 0.7 : 1 }}>
    <Search size={16} color="var(--text-muted)" />
    <input
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ border: "none", outline: "none", background: "transparent", width: "100%", fontSize: 14, color: "var(--text)", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "text" }}
    />
  </div>
);

const stepBtnStyle: React.CSSProperties = {
  width: 32, height: "100%", border: "none", backgroundColor: "var(--surface-2)", color: "var(--text-secondary)",
  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
};

const styles: { [key: string]: React.CSSProperties } = {
  fieldError: { color: "#b91c1c", fontSize: 12, fontWeight: 600, marginTop: 5 },
  miniLabel: { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 4 },
  modalClose: { background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex", padding: 4, borderRadius: 6 },
};

export default ComprasView;
