import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Search, X } from "lucide-react";
import {
  adminCategoryService,
  fetchAllAdminCategoryProducts,
  getAdminCategoryErrorMessage,
  type AdminCategoryDetail,
  type AdminCategoryProduct,
} from "../../services/categoryAdmin.service";
import { getCategoryDisplayColor } from "./categoryColors";
import { matchesProductAssignmentSearch } from "./categoryHelpers";
import { money, ui, useMediaQuery } from "../../views/shared";

interface CategoryProductsModalProps {
  category: AdminCategoryDetail | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function CategoryProductsModal({ category, onClose, onSaved }: CategoryProductsModalProps) {
  const compact = useMediaQuery("(max-width: 620px)");
  const [associated, setAssociated] = useState<AdminCategoryProduct[]>([]);
  const [available, setAvailable] = useState<AdminCategoryProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!category) return;

    setLoading(true);
    setError(null);
    setAssociated([]);
    setAvailable([]);
    setSelectedIds(new Set());
    setSearch("");

    try {
      const [categoryProducts, uncategorizedProducts] = await Promise.all([
        fetchAllAdminCategoryProducts((params) => adminCategoryService.listProducts(category.id, params)),
        fetchAllAdminCategoryProducts((params) => adminCategoryService.listUncategorizedProducts(params)),
      ]);
      const associatedIds = new Set(categoryProducts.map((product) => product.id));
      setAssociated(categoryProducts);
      setAvailable(uncategorizedProducts.filter((product) => !associatedIds.has(product.id)));
      setSelectedIds(associatedIds);
    } catch (err: unknown) {
      setError(getAdminCategoryErrorMessage(err, "No se pudieron cargar los productos de la categoria."));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    if (!category) return;
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [category, loadProducts]);

  const filteredAssociated = useMemo(
    () => associated.filter((product) => matchesProductAssignmentSearch(product, search)),
    [associated, search]
  );
  const filteredAvailable = useMemo(
    () => available.filter((product) => matchesProductAssignmentSearch(product, search)),
    [available, search]
  );

  if (!category) return null;

  const toggleProduct = (product: AdminCategoryProduct) => {
    if (!product.active && !selectedIds.has(product.id)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
  };

  const saveProducts = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      await adminCategoryService.replaceProducts(category.id, [...selectedIds].sort((a, b) => a - b));
      onSaved("Productos de la categoria actualizados correctamente.");
      onClose();
    } catch (err: unknown) {
      setError(getAdminCategoryErrorMessage(err, "No se pudieron actualizar los productos de la categoria."));
    } finally {
      setSaving(false);
    }
  };

  const renderProduct = (product: AdminCategoryProduct, section: "associated" | "available") => {
    const checked = selectedIds.has(product.id);
    const disabled = saving || (!product.active && !checked);

    return (
      <label
        key={`${section}-${product.id}`}
        style={{
          ...styles.productRow,
          gridTemplateColumns: compact ? "18px minmax(0, 1fr)" : "18px minmax(0, 1fr) auto",
          opacity: disabled && !checked ? 0.6 : 1,
          backgroundColor: checked ? "var(--accent-soft)" : "var(--surface)",
          borderColor: checked ? "#93c5fd" : "var(--border)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => toggleProduct(product)}
          style={styles.checkbox}
        />
        <span style={styles.productMain}>
          <span style={styles.productName} title={`${product.sku} · ${product.name}`}>{product.sku} · {product.name}</span>
          <span
            style={styles.productMeta}
            title={`${product.barcode ? `${product.barcode} · ` : ""}${product.description || "Sin descripcion"}`}
          >
            {product.barcode ? `${product.barcode} · ` : ""}
            {product.description || "Sin descripcion"}
          </span>
        </span>
        <span style={{ ...styles.productAside, ...(compact ? styles.productAsideCompact : {}) }}>
          <span style={styles.price}>{money(product.sellPrice)}</span>
          {!product.active && <span style={styles.inactiveBadge}>Inactivo</span>}
        </span>
      </label>
    );
  };

  const noResults = !loading && !error && filteredAssociated.length === 0 && filteredAvailable.length === 0;
  const categoryColor = getCategoryDisplayColor(category.color, category.level, category.active);

  return (
    <div style={styles.overlay} onClick={() => !saving && onClose()}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={ui.modalHeader}>
          <div>
            <div style={ui.modalTitle}>Gestionar productos</div>
            <div style={styles.subtitle}>
              <span
                style={{
                  ...styles.categoryColorDot,
                  backgroundColor: categoryColor,
                  opacity: category.active ? 1 : 0.45,
                }}
              />
              {category.code} · {category.name}
            </div>
          </div>
          <button type="button" style={{ ...ui.ghostBtn, padding: "6px 10px" }} onClick={onClose} disabled={saving}>
            <X size={16} />
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.searchBox}>
            <Search size={16} color="var(--text-muted)" />
            <input
              style={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar SKU, codigo o producto"
            />
          </div>

          <div style={styles.counter}>Productos seleccionados: {selectedIds.size}</div>

          {loading && <div style={styles.stateBox}>Cargando productos...</div>}

          {error && (
            <div style={styles.errorBox}>
              <span>{error}</span>
              <button type="button" style={ui.linkBtn} onClick={() => void loadProducts()}>
                Reintentar
              </button>
            </div>
          )}

          {noResults && <div style={styles.stateBox}>No se encontraron productos con esa busqueda.</div>}

          {!loading && !error && !noResults && (
            <div style={styles.columns}>
              <section style={styles.section}>
                <div style={styles.sectionTitle}>Productos asociados</div>
                <div style={styles.productList}>
                  {filteredAssociated.length === 0
                    ? <div style={styles.emptySmall}>Sin productos asociados en esta busqueda.</div>
                    : filteredAssociated.map((product) => renderProduct(product, "associated"))}
                </div>
              </section>

              <section style={styles.section}>
                <div style={styles.sectionTitle}>Productos disponibles</div>
                <div style={styles.productList}>
                  {filteredAvailable.length === 0
                    ? <div style={styles.emptySmall}>No hay productos sin categoria disponibles.</div>
                    : filteredAvailable.map((product) => renderProduct(product, "available"))}
                </div>
              </section>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }} onClick={() => void saveProducts()} disabled={saving || loading}>
            {saving ? "Guardando..." : "Guardar asignacion"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 360,
    padding: 16,
  },
  modal: {
    ...ui.modal,
    width: "min(980px, calc(100vw - 24px))",
    maxWidth: 980,
    maxHeight: "90vh",
  },
  subtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 4,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  categoryColorDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    border: "1px solid rgba(15, 23, 42, 0.14)",
    flexShrink: 0,
  },
  body: {
    padding: 22,
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
  },
  searchBox: {
    minHeight: 40,
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--input-bg)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    marginBottom: 10,
  },
  searchInput: {
    border: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 13,
    width: "100%",
    minWidth: 0,
  },
  counter: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 14,
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  section: {
    minWidth: 0,
  },
  sectionTitle: {
    color: "var(--accent-strong)",
    fontSize: 13,
    fontWeight: 900,
    marginBottom: 8,
  },
  productList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 420,
    overflowY: "auto",
    padding: "0 3px 4px 0",
  },
  productRow: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "11px 12px",
    display: "grid",
    alignItems: "start",
    gap: "8px 12px",
    minHeight: 76,
    flexShrink: 0,
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "var(--accent)",
    marginTop: 2,
    flexShrink: 0,
  },
  productMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  productName: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.3,
    overflow: "hidden",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    display: "-webkit-box" as CSSProperties["display"],
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as CSSProperties["WebkitBoxOrient"],
  },
  productMeta: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.35,
    overflow: "hidden",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    display: "-webkit-box" as CSSProperties["display"],
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as CSSProperties["WebkitBoxOrient"],
  },
  productAside: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "flex-end",
    justifySelf: "end",
    gap: 5,
    minWidth: 88,
    flexShrink: 0,
  },
  productAsideCompact: {
    gridColumn: "2 / 3",
    justifySelf: "flex-start",
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    minWidth: 0,
    marginTop: 2,
  },
  price: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: "nowrap",
    lineHeight: 1.2,
  },
  inactiveBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(245,158,11,0.14)",
    color: "#b45309",
    padding: "2px 7px",
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },
  stateBox: {
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: "24px 16px",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
  },
  errorBox: {
    border: "1px solid var(--color-danger)",
    borderRadius: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    color: "var(--color-danger)",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
    fontWeight: 700,
  },
  emptySmall: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: 14,
    textAlign: "center",
  },
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "14px 22px",
    display: "flex",
    gap: 10,
    backgroundColor: "var(--surface-2)",
    flexWrap: "wrap",
  },
};
