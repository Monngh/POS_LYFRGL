import type { CSSProperties, ReactElement } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AdminCategoryTreeNode } from "../../services/categoryAdmin.service";
import { filterCategoryTree, levelLabel } from "./categoryHelpers";
import { getCategoryDisplayColor, isValidCategoryColor, normalizeCategoryColor } from "./categoryColors";
import { isUnsupportedCategoryIcon, renderCategoryIcon } from "./categoryIcons";

interface CategoryTreeProps {
  tree: AdminCategoryTreeNode[];
  selectedId: number | null;
  expandedIds: Set<number>;
  search: string;
  loading: boolean;
  error: string | null;
  highlightedId?: number | null;
  onSelect: (category: AdminCategoryTreeNode) => void;
  onToggle: (categoryId: number) => void;
  onRetry: () => void;
}

const nodeIcon = (node: AdminCategoryTreeNode) => {
  return renderCategoryIcon(node.icon, node.level, { size: node.level === "CATEGORY" ? 16 : 17 });
};

export function CategoryTree({
  tree,
  selectedId,
  expandedIds,
  search,
  loading,
  error,
  highlightedId,
  onSelect,
  onToggle,
  onRetry,
}: CategoryTreeProps) {
  const visibleTree = filterCategoryTree(tree, search);
  const hasSearch = search.trim().length > 0;

  const renderNode = (node: AdminCategoryTreeNode, depth: number): ReactElement => {
    const hasChildren = (node.children ?? []).length > 0;
    const expanded = hasSearch || expandedIds.has(node.id);
    const selected = selectedId === node.id;
    const highlighted = highlightedId === node.id;
    const unsupportedIcon = isUnsupportedCategoryIcon(node.icon);
    const nodeDisplayColor = getCategoryDisplayColor(node.color, node.level, node.active);
    const hasStoredColor = isValidCategoryColor(node.color);

    return (
      <div key={node.id}>
        <div
          role="button"
          tabIndex={0}
          data-category-id={node.id}
          onClick={() => onSelect(node)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect(node);
          }}
          style={{
            ...styles.nodeRow,
            marginLeft: depth * 16,
            borderColor: selected ? "var(--accent)" : highlighted ? "rgba(37,99,235,0.55)" : "transparent",
            backgroundColor: selected ? "var(--accent-soft)" : highlighted ? "rgba(37,99,235,0.08)" : "transparent",
            boxShadow: highlighted ? "0 0 0 2px rgba(37,99,235,0.16)" : undefined,
            opacity: node.active ? 1 : 0.62,
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) onToggle(node.id);
            }}
            disabled={!hasChildren}
            style={{
              ...styles.chevronButton,
              opacity: hasChildren ? 1 : 0.35,
              cursor: hasChildren ? "pointer" : "default",
            }}
            aria-label={expanded ? "Contraer categoria" : "Expandir categoria"}
          >
            {hasChildren ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span style={styles.dot} />}
          </button>

          <span
            style={{
              ...styles.colorDot,
              backgroundColor: nodeDisplayColor,
              opacity: node.active ? 1 : 0.45,
            }}
            title={hasStoredColor ? `Color ${normalizeCategoryColor(node.color ?? "")}` : "Color predeterminado por nivel"}
          />

          <span
            style={{
              ...styles.nodeIcon,
              color: nodeDisplayColor,
            }}
            title={unsupportedIcon ? "Icono no reconocido. Se usara el icono predeterminado." : undefined}
          >
            {nodeIcon(node)}
          </span>

          <span style={styles.nodeText}>
            <span style={styles.nodeName}>
              {node.code} · {node.name}
            </span>
            <span style={styles.nodeMeta}>{levelLabel(node.level)}</span>
          </span>

          {!node.active && <span style={styles.inactiveBadge}>Inactiva</span>}
        </div>

        {hasChildren && expanded && (
          <div style={styles.childrenWrap}>
            {[...(node.children ?? [])]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={styles.stateBox}>Cargando categorias...</div>;
  }

  if (error) {
    return (
      <div style={styles.stateBox}>
        <span>{error}</span>
        <button type="button" style={styles.retryButton} onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }

  if (visibleTree.length === 0) {
    return (
      <div style={styles.stateBox}>
        {search.trim() ? "No se encontraron categorias con esa busqueda." : "No hay categorias registradas."}
      </div>
    );
  }

  return <div style={styles.treeWrap}>{visibleTree.map((node) => renderNode(node, 0))}</div>;
}

const styles: Record<string, CSSProperties> = {
  treeWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  childrenWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  nodeRow: {
    minHeight: 44,
    border: "1px solid transparent",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 9px",
    cursor: "pointer",
    color: "var(--text)",
    minWidth: 0,
  },
  chevronButton: {
    width: 24,
    height: 24,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    backgroundColor: "currentColor",
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    border: "1px solid rgba(15, 23, 42, 0.14)",
    flexShrink: 0,
  },
  nodeIcon: {
    width: 22,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  nodeText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  nodeName: {
    fontSize: 13,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  nodeMeta: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 700,
  },
  inactiveBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(245,158,11,0.14)",
    color: "#b45309",
    padding: "2px 7px",
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  stateBox: {
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: "22px 16px",
    minHeight: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 10,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
  },
  retryButton: {
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
  },
};
