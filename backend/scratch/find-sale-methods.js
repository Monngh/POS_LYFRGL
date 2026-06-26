const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../backend/src/controllers/sale.controller.ts');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('createSale') || line.includes('function') || line.includes('const') && line.includes('=')) {
    if (line.includes('createSale') || line.includes('recent') || line.includes('deposit')) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
    }
  }
});
