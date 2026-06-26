const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../backend/src/controllers/sale.controller.ts');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
let startLine = -1;
lines.forEach((line, idx) => {
  if (line.includes('getSaleDetailForCashier')) {
    startLine = idx + 1;
  }
});

if (startLine !== -1) {
  console.log(`getSaleDetailForCashier starts at line ${startLine}`);
  const start = startLine;
  const end = Math.min(lines.length, start + 100);
  for (let i = start - 1; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
} else {
  console.log("Method not found");
}
