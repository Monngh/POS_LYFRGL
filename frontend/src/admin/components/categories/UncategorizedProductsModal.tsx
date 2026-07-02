import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Search, X } from "lucide-react";
import {
  adminCategoryService,
  fetchAllAdminCategoryProducts,
  getAdminCategoryErrorMessage,
  type AdminCategoryProduct,
} from "../../services/categoryAdmin.service";
import { matchesProductAssignmentSearch } from "./categoryHelpers";
import { Badge, money, ui, useMediaQuery } from "../../views/shared";

interface UncategorizedProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClassifyProduct: (productId: number) => Promise<void> | void;
}

export function UncategorizedProductsModal({ isOpen, onClose, onClassifyProduct }: UncategorizedProductsModalProps) {
  const compact = useMediaQuery("(max-width: 720px)");
  const [products, setProducts] = useState<AdminCategoryProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [classifyingId, setClassifyingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await fetchAllAdminCategoryProducts((params) =>
        adminCategoryService.listUncategorizedProducts(params)
      );
      setProducts(rows);
    } catch (err: unknown) {
      setError(getAdminCategoryErrorMessage(err, "No se pudieron cargar los productos sin categoria."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setSearch("");
      setClassifyingId(null);
      void loadProducts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadProducts]);

  const filteredProducts = useMemo(
    () => products.filter((product) => matchesProductAssignmentSearch(product, search)),
    [products, search]
  );

  if (!isOpen) return null;

  const classify = async (product: AdminCategoryProduct) => {
    if (classifyingId !== null) return;
    setClassifyingId(product.id);
    try {
      await onClassifyProduct(product.id);
    } finally {
      setClassifyingId(null);
    }
  };

  return (
    <div style={styles.overlay} onClick={() => classifyingId === null && onClose()}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={ui.modalHeader}>
          <div>
            <div style={ui.modalTitle}>Productos sin categoria</div>
            <div style={styles.subtitle}>{products.length} producto{products.length === 1 ? "" : "s"}</div>
          </div>
          <button type="button" style={{ ...ui.ghostBtn, padding: "6px 10px" }} onClick={onClose} disabled={classifyingId !== null}>
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

          {loading && <div style={styles.stateBox}>Cargando productos...</div>}

          {error && (
            <div style={styles.errorBox}>
              <span>{error}</span>
              <button type="button" style={ui.linkBtn} onClick={() => void loadProducts()}>
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <div style={styles.stateBox}>No se encontraron productos con esa busqueda.</div>
          )}

          {!loading && !error && filteredProducts.length > 0 && (
            <div style={styles.productList}>
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  style={{
                    ...styles.productRow,
                    gridTemplateColumns: compact ? "1fr" : "minmax(220px, 1fr) minmax(120px, .7fr) auto auto auto",
                    alignItems: compact ? "stretch" : "center",
                  }}
                >
                  <div style={styles.productMain}>
                    <span style={styles.sku}>{product.sku}</span>
                    <strong style={styles.productName}>{product.name}</strong>
                    <span style={styles.description}>{product.description || "Sin descripcion"}</span>
                  </div>
                  <span style={styles.meta}>{product.barcode || "Sin codigo"}</span>
                  <span style={styles.price}>{money(product.sellPrice)}</span>
                  <span style={styles.status}>
                    {product.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}
                  </span>
                  <button
                    type="button"
                    style={{ ...ui.primaryBtn, justifyContent: "center", minWidth: 108, ...(compact ? { width: "100%" } : {}) }}
                    onClick={() => void classify(product)}
                    disabled={classifyingId !== null}
                  >
                    {classifyingId === product.id ? "Abriendo..." : "Clasificar"}
                  </button>
                </div>
              ))}
            </div>
          )}
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
    width: "min(920px, calc(100vw - 24px))",
    maxWidth: 920,
    maxHeight: "90vh",
  },
  subtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 4,
    fontWeight: 700,
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
    marginBottom: 14,
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
  productList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  productRow: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    padding: "11px 12px",
    display: "grid",
    alignItems: "center",
    gap: 12,
  },
  productMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  sku: {
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 900,
  },
  productName: {
    color: "var(--text)",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  description: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  meta: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  price: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  status: {
    display: "inline-flex",
    justifyContent: "center",
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
};
