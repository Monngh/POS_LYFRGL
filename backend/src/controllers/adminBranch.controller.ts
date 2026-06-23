import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  listBranches as listBranchesService,
  createBranch as createBranchService,
  updateBranch as updateBranchService,
} from "../services/adminBranch.service";
import { validateAdminLocalPhone } from "../utils/adminPhoneValidation";

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

const BRANCH_NAME_REGEX = /^[a-zA-ZÀ-ÿ0-9 .\-]+$/;

export const listBranches = async (req: Request, res: Response): Promise<void> => {
  try {
    const branches = await listBranchesService(trimQuery(req.query.search));
    res.status(200).json({ branches });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar sucursales." });
  }
};

export const createBranch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, address, phone, phoneCountryCode, active } = req.body;

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) { res.status(400).json({ message: "El nombre de la sucursal es obligatorio." }); return; }
    if (cleanName.length < 3) { res.status(400).json({ message: "El nombre debe tener al menos 3 caracteres." }); return; }
    if (cleanName.length > 80) { res.status(400).json({ message: "El nombre no puede exceder 80 caracteres." }); return; }
    if (!BRANCH_NAME_REGEX.test(cleanName)) {
      res.status(400).json({ message: "El nombre solo permite letras, números, espacios, acentos, puntos y guiones." });
      return;
    }

    const cleanAddress = typeof address === "string" ? address.trim() : "";
    if (!cleanAddress) { res.status(400).json({ message: "La dirección es obligatoria." }); return; }
    if (cleanAddress.length > 150) { res.status(400).json({ message: "La dirección no puede exceder 150 caracteres." }); return; }

    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    const phoneError = validateAdminLocalPhone(cleanPhone, phoneCountryCode, { required: true });
    if (phoneError) {
      res.status(400).json({ message: phoneError });
      return;
    }

    const branch = await createBranchService(
      cleanName,
      cleanAddress,
      cleanPhone,
      typeof active === "boolean" ? active : true
    );

    res.status(201).json({ message: "Sucursal registrada exitosamente.", branch });
  } catch (error: any) {
    if (error.code === "P2002") { res.status(409).json({ message: "Ya existe una sucursal con ese nombre." }); return; }
    res.status(500).json({ message: "Error al registrar la sucursal." });
  }
};

export const updateBranch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "Identificador de sucursal inválido." }); return; }

    const { name, address, phone, phoneCountryCode, active } = req.body;

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) { res.status(400).json({ message: "El nombre de la sucursal es obligatorio." }); return; }
    if (cleanName.length < 3) { res.status(400).json({ message: "El nombre debe tener al menos 3 caracteres." }); return; }
    if (cleanName.length > 80) { res.status(400).json({ message: "El nombre no puede exceder 80 caracteres." }); return; }
    if (!BRANCH_NAME_REGEX.test(cleanName)) {
      res.status(400).json({ message: "El nombre solo permite letras, números, espacios, acentos, puntos y guiones." });
      return;
    }

    const cleanAddress = typeof address === "string" ? address.trim() : "";
    if (!cleanAddress) { res.status(400).json({ message: "La dirección es obligatoria." }); return; }
    if (cleanAddress.length > 150) { res.status(400).json({ message: "La dirección no puede exceder 150 caracteres." }); return; }

    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    const phoneError = validateAdminLocalPhone(cleanPhone, phoneCountryCode, { required: true });
    if (phoneError) {
      res.status(400).json({ message: phoneError });
      return;
    }

    const branch = await updateBranchService(
      id,
      cleanName,
      cleanAddress,
      cleanPhone,
      typeof active === "boolean" ? active : true
    );

    res.status(200).json({ message: "Sucursal actualizada exitosamente.", branch });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    if (error.code === "P2002") { res.status(409).json({ message: "Ya existe otra sucursal con ese nombre." }); return; }
    if (error.code === "P2025") { res.status(404).json({ message: "Sucursal no encontrada." }); return; }
    res.status(500).json({ message: "Error al actualizar la sucursal." });
  }
};
