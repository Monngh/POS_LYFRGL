import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Boxes,
  Edit3,
  FolderPlus,
  PackageSearch,
  Plus,
  Power,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  adminCategoryService,
  getAdminCategoryErrorMessage,
  type AdminCategoryDetail,
  type AdminCategorySummary,
  type AdminCategoryTreeNode,
} from "../../services/categoryAdmin.service";
import { Badge, ui, useMediaQuery } from "../../views/shared";
import { CategoryTree } from "./CategoryTree";
import { CategoryFormModal, type CategoryFormState } from "./CategoryFormModal";
import { CategoryProductsModal } from "./CategoryProductsModal";
import { UncategorizedProductsModal } from "./UncategorizedProductsModal";
import { ConfirmModal } from "../../../shared/ui";
import {
  createChildLabel,
  findCategoryAncestorIds,
  findCategoryEntry,
  findCategoryNode,
  getExpandableIds,
  levelLabel,
  nextChildLevel,
} from "./categoryHelpers";
import { getCategoryDisplayColor, isValidCategoryColor, normalizeCategoryColor } from "./categoryColors";
import { getCategoryIconOption, isUnsupportedCategoryIcon, renderCategoryIcon } from "./categoryIcons";

interface CategoryManagementViewProps {
  onClose: () => void;
  onClassifyProduct: (productId: number) => Promise<void> | void;
}

interface LoadTreeOptions {
  preferredSelectedId?: number | null;
  expandPathToId?: number | null;
  scrollToId?: number | null;
  clearSelectionWhenMissing?: boolean;
}

export function CategoryManagementView({ onClose, onClassifyProduct }: CategoryManagementViewProps) {
  const stacked = useMediaQuery("(max-width: 940px)");
  const compact = useMediaQuery("(max-width: 640px)");
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const treeInitializedRef = useRef(false);

  const [tree, setTree] = useState<AdminCategoryTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lastCreatedCategoryId, setLastCreatedCategoryId] = useState<number | null>(null);
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AdminCategoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [formState, setFormState] = useState<CategoryFormState | null>(null);
  const [productsCategory, setProductsCategory] = useState<AdminCategoryDetail | null>(null);
  const [uncategorizedOpen, setUncategorizedOpen] = useState(false);
  const [actionSaving, setActionSaving] = useState<"status" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmStatusUpdate, setConfirmStatusUpdate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categoryTree = tree;

  const loadTree = useCallback(async ({
    preferredSelectedId = null,
    expandPathToId = null,
    scrollToId = null,
    clearSelectionWhenMissing = false,
  }: LoadTreeOptions = {}) => {
    setTreeLoading(true);
    setTreeError(null);

    try {
      const rows = await adminCategoryService.listTree();
      const expandableIds = new Set(getExpandableIds(rows));
      const ancestorIdsToOpen = findCategoryAncestorIds(rows, expandPathToId);
      const selectedExists = preferredSelectedId ? findCategoryNode(rows, preferredSelectedId) : null;
      const scrollTargetExists = scrollToId ? findCategoryNode(rows, scrollToId) : null;

      setTree(rows);

      setExpandedIds((current) => {
        const next = new Set<number>();

        if (!treeInitializedRef.current) {
          expandableIds.forEach((categoryId) => next.add(categoryId));
        } else {
          current.forEach((categoryId) => {
            if (expandableIds.has(categoryId)) next.add(categoryId);
          });
        }

        ancestorIdsToOpen.forEach((categoryId) => {
          if (expandableIds.has(categoryId)) next.add(categoryId);
        });

        return next;
      });
      treeInitializedRef.current = true;

      if (preferredSelectedId && selectedExists) {
        setSelectedId(preferredSelectedId);
      } else if (clearSelectionWhenMissing) {
        setSelectedId(null);
      }

      if (scrollToId && scrollTargetExists) {
        setLastCreatedCategoryId(scrollToId);
      }
    } catch (err: unknown) {
      setTreeError(getAdminCategoryErrorMessage(err, "No se pudo cargar el arbol de categorias."));
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (categoryId: number) => {
    setDetailLoading(true);
    setDetailError(null);

    try {
      const category = await adminCategoryService.getDetail(categoryId);
      setDetail(category);
    } catch (err: unknown) {
      setDetail(null);
      setDetailError(getAdminCategoryErrorMessage(err, "No se pudo cargar el detalle de la categoria."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTree();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTree]);

  useEffect(() => {
    if (!lastCreatedCategoryId || treeLoading) return;

    const frame = window.requestAnimationFrame(() => {
      const container = treeScrollRef.current;
      const node = container?.querySelector<HTMLElement>(`[data-category-id="${lastCreatedCategoryId}"]`);

      if (container && node) {
        const containerRect = container.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const nodeTopInsideContainer = nodeRect.top - containerRect.top + container.scrollTop;
        const centeredTop = nodeTopInsideContainer - (container.clientHeight / 2) + (nodeRect.height / 2);

        container.scrollTo({
          top: Math.max(0, centeredTop),
          behavior: "smooth",
        });
      }

      setLastCreatedCategoryId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [categoryTree, expandedIds, lastCreatedCategoryId, treeLoading]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      void loadDetail(selectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, loadDetail]);

  const selectedNode = useMemo(
    () => findCategoryNode(categoryTree, selectedId),
    [categoryTree, selectedId]
  );

  const selectedEntry = useMemo(
    () => findCategoryEntry(categoryTree, selectedId),
    [categoryTree, selectedId]
  );

  const closeWithGuard = () => {
    if (actionSaving || formState || productsCategory) return;
    onClose();
  };

  const selectCategory = useCallback((category: AdminCategoryTreeNode) => {
    setSelectedId(category.id);
    setExpandedIds((current) => {
      const next = new Set(current);
      findCategoryAncestorIds(categoryTree, category.id).forEach((categoryId) => next.add(categoryId));
      return next;
    });
    setHighlightedCategoryId((current) => current === category.id ? current : null);
  }, [categoryTree]);

  const refreshKeepingSelection = async () => {
    await loadTree({ preferredSelectedId: selectedId });
    if (selectedId) await loadDetail(selectedId);
  };

  const handleFormSaved = async (category: AdminCategorySummary, successMessage: string) => {
    const wasCreate = formState?.mode === "create";
    setFormState(null);
    setMessage(successMessage);
    if (wasCreate) {
      setSearch("");
      setHighlightedCategoryId(category.id);
      await loadTree({
        preferredSelectedId: category.id,
        expandPathToId: category.id,
        scrollToId: category.id,
      });
    } else {
      await loadTree({ preferredSelectedId: category.id });
    }
    await loadDetail(category.id);
  };

  const handleProductsSaved = async (successMessage: string) => {
    setMessage(successMessage);
    await refreshKeepingSelection();
  };

  const openCreateChild = () => {
    if (!detail || !selectedNode) return;
    const level = nextChildLevel(detail.level);
    if (!level) return;
    setFormState({ mode: "create", level, parent: selectedNode });
  };

  const requestUpdateStatus = () => {
    if (!detail || actionSaving) return;
    setConfirmStatusUpdate(true);
  };

  const executeUpdateStatus = async () => {
    if (!detail || actionSaving) return;
    setConfirmStatusUpdate(false);
    const active = !detail.active;

    setActionSaving("status");
    setMessage(null);
    try {
      const updated = await adminCategoryService.updateStatus(detail.id, active);
      setMessage(active ? "Categoria activada correctamente." : "Categoria desactivada correctamente.");
      await loadTree({ preferredSelectedId: updated.id });
      await loadDetail(updated.id);
    } catch (err: unknown) {
      setMessage(getAdminCategoryErrorMessage(err, "No se pudo actualizar el estado de la categoria."));
    } finally {
      setActionSaving(null);
    }
  };

  const requestDeleteCategory = () => {
    if (!detail || actionSaving) return;
    setConfirmDelete(true);
  };

  const executeDeleteCategory = async () => {
    if (!detail || actionSaving) return;
    setConfirmDelete(false);

    setActionSaving("delete");
    setMessage(null);
    try {
      await adminCategoryService.remove(detail.id);
      setMessage("Categoria eliminada correctamente.");
      setSelectedId(null);
      setDetail(null);
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(detail.id);
        return next;
      });
      setHighlightedCategoryId((current) => current === detail.id ? null : current);
      await loadTree({ clearSelectionWhenMissing: true });
    } catch (err: unknown) {
      setMessage(getAdminCategoryErrorMessage(err, "No se pudo eliminar la categoria."));
    } finally {
      setActionSaving(null);
    }
  };

  const detailRows = detail
    ? [
        { label: "Codigo", value: detail.code },
        { label: "Nombre", value: detail.name },
        { label: "Descripcion", value: detail.description || "Sin descripcion" },
        { label: "Nivel", value: levelLabel(detail.level) },
        { label: "Estado", value: detail.active ? "Activa" : "Inactiva" },
        { label: "Ruta jerarquica", value: selectedEntry?.pathLabel || detail.name },
        { label: "Cantidad de hijos", value: String(detail.children.length) },
        { label: "Productos vinculados", value: String(detail.productCounts.productCategory) },
        { label: "Productos legacy categoryId", value: String(detail.productCounts.legacyCategoryId) },
        { label: "Productos totales", value: String(detail.productCounts.total) },
      ]
    : [];
  const detailIconOption = detail ? getCategoryIconOption(detail.icon) : null;
  const detailIconUnsupported = detail ? isUnsupportedCategoryIcon(detail.icon) : false;
  const detailIconLabel = detail?.icon ? detailIconOption?.label ?? detail.icon : "Predeterminado por nivel";
  const detailDisplayColor = detail ? getCategoryDisplayColor(detail.color, detail.level, detail.active) : "#2563EB";
  const detailHasStoredColor = detail ? isValidCategoryColor(detail.color) : false;
  const detailColorLabel = detailHasStoredColor
    ? normalizeCategoryColor(detail?.color ?? "")
    : "Predeterminado por nivel";

  return (
    <div style={styles.overlay} onClick={closeWithGuard}>
      <div
        style={{
          ...styles.modal,
          width: compact ? "calc(100vw - 12px)" : "min(1180px, calc(100vw - 32px))",
          maxHeight: compact ? "calc(100vh - 12px)" : "92vh",
          borderRadius: compact ? 8 : 14,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ ...styles.header, alignItems: compact ? "stretch" : "center" }}>
          <div style={styles.titleBlock}>
            <div style={styles.titleRow}>
              <Boxes size={20} color="var(--accent)" />
              <h2 style={styles.title}>Administrar categorias</h2>
            </div>
            <p style={styles.subtitle}>Estructura Division / Departamento / Categoria</p>
          </div>

          <div style={{ ...styles.headerActions, width: compact ? "100%" : "auto" }}>
            <button type="button" style={{ ...ui.ghostBtn, justifyContent: "center" }} onClick={() => setUncategorizedOpen(true)}>
              <PackageSearch size={15} /> Productos sin categoria
            </button>
            <button
              type="button"
              style={{ ...ui.primaryBtn, justifyContent: "center" }}
              onClick={() => setFormState({ mode: "create", level: "DIVISION", parent: null })}
            >
              <Plus size={15} /> Nueva division
            </button>
            <button type="button" style={{ ...ui.ghostBtn, padding: "8px 10px", justifyContent: "center" }} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {message && (
          <div
            style={{
              ...styles.message,
              color: message.startsWith("No ") || message.includes("Permiso") ? "var(--color-danger)" : "var(--accent-strong)",
              backgroundColor: message.startsWith("No ") ? "rgba(248,113,113,0.12)" : "var(--accent-soft)",
            }}
          >
            {message}
          </div>
        )}

        <div style={styles.topTools}>
          <div style={styles.searchBox}>
            <Search size={16} color="var(--text-muted)" />
            <input
              style={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar categoria por codigo o nombre"
            />
          </div>
          <button type="button" style={{ ...ui.ghostBtn, justifyContent: "center" }} onClick={() => void refreshKeepingSelection()}>
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>

        <div style={{ ...styles.content, gridTemplateColumns: stacked ? "1fr" : "minmax(320px, .9fr) minmax(360px, 1.1fr)" }}>
          <section style={styles.treePanel}>
            <div style={styles.panelHeader}>
              <FolderPlus size={17} color="var(--accent)" />
              <span>Arbol de categorias</span>
            </div>
            <div ref={treeScrollRef} style={styles.treeScroll}>
              <CategoryTree
                tree={categoryTree}
                selectedId={selectedId}
                expandedIds={expandedIds}
                search={search}
                loading={treeLoading}
                error={treeError}
                highlightedId={highlightedCategoryId}
                onSelect={selectCategory}
                onToggle={(categoryId) => {
                  setExpandedIds((current) => {
                    const next = new Set(current);
                    if (next.has(categoryId)) next.delete(categoryId);
                    else next.add(categoryId);
                    return next;
                  });
                }}
                onRetry={() => void loadTree({ preferredSelectedId: selectedId })}
              />
            </div>
          </section>

          <section style={styles.detailPanel}>
            <div style={styles.panelHeader}>
              <Tag size={17} color="var(--accent)" />
              <span>Detalle de categoria seleccionada</span>
            </div>

            {!selectedId && !detailLoading && (
              <div style={styles.emptyDetail}>Selecciona una categoria del arbol para ver su detalle.</div>
            )}

            {detailLoading && <div style={styles.emptyDetail}>Cargando detalle...</div>}
            {detailError && <div style={{ ...styles.emptyDetail, color: "var(--color-danger)" }}>{detailError}</div>}

            {detail && !detailLoading && (
              <div style={styles.detailContent}>
                <div style={styles.detailHero}>
                  <div style={styles.detailHeroMain}>
                    <span style={{ ...styles.detailIconBadge, color: detailDisplayColor }}>
                      {renderCategoryIcon(detail.icon, detail.level, { size: 23 })}
                    </span>
                    <div style={styles.categoryIdentity}>
                      <span style={styles.codeBadge}>{detail.code}</span>
                      <h3 style={styles.detailTitle}>{detail.name}</h3>
                      {detail.active ? <Badge tone="green">Activa</Badge> : <Badge tone="amber">Inactiva</Badge>}
                    </div>
                  </div>
                  <span
                    style={{ ...styles.bigSwatch, backgroundColor: detailDisplayColor, opacity: detail.active ? 1 : 0.55 }}
                    title={detailHasStoredColor ? normalizeCategoryColor(detail.color ?? "") : "Color predeterminado por nivel"}
                  />
                </div>

                <div style={styles.detailGrid}>
                  {detailRows.map((row) => (
                    <div key={row.label} style={styles.detailRow}>
                      <span style={styles.detailLabel}>{row.label}</span>
                      <strong style={styles.detailValue}>{row.value}</strong>
                    </div>
                  ))}
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Color</span>
                    <strong style={styles.detailValue}>
                      <span style={styles.inlineColor}>
                        <span
                          style={{ ...styles.smallSwatch, backgroundColor: detailDisplayColor, opacity: detail.active ? 1 : 0.55 }}
                        />
                        {detailColorLabel}
                      </span>
                    </strong>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Icono</span>
                    <strong style={styles.detailValue}>
                      <span style={styles.iconValue}>
                        {renderCategoryIcon(detail.icon, detail.level, { size: 15 })}
                        {detailIconLabel}
                      </span>
                      {detailIconUnsupported && (
                        <span style={styles.iconWarning}>Icono no reconocido. Se usará el icono predeterminado.</span>
                      )}
                    </strong>
                  </div>
                </div>

                <div style={styles.actions}>
                  {createChildLabel(detail.level) && (
                    <button type="button" style={ui.primaryBtn} onClick={openCreateChild} disabled={Boolean(actionSaving)}>
                      <Plus size={15} /> {createChildLabel(detail.level)}
                    </button>
                  )}
                  <button type="button" style={ui.ghostBtn} onClick={() => setFormState({ mode: "edit", category: detail })} disabled={Boolean(actionSaving)}>
                    <Edit3 size={15} /> Editar
                  </button>
                  <button type="button" style={ui.ghostBtn} onClick={() => void requestUpdateStatus()} disabled={Boolean(actionSaving)}>
                    <Power size={15} /> {detail.active ? "Desactivar" : "Activar"}
                  </button>
                  {detail.level === "CATEGORY" && (
                    <button type="button" style={ui.ghostBtn} onClick={() => setProductsCategory(detail)} disabled={Boolean(actionSaving)}>
                      <PackageSearch size={15} /> Gestionar productos
                    </button>
                  )}
                  <button
                    type="button"
                    style={{ ...ui.ghostBtn, color: "var(--color-danger)", borderColor: "rgba(220,38,38,0.45)" }}
                    onClick={() => void requestDeleteCategory()}
                    disabled={Boolean(actionSaving)}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <CategoryFormModal
          state={formState}
          onClose={() => setFormState(null)}
          onSaved={(category, successMessage) => void handleFormSaved(category, successMessage)}
        />
        <CategoryProductsModal
          category={productsCategory}
          onClose={() => setProductsCategory(null)}
          onSaved={(successMessage) => void handleProductsSaved(successMessage)}
        />
        <UncategorizedProductsModal
          isOpen={uncategorizedOpen}
          onClose={() => setUncategorizedOpen(false)}
          onClassifyProduct={onClassifyProduct}
        />
        <ConfirmModal
          isOpen={confirmStatusUpdate}
          title={`${!detail?.active ? "Activar" : "Desactivar"} categoría`}
          message={!detail?.active ? `¿Deseas activar "${detail?.name}"?` : `¿Deseas desactivar "${detail?.name}"?\nLos productos que ya la tienen conservarán la relación, pero no podrá asignarse a productos nuevos.`}
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          variant={!detail?.active ? "info" : "warning"}
          onConfirm={executeUpdateStatus}
          onClose={() => setConfirmStatusUpdate(false)}
        />
        <ConfirmModal
          isOpen={confirmDelete}
          title="Eliminar categoría"
          message="¿Deseas eliminar esta categoría?\nEsta acción solo funcionará si no tiene subcategorías, productos asociados o relaciones históricas."
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={executeDeleteCategory}
          onClose={() => setConfirmDelete(false)}
        />
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.58)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 260,
    padding: 16,
  },
  modal: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    padding: "18px 20px",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
    flexShrink: 0,
  },
  titleBlock: {
    minWidth: 0,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
  },
  title: {
    margin: 0,
    color: "var(--text)",
    fontSize: 20,
    fontWeight: 900,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
  },
  headerActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  message: {
    margin: "12px 20px 0",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
  },
  topTools: {
    display: "flex",
    gap: 10,
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
    flexShrink: 0,
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
    flex: "1 1 280px",
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
  content: {
    display: "grid",
    gap: 0,
    minHeight: 0,
    overflow: "auto",
    flex: 1,
  },
  treePanel: {
    borderRight: "1px solid var(--border)",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  detailPanel: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    color: "var(--accent-strong)",
    fontSize: 13,
    fontWeight: 900,
    flexShrink: 0,
  },
  treeScroll: {
    padding: 12,
    overflow: "auto",
    minHeight: 0,
    flex: 1,
  },
  emptyDetail: {
    margin: 16,
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: "32px 18px",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
  },
  detailContent: {
    padding: 16,
    overflow: "auto",
    minHeight: 0,
  },
  detailHero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    borderBottom: "1px solid var(--border)",
    paddingBottom: 14,
    marginBottom: 14,
  },
  detailHeroMain: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  detailIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface-2)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  categoryIdentity: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  codeBadge: {
    borderRadius: 8,
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--accent-strong)",
    padding: "5px 8px",
    fontSize: 12,
    fontWeight: 900,
  },
  detailTitle: {
    margin: 0,
    color: "var(--text)",
    fontSize: 20,
    fontWeight: 900,
    overflowWrap: "anywhere",
  },
  bigSwatch: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: "1px solid var(--border)",
    flexShrink: 0,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
  },
  detailRow: {
    borderBottom: "1px solid var(--border-soft)",
    padding: "8px 0",
    minWidth: 0,
  },
  detailLabel: {
    display: "block",
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  detailValue: {
    color: "var(--text)",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  inlineColor: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  smallSwatch: {
    width: 16,
    height: 16,
    borderRadius: 5,
    border: "1px solid var(--border)",
  },
  iconValue: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  },
  iconWarning: {
    display: "block",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    marginTop: 4,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  },
};
