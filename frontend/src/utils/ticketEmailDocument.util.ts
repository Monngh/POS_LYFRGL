export const TICKET_WIDTH_MM = 80;
export const TICKET_WIDTH_PX = 302;
export const TICKET_NO_PRINT_SELECTOR = ".no-print, [data-no-ticket-print='true']";

export const TICKET_PRINT_STYLES = `
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * {
    box-sizing: border-box;
  }
  body {
    width: 80mm;
    margin: 0;
    padding: 0;
    background: #ffffff;
    font-family: "Courier New", monospace;
    color: #111111;
  }
  .ticket-document,
  .ticket-print {
    box-sizing: border-box;
    width: 80mm;
    max-width: 80mm;
    margin: 0 auto;
    padding: 3mm;
    border: 0;
    border-radius: 0;
    background: #ffffff;
    font-family: "Courier New", monospace;
    font-size: 10px;
    line-height: 1.25;
    overflow: visible;
    height: auto;
    max-height: none;
    color: #111111;
  }
  .ticket-document *,
  .ticket-print * {
    box-sizing: border-box;
    color: #111111 !important;
    background: transparent !important;
    box-shadow: none !important;
  }
  .ticket-document table,
  .ticket-print table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .ticket-document th,
  .ticket-document td,
  .ticket-print th,
  .ticket-print td {
    vertical-align: top;
    word-break: break-word;
  }
  .ticket-document img,
  .ticket-print img {
    display: block;
    margin: 6px auto;
    max-width: 24mm;
    height: auto;
  }
  .ticket-document p,
  .ticket-print p {
    margin: 0 0 4px 0;
  }
  .ticket-header {
    text-align: center;
    border-bottom: 1px dashed #111111;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .ticket-store {
    display: block;
    font-size: 14px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .ticket-operation {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .ticket-muted {
    color: #444444 !important;
    font-size: 10px;
  }
  .ticket-section {
    border-top: 1px dashed #111111;
    margin-top: 8px;
    padding-top: 8px;
  }
  .ticket-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .ticket-row > span:first-child {
    min-width: 0;
  }
  .ticket-value {
    text-align: right;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .ticket-total {
    border-top: 2px solid #111111;
    margin-top: 6px;
    padding-top: 6px;
    font-weight: 800;
    font-size: 12px;
  }
  .ticket-footer {
    text-align: center;
    border-top: 1px dashed #111111;
    margin-top: 12px;
    padding-top: 8px;
    font-size: 9px;
  }
  .ticket-flag {
    text-align: center;
    border: 1px solid #111111;
    padding: 4px;
    margin-bottom: 8px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .no-print,
  [data-no-ticket-print="true"] {
    display: none !important;
  }
`;

export const TICKET_PRINT_MEDIA_STYLES = `
  @media print {
    @page {
      size: 80mm auto;
      margin: 0;
    }

    html,
    body {
      width: 80mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }

    body * {
      visibility: hidden !important;
    }

    .ticket-print,
    .ticket-print * {
      visibility: visible !important;
    }

    .ticket-print {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      box-sizing: border-box !important;
      width: 80mm !important;
      max-width: 80mm !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 3mm !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: #ffffff !important;
      color: #111111 !important;
      font-family: "Courier New", monospace !important;
      font-size: 10px !important;
      line-height: 1.25 !important;
    }

    .ticket-print * {
      color: #111111 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .no-print,
    [data-no-ticket-print="true"] {
      display: none !important;
      visibility: hidden !important;
    }
  }
`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Extrae solo el ticket imprimible, sin botones ni limites visuales del modal. */
export const extractFullTicketHtml = (elementId: string): string => {
  const source = document.getElementById(elementId);
  if (!source) {
    throw new Error("No se encontro el ticket en pantalla.");
  }

  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(TICKET_NO_PRINT_SELECTOR).forEach((node) => node.remove());
  clone.removeAttribute("id");
  clone.style.boxSizing = "border-box";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.overflowY = "visible";
  clone.style.height = "auto";
  clone.style.position = "fixed";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.width = "80mm";
  clone.style.background = "#ffffff";
  clone.style.fontFamily = '"Courier New", monospace';

  document.body.appendChild(clone);

  try {
    return clone.innerHTML;
  } finally {
    document.body.removeChild(clone);
  }
};

type PrintableTicketDocumentOptions = {
  autoPrint?: boolean;
  closeAfterPrint?: boolean;
};

/** Documento HTML listo para correo, PDF o ventana de impresion del POS. */
export const buildPrintableTicketDocument = (
  title: string,
  ticketInnerHtml: string,
  options: PrintableTicketDocumentOptions = {}
): string => `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${TICKET_PRINT_STYLES}</style>
  </head>
  <body>
    <div class="ticket-document ticket-print">
      ${ticketInnerHtml}
    </div>
    ${
      options.autoPrint
        ? `<script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
          ${options.closeAfterPrint ? "setTimeout(function(){ window.close(); }, 250);" : ""}
        }, 120);
      };
    </script>`
        : ""
    }
  </body>
</html>`;

/** Monta el ticket completo fuera de pantalla, sin limites del modal, listo para PDF. */
export const mountTicketForPdfRender = (ticketInnerHtml: string): { host: HTMLElement; ticket: HTMLElement } => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:80mm;z-index:-1;";

  const style = document.createElement("style");
  style.textContent = TICKET_PRINT_STYLES;
  host.appendChild(style);

  const ticket = document.createElement("div");
  ticket.className = "ticket-document ticket-print";
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

export const openTicketPrintWindow = (title: string, ticketInnerHtml: string): boolean => {
  const w = window.open("", "_blank", "width=360,height=720");
  if (!w) return false;

  w.document.write(
    buildPrintableTicketDocument(title, ticketInnerHtml, {
      autoPrint: true,
      closeAfterPrint: true,
    })
  );
  w.document.close();
  return true;
};

export const printTicketElementById = (title: string, elementId: string): boolean => {
  const ticketInnerHtml = extractFullTicketHtml(elementId);
  return openTicketPrintWindow(title, ticketInnerHtml);
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
