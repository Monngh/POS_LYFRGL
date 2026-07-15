import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";

const PRODUCT_TEXT_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9\s.,#\-/()]+$/;
const MOVEMENT_TYPE_REGEX = /^[A-Z_]+$/;
const INVENTORY_ADJUSTMENT_MOVEMENT_TYPES = new Set(["AJUSTE_INVENTARIO", "AJUSTE_MERMA"]);

// Normaliza texto eliminando acentos y pasando a minúsculas
const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Divide la búsqueda en términos individuales
const splitSearchTerms = (search: string): string[] =>
  normalizeSearchText(search)
    .split(/\s+/)
    .filter(Boolean);

// Construye el bloque AND de condiciones OR para multi-palabra en Inventario
export type InventoryStatusFilter = "all" | "active" | "inactive";

interface ListInventoryParams {
  branchId?: number;
  search?: string;
  status?: InventoryStatusFilter;
  lowStock?: boolean;
}

const buildInventorySearchWhere = (search: string): Prisma.ProductWhereInput => {
  const terms = splitSearchTerms(search);
  if (terms.length === 0) return {};
  if (terms.length === 1) {
    const t = terms[0];
    return {
      OR: [
        { name: { contains: t } },
        { sku: { contains: t } },
        { barcode: { contains: t } },
        { description: { contains: t } },
      ],
    };
  }
  // Multi-palabra: AND de bloques OR — todos los términos deben aparecer en algún campo
  return {
    AND: terms.map((t) => ({
      OR: [
        { name: { contains: t } },
        { sku: { contains: t } },
        { barcode: { contains: t } },
        { description: { contains: t } },
      ],
    })),
  };
};

const buildLowStockInventoryWhere = (branchId?: number): Prisma.InventoryWhereInput => ({
  ...(branchId ? { branchId } : {}),
  quantity: { lte: prisma.inventory.fields.minStock },
});

const buildInventoryProductWhere = (params: ListInventoryParams): Prisma.ProductWhereInput => {
  const where: Prisma.ProductWhereInput = {};
  const and: Prisma.ProductWhereInput[] = [];

  if (params.search) {
    and.push(buildInventorySearchWhere(params.search));
  }

  if (params.status === "active") {
    where.active = true;
  } else if (params.status === "inactive") {
    where.active = false;
  }

  if (params.lowStock) {
    and.push({
      inventories: {
        some: buildLowStockInventoryWhere(params.branchId),
      },
    });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
};

const buildActiveLowStockCountWhere = (params: ListInventoryParams): Prisma.ProductWhereInput => {
  const and: Prisma.ProductWhereInput[] = [
    {
      inventories: {
        some: buildLowStockInventoryWhere(params.branchId),
      },
    },
  ];

  if (params.search) {
    and.unshift(buildInventorySearchWhere(params.search));
  }

  return {
    active: true,
    AND: and,
  };
};

// Construye el bloque AND de condiciones OR para multi-palabra en Kardex (relación product)
const buildKardexProductSearchWhere = (search: string): any => {
  const terms = splitSearchTerms(search);
  if (terms.length === 0) return {};
  if (terms.length === 1) {
    const t = terms[0];
    return {
      product: {
        OR: [
          { name: { contains: t } },
          { sku: { contains: t } },
          { barcode: { contains: t } },
          { description: { contains: t } },
        ],
      },
    };
  }
  // Multi-palabra sobre la relación product
  return {
    AND: terms.map((t) => ({
      product: {
        OR: [
          { name: { contains: t } },
          { sku: { contains: t } },
          { barcode: { contains: t } },
          { description: { contains: t } },
        ],
      },
    })),
  };
};

export const listInventory = async (params: ListInventoryParams) => {
  const where = buildInventoryProductWhere(params);
  const activeLowStockCountWhere = buildActiveLowStockCountWhere(params);

  const [products, lowStockCount] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        inventories: params.branchId ? { where: { branchId: params.branchId } } : true,
        categories: {
          orderBy: { categoryId: "asc" },
          include: {
            category: {
              select: {
                id: true,
                code: true,
                name: true,
                level: true,
                active: true,
              },
            },
          },
        },
      },
    }),
    prisma.product.count({ where: activeLowStockCountWhere }),
  ]);

  return {
    products: products.map((p) => {
      const invs = p.inventories;
      const stock = invs.reduce((acc, i) => acc + i.quantity, 0);
      const minStock = invs.reduce((acc, i) => acc + i.minStock, 0);
      const low = invs.some((i) => i.quantity <= i.minStock);
      return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        description: p.description,
        active: p.active,
        sellPrice: Number(p.sellPrice),
        costPrice: Number(p.costPrice),
        satUnitKey: p.satUnitKey,
        stock,
        minStock,
        low,
        branchCount: invs.length,
        categories: p.categories.map((row) => row.category),
      };
    }),
    lowStockCount,
  };
};

const KARDEX_PAGE_SIZE = 20;

export const listKardex = async (params: {
  branchId?: number;
  movementType?: string;
  search?: string;
  from?: Date;
  to?: Date;
  page: number;
}) => {
  const baseWhere: any = {};
  if (params.branchId) baseWhere.branchId = params.branchId;
  if (params.movementType && params.movementType !== "all") baseWhere.movementType = params.movementType;
  if (params.from || params.to) {
    baseWhere.createdAt = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }

  // Construir la búsqueda multi-palabra fusionada con los filtros base
  let where: any;
  if (params.search) {
    const searchWhere = buildKardexProductSearchWhere(params.search);
    // Si el searchWhere tiene AND (multi-término), fusionamos con los filtros base
    if (searchWhere.AND) {
      where = {
        ...baseWhere,
        AND: searchWhere.AND,
      };
    } else if (searchWhere.product) {
      where = {
        ...baseWhere,
        product: searchWhere.product,
      };
    } else {
      where = baseWhere;
    }
  } else {
    where = baseWhere;
  }

  const [rawEntries, total] = await prisma.$transaction([
    prisma.kardex.findMany({
      where,
      take: KARDEX_PAGE_SIZE,
      skip: (params.page - 1) * KARDEX_PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, sku: true } },
        branch: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.kardex.count({ where }),
  ]);

  const entries = rawEntries.map((k) => ({
    id: k.id,
    createdAt: k.createdAt,
    product: k.product.name,
    sku: k.product.sku,
    branch: k.branch.name,
    user: k.user.name,
    movementType: k.movementType,
    quantityChange: k.quantityChange,
    balanceAfter: k.balanceAfter,
    reason: k.reason,
  }));

  return { entries, total };
};

export const adjustInventory = async (params: {
  productId: number;
  branchId: number;
  quantityChange: number;
  movementType: string;
  reason: string;
  userId: number;
  requester?: { role: string; branchId: number };
}) => {
  if (params.requester?.role === "GERENTE" && params.branchId !== params.requester.branchId) {
    throw new AppError("Acceso denegado. Solo puede ajustar el inventario de su sucursal.", 403);
  }

  if (!MOVEMENT_TYPE_REGEX.test(params.movementType) || !INVENTORY_ADJUSTMENT_MOVEMENT_TYPES.has(params.movementType)) {
    throw new AppError("El tipo de movimiento no es valido.", 400);
  }
  if (!PRODUCT_TEXT_REGEX.test(params.reason)) {
    throw new AppError("El motivo contiene caracteres no permitidos.", 400);
  }

  const inventory = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId: params.productId, branchId: params.branchId } },
  });

  if (!inventory) throw new AppError("Inventario no encontrado para este producto y sucursal.", 404);

  const newQuantity = inventory.quantity + params.quantityChange;
  if (newQuantity < 0) throw new AppError("El ajuste resultaría en stock negativo.", 400);

  await prisma.$transaction(async (tx) => {
    await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: newQuantity } });
    await tx.kardex.create({
      data: {
        productId: params.productId,
        branchId: params.branchId,
        userId: params.userId,
        quantityChange: params.quantityChange,
        balanceAfter: newQuantity,
        movementType: params.movementType,
        reason: params.reason,
      },
    });
  });

  return newQuantity;
};

export const transferInventory = async (params: {
  productId: number;
  fromBranch: number;
  toBranch: number;
  quantity: number;
  userId: number;
  requester?: { role: string; branchId: number };
}) => {
  if (
    params.requester?.role === "GERENTE" &&
    params.fromBranch !== params.requester.branchId &&
    params.toBranch !== params.requester.branchId
  ) {
    throw new AppError("Acceso denegado. Uno de los extremos de la transferencia debe ser su sucursal.", 403);
  }

  if (params.fromBranch === params.toBranch) throw new AppError("El origen y destino deben ser diferentes.", 400);
  if (params.quantity <= 0) throw new AppError("La cantidad debe ser mayor a cero.", 400);

  const fromInv = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId: params.productId, branchId: params.fromBranch } },
  });

  if (!fromInv || fromInv.quantity < params.quantity) {
    throw new AppError("Stock insuficiente en la sucursal de origen.", 400);
  }

  const [branchFrom, branchTo] = await Promise.all([
    prisma.branch.findUnique({ where: { id: params.fromBranch }, select: { name: true } }),
    prisma.branch.findUnique({ where: { id: params.toBranch }, select: { name: true } }),
  ]);

  await prisma.$transaction(async (tx) => {
    const fromBalance = fromInv.quantity - params.quantity;
    await tx.inventory.update({ where: { id: fromInv.id }, data: { quantity: fromBalance } });
    await tx.kardex.create({
      data: {
        productId: params.productId,
        branchId: params.fromBranch,
        userId: params.userId,
        quantityChange: -params.quantity,
        balanceAfter: fromBalance,
        movementType: "TRASPASO_SALIDA",
        reason: `Traslado a ${branchTo?.name ?? `sucursal ${params.toBranch}`}`,
      },
    });

    const existingTo = await tx.inventory.findUnique({
      where: { productId_branchId: { productId: params.productId, branchId: params.toBranch } },
    });
    const toBalance = (existingTo?.quantity ?? 0) + params.quantity;

    if (existingTo) {
      await tx.inventory.update({ where: { id: existingTo.id }, data: { quantity: toBalance } });
    } else {
      await tx.inventory.create({
        data: { productId: params.productId, branchId: params.toBranch, quantity: toBalance, minStock: 0, maxStock: 100 },
      });
    }

    await tx.kardex.create({
      data: {
        productId: params.productId,
        branchId: params.toBranch,
        userId: params.userId,
        quantityChange: params.quantity,
        balanceAfter: toBalance,
        movementType: "TRASPASO_ENTRADA",
        reason: `Traslado desde ${branchFrom?.name ?? `sucursal ${params.fromBranch}`}`,
      },
    });
  });
};
