const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../backend/src/app.ts');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('PrismaClient') || line.includes('new PrismaClient')) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
  }
});
