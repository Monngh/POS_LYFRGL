const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/Dashboard.tsx');
const content = fs.readFileSync(filePath, 'utf8');

// Find all .map, .filter, .reduce inside the main component body (before the return)
// and inside the return JSX.
const lines = content.split('\n');
console.log("=== Array operations in Dashboard.tsx ===");
lines.forEach((line, idx) => {
  if ((line.includes('.map') || line.includes('.filter') || line.includes('.reduce')) && idx > 500 && idx < 2000) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
  }
});
