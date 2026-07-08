import { Prisma } from "@prisma/client";
import { prisma } from "../app";
import { AppError } from "../utils/AppError";
import { validateAdminLocalPhone } from "../utils/adminPhoneValidation";
import { buildNextProductSku } from "../utils/productSku";

// ─── Product helpers ───────────────────────────────────────────────────────────

const PRODUCT_TEXT_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9\s.,#\-/()]+$/;
const BARCODE_REGEX = /^[0-9]+$/;
const SAT_PRODUCT_KEY_REGEX = /^[0-9]{8}$/;
const SAT_UNIT_KEY_REGEX = /^[A-Za-z0-9]+$/;
const MONEY_REGEX = /^\d+(?:\.\d+)?$/;
const PRODUCT_NAME_MAX_LENGTH = 50;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 100;
const BARCODE_MAX_LENGTH = 13;
const SKU_GENERATION_MAX_ATTEMPTS = 5;

type MoneyValidation = { ok: true; value: number } | { ok: false; message: string };

const productCategorySummarySelect = {
  id: true,
  code: true,
  name: true,
  level: true,
  active: true,
} satisfies Prisma.CategorySelect;

const cleanBodyText = (value: unknown): string => String(value ?? "").trim();
const cleanOptionalBodyText = (value: unknown): string | null => {
  const text = cleanBodyText(value);
  return text.length > 0 ? text : null;
};
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const parseMoney = (value: unknown, field: "costo" | "precio"): MoneyValidation => {
  const label = field === "costo" ? "El precio de costo" : "El precio de venta";
  const text = cleanBodyText(value);
  if (!text) return { ok: false, message: `${label} es requerido.` };
  if (text.startsWith("-")) return { ok: false, message: `${label} no puede ser negativo.` };
  if (!MONEY_REGEX.test(text)) return { ok: false, message: `${label} debe ser un número válido.` };
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return { ok: false, message: `${label} debe ser un número válido.` };
  return { ok: true, value: roundMoney(numeric) };
};

const parseInteger = (value: unknown): number | null => {
  const text = cleanBodyText(value);
  if (!/^-?\d+$/.test(text)) return null;
  const numeric = Number(text);
  return Number.isSafeInteger(numeric) ? numeric : null;
};

const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = parseInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

const parseCategoryIds = (value: unknown, required: boolean): number[] | undefined => {
  if (value === undefined) {
    if (required) throw new AppError("Selecciona al menos una categoria para el producto.", 400);
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError("categoryIds debe ser un arreglo de ids numericos.", 400);
  }

  const categoryIds: number[] = [];
  for (const raw of value) {
    const categoryId = parsePositiveInteger(raw);
    if (categoryId === null) {
      throw new AppError("categoryIds debe contener ids numericos validos.", 400);
    }
    if (!categoryIds.includes(categoryId)) {
      categoryIds.push(categoryId);
    }
  }

  if (required && categoryIds.length === 0) {
    throw new AppError("Selecciona al menos una categoria para el producto.", 400);
  }

  return categoryIds;
};

const validateAssignableCategories = async (
  client: Prisma.TransactionClient,
  categoryIds: number[]
) => {
  if (categoryIds.length === 0) return [];

  const categories = await client.category.findMany({
    where: { id: { in: categoryIds } },
    select: productCategorySummarySelect,
  });

  if (categories.length !== categoryIds.length) {
    throw new AppError("Una o mas categorias no existen.", 404);
  }

  if (categories.some((category) => category.level !== "CATEGORY")) {
    throw new AppError("Solo se pueden asignar categorias finales a un producto.", 400);
  }

  if (categories.some((category) => !category.active)) {
    throw new AppError("No puedes asignar una categoria inactiva.", 400);
  }

  return categories;
};

const validateCategoriesForSync = async (
  client: Prisma.TransactionClient,
  productId: number,
  categoryIds: number[]
) => {
  if (categoryIds.length === 0) return [];

  const [categories, currentRows] = await Promise.all([
    client.category.findMany({
      where: { id: { in: categoryIds } },
      select: productCategorySummarySelect,
    }),
    client.productCategory.findMany({
      where: { productId },
      select: { categoryId: true },
    }),
  ]);
  const currentIds = new Set(currentRows.map((row) => row.categoryId));

  if (categories.length !== categoryIds.length) {
    throw new AppError("Una o mas categorias no existen.", 404);
  }

  if (categories.some((category) => category.level !== "CATEGORY")) {
    throw new AppError("Solo se pueden asignar categorias finales a un producto.", 400);
  }

  if (categories.some((category) => !category.active && !currentIds.has(category.id))) {
    throw new AppError("No puedes asignar una categoria inactiva.", 400);
  }

  return categories;
};

const syncProductCategories = async (
  client: Prisma.TransactionClient,
  productId: number,
  categoryIds: number[]
): Promise<{ added: number; removed: number }> => {
  const currentRows = await client.productCategory.findMany({
    where: { productId },
    select: { categoryId: true },
  });
  const currentIds = new Set(currentRows.map((row) => row.categoryId));
  const nextIds = new Set(categoryIds);
  const toRemove = [...currentIds].filter((categoryId) => !nextIds.has(categoryId));
  const toAdd = categoryIds.filter((categoryId) => !currentIds.has(categoryId));

  if (toRemove.length > 0) {
    await client.productCategory.deleteMany({
      where: { productId, categoryId: { in: toRemove } },
    });
  }

  if (toAdd.length > 0) {
    await client.productCategory.createMany({
      data: toAdd.map((categoryId) => ({ productId, categoryId })),
    });
  }

  return { added: toAdd.length, removed: toRemove.length };
};

const productCategoriesInclude = {
  categories: {
    orderBy: { categoryId: "asc" },
    include: {
      category: { select: productCategorySummarySelect },
    },
  },
} satisfies Prisma.ProductInclude;

const generateNextProductSku = async (client: Prisma.TransactionClient): Promise<string> => {
  const products = await client.product.findMany({
    select: { sku: true },
  });

  return buildNextProductSku(products);
};

const isRetryableSkuError = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2034";
  }

  return error instanceof Error && /deadlock/i.test(error.message);
};

// ─── Supplier helpers ──────────────────────────────────────────────────────────

const NAME_REGEX = /^[a-zA-ZÀ-ÿÑñ\s]+$/;
const COMPANY_NAME_REGEX = /^[a-zA-ZÀ-ÿ0-9\s.-]+$/;
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_REGEX = /^\d{5}$/;
const CITY_STATE_REGEX = /^[a-zA-ZÀ-ÿÑñ\s]+$/;

interface SupplierValidationData {
  name?: string;
  rfc?: string;
  email?: string;
  phone?: string;
  phoneCountryCode?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contactName?: string;
}

const validateSupplierData = (data: SupplierValidationData, isUpdate = false): string[] => {
  const errors: string[] = [];

  if (!isUpdate || data.name !== undefined) {
    const name = data.name?.trim();
    if (!name) errors.push("El nombre del proveedor es requerido.");
    else if (name.length < 3) errors.push("El nombre debe tener al menos 3 caracteres.");
    else if (name.length > 100) errors.push("El nombre no puede exceder 100 caracteres.");
    else if (!COMPANY_NAME_REGEX.test(name)) errors.push("El nombre solo puede contener letras, números, espacios, puntos y guiones.");
  }

  if (!isUpdate || data.rfc !== undefined) {
    const rfc = data.rfc?.trim().toUpperCase();
    if (!rfc) errors.push("El RFC es requerido.");
    else if (rfc.length !== 12 && rfc.length !== 13) errors.push("El RFC debe tener 12 o 13 caracteres.");
    else if (!RFC_REGEX.test(rfc)) errors.push("El formato del RFC es inválido.");
  }

  if (!isUpdate || data.email !== undefined) {
    const email = data.email?.trim();
    if (!email) errors.push("El correo electrónico es requerido.");
    else if (email.length > 100) errors.push("El correo no puede exceder 100 caracteres.");
    else if (!EMAIL_REGEX.test(email)) errors.push("El correo electrónico no es válido.");
  }

  if (!isUpdate || data.phone !== undefined) {
    const phone = data.phone?.trim();
    const phoneError = validateAdminLocalPhone(phone, data.phoneCountryCode, { required: true });
    if (phoneError) errors.push(phoneError);
  }

  if (!isUpdate || data.address !== undefined) {
    const address = data.address?.trim();
    if (!address) errors.push("La dirección es requerida.");
    else if (address.length < 5) errors.push("La dirección es muy corta.");
    else if (address.length > 200) errors.push("La dirección no puede exceder 200 caracteres.");
  }

  if (!isUpdate || data.city !== undefined) {
    const city = data.city?.trim();
    if (!city) errors.push("La ciudad es requerida.");
    else if (city.length < 2) errors.push("La ciudad es muy corta.");
    else if (!CITY_STATE_REGEX.test(city)) errors.push("La ciudad solo puede contener letras y espacios.");
  }

  if (!isUpdate || data.state !== undefined) {
    const state = data.state?.trim();
    if (!state) errors.push("El estado es requerido.");
    else if (state.length < 2) errors.push("El estado es muy corto.");
    else if (!CITY_STATE_REGEX.test(state)) errors.push("El estado solo puede contener letras y espacios.");
  }

  if (!isUpdate || data.zipCode !== undefined) {
    const zipCode = data.zipCode?.trim();
    if (!zipCode) errors.push("El código postal es requerido.");
    else if (!ZIP_REGEX.test(zipCode)) errors.push("El código postal debe contener exactamente 5 dígitos.");
  }

  if (!isUpdate || data.contactName !== undefined) {
    const contact = data.contactName?.trim();
    if (!contact) errors.push("El nombre del contacto es requerido.");
    else if (contact.length < 3) errors.push("El nombre del contacto debe tener al menos 3 caracteres.");
    else if (!NAME_REGEX.test(contact)) errors.push("El nombre del contacto solo puede contener letras y espacios.");
  }

  return errors;
};

// ─── Product service functions ─────────────────────────────────────────────────

export const getNextProductSku = async (): Promise<string> => generateNextProductSku(prisma);

export const createProduct = async (body: Record<string, unknown>) => {
  const categoryIds = parseCategoryIds(body.categoryIds, true) ?? [];
  const nameClean = cleanBodyText(body.name);
  if (!nameClean) throw new AppError("El nombre del producto es requerido.", 400);
  if (nameClean.length > PRODUCT_NAME_MAX_LENGTH) throw new AppError("El nombre del producto no puede tener más de 20 caracteres.", 400);
  if (!PRODUCT_TEXT_REGEX.test(nameClean)) throw new AppError("El nombre contiene caracteres no permitidos.", 400);

  const descriptionClean = cleanOptionalBodyText(body.description);
  if (descriptionClean && descriptionClean.length > PRODUCT_DESCRIPTION_MAX_LENGTH) throw new AppError("La descripción no puede tener más de 50 caracteres.", 400);
  if (descriptionClean && !PRODUCT_TEXT_REGEX.test(descriptionClean)) throw new AppError("La descripción contiene caracteres no permitidos.", 400);

  const barcodeClean = cleanOptionalBodyText(body.barcode);
  if (barcodeClean && (!BARCODE_REGEX.test(barcodeClean) || barcodeClean.length > BARCODE_MAX_LENGTH)) {
    throw new AppError("El código de barras solo puede contener números y no debe exceder 13 dígitos.", 400);
  }

  const cost = parseMoney(body.costPrice, "costo");
  if (!cost.ok) throw new AppError(cost.message, 400);

  const sell = parseMoney(body.sellPrice, "precio");
  if (!sell.ok) throw new AppError(sell.message, 400);

  const satProductKeyClean = cleanOptionalBodyText(body.satProductKey) ?? "01010101";
  if (!SAT_PRODUCT_KEY_REGEX.test(satProductKeyClean)) throw new AppError("La clave SAT debe contener 8 números.", 400);

  const satUnitKeyClean = cleanOptionalBodyText(body.satUnitKey) ?? "H87";
  if (!SAT_UNIT_KEY_REGEX.test(satUnitKeyClean)) throw new AppError("La clave de unidad SAT solo puede contener letras y números.", 400);

  const { isReturnable, returnWindowDays, trackingType } = body;

  for (let attempt = 1; attempt <= SKU_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await validateAssignableCategories(tx, categoryIds);

          if (barcodeClean) {
            const existingBarcode = await tx.product.findUnique({ where: { barcode: barcodeClean } });
            if (existingBarcode) throw new AppError("El código de barras ingresado ya está registrado.", 409);
          }

          const sku = await generateNextProductSku(tx);
          const product = await tx.product.create({
            data: {
              sku,
              barcode: barcodeClean,
              name: nameClean,
              description: descriptionClean,
              costPrice: cost.value,
              sellPrice: sell.value,
              active: true,
              isReturnable: isReturnable !== undefined ? Boolean(isReturnable) : true,
              returnWindowDays: returnWindowDays !== undefined ? Number(returnWindowDays) : 30,
              trackingType: trackingType && String(trackingType).trim() ? String(trackingType).trim() : "NONE",
              satProductKey: satProductKeyClean,
              satUnitKey: satUnitKeyClean,
            },
          });

          const branches = await tx.branch.findMany({ select: { id: true } });
          for (const branch of branches) {
            await tx.inventory.create({
              data: { productId: product.id, branchId: branch.id, quantity: 0, minStock: 10, maxStock: 400 },
            });
          }

          await tx.productCategory.createMany({
            data: categoryIds.map((categoryId) => ({ productId: product.id, categoryId })),
          });

          return tx.product.findUniqueOrThrow({
            where: { id: product.id },
            include: productCategoriesInclude,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        }
      );
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;

      if (barcodeClean && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existingBarcode = await prisma.product.findUnique({ where: { barcode: barcodeClean } });
        if (existingBarcode) throw new AppError("El código de barras ingresado ya está registrado.", 409);
      }

      if (!isRetryableSkuError(error)) throw error;
      if (attempt === SKU_GENERATION_MAX_ATTEMPTS) {
        throw new AppError("No fue posible generar un SKU único. Intenta nuevamente.", 409);
      }
    }
  }

  throw new AppError("No fue posible generar un SKU único. Intenta nuevamente.", 409);
};

export const listProducts = async (search?: string, includeInactive = false) => {
  const where: any = {};
  if (!includeInactive) where.active = true;
  if (search) {
    where.OR = [
      { sku: { contains: search } },
      { name: { contains: search } },
      { barcode: { contains: search } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true, sku: true, barcode: true, name: true, description: true,
      costPrice: true, sellPrice: true, active: true, trackingType: true,
      isReturnable: true, createdAt: true,
      categories: {
        orderBy: { categoryId: "asc" },
        include: { category: { select: productCategorySummarySelect } },
      },
    },
  });

  return products.map((p) => ({
    ...p,
    costPrice: Number(p.costPrice),
    sellPrice: Number(p.sellPrice),
    categories: p.categories.map((row) => row.category),
  }));
};

export const getProductDetail = async (id: number) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      ...productCategoriesInclude,
      inventories: { include: { branch: { select: { id: true, name: true } } } },
      kardexEntries: {
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { branch: { select: { name: true } }, user: { select: { name: true } } },
      },
    },
  });

  if (!product) return null;

  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    costPrice: Number(product.costPrice),
    sellPrice: Number(product.sellPrice),
    active: product.active,
    trackingType: product.trackingType,
    isReturnable: product.isReturnable,
    returnWindowDays: product.returnWindowDays,
    satProductKey: product.satProductKey,
    satUnitKey: product.satUnitKey,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    categories: product.categories.map((row) => row.category),
    inventories: product.inventories.map((inv) => ({
      id: inv.id,
      branch: inv.branch.name,
      branchId: inv.branchId,
      quantity: inv.quantity,
      minStock: inv.minStock,
      maxStock: inv.maxStock,
    })),
    recentKardex: product.kardexEntries.map((k) => ({
      id: k.id,
      date: k.createdAt,
      branch: k.branch.name,
      user: k.user.name,
      movementType: k.movementType,
      quantityChange: k.quantityChange,
      balanceAfter: k.balanceAfter,
      reason: k.reason,
    })),
  };
};

export const updateProduct = async (id: number, body: Record<string, unknown>) => {
  const categoryIds = parseCategoryIds(body.categoryIds, false);
  const existingProduct = await prisma.product.findUnique({ where: { id } });
  if (!existingProduct) throw new AppError("Producto no encontrado.", 404);

  const { name, description, barcode, costPrice, sellPrice, active, isReturnable, returnWindowDays, trackingType, satProductKey, satUnitKey } = body;

  const nameClean = name !== undefined ? cleanBodyText(name) : existingProduct.name;
  if (name !== undefined && !nameClean) throw new AppError("El nombre del producto es requerido.", 400);
  if (name !== undefined && nameClean.length > PRODUCT_NAME_MAX_LENGTH) throw new AppError("El nombre del producto no puede tener más de 20 caracteres.", 400);
  if (name !== undefined && !PRODUCT_TEXT_REGEX.test(nameClean)) throw new AppError("El nombre contiene caracteres no permitidos.", 400);

  const descriptionClean = description !== undefined ? cleanOptionalBodyText(description) : existingProduct.description;
  if (description !== undefined && descriptionClean && descriptionClean.length > PRODUCT_DESCRIPTION_MAX_LENGTH) throw new AppError("La descripción no puede tener más de 50 caracteres.", 400);
  if (description !== undefined && descriptionClean && !PRODUCT_TEXT_REGEX.test(descriptionClean)) throw new AppError("La descripción contiene caracteres no permitidos.", 400);

  const barcodeClean = barcode !== undefined ? cleanOptionalBodyText(barcode) : existingProduct.barcode;
  if (barcode !== undefined && barcodeClean && (!BARCODE_REGEX.test(barcodeClean) || barcodeClean.length > BARCODE_MAX_LENGTH)) {
    throw new AppError("El código de barras solo puede contener números y no debe exceder 13 dígitos.", 400);
  }

  let cost = Number(existingProduct.costPrice);
  if (costPrice !== undefined) {
    const parsedCost = parseMoney(costPrice, "costo");
    if (!parsedCost.ok) throw new AppError(parsedCost.message, 400);
    cost = parsedCost.value;
  }

  let sell = Number(existingProduct.sellPrice);
  if (sellPrice !== undefined) {
    const parsedSell = parseMoney(sellPrice, "precio");
    if (!parsedSell.ok) throw new AppError(parsedSell.message, 400);
    sell = parsedSell.value;
  }

  let satProductKeyClean = existingProduct.satProductKey || "01010101";
  if (satProductKey !== undefined) {
    satProductKeyClean = cleanOptionalBodyText(satProductKey) ?? "01010101";
    if (!SAT_PRODUCT_KEY_REGEX.test(satProductKeyClean)) throw new AppError("La clave SAT debe contener 8 números.", 400);
  }

  let satUnitKeyClean = existingProduct.satUnitKey || "H87";
  if (satUnitKey !== undefined) {
    satUnitKeyClean = cleanOptionalBodyText(satUnitKey) ?? "H87";
    if (!SAT_UNIT_KEY_REGEX.test(satUnitKeyClean)) throw new AppError("La clave de unidad SAT solo puede contener letras y números.", 400);
  }

  const returnWindowDaysClean = returnWindowDays !== undefined ? parseInteger(returnWindowDays) : existingProduct.returnWindowDays;
  if (returnWindowDaysClean === null || returnWindowDaysClean < 0) throw new AppError("La ventana de devolución debe ser un entero no negativo.", 400);

  if (barcode !== undefined && barcodeClean) {
    const duplicateBarcode = await prisma.product.findFirst({ where: { barcode: barcodeClean, id: { not: id } } });
    if (duplicateBarcode) throw new AppError("El código de barras ingresado ya está asignado a otro producto.", 409);
  }

  return prisma.$transaction(async (tx) => {
    if (categoryIds !== undefined) {
      await validateCategoriesForSync(tx, id, categoryIds);
    }

    await tx.product.update({
      where: { id },
      data: {
        name: nameClean,
        description: descriptionClean,
        barcode: barcodeClean,
        costPrice: cost,
        sellPrice: sell,
        active: typeof active === "boolean" ? active : existingProduct.active,
        isReturnable: isReturnable !== undefined ? Boolean(isReturnable) : existingProduct.isReturnable,
        returnWindowDays: returnWindowDaysClean,
        trackingType: trackingType !== undefined ? cleanBodyText(trackingType) || "NONE" : existingProduct.trackingType,
        satProductKey: satProductKeyClean,
        satUnitKey: satUnitKeyClean,
      },
    });

    if (categoryIds !== undefined) {
      await syncProductCategories(tx, id, categoryIds);
    }

    return tx.product.findUniqueOrThrow({
      where: { id },
      include: productCategoriesInclude,
    });
  });
};

export const deleteProduct = async (id: number) => {
  const existingProduct = await prisma.product.findUnique({ where: { id } });
  if (!existingProduct) throw new AppError("Producto no encontrado.", 404);

  return prisma.product.update({ where: { id }, data: { active: false } });
};

// ─── Supplier service functions ────────────────────────────────────────────────

export const listSuppliers = async () =>
  prisma.supplier.findMany({ orderBy: { name: "asc" } });

export const createSupplier = async (body: Record<string, unknown>) => {
  const { name, rfc, email, phone, phoneCountryCode, address, city, state, zipCode, contactName, active } = body as any;

  const validationErrors = validateSupplierData({ name, rfc, email, phone, phoneCountryCode, address, city, state, zipCode, contactName });
  if (validationErrors.length > 0) throw new AppError(validationErrors[0], 400);

  const supplierByName = await prisma.supplier.findFirst({ where: { name: String(name).trim() } });
  if (supplierByName) throw new AppError("Ya existe un proveedor con ese nombre.", 400);

  const supplierByRFC = await prisma.supplier.findFirst({ where: { rfc: String(rfc).trim().toUpperCase() } });
  if (supplierByRFC) throw new AppError("Ya existe un proveedor con ese RFC.", 400);

  return prisma.supplier.create({
    data: {
      name: String(name).trim(),
      rfc: String(rfc).trim().toUpperCase(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      city: String(city).trim(),
      state: String(state).trim(),
      zipCode: String(zipCode).trim(),
      contactName: String(contactName).trim(),
      active: active !== undefined ? Boolean(active) : true,
    },
  });
};

export const updateSupplier = async (id: number, body: Record<string, unknown>) => {
  const { name, rfc, email, phone, phoneCountryCode, address, city, state, zipCode, contactName, active } = body as any;

  const hasData = [name, rfc, email, phone, address, city, state, zipCode, contactName, active].some((v) => v !== undefined);
  if (!hasData) throw new AppError("No se enviaron datos para actualizar.", 400);

  const updateValidation: SupplierValidationData = {};
  if (name !== undefined) updateValidation.name = name;
  if (rfc !== undefined) updateValidation.rfc = rfc;
  if (email !== undefined) updateValidation.email = email;
  if (phone !== undefined) {
    updateValidation.phone = phone;
    updateValidation.phoneCountryCode = phoneCountryCode;
  }
  if (address !== undefined) updateValidation.address = address;
  if (city !== undefined) updateValidation.city = city;
  if (state !== undefined) updateValidation.state = state;
  if (zipCode !== undefined) updateValidation.zipCode = zipCode;
  if (contactName !== undefined) updateValidation.contactName = contactName;

  const validationErrors = validateSupplierData(updateValidation, true);
  if (validationErrors.length > 0) throw new AppError(validationErrors[0], 400);

  if (name !== undefined) {
    const dup = await prisma.supplier.findFirst({ where: { name: String(name).trim(), NOT: { id } } });
    if (dup) throw new AppError("Ya existe otro proveedor con ese nombre.", 400);
  }
  if (rfc !== undefined) {
    const dup = await prisma.supplier.findFirst({ where: { rfc: String(rfc).trim().toUpperCase(), NOT: { id } } });
    if (dup) throw new AppError("Ya existe otro proveedor con ese RFC.", 400);
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (rfc !== undefined) updateData.rfc = String(rfc).trim().toUpperCase();
  if (email !== undefined) updateData.email = String(email).trim().toLowerCase();
  if (phone !== undefined) updateData.phone = String(phone).trim();
  if (address !== undefined) updateData.address = String(address).trim();
  if (city !== undefined) updateData.city = String(city).trim();
  if (state !== undefined) updateData.state = String(state).trim();
  if (zipCode !== undefined) updateData.zipCode = String(zipCode).trim();
  if (contactName !== undefined) updateData.contactName = String(contactName).trim();
  if (active !== undefined) updateData.active = Boolean(active);

  return prisma.supplier.update({ where: { id }, data: updateData });
};

export const getSupplierProducts = async (supplierId: number) => {
  const records = await prisma.supplierProduct.findMany({
    where: { supplierId },
    include: { product: { select: { id: true, sku: true, name: true, costPrice: true, sellPrice: true, active: true, satUnitKey: true } } },
  });

  return records.map((sp) => ({
    id: sp.product.id,
    sku: sp.product.sku,
    name: sp.product.name,
    costPrice: Number(sp.product.costPrice),
    sellPrice: Number(sp.product.sellPrice),
    active: sp.product.active,
    satUnitKey: sp.product.satUnitKey,
  }));
};

export const assignProductToSupplier = async (supplierId: number, productId: number) => {
  const existing = await prisma.supplierProduct.findUnique({
    where: { supplierId_productId: { supplierId, productId } },
  });
  if (existing) throw new AppError("Este producto ya está asignado a este proveedor.", 400);

  return prisma.supplierProduct.create({
    data: { supplierId, productId },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });
};

export const removeProductFromSupplier = async (supplierId: number, productId: number) => {
  await prisma.supplierProduct.delete({
    where: { supplierId_productId: { supplierId, productId } },
  });
};

export const getProductSuppliers = async (productId: number) => {
  const records = await prisma.supplierProduct.findMany({
    where: { productId },
    include: { supplier: { select: { id: true, name: true, rfc: true, email: true } } },
  });

  return records.map((sp) => sp.supplier);
};
