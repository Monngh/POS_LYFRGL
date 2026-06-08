import { Request, Response } from "express";
import { sendTicketEmail, isTicketEmailConfigured } from "../services/ticketEmail.service";
import { validateEmail, verifyEmailDomain } from "../utils/email.util";

export const sendTicketByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "No autenticado." });
      return;
    }

    const email = String(req.body.email || "").trim();
    const subject = String(req.body.subject || "").trim();
    const pdfBase64 = String(req.body.pdfBase64 || "").trim();
    const pdfFilename = String(req.body.pdfFilename || "ticket.pdf").trim();

    if (!email || !subject || !pdfBase64) {
      res.status(400).json({ message: "Correo, asunto y PDF del ticket son obligatorios." });
      return;
    }

    if (!validateEmail(email)) {
      res.status(400).json({
        message: "Formato de correo electrónico inválido (ej: usuario@empresa.com).",
      });
      return;
    }

    if (!isTicketEmailConfigured()) {
      res.status(503).json({
        message: "El servicio de correo no está configurado. Contacte al administrador del sistema.",
      });
      return;
    }

    const domainValid = await verifyEmailDomain(email);
    if (!domainValid) {
      res.status(400).json({
        message: "El dominio del correo no es válido o no puede recibir mensajes.",
      });
      return;
    }

    await sendTicketEmail({
      to: email,
      subject,
      pdfBase64,
      pdfFilename: pdfFilename || undefined,
    });

    res.status(200).json({ message: "Ticket enviado correctamente al correo indicado." });
  } catch (error: any) {
    console.error("Error al enviar ticket por correo:", error);
    res.status(500).json({
      message: error.message || "No se pudo enviar el ticket por correo. Verifique la dirección e intente de nuevo.",
    });
  }
};
