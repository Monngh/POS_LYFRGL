import { prisma } from "../app";
import { AppError } from "../utils/AppError";

// ─── Validation helpers ────────────────────────────────────────────────────────

const CUSTOMER_NAME_PATTERN = /^[A-Za-z0-9À-ſ\s.,'&-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9\s()+-]+$/;
const ADDRESS_PATTERN = /^[A-Za-z0-9À-ſ\s.,#\-\/]+$/;
const ZIP_CODE_PATTERN = /^\d{5}$/;
const TAX_REGIME_PATTERN = /^\d{3}$/;
const CFDI_USE_PATTERN = /^[A-Z0-9]{3,4}$/;

type CustomerInput = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  address?: string | null;
  creditLimit?: number;
  zipCode?: string | null;
  taxRegime?: string | null;
  cfdiUse?: string | null;
};

const readString = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
};

const normalizeSpaces = (value: string): string => value.trim().replace(/\s+/g, " ");

const validateRFC = (rfc: string): { valid: boolean; message: string } => {
  const cleaned = rfc.toUpperCase().replace(/\s+/g, "");
  const rfcRegex = /^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/;
  if (!rfcRegex.test(cleaned)) {
    return { valid: false, message: "RFC debe tener 12 (moral) o 13 (física) caracteres alfanuméricos, sin espacios." };
  }
  return { valid: true, message: "" };
};

const checkRFCUnique = async (rfc: string, excludeId?: number): Promise<boolean> => {
  const cleaned = rfc.toUpperCase().replace(/\s+/g, "");
  const existing = await prisma.customer.findFirst({
    where: { taxId: cleaned, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
  return !existing;
};

const validateCustomerInput = (
  body: Record<string, unknown>,
  options: { requireName: boolean }
): { valid: true; data: CustomerInput } | { valid: false; message: string } => {
  const data: CustomerInput = {};

  if (options.requireName || body.name !== undefined) {
    const name = normalizeSpaces(readString(body.name));
    if (!name) return { valid: false, message: "El nombre del cliente es requerido." };
    if (name.length < 2) return { valid: false, message: "El nombre debe tener al menos 2 caracteres." };
    if (name.length > 100) return { valid: false, message: "El nombre no puede superar 100 caracteres." };
    if (!CUSTOMER_NAME_PATTERN.test(name)) return { valid: false, message: "El nombre contiene caracteres no permitidos." };
    data.name = name;
  }

  if (body.email !== undefined) {
    const email = readString(body.email).toLowerCase();
    if (email && (!EMAIL_PATTERN.test(email) || /\s/.test(email))) return { valid: false, message: "El correo no tiene un formato valido." };
    data.email = email || null;
  }

  if (body.phone !== undefined) {
    const phone = normalizeSpaces(readString(body.phone));
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (!PHONE_PATTERN.test(phone)) return { valid: false, message: "El telefono solo puede contener numeros, espacios, +, - y parentesis." };
      if (digits.length < 10 || digits.length > 15) return { valid: false, message: "El telefono debe tener entre 10 y 15 digitos." };
    }
    data.phone = phone || null;
  }

  if (body.taxId !== undefined) {
    const taxId = readString(body.taxId).toUpperCase().replace(/\s+/g, "");
    if (taxId) {
      const rfcCheck = validateRFC(taxId);
      if (!rfcCheck.valid) return { valid: false, message: rfcCheck.message };
    }
    data.taxId = taxId || null;
  }

  if (body.address !== undefined) {
    const address = normalizeSpaces(readString(body.address));
    if (address) {
      if (address.length > 200) return { valid: false, message: "La direccion no puede superar 200 caracteres." };
      if (!ADDRESS_PATTERN.test(address)) return { valid: false, message: "La direccion contiene caracteres no permitidos." };
    }
    data.address = address || null;
  }

  if (options.requireName || body.creditLimit !== undefined) {
    const rawCreditLimit = readString(body.creditLimit);
    const creditLimit = rawCreditLimit ? Number(rawCreditLimit) : 0;
    if (!Number.isFinite(creditLimit)) return { valid: false, message: "El limite de credito debe ser numerico." };
    if (creditLimit < 0) return { valid: false, message: "El limite de credito no puede ser negativo." };
    data.creditLimit = creditLimit;
  }

  if (body.zipCode !== undefined) {
    const zipCode = readString(body.zipCode);
    if (zipCode && !ZIP_CODE_PATTERN.test(zipCode)) return { valid: false, message: "El Codigo Postal debe ser exactamente 5 digitos." };
    data.zipCode = zipCode || null;
  }

  if (body.taxRegime !== undefined) {
    const taxRegime = readString(body.taxRegime);
    if (taxRegime && !TAX_REGIME_PATTERN.test(taxRegime)) return { valid: false, message: "El regimen fiscal no es valido." };
    data.taxRegime = taxRegime || null;
  }

  if (body.cfdiUse !== undefined) {
    const cfdiUse = readString(body.cfdiUse).toUpperCase();
    if (cfdiUse && !CFDI_USE_PATTERN.test(cfdiUse)) return { valid: false, message: "El uso de CFDI no es valido." };
    data.cfdiUse = cfdiUse || null;
  }

  return { valid: true, data };
};

// ─── Exported service functions ───────────────────────────────────────────────

export const listCustomers = async (search?: string) => {
  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { taxId: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { sales: true } } },
  });

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    taxId: c.taxId,
    address: c.address,
    creditLimit: Number(c.creditLimit),
    balance: Number(c.balance),
    salesCount: c._count.sales,
    zipCode: c.zipCode,
    taxRegime: c.taxRegime,
    cfdiUse: c.cfdiUse,
    createdAt: c.createdAt,
  }));
};

export const createCustomer = async (body: Record<string, unknown>) => {
  const validation = validateCustomerInput(body, { requireName: true });
  if (!validation.valid) throw new AppError(validation.message, 400);

  const { name, email, phone, taxId, address, creditLimit, zipCode, taxRegime, cfdiUse } = validation.data;

  if (taxId) {
    const isUnique = await checkRFCUnique(taxId);
    if (!isUnique) throw new AppError("El RFC ya existe en el catálogo de clientes.", 409);
  }

  const customer = await prisma.customer.create({
    data: {
      name: name!.trim(),
      email: email ?? null,
      phone: phone ?? null,
      taxId: taxId ?? null,
      address: address ?? null,
      creditLimit: creditLimit ?? 0,
      zipCode: zipCode ?? null,
      taxRegime: taxRegime ?? null,
      cfdiUse: cfdiUse ?? null,
    },
  });

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    taxId: customer.taxId,
    address: customer.address,
    creditLimit: Number(customer.creditLimit),
    balance: Number(customer.balance),
    salesCount: 0,
    zipCode: customer.zipCode,
    taxRegime: customer.taxRegime,
    cfdiUse: customer.cfdiUse,
    createdAt: customer.createdAt,
  };
};

export const updateCustomer = async (customerId: number, body: Record<string, unknown>) => {
  const validation = validateCustomerInput(body, { requireName: false });
  if (!validation.valid) throw new AppError(validation.message, 400);

  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) throw new AppError("Cliente no encontrado.", 404);

  const { name, email, phone, taxId, address, creditLimit, zipCode, taxRegime, cfdiUse } = validation.data;

  if (taxId && taxId !== existing.taxId) {
    const isUnique = await checkRFCUnique(taxId, customerId);
    if (!isUnique) throw new AppError("El RFC ya está registrado en otro cliente.", 409);
  }

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(email !== undefined && { email: email ?? null }),
      ...(phone !== undefined && { phone: phone ?? null }),
      ...(taxId !== undefined && { taxId: taxId ?? null }),
      ...(address !== undefined && { address: address ?? null }),
      ...(creditLimit !== undefined && { creditLimit }),
      ...(zipCode !== undefined && { zipCode: zipCode ?? null }),
      ...(taxRegime !== undefined && { taxRegime: taxRegime ?? null }),
      ...(cfdiUse !== undefined && { cfdiUse: cfdiUse ?? null }),
    },
    include: { _count: { select: { sales: true } } },
  });

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    taxId: customer.taxId,
    address: customer.address,
    creditLimit: Number(customer.creditLimit),
    balance: Number(customer.balance),
    salesCount: customer._count.sales,
    zipCode: customer.zipCode,
    taxRegime: customer.taxRegime,
    cfdiUse: customer.cfdiUse,
    createdAt: customer.createdAt,
  };
};
