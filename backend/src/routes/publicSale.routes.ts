import { NextFunction, Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { getTicketDetails, issueTicketInvoice, getInvoiceXml, getInvoicePdf } from "../controllers/publicSale.controller";

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invoiceDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiadas solicitudes de descarga. Intente nuevamente más tarde."
  }
});

const validateInvoiceUuid = (req: Request, res: Response, next: NextFunction): void => {
  const { uuid } = req.params;

  if (!UUID_REGEX.test(uuid)) {
    res.status(400).json({
      success: false,
      message: "UUID de factura inválido."
    });
    return;
  }

  next();
};

// Rutas públicas de autofacturación
router.get("/ticket/:invoiceNumber", getTicketDetails);
router.post("/invoice", issueTicketInvoice);
router.get("/invoice/:uuid/xml", invoiceDownloadLimiter, validateInvoiceUuid, getInvoiceXml);
router.get("/invoice/:uuid/pdf", invoiceDownloadLimiter, validateInvoiceUuid, getInvoicePdf);

export default router;
