export const TICKET_PRINT_STYLES = `
  body {
    margin: 0;
    padding: 16px;
    background: #f8fafc;
    font-family: monospace;
    color: #0f172a;
  }
  .ticket-document {
    box-sizing: border-box;
    max-width: 360px;
    margin: 0 auto;
    padding: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fffdf9;
    font-family: monospace;
    font-size: 11px;
    line-height: 1.4;
    overflow: visible;
    height: auto;
    max-height: none;
  }
  .ticket-document table {
    width: 100%;
    border-collapse: collapse;
  }
  .ticket-document th,
  .ticket-document td {
    vertical-align: top;
  }
  .ticket-document img {
    display: block;
    margin: 6px auto;
    max-width: 100px;
    height: auto;
  }
  .ticket-document p {
    margin: 0 0 4px 0;
  }
`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Extrae el HTML completo del ticket sin recortes de scroll ni max-height del modal. */
export const extractFullTicketHtml = (elementId: string): string => {
  const source = document.getElementById(elementId);
  if (!source) {
    throw new Error("No se encontró el ticket en pantalla.");
  }

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.style.boxSizing = "border-box";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.overflowY = "visible";
  clone.style.height = "auto";
  clone.style.position = "fixed";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.width = `${source.offsetWidth || 328}px`;
  clone.style.background = "#fffdf9";
  clone.style.fontFamily = "monospace";

  document.body.appendChild(clone);

  try {
    return clone.innerHTML;
  } finally {
    document.body.removeChild(clone);
  }
};

/** Documento HTML listo para correo, igual que la ventana de impresión del POS. */
export const buildPrintableTicketDocument = (title: string, ticketInnerHtml: string): string => `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${TICKET_PRINT_STYLES}</style>
  </head>
  <body>
    <div class="ticket-document">
      ${ticketInnerHtml}
    </div>
    <p style="max-width:360px;margin:12px auto 0;font-size:10px;color:#64748b;text-align:center;font-family:Arial,sans-serif;">
      Comprobante generado por LYFRGL POS
    </p>
  </body>
</html>`;

/** Monta el ticket completo fuera de pantalla, sin límites del modal, listo para PDF. */
export const mountTicketForPdfRender = (ticketInnerHtml: string): { host: HTMLElement; ticket: HTMLElement } => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:360px;z-index:-1;";

  const style = document.createElement("style");
  style.textContent = TICKET_PRINT_STYLES;
  host.appendChild(style);

  const ticket = document.createElement("div");
  ticket.className = "ticket-document";
  ticket.innerHTML = ticketInnerHtml;
  host.appendChild(ticket);

  document.body.appendChild(host);
  return { host, ticket };
};

export const unmountTicketRender = (host: HTMLElement): void => {
  if (host.parentNode) {
    host.parentNode.removeChild(host);
  }
};

export const ticketPdfFilename = (subject: string): string => {
  const safe = subject
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${safe || "ticket"}.pdf`;
};
