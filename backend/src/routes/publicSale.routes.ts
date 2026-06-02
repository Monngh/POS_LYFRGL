import { Router } from "express";
import { getTicketDetails, issueTicketInvoice, getInvoiceXml, getInvoicePdf } from "../controllers/publicSale.controller";

const router = Router();

// Rutas públicas de autofacturación
router.get("/ticket/:invoiceNumber", getTicketDetails);
router.post("/invoice", issueTicketInvoice);
router.get("/invoice/:uuid/xml", getInvoiceXml);
router.get("/invoice/:uuid/pdf", getInvoicePdf);

export default router;
