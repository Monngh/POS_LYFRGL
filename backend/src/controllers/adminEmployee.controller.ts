import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  listEmployees as listEmployeesService,
  createEmployee as createEmployeeService,
  updateEmployee as updateEmployeeService,
  getEmployeeOperations as getEmployeeOperationsService,
  type UpdateEmployeeInput,
} from "../services/adminEmployee.service";

const parseBranch = (req: Request): number | undefined => {
  if (req.user && req.user.role === "GERENTE") return req.user.branchId;
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const listEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const role = req.query.role as string | undefined;
    const search = trimQuery(req.query.search);
    const employees = await listEmployeesService(branchId, role, search);
    res.status(200).json({ employees });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar empleados." });
  }
};

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, branchId, pinCode, phone, baseSalary, commissionRate } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !role || !branchId) {
      res.status(400).json({ message: "Nombre, correo, contraseña, rol y sucursal son obligatorios." });
      return;
    }
    if (!validateEmail(String(email))) {
      res.status(400).json({ message: "Formato de correo electrónico inválido (ej: usuario@empresa.com)." });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    const validRoles = ["ADMIN", "GERENTE", "CAJERO"];
    if (!validRoles.includes(String(role).toUpperCase())) {
      res.status(400).json({ message: "Rol inválido. Use ADMIN, GERENTE o CAJERO." });
      return;
    }
    if (String(role).toUpperCase() === "CAJERO" && (!pinCode || !/^\d{4}$/.test(String(pinCode)))) {
      res.status(400).json({ message: "Los cajeros requieren un PIN numérico de 4 dígitos." });
      return;
    }
    if (pinCode && !/^\d{4}$/.test(String(pinCode))) {
      res.status(400).json({ message: "El PIN debe ser numérico de 4 dígitos." });
      return;
    }
    if (req.user && req.user.role === "GERENTE" && Number(branchId) !== req.user.branchId) {
      res.status(403).json({ message: "Acceso denegado. Solo puede crear empleados para su propia sucursal." });
      return;
    }

    const employee = await createEmployeeService({
      name: String(name),
      email: String(email),
      password: String(password),
      role: String(role),
      branchId: Number(branchId),
      pinCode: pinCode ? String(pinCode) : null,
      phone: phone ? String(phone) : null,
      baseSalary: baseSalary ? parseFloat(String(baseSalary)) : null,
      commissionRate: commissionRate ? parseFloat(String(commissionRate)) : null,
    });

    res.status(201).json({ message: "Empleado registrado exitosamente.", employee });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    if (error.code === "P2002") { res.status(409).json({ message: "Ya existe un usuario registrado con ese correo electrónico." }); return; }
    res.status(500).json({ message: "Error al registrar el empleado." });
  }
};

export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) { res.status(400).json({ message: "Identificador de empleado inválido." }); return; }

    const { name, email, phone, baseSalary, commissionRate, role, branchId, active, newPin } = req.body;

    if (email && String(email).trim() !== "" && !validateEmail(String(email))) {
      res.status(400).json({ message: "Formato de correo electrónico inválido." });
      return;
    }
    if (role && String(role).trim() !== "" && !["ADMIN", "GERENTE", "CAJERO"].includes(String(role).toUpperCase())) {
      res.status(400).json({ message: "Rol inválido. Use ADMIN, GERENTE o CAJERO." });
      return;
    }
    if (newPin && String(newPin).trim() !== "" && !/^\d{4}$/.test(String(newPin))) {
      res.status(400).json({ message: "El PIN debe ser exactamente 4 dígitos numéricos." });
      return;
    }

    const updateData: UpdateEmployeeInput = {
      ...(name && String(name).trim() !== "" ? { name: String(name).trim().toUpperCase() } : {}),
      ...(email && String(email).trim() !== "" ? { email: String(email).trim().toLowerCase() } : {}),
      ...(phone !== undefined ? { phone: phone ? String(phone).trim() : null } : {}),
      ...(baseSalary !== undefined ? { baseSalary: baseSalary !== "" && baseSalary !== null ? parseFloat(String(baseSalary)) : null } : {}),
      ...(commissionRate !== undefined ? { commissionRate: commissionRate !== "" && commissionRate !== null ? parseFloat(String(commissionRate)) : null } : {}),
      ...(role && String(role).trim() !== "" ? { role: String(role).toUpperCase() } : {}),
      ...(branchId ? { branchId: Number(branchId) } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
      ...(newPin && String(newPin).trim() !== "" ? { newPin: String(newPin) } : {}),
    };

    const requester = req.user ? { role: req.user.role, branchId: req.user.branchId } : undefined;
    const updated = await updateEmployeeService(userId, updateData, requester);

    const { passwordHash, pinCode, ...userSafe } = updated as any;
    res.status(200).json({
      message: "Empleado actualizado exitosamente.",
      employee: {
        id: userSafe.id,
        name: userSafe.name,
        email: userSafe.email,
        phone: userSafe.phone,
        role: userSafe.role,
        active: userSafe.active,
        baseSalary: userSafe.baseSalary !== null ? Number(userSafe.baseSalary) : null,
        commissionRate: userSafe.commissionRate !== null ? Number(userSafe.commissionRate) : null,
        branch: userSafe.branch.name,
        createdAt: userSafe.createdAt,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    if (error.code === "P2025") { res.status(404).json({ message: "Empleado no encontrado." }); return; }
    res.status(500).json({ message: "Error al actualizar el empleado." });
  }
};

export const getEmployeeOperations = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "Identificador de empleado inválido." }); return; }

    const requester = req.user ? { role: req.user.role, branchId: req.user.branchId } : undefined;
    const result = await getEmployeeOperationsService(id, requester);

    if (!result) { res.status(404).json({ message: "Empleado no encontrado." }); return; }

    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al obtener las operaciones del empleado." });
  }
};
