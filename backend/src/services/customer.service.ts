import { prisma } from "../app";
import { hashPassword, comparePassword } from "../utils/auth";
import { AppError } from "../utils/AppError";

const CUSTOMER_ACCOUNT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const registerCustomer = async (
  email: string,
  phone: string,
  invoiceNumber: string,
  password: string
): Promise<{ autoLogin: boolean; customer: { id: number; name: string; phone: string | null; email: string | null } }> => {
  const sale = await prisma.sale.findUnique({
    where: { invoiceNumber },
    include: { customer: true },
  });

  if (!sale) {
    throw new AppError("El folio del ticket no es válido.", 404);
  }

  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanPhone = typeof phone === "string" ? phone.trim().replace(/\D/g, "") : "";

  if (!cleanEmail || !CUSTOMER_ACCOUNT_EMAIL_REGEX.test(cleanEmail)) {
    throw new AppError("El correo electrónico no tiene un formato válido.", 400);
  }

  if (!cleanPhone || cleanPhone.length !== 10) {
    throw new AppError("El número de teléfono debe tener exactamente 10 dígitos.", 400);
  }

  // 1. Buscar si ya existe un cliente con ese teléfono
  let customerByPhone = await prisma.customer.findFirst({
    where: { phone: cleanPhone }
  });

  // 2. Buscar si ya existe un cliente con ese correo
  let customerByEmail = await prisma.customer.findFirst({
    where: { email: cleanEmail }
  });

  // Si existe por teléfono y ya tiene contraseña
  if (customerByPhone && customerByPhone.passwordHash) {
    throw new AppError("El número de teléfono ya está registrado con otra cuenta.", 400);
  }

  // Si existe por correo y ya tiene contraseña
  if (customerByEmail && customerByEmail.passwordHash) {
    throw new AppError("El correo electrónico ya está registrado con otra cuenta.", 400);
  }

  const hashedPassword = await hashPassword(password);
  let customer;

  if (customerByPhone) {
    // Si ya existía por teléfono (ej: registro en caja sin correo), lo actualizamos
    customer = await prisma.customer.update({
      where: { id: customerByPhone.id },
      data: {
        email: cleanEmail,
        passwordHash: hashedPassword,
      },
    });
  } else if (customerByEmail) {
    // Si ya existía por correo, le asignamos el teléfono y contraseña
    customer = await prisma.customer.update({
      where: { id: customerByEmail.id },
      data: {
        phone: cleanPhone,
        passwordHash: hashedPassword,
      },
    });
  } else {
    // Si es completamente nuevo, lo creamos
    customer = await prisma.customer.create({
      data: {
        name: "Cliente registrado",
        email: cleanEmail,
        phone: cleanPhone,
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

export const verifyCustomerExists = async (email: string): Promise<boolean> => {
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const customer = await prisma.customer.findFirst({
    where: { email: cleanEmail }
  });
  return !!customer;
};

export const resetCustomerPassword = async (email: string, password: string): Promise<void> => {
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const customer = await prisma.customer.findFirst({
    where: { email: cleanEmail }
  });

  if (!customer) {
    throw new AppError("No se encontró el cliente para actualizar la contraseña.", 404);
  }

  const hashedPassword = await hashPassword(password);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash: hashedPassword },
  });
};

export const loginCustomer = async (identifier: string, password: string) => {
  const cleanInput = typeof identifier === "string" ? identifier.trim() : "";
  const cleanEmail = cleanInput.toLowerCase();
  const cleanPhone = cleanInput.replace(/\D/g, "");

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { email: cleanEmail },
        ...(cleanPhone.length === 10 ? [{ phone: cleanPhone }] : []),
      ],
    },
  });

  if (!customer || !customer.passwordHash) {
    throw new AppError(
      "El correo electrónico o número de teléfono no está registrado, o no se ha creado una contraseña para este cliente.",
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
    include: { 
      branch: { select: { name: true } },
      returns: { select: { cfdiUuid: true } }
    },
  });

  return sales.map((s) => {
    const cleanUuid = s.cfdiUuid ? s.cfdiUuid.split(":")[0] : null;
    const returnUuidStr = s.returns?.[0]?.cfdiUuid;
    const cleanReturnUuid = returnUuidStr ? returnUuidStr.split(":")[0] : null;

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
      returnCfdiUuid: cleanReturnUuid,
      returnPdfUrl: cleanReturnUuid ? `/api/public/sales/invoice/${cleanReturnUuid}/pdf` : null,
      returnXmlUrl: cleanReturnUuid ? `/api/public/sales/invoice/${cleanReturnUuid}/xml` : null,
    };
  });
};
