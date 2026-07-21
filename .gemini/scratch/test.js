const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super_secret_key_for_fmb_pos_enterprise_2026';

const token = jwt.sign(
  { id: 2, role: 'ADMIN', email: 'admin@fmb.com' },
  JWT_SECRET,
  { expiresIn: '8h' }
);

const user = { id: 2, role: 'ADMIN', name: 'ADMINISTRADOR LYFRGL' };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set local storage
  await page.goto('http://localhost:5173');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('fmb_pos_token', token);
    localStorage.setItem('fmb_pos_user', JSON.stringify(user));
  }, { token, user });

  // Navigate to Compras
  await page.goto('http://localhost:5173/admin/compras');
  await page.waitForLoadState('networkidle');

  console.log("Navigated to Compras");

  // Step a. Create an order with PIEZA
  // We need to select Branch and Supplier first.
  await page.selectOption('select:has-text("Seleccione…")', { index: 1 }); // select first branch
  await page.click('button:has-text("Seleccione proveedor…")'); // open supplier modal
  await page.waitForSelector('text=Directorio de proveedores');
  // Click the first "Seleccionar" button
  await page.click('button:has-text("Seleccionar") >> nth=0');

  // Search product
  await page.fill('input[placeholder="Buscar producto por nombre o SKU para agregar…"]', 'a');
  await page.waitForTimeout(1000); // Wait for debounce and search results
  // Click the first "Agregar" button
  await page.click('button:has-text("Agregar") >> nth=0');

  console.log("Added first product");
  await page.waitForTimeout(1000); // Wait for it to render

  // Wait for the row to appear. Let's find the unit select
  const unitSelect = page.locator('select').nth(1); // The first select is branch, next is in the card. Let's be more specific.
  // Actually, we can find select with value "PIEZA"
  const rowUnitSelect = page.locator('select >> nth=1');
  await rowUnitSelect.selectOption('PIEZA');
  
  // Verify Importe and no conversion fields
  const piecesPerBoxLocator = page.locator('text=Piezas por caja');
  const hasPiecesPerBox = await piecesPerBoxLocator.count() > 0;
  console.log('Unit PIEZA: has conversion field?', hasPiecesPerBox);

  // Step b. Create another line with CAJA
  // Let's just change the same line to CAJA to test
  await rowUnitSelect.selectOption('CAJA');
  await page.waitForTimeout(500);

  // Fill "Piezas por caja"
  await page.fill('input:near(:text("Piezas por caja"))', '12');
  
  // Set Quantity to 1 and Cost to 100
  const qtyInput = page.locator('input[type="number"]').nth(0);
  await qtyInput.fill('1');
  const costInput = page.locator('input[placeholder="0.00"]');
  await costInput.fill('100');

  await page.waitForTimeout(500);
  
  // Check preview
  const previewText = await page.locator('text=→ 12 piezas totales').count();
  console.log('Unit CAJA: preview text (-> 12 piezas totales) found?', previewText > 0);

  // Check importe
  const importeText = await page.locator('label:has-text("Importe") + div').innerText();
  console.log('Unit CAJA: Importe =', importeText); // should be 100

  // Step c. Change to LOTE, modo "Por cajas"
  await rowUnitSelect.selectOption('LOTE');
  await page.waitForTimeout(500);

  // Fill Cajas en el lote
  await page.fill('input:near(:text("Cajas en el lote"))', '10');
  await page.fill('input:near(:text("Piezas por caja"))', '12'); // might still be 12, but let's re-fill
  await qtyInput.fill('2'); // 2 lots

  await page.waitForTimeout(500);
  
  const lotePreviewText = await page.locator('text=→ 240 piezas totales').count();
  console.log('Unit LOTE (cajas): preview text (-> 240 piezas totales) found?', lotePreviewText > 0);
  
  const loteImporteText = await page.locator('label:has-text("Importe") + div').innerText();
  console.log('Unit LOTE (cajas): Importe =', loteImporteText); // 2 * 100 = 200

  // Step d. LOTE, modo "Total directo"
  // Click the toggle button to switch to direct mode
  await page.click('button:has-text("Total directo")');
  await page.waitForTimeout(500);

  // Fill Piezas totales del lote
  await page.fill('input:near(:text("Piezas totales del lote"))', '500');
  await page.waitForTimeout(500);

  const directPreviewText = await page.locator('text=→ 1,000 piezas totales').count();
  console.log('Unit LOTE (directo): preview text (-> 1,000 piezas totales) found?', directPreviewText > 0);

  // Step e. Save the order
  await page.click('button:has-text("Crear orden de compra")');
  await page.waitForSelector('text=Nueva orden de compra', { state: 'visible' }); // Wait for the form to reset or success message
  await page.waitForTimeout(1000); // give it time to hit DB

  console.log("Order saved.");
  
  await browser.close();
})();
