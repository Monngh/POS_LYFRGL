import {
  extractFullTicketHtml,
  mountTicketForPdfRender,
  TICKET_WIDTH_MM,
  TICKET_WIDTH_PX,
  unmountTicketRender,
} from "./ticketEmailDocument.util";
let cachedHtml2canvas: any = null;
let cachedJsPDF: any = null;

const loadLibraries = async () => {
  if (cachedHtml2canvas && cachedJsPDF) {
    return { html2canvas: cachedHtml2canvas, jsPDF: cachedJsPDF };
  }
  try {
    const [html2canvasModule, jspdfModule] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    cachedHtml2canvas = html2canvasModule.default || html2canvasModule;
    cachedJsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
    return { html2canvas: cachedHtml2canvas, jsPDF: cachedJsPDF };
  } catch (error) {
    console.error("Error loading PDF libraries (html2canvas/jspdf). Reloading page...", error);
    window.location.reload();
    return new Promise<{ html2canvas: any; jsPDF: any }>(() => {}); // Hold execution
  }
};


const waitForImages = async (root: HTMLElement): Promise<void> => {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
};

const inlineExternalImages = async (root: HTMLElement): Promise<void> => {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:")) return;

      try {
        const response = await fetch(src);
        if (!response.ok) return;
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        img.src = dataUrl;
      } catch {
        // QR u otras imágenes externas pueden omitirse si CORS falla.
      }
    })
  );
  await waitForImages(root);
};

const renderTicketElementToPdfBase64 = async (ticket: HTMLElement): Promise<string> => {
  const { html2canvas, jsPDF } = await loadLibraries();

  await waitForImages(ticket);
  await inlineExternalImages(ticket);

  const contentHeight = Math.max(ticket.scrollHeight, ticket.offsetHeight, ticket.clientHeight);
  const contentWidth = Math.max(ticket.scrollWidth, ticket.offsetWidth, TICKET_WIDTH_PX);

  const canvas = await html2canvas(ticket, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    width: contentWidth,
    height: contentHeight,
    windowWidth: contentWidth,
    windowHeight: contentHeight,
    scrollX: 0,
    scrollY: 0,
  });

  if (!canvas.width || !canvas.height) {
    throw new Error("No se pudo capturar el contenido del ticket.");
  }

  let imgData: string;
  try {
    imgData = canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    throw new Error("No se pudo generar la imagen del ticket para el PDF.");
  }

  const pdfHeightMm = (canvas.height * TICKET_WIDTH_MM) / canvas.width;
  if (!Number.isFinite(pdfHeightMm) || pdfHeightMm <= 0) {
    throw new Error("El tamaño del ticket no es válido para generar el PDF.");
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [TICKET_WIDTH_MM, pdfHeightMm],
  });

  pdf.addImage(imgData, "JPEG", 0, 0, TICKET_WIDTH_MM, pdfHeightMm);

  const dataUri = pdf.output("datauristring");
  const base64 = dataUri.split(",")[1];
  if (!base64) {
    throw new Error("No se pudo generar el PDF del ticket.");
  }
  return base64;
};

export const generateTicketPdfBase64 = async (options: {
  elementId?: string;
  innerHtml?: string;
}): Promise<string> => {
  const ticketInnerHtml = options.elementId
    ? extractFullTicketHtml(options.elementId)
    : options.innerHtml;

  if (!ticketInnerHtml) {
    throw new Error("No se pudo obtener el contenido del ticket.");
  }

  const { host, ticket } = mountTicketForPdfRender(ticketInnerHtml);

  try {
    return await renderTicketElementToPdfBase64(ticket);
  } finally {
    unmountTicketRender(host);
  }
};
