const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const content = fs.readFileSync(filePath, 'utf8');

// Find index of "/autofacturacion"
const query = "/autofacturacion";
let index = content.indexOf(query);
while (index !== -1) {
  console.log("Found autofacturacion at index:", index);
  // Get surrounding lines (about 20 lines)
  const start = content.lastIndexOf('\n', index - 500);
  const end = content.indexOf('\n', index + 500);
  console.log("------------------------");
  console.log(content.substring(start, end));
  console.log("------------------------\n");
  index = content.indexOf(query, index + 1);
}
