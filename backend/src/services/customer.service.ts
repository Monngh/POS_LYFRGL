import { prisma } from "../app";
import { hashPassword, comparePassword } from "../utils/auth";
import { AppError } from "../utils/AppError";

const CUSTOMER_ACCOUNT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const registerCustomer = async (
  phone: string,
  invoiceNumber: string,
  password: string,
  email: string
): Promise<void> => {
  const sale = await prisma.sale.findUnique({
    where: { invoiceNumber },
    include: { customer: true },
  });

  if (!sale) {
    throw new AppError("No se encontró ningún ticket de venta con el folio proporcionado.", 404);
  }

  if (!sale.customerId || !sale.customer) {
    throw new AppError("Este ticket no está asociado a ningún cliente registrado.", 400);
  }

  const inputPhoneNormalized = phone.replace(/[^0-9]/g, "");
  const dbPhoneNormalized = (sale.customer.phone || "").replace(/[^0-9]/g, "");

  if (!dbPhoneNormalized || inputPhoneNormalized !== dbPhoneNormalized) {
    throw new AppError("El número de teléfono no coincide con el cliente asociado a este ticket.", 400);
  }

  if (sale.customer.passwordHash) {
    throw new AppError(
      "Esta cuenta ya está registrada y tiene una contraseña establecida. Por favor, inicia sesión.",
      400
    );
  }

  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !CUSTOMER_ACCOUNT_EMAIL_REGEX.test(cleanEmail)) {
    throw new AppError("El correo electrónico no tiene un formato válido.", 400);
  }

  const hashedPassword = await hashPassword(password);

  await prisma.customer.update({
    where: { id: sale.customer.id },
    data: { passwordHash: hashedPassword, email: cleanEmail },
  });
};

export const loginCustomer = async (phone: string, password: string) => {
  const phoneNormalized = phone.replace(/[^0-9]/g, "");

  const customers = await prisma.customer.findMany({
    where: { passwordHash: { not: null } },
  });

  const customer = customers.find(
    (c) => (c.phone || "").replace(/[^0-9]/g, "") === phoneNormalized
  );

  if (!customer || !customer.passwordHash) {
    throw new AppError(
      "El número de teléfono no está registrado o no se ha creado una contraseña para este cliente.",
      401
    );
  }

  const isMatch = await comparePassword(password, customer.passwordHash);
  if (!isMatch) {
    throw new AppError("Contraseña incorrecta.", 401);
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
  };
};

export const getCustomerProfile = async (customerId: number) => {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });

  if (!customer) {
    throw new AppError("Cliente no encontrado.", 404);
  }

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    taxId: customer.taxId,
    address: customer.address,
    zipCode: customer.zipCode,
    taxRegime: customer.taxRegime,
    cfdiUse: customer.cfdiUse,
    points: customer.points,
  };
};

export const updateCustomerProfile = async (
  customerId: number,
  data: {
    taxId?: string;
    name?: string;
    taxRegime?: string;
    zipCode?: string;
    email?: string;
    cfdiUse?: string;
    address?: string;
  }
) => {
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      taxId: data.taxId || null,
      name: data.name || undefined,
      taxRegime: data.taxRegime || null,
      zipCode: data.zipCode || null,
      email: data.email || null,
      cfdiUse: data.cfdiUse || null,
      address: data.address || null,
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    taxId: updated.taxId,
    address: updated.address,
    zipCode: updated.zipCode,
    taxRegime: updated.taxRegime,
    cfdiUse: updated.cfdiUse,
    points: updated.points,
  };
};

export const getCustomerInvoices = async (customerId: number) => {
  const sales = await prisma.sale.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { branch: { select: { name: true } } },
  });

  return sales.map((s) => {
    const cleanUuid = s.cfdiUuid ? s.cfdiUuid.split(":")[0] : null;
    return {
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      totalAmount: Number(s.totalAmount),
      taxAmount: Number(s.taxAmount),
      status: s.status,
      branchName: s.branch.name,
      cfdiUuid: cleanUuid,
      pdfUrl: cleanUuid ? `/api/public/sales/invoice/${cleanUuid}/pdf` : null,
      xmlUrl: cleanUuid ? `/api/public/sales/invoice/${cleanUuid}/xml` : null,
    };
  });
};
