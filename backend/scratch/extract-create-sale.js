const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../backend/src/controllers/sale.controller.ts');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

const start = 301;
const end = 330;
for (let i = start - 1; i < end; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
