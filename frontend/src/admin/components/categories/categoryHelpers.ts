import type { AdminCategoryProduct, AdminCategoryTreeNode, CategoryLevel } from "../../services/categoryAdmin.service";

export interface CategoryTreeEntry {
  node: AdminCategoryTreeNode;
  depth: number;
  pathLabel: string;
  searchText: string;
}

export const normalizeCategorySearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const levelLabel = (level: CategoryLevel): string => {
  if (level === "DIVISION") return "Division";
  if (level === "DEPARTMENT") return "Departamento";
  return "Categoria";
};

export const nextChildLevel = (level: CategoryLevel): CategoryLevel | null => {
  if (level === "DIVISION") return "DEPARTMENT";
  if (level === "DEPARTMENT") return "CATEGORY";
  return null;
};

export const createChildLabel = (level: CategoryLevel): string | null => {
  if (level === "DIVISION") return "Crear departamento";
  if (level === "DEPARTMENT") return "Crear categoria";
  return null;
};

export const flattenCategoryTree = (tree: AdminCategoryTreeNode[]): CategoryTreeEntry[] => {
  const entries: CategoryTreeEntry[] = [];

  const visit = (node: AdminCategoryTreeNode, depth: number, parents: string[]) => {
    const path = [...parents, node.name];
    const pathLabel = path.join(" > ");
    entries.push({
      node,
      depth,
      pathLabel,
      searchText: normalizeCategorySearchText([
        node.code,
        node.name,
        node.description ?? "",
        pathLabel,
      ].join(" ")),
    });
    [...(node.children ?? [])]
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((child) => visit(child, depth + 1, path));
  };

  [...tree]
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((node) => visit(node, 0, []));

  return entries;
};

export const findCategoryNode = (
  tree: AdminCategoryTreeNode[],
  categoryId: number | null
): AdminCategoryTreeNode | null => {
  if (!categoryId) return null;

  for (const node of tree) {
    if (node.id === categoryId) return node;
    const child = findCategoryNode(node.children ?? [], categoryId);
    if (child) return child;
  }

  return null;
};

export const findCategoryEntry = (
  tree: AdminCategoryTreeNode[],
  categoryId: number | null
): CategoryTreeEntry | null => {
  if (!categoryId) return null;
  return flattenCategoryTree(tree).find((entry) => entry.node.id === categoryId) ?? null;
};

export const findCategoryAncestorIds = (
  tree: AdminCategoryTreeNode[],
  categoryId: number | null
): number[] => {
  if (!categoryId) return [];

  const visit = (node: AdminCategoryTreeNode, ancestors: number[]): number[] | null => {
    if (node.id === categoryId) return ancestors;

    for (const child of node.children ?? []) {
      const result = visit(child, [...ancestors, node.id]);
      if (result) return result;
    }

    return null;
  };

  for (const node of tree) {
    const result = visit(node, []);
    if (result) return result;
  }

  return [];
};

export const getExpandableIds = (tree: AdminCategoryTreeNode[]): number[] => {
  const ids: number[] = [];
  const visit = (node: AdminCategoryTreeNode) => {
    if ((node.children ?? []).length > 0) {
      ids.push(node.id);
      node.children?.forEach(visit);
    }
  };
  tree.forEach(visit);
  return ids;
};

export const filterCategoryTree = (
  tree: AdminCategoryTreeNode[],
  search: string
): AdminCategoryTreeNode[] => {
  const terms = normalizeCategorySearchText(search).split(" ").filter(Boolean);
  if (terms.length === 0) return tree;

  const entryMap = new Map<number, CategoryTreeEntry>();
  flattenCategoryTree(tree).forEach((entry) => entryMap.set(entry.node.id, entry));

  const visit = (node: AdminCategoryTreeNode): AdminCategoryTreeNode | null => {
    const entry = entryMap.get(node.id);
    const children = (node.children ?? [])
      .map(visit)
      .filter((child): child is AdminCategoryTreeNode => Boolean(child));
    const matchesSelf = entry ? terms.every((term) => entry.searchText.includes(term)) : false;

    if (matchesSelf || children.length > 0) {
      return { ...node, children };
    }

    return null;
  };

  return tree
    .map(visit)
    .filter((node): node is AdminCategoryTreeNode => Boolean(node));
};

export const previewNextChildCode = (parent: AdminCategoryTreeNode, childLevel: CategoryLevel): string => {
  const children = parent.children ?? [];
  const suffixes = children
    .filter((child) => child.level === childLevel && child.code.startsWith(parent.code))
    .map((child) => Number(child.code.slice(parent.code.length)))
    .filter((suffix) => Number.isInteger(suffix));
  const next = Math.max(0, ...suffixes) + 1;
  return `${parent.code}${String(next).padStart(2, "0")}`;
};

export const matchesProductAssignmentSearch = (product: AdminCategoryProduct, search: string): boolean => {
  const terms = normalizeCategorySearchText(search).split(" ").filter(Boolean);
  if (terms.length === 0) return true;

  const text = normalizeCategorySearchText([
    product.sku,
    product.barcode ?? "",
    product.name,
    product.description ?? "",
  ].join(" "));

  return terms.every((term) => text.includes(term));
};
