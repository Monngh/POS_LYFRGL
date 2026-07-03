import puppeteer, { Browser } from "puppeteer";

// ============================================================================
// Generación de PDF de nivel ERP mediante el motor de impresión de Chromium
// (Puppeteer). Recibe el MISMO HTML + Print CSS que el navegador ya usa para
// «Imprimir», por lo que el documento es idéntico: PDF vectorial, texto nítido
// y seleccionable, fuentes/iconos SVG conservados, colores preservados y
// archivo ligero. Un solo diseño para pantalla, impresión y descarga.
// El navegador (Chromium) se lanza una vez y se reutiliza entre solicitudes.
// ============================================================================

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  let lastError: unknown;
  // Hasta 2 intentos: si el navegador reutilizado murió, se relanza.
  for (let attempt = 0; attempt < 2; attempt++) {
    let page;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();

      // Seguridad: el HTML proviene del cliente. Bloqueamos TODA la red para
      // evitar SSRF/exfiltración — el documento es autocontenido (CSS y SVG
      // en línea, sin recursos externos), así que no necesita ninguna petición.
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith("data:") || url === "about:blank") req.continue();
        else req.abort();
      });

      await page.emulateMediaType("print");
      // El documento es autocontenido (CSS y SVG en línea) y la red está
      // bloqueada, por lo que "load" basta para un render completo.
      await page.setContent(html, { waitUntil: "load", timeout: 30000 });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true, // respeta @page { size: A4; margin: 0 }
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.from(pdf);
    } catch (e) {
      lastError = e;
      browserPromise = null; // fuerza relanzamiento en el siguiente intento
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo generar el PDF.");
}
