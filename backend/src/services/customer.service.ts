import { prisma } from "../app";
import { hashPassword, comparePassword } from "../utils/auth";
import { AppError } from "../utils/AppError";

const CUSTOMER_ACCOUNT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const registerCustomer = async (
  phone: string,
  invoiceNumber: string,
  password: string,
  email: string
): Promise<{ autoLogin: boolean; customer: { id: number; name: string; phone: string | null; email: string | null } }> => {
  const sale = await prisma.sale.findUnique({
    where: { invoiceNumber },
    include: { customer: true },
  });

  if (!sale) {
    throw new AppError("El folio del ticket no es válido.", 404);
  }

  const inputPhoneNormalized = phone.replace(/[^0-9]/g, "");

  // Buscar si ya existe un cliente con este teléfono
  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { phone: inputPhoneNormalized },
        { phone: phone }
      ]
    }
  });

  if (!customer) {
    const allCustomers = await prisma.customer.findMany({
      where: { phone: { not: null } }
    });
    customer = allCustomers.find(c => (c.phone || "").replace(/[^0-9]/g, "") === inputPhoneNormalized) || null;
  }

  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (customer && customer.passwordHash) {
    throw new AppError("El número de teléfono ya está registrado con otra cuenta.", 400);
  }

  if (!cleanEmail || !CUSTOMER_ACCOUNT_EMAIL_REGEX.test(cleanEmail)) {
    throw new AppError("El correo electrónico no tiene un formato válido.", 400);
  }

  const hashedPassword = await hashPassword(password);

  if (customer) {
    // Actualizar cliente existente
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashedPassword, email: cleanEmail },
    });
  } else {
    // Crear nuevo cliente
    customer = await prisma.customer.create({
      data: {
        name: "Cliente registrado",
        phone: inputPhoneNormalized,
        email: cleanEmail,
        passwordHash: hashedPassword,
      },
    });
  }

  // Vincular la venta al cliente
  await prisma.sale.update({
    where: { id: sale.id },
    data: { customerId: customer.id },
  });

  return {
    autoLogin: false,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    }
  };
};

export const verifyCustomerExists = async (phone: string): Promise<boolean> => {
  const phoneNormalized = phone.replace(/[^0-9]/g, "");
  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { phone: phoneNormalized },
        { phone: phone }
      ]
    }
  });

  if (!customer) {
    const allCustomers = await prisma.customer.findMany({
      where: { phone: { not: null } }
    });
    customer = allCustomers.find(c => (c.phone || "").replace(/[^0-9]/g, "") === phoneNormalized) || null;
  }
  return !!customer;
};

export const resetCustomerPassword = async (phone: string, password: string): Promise<void> => {
  const phoneNormalized = phone.replace(/[^0-9]/g, "");
  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { phone: phoneNormalized },
        { phone: phone }
      ]
    }
  });

  if (!customer) {
    const allCustomers = await prisma.customer.findMany({
      where: { phone: { not: null } }
    });
    customer = allCustomers.find(c => (c.phone || "").replace(/[^0-9]/g, "") === phoneNormalized) || null;
  }

  if (!customer) {
    throw new AppError("No se encontró el cliente para actualizar la contraseña.", 404);
  }

  const hashedPassword = await hashPassword(password);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash: hashedPassword },
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
