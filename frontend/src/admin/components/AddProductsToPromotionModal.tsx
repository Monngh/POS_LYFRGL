import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PackageMinus, PackagePlus, X } from "lucide-react";
import {
  adminCategoryService,
  type AdminCategoryFlatItem,
} from "../services/categoryAdmin.service";
import {
  getAvailablePromotionProducts,
  addProductsToPromotion,
  removeProductFromPromotion,
  getPromotionApiError,
} from "../utils/promotionsApi";
import type {
  AvailablePromotionProduct,
  PromotionAssociatedProduct,
  PromotionProductScope,
} from "../types/promotions.types";
import { Badge, SearchInput, ui, moneyExact, useMediaQuery } from "../views/shared";
import { useToast } from "../../shared/context/ToastContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const fmt = (n: number) => mxnFmt.format(Number(n));

const SCOPE_OPTIONS: { label: string; value: PromotionProductScope }[] = [
  { label: "Todos los productos", value: "ALL" },
  { label: "Por división", value: "DIVISION" },
  { label: "Por departamento", value: "DEPARTMENT" },
  { label: "Por categoría", value: "CATEGORY" },
  { label: "Productos sin categoría", value: "UNCATEGORIZED" },
];

const SCOPE_NEEDS_CATEGORY: PromotionProductScope[] = ["DIVISION", "DEPARTMENT", "CATEGORY"];
const LIMIT = 10;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AddProductsToPromotionModalProps {
  promotionId: number;
  promotionName: string;
  promotionStartDate: string | Date;
  associatedProducts: PromotionAssociatedProduct[];
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

type ModalTab = "associated" | "available";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const AddProductsToPromotionModal: React.FC<AddProductsToPromotionModalProps> = ({
  promotionId,
  promotionName,
  promotionStartDate,
  associatedProducts,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [activeTab, setActiveTab] = useState<ModalTab>(associatedProducts.length > 0 ? "associated" : "available");

  // ── Filters state ──────────────────────────────────────────────────────────
  const [scope, setScope] = useState<PromotionProductScope>("ALL");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── Categories state ───────────────────────────────────────────────────────
  const [allCategories, setAllCategories] = useState<AdminCategoryFlatItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // ── Products state ─────────────────────────────────────────────────────────
  const [products, setProducts] = useState<AvailablePromotionProduct[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: LIMIT, total: 0, totalPages: 1 });
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const promotionStart = useMemo(() => new Date(promotionStartDate), [promotionStartDate]);
  const promotionStarted = Number.isFinite(promotionStart.getTime()) && promotionStart <= new Date();
  const canRemoveAssociated = !promotionStarted;

  useEffect(() => {
    setActiveTab(associatedProducts.length > 0 ? "associated" : "available");
  }, [promotionId, associatedProducts.length]);

  // ── Debounce search ────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // ── Load categories once ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setCategoriesLoading(true);
    adminCategoryService
      .listFlat({ active: true })
      .then((data) => {
        if (!cancelled) setAllCategories(data);
      })
      .catch(() => {
        if (!cancelled) setAllCategories([]);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Filtered categories by scope ───────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    if (!SCOPE_NEEDS_CATEGORY.includes(scope)) return [];
    return allCategories.filter((cat) => cat.level === scope);
  }, [allCategories, scope]);

  // ── Load products ──────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    // For DIVISION, DEPARTMENT, CATEGORY we need a valid categoryId
    if (SCOPE_NEEDS_CATEGORY.includes(scope) && !categoryId) {
      setProducts([]);
      setPagination({ page: 1, limit: LIMIT, total: 0, totalPages: 1 });
      return;
    }

    setProductsLoading(true);
    setProductsError(null);
    try {
      const result = await getAvailablePromotionProducts(promotionId, {
        search: debouncedSearch.trim() || undefined,
        scope,
        categoryId: SCOPE_NEEDS_CATEGORY.includes(scope) ? categoryId : undefined,
        page,
        limit: LIMIT,
        includeAssociated: true,
      });
      setProducts(result.products);
      setPagination(
        result.pagination ?? { page, limit: LIMIT, total: result.products.length, totalPages: 1 }
      );
    } catch (err: unknown) {
      const backendMessage = getPromotionApiError(err, "Error desconocido");
      setProductsError(`No se pudieron cargar los productos: ${backendMessage}`);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [promotionId, scope, categoryId, debouncedSearch, page]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // ── Scope change ───────────────────────────────────────────────────────────
  const handleScopeChange = (newScope: PromotionProductScope) => {
    setScope(newScope);
    setCategoryId(undefined);
    setSelectedIds(new Set());
    setPage(1);
  };

  // ── Category change ────────────────────────────────────────────────────────
  const handleCategoryChange = (id: number | undefined) => {
    setCategoryId(id);
    setSelectedIds(new Set());
    setPage(1);
  };

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleProduct = (id: number, alreadyAssociated: boolean) => {
    if (alreadyAssociated) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      products.forEach((p) => {
        if (!p.alreadyAssociated) next.add(p.id);
      });
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addProductsToPromotion(promotionId, Array.from(selectedIds));
      showToast(
        `${selectedIds.size} producto${selectedIds.size === 1 ? "" : "s"} agregado${selectedIds.size === 1 ? "" : "s"} a la promoción.`,
        "success"
      );
      setSelectedIds(new Set());
      await onSuccess();
      await loadProducts();
      setActiveTab("associated");
    } catch (err: unknown) {
      setSubmitError(getPromotionApiError(err, "No se pudieron agregar los productos."));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Selectable products on current page ────────────────────────────────────
  const selectableCount = products.filter((p) => !p.alreadyAssociated).length;
  const visibleSelectedCount = products.filter((p) => selectedIds.has(p.id)).length;
  const allVisibleSelected = selectableCount > 0 && visibleSelectedCount === selectableCount;

  // ── Category label for current scope ──────────────────────────────────────
  const scopeLabel = (s: PromotionProductScope) => {
    if (s === "DIVISION") return "División";
    if (s === "DEPARTMENT") return "Departamento";
    if (s === "CATEGORY") return "Categoría";
    return "";
  };

  const categoryText = (categories: AvailablePromotionProduct["categories"] | undefined) =>
    categories && categories.length > 0
      ? categories.map((category) => `${category.code} ${category.name}`).join(", ")
      : "Sin categorias";

  const handleRemoveProduct = async (productId: number) => {
    if (!canRemoveAssociated || removingId !== null) return;

    setRemovingId(productId);
    setRemoveError(null);
    try {
      await removeProductFromPromotion(promotionId, productId);
      showToast("Producto removido de la promocion.", "success");
      await onSuccess();
      await loadProducts();
    } catch (err: unknown) {
      const backendMessage = getPromotionApiError(err, "No se pudo quitar el producto.");
      setRemoveError(`No se pudo quitar el producto: ${backendMessage}`);
    } finally {
      setRemovingId(null);
    }
  };

  const renderAssociatedProducts = () => (
    <div>
      {associatedProducts.length > 0 && !canRemoveAssociated && (
        <div style={s.infoBox}>Esta promocion ya inicio. Los productos asociados se muestran, pero no se pueden quitar.</div>
      )}

      <div style={s.tableWrap}>
        <div style={{ ...s.tableRow, ...s.tableHead }}>
          <div style={{ ...s.cell, ...s.colAssociatedSku }}>SKU</div>
          <div style={{ ...s.cell, ...s.colAssociatedBarcode }}>Codigo barras</div>
          <div style={{ ...s.cell, ...s.colAssociatedName }}>Producto</div>
          <div style={{ ...s.cell, ...s.colAssociatedPrice }}>Precio venta</div>
          <div style={{ ...s.cell, ...s.colAssociatedStatus }}>Estado</div>
          <div style={{ ...s.cell, ...s.colAssociatedCats }}>Categorias</div>
          <div style={{ ...s.cell, ...s.colAssociatedAction }}>Accion</div>
        </div>
        <div style={s.tableBody}>
          {associatedProducts.length === 0 ? (
            <div style={s.stateRow}>Esta promocion todavia no tiene productos asociados.</div>
          ) : (
            associatedProducts.map((row) => {
              const product = row.product;
              const productId = product?.id ?? row.productId;
              const isRemoving = removingId === productId;

              return (
                <div key={`${row.id ?? row.productId}-${productId}`} style={s.tableRow}>
                  <div style={{ ...s.cell, ...s.colAssociatedSku }}>
                    <span style={s.skuBadge}>{product?.sku ?? `#${productId}`}</span>
                  </div>
                  <div style={{ ...s.cell, ...s.colAssociatedBarcode, color: "var(--text-muted)", fontSize: 12 }}>
                    {product?.barcode || "Sin codigo"}
                  </div>
                  <div style={{ ...s.cell, ...s.colAssociatedName }}>
                    <div style={s.productName}>{product?.name ?? `Producto #${productId}`}</div>
                  </div>
                  <div
                    style={{
                      ...s.cell,
                      ...s.colAssociatedPrice,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums" as const,
                    }}
                  >
                    {product ? moneyExact(Number(product.sellPrice)) : "-"}
                  </div>
                  <div style={{ ...s.cell, ...s.colAssociatedStatus, textAlign: "center" as const }}>
                    {product?.active ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Inactivo</Badge>}
                  </div>
                  <div style={{ ...s.cell, ...s.colAssociatedCats }}>
                    <span style={s.categoryText}>{categoryText(product?.categories)}</span>
                  </div>
                  <div style={{ ...s.cell, ...s.colAssociatedAction }}>
                    {canRemoveAssociated ? (
                      <button
                        type="button"
                        style={{ ...ui.linkBtn, color: "#b91c1c", opacity: isRemoving ? 0.65 : 1 }}
                        onClick={() => void handleRemoveProduct(productId)}
                        disabled={removingId !== null}
                      >
                        <PackageMinus size={14} /> {isRemoving ? "Quitando..." : "Quitar"}
                      </button>
                    ) : (
                      <span style={s.lockedText}>No se puede quitar</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {removeError && <div style={s.errorBox}>{removeError}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" style={{ ...ui.ghostBtn, justifyContent: "center" }} onClick={onClose} disabled={removingId !== null}>
          Cerrar
        </button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.overlay, ...(isMobile ? { padding: 0 } : {}) }} onClick={!submitting ? onClose : undefined}>
      <div
        style={{
          ...s.modal,
          ...(isMobile ? { maxWidth: "100%", height: "100%", maxHeight: "100%", borderRadius: 0 } : {})
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-products-title"
        aria-label="Gestionar productos de la promocion"
      >
        {/* Header */}
        <div style={ui.modalHeader}>
          <span style={{ ...ui.modalTitle, display: "flex", alignItems: "center", gap: 8, fontSize: 0 }}>
            <PackagePlus size={18} />
            <span id="promotion-products-title" style={{ fontSize: 16 }}>Gestionar productos de la promocion</span>
            {" "}
          </span>
          <button
            type="button"
            style={ui.linkBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ ...ui.modalBody, ...(isMobile ? { overflowY: "auto" } : {}) }}>
          {/* Promotion name */}
          <div style={s.promotionTag}>{promotionName}</div>

          <div style={s.tabs} role="tablist" aria-label="Productos de la promocion">
            <button
              type="button"
              style={{ ...s.tabButton, ...(activeTab === "associated" ? s.tabButtonActive : {}) }}
              onClick={() => setActiveTab("associated")}
            >
              Productos asociados
              <span style={s.tabCount}>{associatedProducts.length}</span>
            </button>
            <button
              type="button"
              style={{ ...s.tabButton, ...(activeTab === "available" ? s.tabButtonActive : {}) }}
              onClick={() => setActiveTab("available")}
            >
              Productos disponibles
            </button>
          </div>

          {activeTab === "associated" ? renderAssociatedProducts() : (
          <>

          {/* ── Filters row ── */}
          <div style={{
            ...s.filtersRow,
            ...(isMobile ? { flexDirection: "column", alignItems: "stretch", gap: 8 } : {})
          }}>
            {/* Scope selector */}
            <div style={{
              ...s.filterGroup,
              ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {})
            }}>
              <label style={ui.fieldLabel}>Alcance</label>
              <select
                style={{ ...ui.input, ...s.select }}
                value={scope}
                onChange={(e) => handleScopeChange(e.target.value as PromotionProductScope)}
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Category selector — only when scope requires it */}
            {SCOPE_NEEDS_CATEGORY.includes(scope) && (
              <div style={{
                ...s.filterGroup,
                ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {})
              }}>
                <label style={ui.fieldLabel}>{scopeLabel(scope)}</label>
                {categoriesLoading ? (
                  <div style={s.selectPlaceholder}>Cargando categorías...</div>
                ) : (
                  <select
                    style={{ ...ui.input, ...s.select }}
                    value={categoryId ?? ""}
                    onChange={(e) =>
                      handleCategoryChange(e.target.value ? Number(e.target.value) : undefined)
                    }
                  >
                    <option value="">Selecciona {scopeLabel(scope).toLowerCase()}...</option>
                    {filteredCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* ── Search ── */}
          <div style={{ marginBottom: 12 }}>
            <SearchInput
              value={searchInput}
              onChange={(v) => { setSearchInput(v); setPage(1); }}
              placeholder="Buscar por SKU, código, nombre o descripción"
            />
          </div>

          {/* ── Selection controls ── */}
          <div style={s.selectionBar}>
            <button
              type="button"
              style={{ ...ui.ghostBtn, fontSize: 12, padding: "5px 10px", height: 30 }}
              onClick={selectVisible}
              disabled={selectableCount === 0 || productsLoading}
              title="Seleccionar todos los productos visibles en esta página"
            >
              {allVisibleSelected ? "✓ " : ""}{isMobile ? "Todos visibles" : "Seleccionar visibles"}
            </button>
            <button
              type="button"
              style={{ ...ui.ghostBtn, fontSize: 12, padding: "5px 10px", height: 30 }}
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
            >
              {isMobile ? "Limpiar" : "Limpiar selección"}
            </button>
            <span style={s.counter}>
              {selectedIds.size} producto{selectedIds.size === 1 ? "" : "s"} seleccionado{selectedIds.size === 1 ? "" : "s"}
            </span>
          </div>

          {/* ── Products table or cards ── */}
          <div style={{
            ...s.tableWrap,
            ...(isMobile ? { border: "none", backgroundColor: "transparent" } : {})
          }}>
            {/* Table header */}
            {!isMobile && (
              <div style={{ ...s.tableRow, ...s.tableHead }}>
                <div style={{ ...s.cell, ...s.colCheck }} />
                <div style={{ ...s.cell, ...s.colSku }}>SKU</div>
                <div style={{ ...s.cell, ...s.colBarcode }}>Código barras</div>
                <div style={{ ...s.cell, ...s.colName }}>Producto</div>
                <div style={{ ...s.cell, ...s.colCost }}>Costo</div>
                <div style={{ ...s.cell, ...s.colPrice }}>Precio venta</div>
                <div style={{ ...s.cell, ...s.colCats }}>Categorías</div>
                <div style={{ ...s.cell, ...s.colStatus }}>Estado</div>
              </div>
            )}

            {/* Table body */}
            <div style={{
              ...s.tableBody,
              ...(isMobile ? { maxHeight: "42vh", padding: "4px 2px" } : {})
            }}>
              {/* Loading */}
              {productsLoading && (
                <div style={s.stateRow}>Cargando productos...</div>
              )}

              {/* Error */}
              {!productsLoading && productsError && (
                <div style={{ ...s.stateRow, color: "#b91c1c" }}>{productsError}</div>
              )}

              {/* Empty state: waiting for category */}
              {!productsLoading &&
                !productsError &&
                SCOPE_NEEDS_CATEGORY.includes(scope) &&
                !categoryId && (
                  <div style={s.stateRow}>
                    Selecciona una {scopeLabel(scope).toLowerCase()} para ver productos.
                  </div>
                )}

              {/* Empty results */}
              {!productsLoading &&
                !productsError &&
                products.length === 0 &&
                (!SCOPE_NEEDS_CATEGORY.includes(scope) || categoryId) && (
                  <div style={s.stateRow}>
                    {debouncedSearch.trim()
                      ? "No se encontraron productos con esa búsqueda."
                      : "No hay productos disponibles con estos filtros."}
                  </div>
                )}

              {/* Products */}
              {!productsLoading &&
                !productsError &&
                products.map((product) => {
                  const isSelected = selectedIds.has(product.id);
                  const disabled = product.alreadyAssociated;

                  if (isMobile) {
                    return (
                      <div
                        key={product.id}
                        onClick={() => !disabled && toggleProduct(product.id, product.alreadyAssociated)}
                        style={{
                          backgroundColor: isSelected
                            ? "rgba(30,58,138,0.06)"
                            : disabled
                            ? "var(--surface-2)"
                            : "var(--surface)",
                          border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border-soft)",
                          borderRadius: 14,
                          padding: 14,
                          marginBottom: 10,
                          opacity: disabled ? 0.65 : 1,
                          cursor: disabled ? "default" : "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                        }}
                      >
                        {/* Header card: Checkbox, SKU y Status */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={disabled}
                              onChange={() => toggleProduct(product.id, product.alreadyAssociated)}
                              onClick={(e) => e.stopPropagation()}
                              style={s.check}
                              aria-label={`Seleccionar ${product.name}`}
                            />
                            <span style={s.skuBadge}>{product.sku}</span>
                          </div>
                          <div>
                            {product.alreadyAssociated ? (
                              <Badge tone="blue">Ya asociado</Badge>
                            ) : product.active ? (
                              <Badge tone="green">Activo</Badge>
                            ) : (
                              <Badge tone="slate">Inactivo</Badge>
                            )}
                          </div>
                        </div>

                        {/* Name and Description */}
                        <div>
                          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13, wordBreak: "break-word" }}>
                            {product.name}
                          </div>
                          {product.description && (
                            <div style={{ ...s.productDesc, color: "var(--text-muted)", wordBreak: "break-word" }}>
                              {product.description}
                            </div>
                          )}
                          {product.barcode && (
                            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, fontFamily: "monospace" }}>
                              Código: {product.barcode}
                            </div>
                          )}
                        </div>

                        {/* Cost & Sell Price */}
                        <div style={{ display: "flex", gap: 20 }}>
                          <div>
                            <span style={{ fontSize: 9, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase" }}>Costo</span>
                            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{fmt(product.costPrice)}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: 9, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase" }}>Precio Venta</span>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{moneyExact(Number(product.sellPrice))}</div>
                          </div>
                        </div>

                        {/* Categories (línea completa) */}
                        <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                          <span style={{ fontSize: 9, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Categorías</span>
                          {product.categories.length === 0 ? (
                            <span style={s.noCatBadge}>Sin categoría</span>
                          ) : (
                            <div style={s.catList}>
                              {product.categories.map((cat) => (
                                <span key={cat.id} style={s.catBadge}>
                                  {cat.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={product.id}
                      style={{
                        ...s.tableRow,
                        backgroundColor: isSelected
                          ? "rgba(30,58,138,0.06)"
                          : disabled
                          ? "var(--surface-2)"
                          : undefined,
                        opacity: disabled ? 0.65 : 1,
                        cursor: disabled ? "default" : "pointer",
                      }}
                      onClick={() => !disabled && toggleProduct(product.id, product.alreadyAssociated)}
                    >
                      {/* Checkbox */}
                      <div style={{ ...s.cell, ...s.colCheck, textAlign: "center" as const }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={() => toggleProduct(product.id, product.alreadyAssociated)}
                          onClick={(e) => e.stopPropagation()}
                          style={s.check}
                          aria-label={`Seleccionar ${product.name}`}
                        />
                      </div>

                      {/* SKU */}
                      <div style={{ ...s.cell, ...s.colSku }}>
                        <span style={s.skuBadge}>{product.sku}</span>
                      </div>

                      {/* Barcode */}
                      <div style={{ ...s.cell, ...s.colBarcode, color: "var(--text-muted)", fontSize: 12 }}>
                        {product.barcode ?? "—"}
                      </div>

                      {/* Name */}
                      <div style={{ ...s.cell, ...s.colName }}>
                        <div style={s.productName}>{product.name}</div>
                        {product.description && (
                          <div style={s.productDesc}>{product.description}</div>
                        )}
                      </div>

                      {/* Cost */}
                      <div style={{ ...s.cell, ...s.colCost, fontVariantNumeric: "tabular-nums" as const }}>
                        {fmt(product.costPrice)}
                      </div>

                      {/* Sell price */}
                      <div
                        style={{
                          ...s.cell,
                          ...s.colPrice,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums" as const,
                        }}
                      >
                        {moneyExact(Number(product.sellPrice))}
                      </div>

                      {/* Categories */}
                      <div style={{ ...s.cell, ...s.colCats }}>
                        {product.categories.length === 0 ? (
                          <span style={s.noCatBadge}>Sin categoría</span>
                        ) : (
                          <div style={s.catList}>
                            {product.categories.map((cat) => (
                              <span key={cat.id} style={s.catBadge}>
                                {cat.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Status */}
                      <div style={{ ...s.cell, ...s.colStatus, textAlign: "center" as const }}>
                        {product.alreadyAssociated ? (
                          <Badge tone="blue">Ya asociado</Badge>
                        ) : product.active ? (
                          <Badge tone="green">Activo</Badge>
                        ) : (
                          <Badge tone="slate">Inactivo</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* ── Pagination ── */}
          {pagination.totalPages > 1 && (
            <div style={s.paginationBar}>
              <button
                type="button"
                style={{
                  ...ui.ghostBtn,
                  padding: "5px 10px",
                  height: 30,
                  fontSize: 12,
                  ...(isMobile ? { width: 34, height: 30, padding: 0, justifyContent: "center" } : {})
                }}
                disabled={page <= 1 || productsLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Anterior"
              >
                <ChevronLeft size={14} />
                {!isMobile && " Anterior"}
              </button>
              <span style={s.pageInfo}>
                {isMobile ? `${pagination.page}/${pagination.totalPages}` : `Página ${pagination.page} de ${pagination.totalPages}`}
                {!isMobile && (
                  <span style={{ marginLeft: 8, color: "var(--text-faint)", fontWeight: 500 }}>
                    ({pagination.total} producto{pagination.total === 1 ? "" : "s"})
                  </span>
                )}
              </span>
              <button
                type="button"
                style={{
                  ...ui.ghostBtn,
                  padding: "5px 10px",
                  height: 30,
                  fontSize: 12,
                  ...(isMobile ? { width: 34, height: 30, padding: 0, justifyContent: "center" } : {})
                }}
                disabled={page >= pagination.totalPages || productsLoading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                title="Siguiente"
              >
                {!isMobile && "Siguiente "}
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* ── Submit error ── */}
          {submitError && (
            <div style={s.errorBox}>{submitError}</div>
          )}

          {/* ── Action buttons ── */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              style={{
                ...ui.ghostBtn,
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                ...(isMobile ? { padding: "10px 0", maxWidth: 50 } : {})
              }}
              onClick={onClose}
              disabled={submitting}
              title="Cancelar"
            >
              <X size={15} />
              {!isMobile && <span>Cancelar</span>}
            </button>
            <button
              type="button"
              style={{
                ...ui.primaryBtn,
                flex: isMobile ? 1 : 2,
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                opacity: selectedIds.size === 0 || submitting ? 0.55 : 1,
                cursor: selectedIds.size === 0 || submitting ? "not-allowed" : "pointer",
              }}
              disabled={selectedIds.size === 0 || submitting}
              onClick={handleSubmit}
              title="Agregar seleccionados"
            >
              <PackagePlus size={15} />
              {submitting ? (
                <span>Agregando...</span>
              ) : isMobile ? (
                <span>Agregar ({selectedIds.size})</span>
              ) : (
                <span>Agregar {selectedIds.size > 0 ? selectedIds.size : ""} producto{selectedIds.size === 1 ? "" : "s"} seleccionado{selectedIds.size === 1 ? "" : "s"}</span>
              )}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 16,
  },
  modal: {
    backgroundColor: "var(--surface)",
    borderRadius: 14,
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
    width: "100%",
    maxWidth: 900,
    maxHeight: "92vh",
    overflowY: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  promotionTag: {
    display: "inline-block",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 800,
    padding: "4px 10px",
    marginBottom: 14,
  },
  tabs: {
    display: "flex",
    gap: 6,
    padding: 4,
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2)",
    marginBottom: 14,
    flexWrap: "wrap",
  },
  tabButton: {
    border: "none",
    borderRadius: 6,
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  tabButtonActive: {
    backgroundColor: "var(--surface)",
    color: "var(--accent-strong)",
    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
  },
  tabCount: {
    borderRadius: 999,
    padding: "1px 7px",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
    fontSize: 11,
    fontWeight: 900,
  },
  infoBox: {
    border: "1px solid #fde68a",
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    color: "#92400e",
    padding: "10px 12px",
    marginBottom: 10,
    fontSize: 13,
    fontWeight: 700,
  },
  filtersRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: "1 1 200px",
    minWidth: 160,
  },
  select: {
    height: 38,
    padding: "0 12px",
    fontSize: 13,
    cursor: "pointer",
  },
  selectPlaceholder: {
    height: 38,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    fontSize: 13,
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--input-bg)",
  },
  selectionBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  counter: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 800,
    color: "var(--accent-strong)",
    whiteSpace: "nowrap",
  },
  tableWrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "var(--surface)",
    width: "100%",
  },
  tableHead: {
    backgroundColor: "var(--surface-2)",
    borderBottom: "1px solid var(--border)",
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
  },
  tableBody: {
    display: "block",
    width: "100%",
    maxHeight: 280,
    overflowY: "auto",
    overflowX: "hidden",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box" as const,
    borderBottom: "1px solid var(--border-soft)",
    minWidth: 0,
  },
  cell: {
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    boxSizing: "border-box" as const,
    flexShrink: 0,
  },
  colCheck: { flex: "0 0 36px", width: 36 },
  colSku: { flex: "0 0 90px", width: 90, fontWeight: 800, color: "var(--accent-strong)" },
  colBarcode: { flex: "0 0 110px", width: 110 },
  colName: { flex: "1 1 auto", minWidth: 120, whiteSpace: "normal" as const, overflow: "visible" },
  colCost: { flex: "0 0 90px", width: 90, textAlign: "right" as const },
  colPrice: { flex: "0 0 100px", width: 100, textAlign: "right" as const },
  colCats: { flex: "0 0 160px", width: 160, whiteSpace: "normal" as const, overflow: "visible" },
  colStatus: { flex: "0 0 100px", width: 100 },
  colAssociatedSku: { flex: "0 0 92px", width: 92, fontWeight: 800, color: "var(--accent-strong)" },
  colAssociatedBarcode: { flex: "0 0 118px", width: 118 },
  colAssociatedName: { flex: "1 1 170px", minWidth: 170, whiteSpace: "normal" as const, overflow: "visible" },
  colAssociatedPrice: { flex: "0 0 104px", width: 104, textAlign: "right" as const },
  colAssociatedStatus: { flex: "0 0 92px", width: 92 },
  colAssociatedCats: { flex: "1 1 160px", minWidth: 150, whiteSpace: "normal" as const, overflow: "visible" },
  colAssociatedAction: { flex: "0 0 118px", width: 118 },
  stateRow: {
    textAlign: "center" as const,
    padding: "28px 16px",
    color: "var(--text-faint)",
    fontSize: 13,
    fontWeight: 500,
    width: "100%",
  },
  productName: {
    fontWeight: 700,
    color: "var(--text)",
    fontSize: 13,
    lineHeight: 1.3,
  },
  productDesc: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 2,
    lineHeight: 1.3,
  },
  skuBadge: {
    backgroundColor: "var(--accent-soft)",
    borderRadius: 5,
    color: "var(--accent-strong)",
    fontSize: 11,
    fontWeight: 800,
    padding: "2px 6px",
    display: "inline-block",
  },
  catList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
    padding: "2px 0",
  },
  catBadge: {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
  },
  noCatBadge: {
    fontSize: 11,
    color: "var(--text-faint)",
    fontStyle: "italic" as const,
  },
  categoryText: {
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  lockedText: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "normal" as const,
  },
  paginationBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 10,
    flexWrap: "wrap" as const,
  },
  pageInfo: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 12,
    padding: "10px 12px",
  },
  check: {
    width: 16,
    height: 16,
    accentColor: "#1e3a8a",
    cursor: "pointer",
  },
};

export default AddProductsToPromotionModal;
