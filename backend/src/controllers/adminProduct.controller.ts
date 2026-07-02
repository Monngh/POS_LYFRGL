import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  createProduct as createProductService,
  getNextProductSku as getNextProductSkuService,
  listProducts as listProductsService,
  getProductDetail as getProductDetailService,
  updateProduct as updateProductService,
  deleteProduct as deleteProductService,
  listSuppliers as listSuppliersService,
  createSupplier as createSupplierService,
  updateSupplier as updateSupplierService,
  getSupplierProducts as getSupplierProductsService,
  assignProductToSupplier as assignProductToSupplierService,
  removeProductFromSupplier as removeProductFromSupplierService,
  getProductSuppliers as getProductSuppliersService,
} from "../services/adminProduct.service";

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

const parseIntParam = (value: unknown): number | null => {
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
};

// ─── Product controllers ───────────────────────────────────────────────────────

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await createProductService(req.body as Record<string, unknown>);
    res.status(201).json({
      message: "Producto registrado exitosamente.",
      product: {
        id: product.id, sku: product.sku, barcode: product.barcode, name: product.name,
        description: product.description, costPrice: Number(product.costPrice),
        sellPrice: Number(product.sellPrice), active: product.active,
        isReturnable: product.isReturnable, returnWindowDays: product.returnWindowDays,
        trackingType: product.trackingType, satProductKey: product.satProductKey,
        satUnitKey: product.satUnitKey,
        categories: product.categories.map((row) => row.category),
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    res.status(500).json({ message: "Error al registrar el producto." });
  }
};

export const getNextProductSku = async (_req: Request, res: Response): Promise<void> => {
  try {
    const sku = await getNextProductSkuService();
    res.status(200).json({ sku });
  } catch (error: unknown) {
    console.error(error);
    res.status(500).json({ message: "No se pudo generar el siguiente SKU." });
  }
};

export const listProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await listProductsService(
      trimQuery(req.query.search),
      req.query.includeInactive === "true"
    );
    res.status(200).json({ products });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar productos." });
  }
};

export const getProductDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "Identificador de producto inválido." }); return; }

    const product = await getProductDetailService(id);
    if (!product) { res.status(404).json({ message: "Producto no encontrado." }); return; }

    res.status(200).json({ product });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener el detalle del producto." });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id || id <= 0) { res.status(400).json({ message: "Identificador de producto inválido." }); return; }

    const updated = await updateProductService(id, req.body as Record<string, unknown>);
    const categoriesWereSent = Boolean(req.body) &&
      typeof req.body === "object" &&
      Object.prototype.hasOwnProperty.call(req.body, "categoryIds");
    res.status(200).json({
      message: categoriesWereSent
        ? "Producto actualizado exitosamente. Categorias actualizadas correctamente."
        : "Producto actualizado exitosamente.",
      product: {
        id: updated.id, sku: updated.sku, barcode: updated.barcode, name: updated.name,
        description: updated.description, costPrice: Number(updated.costPrice),
        sellPrice: Number(updated.sellPrice), active: updated.active,
        isReturnable: updated.isReturnable, returnWindowDays: updated.returnWindowDays,
        trackingType: updated.trackingType, satProductKey: updated.satProductKey,
        satUnitKey: updated.satUnitKey,
        categories: updated.categories.map((row) => row.category),
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al actualizar el producto." });
  }
};

export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "Identificador de producto inválido." }); return; }

    const updated = await deleteProductService(id);
    res.status(200).json({ message: "Producto desactivado exitosamente.", product: { id: updated.id, sku: updated.sku, active: updated.active } });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al desactivar el producto." });
  }
};

// ─── Supplier controllers ──────────────────────────────────────────────────────

export const listSuppliers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await listSuppliersService();
    res.json(suppliers);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar proveedores.", error: error.message });
  }
};

export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplier = await createSupplierService(req.body as Record<string, unknown>);
    res.status(201).json(supplier);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    if (error.code === "P2002") { res.status(400).json({ message: "Ya existe un proveedor registrado con esos datos." }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al crear proveedor.", error: error.message });
  }
};

export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "ID de proveedor inválido." }); return; }

    const supplier = await updateSupplierService(id, req.body as Record<string, unknown>);
    res.json(supplier);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    if (error.code === "P2025") { res.status(404).json({ message: "Proveedor no encontrado." }); return; }
    if (error.code === "P2002") { res.status(400).json({ message: "Ya existe un proveedor con esos datos." }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al actualizar proveedor.", error: error.message });
  }
};

export const getSupplierProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplierId = Number(req.params.supplierId);
    if (isNaN(supplierId)) { res.status(400).json({ message: "Identificador de proveedor inválido." }); return; }

    const products = await getSupplierProductsService(supplierId);
    res.status(200).json(products);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener productos del proveedor." });
  }
};

export const assignProductToSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplierId = Number(req.body.supplierId);
    const productId = Number(req.body.productId);
    if (!supplierId || !productId) { res.status(400).json({ message: "supplierId y productId son requeridos." }); return; }

    const record = await assignProductToSupplierService(supplierId, productId);
    res.status(201).json({ message: "Producto asignado al proveedor exitosamente.", record });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al asignar producto al proveedor." });
  }
};

export const removeProductFromSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplierId = Number(req.body.supplierId);
    const productId = Number(req.body.productId);
    if (!supplierId || !productId) { res.status(400).json({ message: "supplierId y productId son requeridos." }); return; }

    await removeProductFromSupplierService(supplierId, productId);
    res.status(200).json({ message: "Producto removido del proveedor exitosamente." });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al remover producto del proveedor." });
  }
};

export const getProductSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = Number(req.params.productId);
    if (isNaN(productId)) { res.status(400).json({ message: "Identificador de producto inválido." }); return; }

    const suppliers = await getProductSuppliersService(productId);
    res.status(200).json(suppliers);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener proveedores del producto." });
  }
};
