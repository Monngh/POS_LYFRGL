const fs = require('fs');

const path = 'frontend/src/pos/components/ProductSearchPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

// The markers
const customerStart = '      {/* ===== CLIENTE — siempre visible en la parte superior ===== */}';
const searchStart = '      {/* ===== BUSCADOR DE PRODUCTOS ===== */}';
const searchEnd = '      {/* Dropdown de búsqueda multi-producto'; // start of next block

const idxCustomer = content.indexOf(customerStart);
const idxSearch = content.indexOf(searchStart);
const idxSearchEnd = content.indexOf(searchEnd);

if (idxCustomer !== -1 && idxSearch !== -1 && idxSearchEnd !== -1) {
  const customerBlock = content.substring(idxCustomer, idxSearch);
  const searchBlock = content.substring(idxSearch, idxSearchEnd);
  
  // Swap them
  let newContent = content.substring(0, idxCustomer) + searchBlock + customerBlock + content.substring(idxSearchEnd);
  
  // Also fix "VENTA ANÓNIMA"
  newContent = newContent.replace(
    '👤 VENTA ANÓNIMA',
    'Venta Anónima'
  );
  
  newContent = newContent.replace(
    '<div className="pos-customer-bar-anon-label">',
    '<div className="pos-customer-bar-anon-label" style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8" }}>'
  );

  fs.writeFileSync(path, newContent, 'utf8');
  console.log("Swapped successfully");
} else {
  console.log("Markers not found");
}
