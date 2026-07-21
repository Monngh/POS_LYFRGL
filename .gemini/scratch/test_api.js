const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super_secret_key_for_fmb_pos_enterprise_2026';
const token = jwt.sign(
  { id: 2, role: 'ADMIN', email: 'admin@fmb.com' },
  JWT_SECRET,
  { expiresIn: '8h' }
);

async function testBackend() {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  
  // Create order
  const createRes = await fetch('http://localhost:4000/api/admin/purchases', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      supplierId: 1, // assume supplier 1 exists
      branchId: 1, // assume branch 1 exists
      reference: 'TEST-AUDIT-123',
      notes: 'Test E2E',
      details: [
        { productId: 1, quantity: 1, unitCost: 100, unit: 'PIEZA' },
        { productId: 1, quantity: 1, unitCost: 100, unit: 'CAJA', piecesPerBox: 12 },
        { productId: 1, quantity: 2, unitCost: 100, unit: 'LOTE', lotMode: 'boxes', boxesPerLot: 10, piecesPerBox: 12 },
        { productId: 1, quantity: 2, unitCost: 100, unit: 'LOTE', lotMode: 'direct', piecesPerLot: 500 }
      ]
    })
  });
  
  const createData = await createRes.json();
  console.log("Create Order Response:", JSON.stringify(createData, null, 2));
  
  if (!createData.data || !createData.data.id) return;
  const orderId = createData.data.id;
  
  // Receive order
  const receiveRes = await fetch(`http://localhost:4000/api/admin/purchases/${orderId}/receive`, {
    method: 'PUT',
    headers
  });
  
  const receiveData = await receiveRes.json();
  console.log("Receive Order Response:", JSON.stringify(receiveData, null, 2));
}

testBackend().catch(console.error);
