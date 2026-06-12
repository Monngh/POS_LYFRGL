import { Request, Response } from "express";
import { prisma } from "../app";
import { hashPassword, comparePassword, generateToken } from "../utils/auth";

const CUSTOMER_ACCOUNT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Registro y reclamo de cuenta para clientes pre-registrados en tienda
 */
export const registerCustomerAccount = async (req: Request, res: Response): Promise<void> => {
  const { phone, invoiceNumber, password, email } = req.body;

  if (!phone || !invoiceNumber || !password) {
    res.status(400).json({ message: "El teléfono, folio de ticket y la contraseña son requeridos." });
    return;
  }

  try {
    // Buscar la venta/ticket por su folio
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber },
      include: { customer: true }
    });

    if (!sale) {
      res.status(404).json({ message: "No se encontró ningún ticket de venta con el folio proporcionado." });
      return;
    }

    if (!sale.customerId || !sale.customer) {
      res.status(400).json({ message: "Este ticket no está asociado a ningún cliente registrado." });
      return;
    }

    // Normalizar números de teléfono para la comparación
    const inputPhoneNormalized = phone.replace(/[^0-9]/g, "");
    const dbPhoneNormalized = (sale.customer.phone || "").replace(/[^0-9]/g, "");

    if (!dbPhoneNormalized || inputPhoneNormalized !== dbPhoneNormalized) {
      res.status(400).json({ message: "El número de teléfono no coincide con el cliente asociado a este ticket." });
      return;
    }

    if (sale.customer.passwordHash) {
      res.status(400).json({ message: "Esta cuenta ya está registrada y tiene una contraseña establecida. Por favor, inicia sesión." });
      return;
    }

    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanEmail || !CUSTOMER_ACCOUNT_EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ message: "El correo electrónico no tiene un formato válido." });
      return;
    }

    // Cifrar contraseña y guardar
    const hashedPassword = await hashPassword(password);

    await prisma.customer.update({
      where: { id: sale.customer.id },
      data: {
        passwordHash: hashedPassword,
        email: cleanEmail
      }
    });

    res.status(200).json({
      message: "Cuenta registrada exitosamente. Ahora puedes iniciar sesión con tu teléfono y contraseña."
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al registrar la cuenta.", error: error.message });
  }
};

/**
 * Inicio de sesión de clientes (Teléfono + Contraseña)
 */
export const loginCustomer = async (req: Request, res: Response): Promise<void> => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    res.status(400).json({ message: "El teléfono y la contraseña son requeridos." });
    return;
  }

  try {
    const phoneNormalized = phone.replace(/[^0-9]/g, "");

    // Buscar al cliente. Como el teléfono en base de datos podría tener guiones, buscaremos de forma flexible o normalizada
    // Primero intentamos coincidencia exacta, luego coincidencia parcial si es necesario.
    // Para SQL Server, podemos hacer una consulta básica:
    const customers = await prisma.customer.findMany({
      where: {
        passwordHash: { not: null }
      }
    });

    const customer = customers.find(c => (c.phone || "").replace(/[^0-9]/g, "") === phoneNormalized);

    if (!customer || !customer.passwordHash) {
      res.status(401).json({ message: "El número de teléfono no está registrado o no se ha creado una contraseña para este cliente." });
      return;
    }

    const isMatch = await comparePassword(password, customer.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: "Contraseña incorrecta." });
      return;
    }

    // Generar JWT de cliente
    const token = generateToken({
      customerId: customer.id,
      email: customer.email,
      role: "CUSTOMER"
    });

    res.status(200).json({
      message: "Inicio de sesión exitoso.",
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al iniciar sesión.", error: error.message });
  }
};

/**
 * Obtener perfil del cliente autenticado
 */
export const getCustomerProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.customerId) {
    res.status(401).json({ message: "No autenticado como cliente." });
    return;
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user.customerId }
    });

    if (!customer) {
      res.status(404).json({ message: "Cliente no encontrado." });
      return;
    }

    res.status(200).json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        taxId: customer.taxId,
        address: customer.address,
        zipCode: customer.zipCode,
        taxRegime: customer.taxRegime,
        cfdiUse: customer.cfdiUse,
        points: customer.points
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al recuperar el perfil.", error: error.message });
  }
};

/**
 * Actualizar datos fiscales del cliente autenticado
 */
export const updateCustomerProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.customerId) {
    res.status(401).json({ message: "No autenticado como cliente." });
    return;
  }

  const { taxId, name, taxRegime, zipCode, email, cfdiUse, address } = req.body;

  try {
    const updatedCustomer = await prisma.customer.update({
      where: { id: req.user.customerId },
      data: {
        taxId: taxId || null,
        name: name || undefined, // Evitar vaciar el nombre principal si no se provee
        taxRegime: taxRegime || null,
        zipCode: zipCode || null,
        email: email || null,
        cfdiUse: cfdiUse || null,
        address: address || null
      }
    });

    res.status(200).json({
      message: "Datos fiscales actualizados exitosamente.",
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        email: updatedCustomer.email,
        phone: updatedCustomer.phone,
        taxId: updatedCustomer.taxId,
        address: updatedCustomer.address,
        zipCode: updatedCustomer.zipCode,
        taxRegime: updatedCustomer.taxRegime,
        cfdiUse: updatedCustomer.cfdiUse,
        points: updatedCustomer.points
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al actualizar los datos fiscales.", error: error.message });
  }
};

/**
 * Obtener listado de tickets y facturas (historial) del cliente autenticado
 */
export const getCustomerInvoices = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.customerId) {
    res.status(401).json({ message: "No autenticado como cliente." });
    return;
  }

  try {
    const sales = await prisma.sale.findMany({
      where: { customerId: req.user.customerId },
      orderBy: { createdAt: "desc" },
      include: {
        branch: {
          select: { name: true }
        }
      }
    });

    const formattedInvoices = sales.map(s => {
      // Si tiene cfdiUuid, dividimos para extraer la primera parte del UUID real
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
        xmlUrl: cleanUuid ? `/api/public/sales/invoice/${cleanUuid}/xml` : null
      };
    });

    res.status(200).json({ invoices: formattedInvoices });
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener el historial de facturas.", error: error.message });
  }
};
